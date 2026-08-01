/**
 * NovaDL Engine — Metrics Collector
 *
 * Tracks extraction performance, provider reliability,
 * cache effectiveness, and system resource usage.
 * Exposes metrics via the API for monitoring dashboards.
 */

import type { EngineMetrics, ProviderMetrics, ProviderStatus } from '../types/index';
import type { NovaLogger } from './logger';

interface MetricsData {
  extractions: {
    total: number;
    successful: number;
    failed: number;
    cached: number;
    fallbackUsed: number;
  };
  providers: Map<string, ProviderMetricsInternal>;
  latencies: number[];
  systemStartTime: Date;
}

interface ProviderMetricsInternal {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
  lastUsedAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
  healthStatus: ProviderStatus;
}

export class MetricsCollector {
  private _logger: NovaLogger;
  private _data: MetricsData;
  private _enabled: boolean;

  constructor(logger: NovaLogger, enabled: boolean = true) {
    this._logger = logger.child({ component: 'metrics' });
    this._enabled = enabled;
    this._data = {
      extractions: {
        total: 0,
        successful: 0,
        failed: 0,
        cached: 0,
        fallbackUsed: 0,
      },
      providers: new Map(),
      latencies: [],
      systemStartTime: new Date(),
    };
  }

  /** Record a successful extraction */
  recordExtractionSuccess(providerId: string, latencyMs: number, cached: boolean = false, fallbackUsed: boolean = false): void {
    if (!this._enabled) return;

    this._data.extractions.total++;
    this._data.extractions.successful++;
    if (cached) this._data.extractions.cached++;
    if (fallbackUsed) this._data.extractions.fallbackUsed++;

    this._data.latencies.push(latencyMs);
    // Keep only last 1000 latency samples for percentile calculation
    if (this._data.latencies.length > 1000) {
      this._data.latencies.shift();
    }

    this._recordProviderSuccess(providerId, latencyMs);
  }

  /** Record a failed extraction */
  recordExtractionFailure(providerId: string, latencyMs: number, error: string): void {
    if (!this._enabled) return;

    this._data.extractions.total++;
    this._data.extractions.failed++;

    this._data.latencies.push(latencyMs);
    // Keep only last 1000 latency samples for percentile calculation
    if (this._data.latencies.length > 1000) {
      this._data.latencies.shift();
    }

    this._recordProviderFailure(providerId, latencyMs, error);
  }

  /** Record a provider success */
  private _recordProviderSuccess(providerId: string, latencyMs: number): void {
    const metrics = this._data.providers.get(providerId) ?? {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      latencies: [],
      healthStatus: 'unknown' as ProviderStatus,
    };

    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.latencies.push(latencyMs);
    if (metrics.latencies.length > 100) metrics.latencies.shift();
    metrics.lastUsedAt = new Date();

    this._data.providers.set(providerId, metrics);
  }

  /** Record a provider failure */
  private _recordProviderFailure(providerId: string, latencyMs: number, error: string): void {
    const metrics = this._data.providers.get(providerId) ?? {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      latencies: [],
      healthStatus: 'unknown' as ProviderStatus,
    };

    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.latencies.push(latencyMs);
    if (metrics.latencies.length > 100) metrics.latencies.shift();
    metrics.lastErrorAt = new Date();
    metrics.lastError = error;

    this._data.providers.set(providerId, metrics);
  }

  /** Get the complete engine metrics snapshot */
  getMetrics(): EngineMetrics {
    const latencies = this._data.latencies;
    const sortedLatencies = [...latencies].sort((a, b) => a - b);

    const providerMetrics: Record<string, ProviderMetrics> = {};
    for (const [id, internal] of this._data.providers) {
      const sorted = [...internal.latencies].sort((a, b) => a - b);
      providerMetrics[id] = {
        totalRequests: internal.totalRequests,
        successfulRequests: internal.successfulRequests,
        failedRequests: internal.failedRequests,
        avgLatencyMs: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
        p50LatencyMs: this._percentile(sorted, 50),
        p95LatencyMs: this._percentile(sorted, 95),
        lastUsedAt: internal.lastUsedAt,
        lastErrorAt: internal.lastErrorAt,
        healthStatus: internal.healthStatus,
      };
    }

    const memoryUsage = process.memoryUsage();

    return {
      extractions: { ...this._data.extractions },
      providers: providerMetrics,
      performance: {
        avgLatencyMs: sortedLatencies.length > 0
          ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
          : 0,
        p50LatencyMs: this._percentile(sortedLatencies, 50),
        p95LatencyMs: this._percentile(sortedLatencies, 95),
        p99LatencyMs: this._percentile(sortedLatencies, 99),
        avgQueueWaitMs: 0, // Updated by queue system
      },
      system: {
        uptimeMs: Date.now() - this._data.systemStartTime.getTime(),
        memoryUsageMb: memoryUsage.heapUsed / (1024 * 1024),
        activeConnections: 0, // Updated by API server
        queueSize: 0, // Updated by queue system
      },
    };
  }

  /** Reset all metrics */
  reset(): void {
    this._data = {
      extractions: { total: 0, successful: 0, failed: 0, cached: 0, fallbackUsed: 0 },
      providers: new Map(),
      latencies: [],
      systemStartTime: new Date(),
    };
  }

  /** Calculate percentile from sorted array */
  private _percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  /** Enable or disable metrics collection */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this._logger.info(`Metrics collection ${enabled ? 'enabled' : 'disabled'}`);
  }
}
