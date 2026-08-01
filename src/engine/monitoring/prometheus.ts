/**
 * NovaDL Engine — Prometheus Metrics Exporter
 *
 * Production-grade Prometheus metrics exporter using prom-client.
 * The prom-client library is loaded dynamically at runtime — if
 * it is not installed, all methods gracefully degrade to no-ops.
 * This follows the same lazy-load pattern used by RedisCacheAdapter
 * for ioredis.
 *
 * Exposes NovaDL-specific metrics for monitoring dashboards,
 * alerting, and observability platforms.
 */

import type {
  Registry,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';
import type { Platform, ProviderStatus } from '../types/index';
import type { NovaLogger } from './logger';

/** Type alias for the dynamically loaded prom-client module */
interface PromClientModule {
  Registry: typeof Registry;
  Counter: typeof Counter;
  Histogram: typeof Histogram;
  Gauge: typeof Gauge;
  collectDefaultMetrics: (configuration?: { register?: Registry }) => void;
  register: Registry;
}

/** Security event types that can be recorded */
export type SecurityEventType =
  | 'request_signing_failure'
  | 'ssrf_block'
  | 'rate_limit_block';

/** Numeric mapping for provider health status to gauge values */
const HEALTH_STATUS_MAP: Record<ProviderStatus, number> = {
  healthy: 1,
  degraded: 0.5,
  unhealthy: 0,
  unknown: -1,
  disabled: -2,
};

export class PrometheusExporter {
  private _logger: NovaLogger;
  private _promClient: PromClientModule | null = null;
  private _registry: Registry | null = null;
  private _initialized = false;

  // ─── Metric handles (set during initialize) ────────────────────────
  private _extractionsTotal: Counter | null = null;
  private _extractionDurationMs: Histogram | null = null;
  private _providerHealthGauge: Gauge | null = null;
  private _cacheOperationsTotal: Counter | null = null;
  private _activeExtractions: Gauge | null = null;
  private _queueSize: Gauge | null = null;
  private _requestSigningFailures: Counter | null = null;
  private _ssrfBlocksTotal: Counter | null = null;
  private _rateLimitBlocksTotal: Counter | null = null;

  constructor(logger: NovaLogger) {
    this._logger = logger.child({ component: 'prometheus-exporter' });
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  /**
   * Dynamically load prom-client and set up the registry,
   * NovaDL-specific metrics, and default Node.js metrics.
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    try {
      const promClientModule = await import('prom-client');
      const pc: PromClientModule = promClientModule.default ?? promClientModule;
      this._promClient = pc;

      this._registry = new pc.Registry();

      // Collect default Node.js metrics (GC, event loop lag, etc.)
      pc.collectDefaultMetrics({ register: this._registry });

      // ─── NovaDL custom metrics ──────────────────────────────────────
      this._extractionsTotal = new pc.Counter({
        name: 'novadl_extractions_total',
        help: 'Total number of media extractions',
        labelNames: ['platform', 'provider', 'status'],
        registers: [this._registry],
      });

      this._extractionDurationMs = new pc.Histogram({
        name: 'novadl_extraction_duration_ms',
        help: 'Extraction duration in milliseconds',
        labelNames: ['platform', 'provider'],
        buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
        registers: [this._registry],
      });

      this._providerHealthGauge = new pc.Gauge({
        name: 'novadl_provider_health_gauge',
        help: 'Provider health status (1=healthy, 0.5=degraded, 0=unhealthy, -1=unknown, -2=disabled)',
        labelNames: ['provider_id'],
        registers: [this._registry],
      });

      this._cacheOperationsTotal = new pc.Counter({
        name: 'novadl_cache_operations_total',
        help: 'Total cache operations',
        labelNames: ['operation', 'adapter'],
        registers: [this._registry],
      });

      this._activeExtractions = new pc.Gauge({
        name: 'novadl_active_extractions',
        help: 'Number of currently active extractions',
        registers: [this._registry],
      });

      this._queueSize = new pc.Gauge({
        name: 'novadl_queue_size',
        help: 'Current queue size by priority level',
        labelNames: ['priority'],
        registers: [this._registry],
      });

      this._requestSigningFailures = new pc.Counter({
        name: 'novadl_request_signing_failures',
        help: 'Total request signing failures',
        registers: [this._registry],
      });

      this._ssrfBlocksTotal = new pc.Counter({
        name: 'novadl_ssrf_blocks_total',
        help: 'Total SSRF blocks',
        registers: [this._registry],
      });

      this._rateLimitBlocksTotal = new pc.Counter({
        name: 'novadl_rate_limit_blocks_total',
        help: 'Total rate-limit blocks',
        labelNames: ['key'],
        registers: [this._registry],
      });

      this._initialized = true;
      this._logger.info('Prometheus exporter initialized', { metricsCount: 9 });
    } catch (error) {
      this._logger.warn('prom-client not available — Prometheus metrics disabled', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ─── Metric recording methods ──────────────────────────────────────

  /** Record an extraction result with platform, provider, duration, and status */
  recordExtraction(platform: Platform, provider: string, durationMs: number, status: string): void {
    if (!this._extractionsTotal || !this._extractionDurationMs) return;

    this._extractionsTotal.inc({ platform, provider, status });
    this._extractionDurationMs.observe({ platform, provider }, durationMs);
  }

  /** Record a cache operation (hit, miss, set, evict, etc.) */
  recordCacheOp(operation: string, adapter: string): void {
    if (!this._cacheOperationsTotal) return;

    this._cacheOperationsTotal.inc({ operation, adapter });
  }

  /** Update the provider health gauge with a numeric health status */
  recordProviderHealth(providerId: string, healthStatus: ProviderStatus): void {
    if (!this._providerHealthGauge) return;

    const value = HEALTH_STATUS_MAP[healthStatus];
    this._providerHealthGauge.set({ provider_id: providerId }, value);
  }

  /** Update the number of currently active extractions */
  setActiveExtractions(count: number): void {
    if (!this._activeExtractions) return;

    this._activeExtractions.set(count);
  }

  /** Update queue size for a given priority level */
  setQueueSize(priority: string, size: number): void {
    if (!this._queueSize) return;

    this._queueSize.set({ priority }, size);
  }

  /** Record a security event (request signing failure, SSRF block, rate-limit block) */
  recordSecurityEvent(type: SecurityEventType, key?: string): void {
    switch (type) {
      case 'request_signing_failure':
        if (this._requestSigningFailures) this._requestSigningFailures.inc();
        break;
      case 'ssrf_block':
        if (this._ssrfBlocksTotal) this._ssrfBlocksTotal.inc();
        break;
      case 'rate_limit_block':
        if (this._rateLimitBlocksTotal) this._rateLimitBlocksTotal.inc({ key: key ?? 'unknown' });
        break;
    }
  }

  // ─── Export methods ────────────────────────────────────────────────

  /** Return Prometheus-formatted metrics string for the /metrics endpoint */
  getMetrics(): string {
    if (!this._registry) return '';
    return this._registry.metrics();
  }

  /** Return the standard Prometheus content type header */
  getContentType(): string {
    if (!this._registry) return 'text/plain; version=0.0.4; charset=utf-8';
    return this._registry.contentType;
  }

  /** Check if prom-client was successfully loaded */
  isAvailable(): boolean {
    return this._initialized && this._promClient !== null;
  }
}
