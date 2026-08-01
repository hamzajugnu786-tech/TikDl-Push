/**
 * NovaDL Engine — Weighted Routing System
 *
 * Selects providers based on their composite scores from the
 * ProviderScorer, falling back to priority-based selection when
 * scores are not available. Respects circuit breaker state,
 * automatically skipping providers with open circuits.
 *
 * Selection strategy:
 *   1. Preferred provider: if the request specifies one, try it first
 *      (unless circuit is OPEN).
 *   2. Weighted random: with configurable probability, select from
 *      eligible providers using scores as weights. Higher-scored
 *      providers are chosen more often but not exclusively.
 *   3. Top-score: select the provider with the highest effective score.
 *   4. Priority fallback: when no scores are available, fall back to
 *      the registry's priority order.
 */

import { TypedEmitter } from '../utils/events';
import type { Platform, ExtractionRequest } from '../types/index';
import type { IProvider } from './base';
import type { ProviderRegistry } from './registry';
import type { ProviderScorer } from './scoring';
import type { CircuitBreaker, CircuitState } from './circuit-breaker';

// ─── Configuration ────────────────────────────────────────────────

export interface WeightedRoutingConfig {
  /** Probability of using weighted random vs top-score selection. Default: 0.7 */
  weightedRandomProbability: number;
  /** Score multiplier for HALF_OPEN providers (reduced weight). Default: 0.5 */
  halfOpenScoreMultiplier: number;
}

export const DEFAULT_WEIGHTED_ROUTING_CONFIG: WeightedRoutingConfig = {
  weightedRandomProbability: 0.7,
  halfOpenScoreMultiplier: 0.5,
};

// ─── Selection Result ─────────────────────────────────────────────

export interface ProviderSelection {
  providerId: string;
  provider: IProvider;
  score: number;
  selectionMethod: 'weighted' | 'priority' | 'preferred';
  circuitState: CircuitState;
}

// ─── Internal Eligible Provider ────────────────────────────────────

interface EligibleProvider {
  providerId: string;
  provider: IProvider;
  rawScore: number;
  effectiveScore: number;
  hasScoreData: boolean;
  circuitState: CircuitState;
}

// ─── Routing Events ───────────────────────────────────────────────

export interface WeightedRoutingEvents {
  'provider:selected': { providerId: string; platform: Platform; method: 'weighted' | 'priority' | 'preferred' };
  'provider:skipped': { providerId: string; platform: Platform; reason: 'circuit_open' };
  'providers:selected_chain': { providerIds: string[]; platform: Platform; count: number };
}

// ─── WeightedRouter ──────────────────────────────────────────────

export class WeightedRouter extends TypedEmitter<WeightedRoutingEvents> {
  private _registry: ProviderRegistry;
  private _scorer: ProviderScorer;
  private _circuitBreaker: CircuitBreaker;
  private _config: WeightedRoutingConfig;
  private _effectiveWeights: Map<string, number> = new Map();

  constructor(
    registry: ProviderRegistry,
    scorer: ProviderScorer,
    circuitBreaker: CircuitBreaker,
    config?: Partial<WeightedRoutingConfig>,
  ) {
    super();
    this._registry = registry;
    this._scorer = scorer;
    this._circuitBreaker = circuitBreaker;
    this._config = { ...DEFAULT_WEIGHTED_ROUTING_CONFIG, ...config };
  }

  // ─── Provider Selection ──────────────────────────────────────────

  /**
   * Select the best available provider for a given request and platform.
   * Respects preferred provider requests, circuit breaker state, and
   * uses weighted scoring for selection when data is available.
   * Returns null if no eligible providers are found.
   */
  selectProvider(request: ExtractionRequest, platform: Platform): ProviderSelection | null {
    // ── Preferred provider ──────────────────────────────────────
    if (request.preferredProvider) {
      const preferredResult = this._tryPreferredProvider(request.preferredProvider, platform);
      if (preferredResult !== null) return preferredResult;
    }

    // ── Score-based or priority-based selection ─────────────────
    const eligible = this._getEligibleProviders(platform);
    if (eligible.length === 0) return null;

    // Decide between weighted random and top-score selection
    const hasScoreData = eligible.some((ep) => ep.hasScoreData);
    if (hasScoreData && Math.random() < this._config.weightedRandomProbability) {
      return this._weightedRandomSelect(eligible, platform);
    }
    return this._topScoreSelect(eligible, platform);
  }

  /**
   * Select top N providers for a fallback chain. The first provider
   * is the best candidate; subsequent providers serve as fallbacks
   * if the first fails.
   */
  selectProviders(request: ExtractionRequest, platform: Platform, count: number): ProviderSelection[] {
    const selections: ProviderSelection[] = [];

    // ── Preferred provider first ──────────────────────────────
    if (request.preferredProvider) {
      const preferredResult = this._tryPreferredProvider(request.preferredProvider, platform);
      if (preferredResult !== null) {
        selections.push(preferredResult);
      }
    }

    // ── Fill remaining slots from eligible providers ────────────
    const eligible = this._getEligibleProviders(platform);
    const selectedIds = new Set(selections.map((s) => s.providerId));
    const remaining = eligible
      .filter((ep) => !selectedIds.has(ep.providerId))
      .sort((a, b) => b.effectiveScore - a.effectiveScore);

    for (const ep of remaining) {
      if (selections.length >= count) break;
      selections.push({
        providerId: ep.providerId,
        provider: ep.provider,
        score: ep.rawScore,
        selectionMethod: ep.hasScoreData ? 'weighted' : 'priority',
        circuitState: ep.circuitState,
      });
    }

    if (selections.length > 0) {
      this.emit('providers:selected_chain', {
        providerIds: selections.map((s) => s.providerId),
        platform,
        count: selections.length,
      });
    }

    return selections;
  }

  // ─── Weight Management ──────────────────────────────────────────

  /**
   * Recalculate effective weights from latest scores and circuit states.
   * Stores precomputed weights for faster selection lookups.
   */
  updateWeights(): void {
    this._effectiveWeights.clear();
    const providers = this._registry.getEnabled();
    for (const provider of providers) {
      const rawScore = this._scorer.getScore(provider.id);
      const circuitState = this._circuitBreaker.getState(provider.id);
      const effectiveScore = circuitState === 'HALF_OPEN'
        ? rawScore * this._config.halfOpenScoreMultiplier
        : rawScore;
      this._effectiveWeights.set(provider.id, effectiveScore);
    }
  }

  // ─── Configuration ──────────────────────────────────────────────

  /** Get the current routing configuration */
  getConfig(): WeightedRoutingConfig {
    return { ...this._config };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private _tryPreferredProvider(providerId: string, platform: Platform): ProviderSelection | null {
    const provider = this._registry.get(providerId);
    if (!provider) return null;
    if (!provider.config.enabled) return null;
    if (!provider.supports(platform)) return null;

    const circuitState = this._circuitBreaker.getState(providerId);
    if (circuitState === 'OPEN') {
      this.emit('provider:skipped', { providerId, platform, reason: 'circuit_open' });
      return null;
    }

    this.emit('provider:selected', { providerId, platform, method: 'preferred' });

    return {
      providerId,
      provider,
      score: this._scorer.getScore(providerId),
      selectionMethod: 'preferred',
      circuitState,
    };
  }

  private _getEligibleProviders(platform: Platform): EligibleProvider[] {
    const providers = this._registry.getByPlatform(platform);
    const eligible: EligibleProvider[] = [];

    for (const provider of providers) {
      const circuitState = this._circuitBreaker.getState(provider.id);

      if (circuitState === 'OPEN') {
        this.emit('provider:skipped', { providerId: provider.id, platform, reason: 'circuit_open' });
        continue;
      }

      const rawScore = this._scorer.getScore(provider.id);
      const hasScoreData = this._scorer.getMetrics(provider.id).totalRequests > 0;

      // Use cached effective weight when available; compute on-the-fly otherwise
      const cachedWeight = this._effectiveWeights.get(provider.id);
      const effectiveScore = cachedWeight !== undefined
        ? cachedWeight
        : (circuitState === 'HALF_OPEN'
          ? rawScore * this._config.halfOpenScoreMultiplier
          : rawScore);

      eligible.push({
        providerId: provider.id,
        provider,
        rawScore,
        effectiveScore,
        hasScoreData,
        circuitState,
      });
    }

    return eligible;
  }

  private _weightedRandomSelect(eligible: EligibleProvider[], platform: Platform): ProviderSelection {
    const totalWeight = eligible.reduce((sum, ep) => sum + ep.effectiveScore, 0);

    // If all weights are zero, fall back to top-score (priority) selection
    if (totalWeight <= 0) {
      return this._topScoreSelect(eligible, platform);
    }

    let remaining = Math.random() * totalWeight;
    let selected: EligibleProvider | null = null;

    for (const ep of eligible) {
      remaining -= ep.effectiveScore;
      if (remaining <= 0 && selected === null) {
        selected = ep;
      }
    }

    // Fallback for floating-point edge case: pick the highest-scoring provider
    const chosen = selected ?? eligible.reduce(
      (best, current) => current.effectiveScore > best.effectiveScore ? current : best,
    );

    this.emit('provider:selected', { providerId: chosen.providerId, platform, method: 'weighted' });
    return {
      providerId: chosen.providerId,
      provider: chosen.provider,
      score: chosen.rawScore,
      selectionMethod: 'weighted',
      circuitState: chosen.circuitState,
    };
  }

  private _topScoreSelect(eligible: EligibleProvider[], platform: Platform): ProviderSelection {
    // Find the provider with the highest effective score, using registry priority as tiebreaker
    const top = eligible.reduce((best, current) => {
      const scoreDiff = current.effectiveScore - best.effectiveScore;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff > 0 ? current : best;
      // Tiebreaker: lower priority number = higher priority
      return current.provider.config.priority < best.provider.config.priority ? current : best;
    });

    const method = top.hasScoreData ? 'weighted' : 'priority';
    this.emit('provider:selected', { providerId: top.providerId, platform, method });
    return {
      providerId: top.providerId,
      provider: top.provider,
      score: top.rawScore,
      selectionMethod: method,
      circuitState: top.circuitState,
    };
  }
}
