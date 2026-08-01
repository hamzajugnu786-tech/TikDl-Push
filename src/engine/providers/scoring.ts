/**
 * NovaDL Engine — Provider Scoring System
 *
 * Continuously tracks and scores providers based on observed
 * extraction performance. The composite score drives provider
 * selection in the weighted routing system.
 *
 * Scoring dimensions (weights):
 *   - success_rate:   30%  — How often extractions succeed
 *   - latency_ms:     20%  — How fast the provider responds (exponential decay)
 *   - failure_%:      20%  — How often extractions fail (inverted: less failure = higher score)
 *   - timeout_%:      15%  — How often requests time out (inverted)
 *   - availability:   15%  — Provider infrastructure reliability (distinct from timeouts)
 *
 * Availability counts infrastructure-level failures (NETWORK, AUTH_FAILED,
 * RATE_LIMITED, QUOTA_EXCEEDED) separately from content-level failures
 * (NOT_FOUND, GEO_BLOCKED, etc.), giving a distinct view of provider
 * service health vs extraction success.
 */

import { TypedEmitter } from '../utils/events';
import type { Platform } from '../types/index';
import type { ProviderErrorCode } from './base';
import type { ProviderRegistry } from './registry';

// ─── Infrastructure Error Types ───────────────────────────────────
// These error types indicate the provider's infrastructure was
// unavailable, not just that the extraction failed for content reasons.

const INFRASTRUCTURE_ERROR_TYPES = new Set<ProviderErrorCode>([
  'NETWORK',
  'AUTH_FAILED',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
]);

// ─── Configuration ────────────────────────────────────────────────

export interface ScoringWeights {
  /** Weight for success rate dimension. Default: 30 */
  successRate: number;
  /** Weight for latency dimension. Default: 20 */
  latency: number;
  /** Weight for failure rate dimension. Default: 20 */
  failureRate: number;
  /** Weight for timeout rate dimension. Default: 15 */
  timeoutRate: number;
  /** Weight for availability dimension. Default: 15 */
  availability: number;
}

export interface ScoringConfig {
  /** Reference latency for exponential decay normalization (ms). Default: 5000 */
  referenceLatencyMs: number;
  /** Default composite score for providers with no data. Default: 50 */
  baselineScore: number;
  /** Weight configuration (weights should sum to 100) */
  weights: ScoringWeights;
  /** Minimum number of requests before using fully actual data. Default: 5 */
  minDataPoints: number;
  /** Time window for recent metrics (ms). Default: 3600000 (1 hour) */
  recentWindowMs: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  referenceLatencyMs: 5000,
  baselineScore: 50,
  weights: {
    successRate: 30,
    latency: 20,
    failureRate: 20,
    timeoutRate: 15,
    availability: 15,
  },
  minDataPoints: 5,
  recentWindowMs: 3600000,
};

// ─── Score Components ─────────────────────────────────────────────

export interface ScoreComponents {
  /** Contribution from success rate dimension (0–30) */
  successRateContribution: number;
  /** Contribution from latency dimension (0–20) */
  latencyContribution: number;
  /** Contribution from failure rate dimension (0–20) */
  failureRateContribution: number;
  /** Contribution from timeout rate dimension (0–15) */
  timeoutRateContribution: number;
  /** Contribution from availability dimension (0–15) */
  availabilityContribution: number;
}

// ─── Scoring Metrics ─────────────────────────────────────────────

export interface ProviderScoringMetrics {
  providerId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutRequests: number;
  infrastructureFailures: number;
  avgLatencyMs: number;
  successRate: number;
  failurePercent: number;
  timeoutPercent: number;
  availability: number;
  compositeScore: number;
  scoreComponents: ScoreComponents;
  lastUpdated: Date | null;
  recentRequests: number;
}

// ─── Internal Tracking ────────────────────────────────────────────

interface ProviderTrackingData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutRequests: number;
  infrastructureFailures: number;
  totalLatencySum: number;
  latencyCount: number;
  recentEvents: ScoringEvent[];
}

interface ScoringEvent {
  timestamp: number;
}

// ─── Scoring Events ──────────────────────────────────────────────

export interface ScorerEvents {
  'score:updated': { providerId: string; oldScore: number; newScore: number };
  'score:calculated': { providerId: string; score: number; metrics: ProviderScoringMetrics };
}

// ─── ProviderScorer ──────────────────────────────────────────────

export class ProviderScorer extends TypedEmitter<ScorerEvents> {
  private _config: ScoringConfig;
  private _registry: ProviderRegistry;
  private _data: Map<string, ProviderTrackingData> = new Map();
  private _scores: Map<string, number> = new Map();

  constructor(registry: ProviderRegistry, config?: Partial<ScoringConfig>) {
    super();
    this._registry = registry;
    this._config = {
      ...DEFAULT_SCORING_CONFIG,
      ...config,
      weights: { ...DEFAULT_SCORING_CONFIG.weights, ...(config?.weights ?? {}) },
    };
  }

  // ─── Recording Methods ──────────────────────────────────────────

  /** Record a successful extraction with measured latency */
  recordSuccess(providerId: string, latencyMs: number): void {
    const data = this._getOrCreateData(providerId);
    data.totalRequests += 1;
    data.successfulRequests += 1;
    data.totalLatencySum += latencyMs;
    data.latencyCount += 1;
    data.recentEvents.push({ timestamp: Date.now() });
    this._pruneRecentEvents(data);
    this._recalculateScore(providerId);
  }

  /** Record a failed extraction with measured latency and error classification */
  recordFailure(providerId: string, latencyMs: number, errorType: ProviderErrorCode): void {
    const data = this._getOrCreateData(providerId);
    const isInfrastructure = INFRASTRUCTURE_ERROR_TYPES.has(errorType);
    data.totalRequests += 1;
    data.failedRequests += 1;
    if (isInfrastructure) {
      data.infrastructureFailures += 1;
    }
    data.totalLatencySum += latencyMs;
    data.latencyCount += 1;
    data.recentEvents.push({ timestamp: Date.now() });
    this._pruneRecentEvents(data);
    this._recalculateScore(providerId);
  }

  /** Record a timeout — provider exceeded its time limit */
  recordTimeout(providerId: string): void {
    const data = this._getOrCreateData(providerId);
    data.totalRequests += 1;
    data.timeoutRequests += 1;
    // Timeouts count as max latency for scoring purposes
    data.totalLatencySum += this._config.referenceLatencyMs * 3;
    data.latencyCount += 1;
    data.recentEvents.push({ timestamp: Date.now() });
    this._pruneRecentEvents(data);
    this._recalculateScore(providerId);
  }

  // ─── Score Retrieval ────────────────────────────────────────────

  /** Get composite score for a provider. Returns baseline score if no data available. */
  getScore(providerId: string): number {
    const score = this._scores.get(providerId);
    if (score !== undefined) return score;
    return this._config.baselineScore;
  }

  /** Get providers sorted by composite score for a given platform */
  getRankedProviders(platform: Platform): string[] {
    const providers = this._registry.getByPlatform(platform);
    return providers
      .map((p) => ({ id: p.id, score: this.getScore(p.id) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.id);
  }

  /** Get detailed scoring metrics for a provider */
  getMetrics(providerId: string): ProviderScoringMetrics {
    const data = this._data.get(providerId);
    if (!data) {
      return {
        providerId,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        timeoutRequests: 0,
        infrastructureFailures: 0,
        avgLatencyMs: 0,
        successRate: 0,
        failurePercent: 0,
        timeoutPercent: 0,
        availability: 0,
        compositeScore: this._config.baselineScore,
        scoreComponents: {
          successRateContribution: 0,
          latencyContribution: 0,
          failureRateContribution: 0,
          timeoutRateContribution: 0,
          availabilityContribution: 0,
        },
        lastUpdated: null,
        recentRequests: 0,
      };
    }
    return this._buildMetrics(providerId, data);
  }

  // ─── Configuration ──────────────────────────────────────────────

  /** Get the current scoring configuration */
  getConfig(): ScoringConfig {
    return { ...this._config, weights: { ...this._config.weights } };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private _getOrCreateData(providerId: string): ProviderTrackingData {
    const existing = this._data.get(providerId);
    if (existing) return existing;
    const newData: ProviderTrackingData = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      infrastructureFailures: 0,
      totalLatencySum: 0,
      latencyCount: 0,
      recentEvents: [],
    };
    this._data.set(providerId, newData);
    return newData;
  }

  private _recalculateScore(providerId: string): void {
    const data = this._data.get(providerId);
    if (!data) return;

    const oldScore = this._scores.get(providerId) ?? this._config.baselineScore;
    const metrics = this._buildMetrics(providerId, data);
    const newScore = metrics.compositeScore;

    this._scores.set(providerId, newScore);

    if (Math.abs(newScore - oldScore) > 0.5) {
      this.emit('score:updated', { providerId, oldScore, newScore });
    }
    this.emit('score:calculated', { providerId, score: newScore, metrics });
  }

  private _buildMetrics(providerId: string, data: ProviderTrackingData): ProviderScoringMetrics {
    const total = data.totalRequests;
    const weights = this._config.weights;

    // ── Raw rates ──────────────────────────────────────────────────
    const successRate = total > 0 ? data.successfulRequests / total : 0;
    const failurePercent = total > 0 ? data.failedRequests / total : 0;
    const timeoutPercent = total > 0 ? data.timeoutRequests / total : 0;
    const availability = total > 0
      ? (total - data.infrastructureFailures) / total
      : 0;

    // ── Average latency ────────────────────────────────────────────
    const avgLatencyMs = data.latencyCount > 0
      ? data.totalLatencySum / data.latencyCount
      : 0;

    // ── Latency normalization (exponential decay) ──────────────────
    // At referenceLatencyMs, normalized ≈ 0.37; at 0ms, normalized = 1.0
    const latencyNormalized = avgLatencyMs > 0
      ? Math.exp(-avgLatencyMs / this._config.referenceLatencyMs)
      : 1.0;

    // ── Score component calculation ────────────────────────────────
    const successRateContribution = successRate * weights.successRate;
    const latencyContribution = latencyNormalized * weights.latency;
    const failureRateContribution = (1 - failurePercent) * weights.failureRate;
    const timeoutRateContribution = (1 - timeoutPercent) * weights.timeoutRate;
    const availabilityContribution = availability * weights.availability;

    // ── Composite score ────────────────────────────────────────────
    // Blend baseline with actual data when insufficient data points
    let compositeScore: number;
    if (total < this._config.minDataPoints) {
      const blendRatio = total / this._config.minDataPoints;
      const actualScore =
        successRateContribution +
        latencyContribution +
        failureRateContribution +
        timeoutRateContribution +
        availabilityContribution;
      compositeScore = this._config.baselineScore * (1 - blendRatio) + actualScore * blendRatio;
    } else {
      compositeScore =
        successRateContribution +
        latencyContribution +
        failureRateContribution +
        timeoutRateContribution +
        availabilityContribution;
    }

    // Clamp to 0–100
    compositeScore = Math.max(0, Math.min(100, compositeScore));

    // ── Recent request count ───────────────────────────────────────
    const cutoff = Date.now() - this._config.recentWindowMs;
    const recentRequests = data.recentEvents.filter((e) => e.timestamp >= cutoff).length;

    return {
      providerId,
      totalRequests: total,
      successfulRequests: data.successfulRequests,
      failedRequests: data.failedRequests,
      timeoutRequests: data.timeoutRequests,
      infrastructureFailures: data.infrastructureFailures,
      avgLatencyMs,
      successRate,
      failurePercent,
      timeoutPercent,
      availability,
      compositeScore,
      scoreComponents: {
        successRateContribution,
        latencyContribution,
        failureRateContribution,
        timeoutRateContribution,
        availabilityContribution,
      },
      lastUpdated: new Date(),
      recentRequests,
    };
  }

  private _pruneRecentEvents(data: ProviderTrackingData): void {
    // Prune when events exceed 20x minDataPoints to keep memory bounded
    const maxEvents = this._config.minDataPoints * 20;
    if (data.recentEvents.length > maxEvents) {
      const cutoff = Date.now() - this._config.recentWindowMs;
      data.recentEvents = data.recentEvents.filter((e) => e.timestamp >= cutoff);
    }
  }
}
