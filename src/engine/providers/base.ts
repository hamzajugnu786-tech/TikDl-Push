/**
 * NovaDL Engine — Provider Abstraction Layer
 * 
 * This is the contract that every extraction provider must implement.
 * Providers are the muscle of the engine — they perform the actual
 * extraction work for each platform.
 * 
 * The abstraction ensures that:
 * - Providers can be swapped without changing engine logic
 * - New providers can be added via the plugin system
 * - Failover between providers is seamless
 * - Health monitoring works uniformly across all providers
 */

import type {
  Platform,
  MediaType,
  MediaFormat,
  ProviderConfig,
  ProviderHealth,
  ProviderCapabilities,
  ExtractionRequest,
  ExtractionResult,
  VideoQuality,
  AudioQuality,
} from '../types/index';

// ─── Provider Interface ────────────────────────────────────────────
/**
 * IProvider — The contract every extraction provider must satisfy.
 * 
 * Think of this as a "strategy pattern" interface. The engine doesn't
 * care HOW a provider extracts media — only that it can deliver
 * structured results through a consistent API.
 */
export interface IProvider {
  /** Unique identifier for this provider (e.g., 'ytdlp', 'tikhub') */
  readonly id: string;

  /** Human-readable name (e.g., 'yt-dlp CLI Extractor') */
  readonly name: string;

  /** Provider category */
  readonly type: 'api' | 'cli' | 'custom';

  /** Current configuration */
  config: ProviderConfig;

  /**
   * Initialize the provider — validate config, set up connections,
   * prepare resources. Called once during engine startup.
   */
  initialize(): Promise<void>;

  /**
   * Extract media from a URL.
   * 
   * This is the main entry point. The provider receives a validated
   * request and must return a complete ExtractionResult or throw
   * a ProviderError with enough detail for the fallback system.
   */
  extract(request: ExtractionRequest): Promise<ExtractionResult>;

  /**
   * Check if this provider can handle the given platform.
   * Used by the provider selector during the pipeline's detect stage.
   */
  supports(platform: Platform): boolean;

  /**
   * Check if this provider can deliver the requested media type/format.
   * Enables fine-grained capability matching.
   */
  canDeliver(
    mediaType: MediaType,
    format?: MediaFormat,
    quality?: VideoQuality | AudioQuality,
  ): boolean;

  /**
   * Perform a health check against the provider.
   * Used by the health monitoring system to track provider reliability.
   * Should return quickly (< 5s) and not consume quota.
   */
  healthCheck(): Promise<ProviderHealth>;

  /**
   * Get a description of what this provider can do.
   * Used for capability-based provider selection.
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Gracefully shut down the provider — close connections,
   * clean up resources. Called during engine shutdown.
   */
  shutdown(): Promise<void>;
}

// ─── Provider Error ────────────────────────────────────────────────
/**
 * ProviderError — Structured error type for provider failures.
 * 
 * Carries enough information for the fallback and retry systems
 * to make smart decisions about what to do next.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly code: ProviderErrorCode,
    public readonly retryable: boolean = false,
    public readonly platform?: Platform,
    public readonly originalError?: Error,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /** Create a ProviderError from an unknown thrown value */
  static fromUnknown(providerId: string, error: unknown, platform?: Platform): ProviderError {
    if (error instanceof ProviderError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof Error && error.message.includes('timeout')
      ? 'TIMEOUT'
      : 'UNKNOWN';
    return new ProviderError(
      message,
      providerId,
      code,
      code === 'TIMEOUT',
      platform,
      error instanceof Error ? error : undefined,
    );
  }
}

export type ProviderErrorCode =
  | 'TIMEOUT'            // Provider exceeded its time limit
  | 'RATE_LIMITED'       // Provider's API quota exhausted
  | 'AUTH_FAILED'        // API key or credentials invalid
  | 'NOT_FOUND'          // Content not found on platform
  | 'UNSUPPORTED'        // Provider doesn't support this platform/URL
  | 'GEO_BLOCKED'        // Content geo-restricted
  | 'PRIVATE'            // Content is private/restricted
  | 'FORMAT_UNAVAILABLE' // Requested format not available
  | 'NETWORK'            // Network-level failure (DNS, connection)
  | 'PARSE_ERROR'        // Provider returned unparseable data
  | 'QUOTA_EXCEEDED'     // Monthly/daily quota hit
  | 'CONFIG_ERROR'       // Provider misconfigured
  | 'UNKNOWN';           // Unclassified failure

// ─── Provider Factory ──────────────────────────────────────────────
/**
 * IProviderFactory — Creates provider instances from configs.
 * 
 * The engine uses factories to instantiate providers dynamically,
 * enabling runtime configuration and plugin-driven provider creation.
 */
export interface IProviderFactory {
  /** The provider type this factory creates */
  readonly type: string;

  /** Create a new provider instance from a config */
  create(config: ProviderConfig): IProvider;

  /** Validate that a config is suitable for this factory */
  validateConfig(config: ProviderConfig): boolean;
}

// ─── Base Provider ─────────────────────────────────────────────────
/**
 * BaseProvider — Shared logic that all providers can inherit.
 * 
 * Provides common health tracking, retry counting, and lifecycle
 * management. Providers only need to implement extract() and
 * declare their capabilities.
 */
export abstract class BaseProvider implements IProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly type: 'api' | 'cli' | 'custom';

  config: ProviderConfig;

  protected _health: ProviderHealth = {
    status: 'unknown',
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
  };

  protected _initialized = false;
  protected _shuttingDown = false;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract initialize(): Promise<void>;
  abstract extract(request: ExtractionRequest): Promise<ExtractionResult>;
  abstract supports(platform: Platform): boolean;
  abstract getCapabilities(): ProviderCapabilities;

  canDeliver(
    mediaType: MediaType,
    format?: MediaFormat,
    quality?: VideoQuality | AudioQuality,
  ): boolean {
    const caps = this.getCapabilities();
    if (!caps.mediaTypes.includes(mediaType)) return false;
    if (format && !caps.formats.includes(format)) return false;
    if (quality && !caps.qualities.includes(quality)) return false;
    return true;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ...this._health };
  }

  async shutdown(): Promise<void> {
    this._shuttingDown = true;
    this._initialized = false;
  }

  /** Update health after a successful extraction */
  protected recordSuccess(latencyMs: number): void {
    this._health = {
      ...this._health,
      status: 'healthy',
      latencyMs,
      lastChecked: new Date(),
      consecutiveFailures: 0,
      consecutiveSuccesses: (this._health.consecutiveSuccesses ?? 0) + 1,
      successRate: this._calculateSuccessRate(true),
    };
  }

  /** Update health after a failed extraction */
  protected recordFailure(error: string, latencyMs?: number): void {
    this._health = {
      ...this._health,
      status: (this._health.consecutiveFailures ?? 0) >= 3 ? 'unhealthy' : 'degraded',
      latencyMs,
      lastChecked: new Date(),
      lastError: error,
      consecutiveFailures: (this._health.consecutiveFailures ?? 0) + 1,
      consecutiveSuccesses: 0,
      successRate: this._calculateSuccessRate(false),
    };
  }

  private _calculateSuccessRate(success: boolean): number {
    const total = (this._health.consecutiveFailures ?? 0) + (this._health.consecutiveSuccesses ?? 0) + 1;
    const successes = success
      ? (this._health.consecutiveSuccesses ?? 0) + 1
      : (this._health.consecutiveSuccesses ?? 0);
    return successes / total;
  }

  /** Check if provider is ready to handle requests */
  protected ensureInitialized(): void {
    if (!this._initialized) {
      throw new ProviderError(
        `Provider ${this.id} not initialized`,
        this.id,
        'CONFIG_ERROR',
        false,
      );
    }
    if (this._shuttingDown) {
      throw new ProviderError(
        `Provider ${this.id} is shutting down`,
        this.id,
        'CONFIG_ERROR',
        false,
      );
    }
  }

  /** Apply timeout to an extraction promise */
  protected withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ProviderError(
          `Provider ${this.id} timed out after ${timeoutMs}ms`,
          this.id,
          'TIMEOUT',
          true,
        ));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(ProviderError.fromUnknown(this.id, error));
        });
    });
  }
}
