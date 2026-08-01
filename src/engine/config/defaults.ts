/**
 * NovaDL Engine — Default Configuration Values
 *
 * These defaults are used when no explicit configuration is provided.
 * They are tuned for production use: sensible timeouts, moderate caching,
 * safe security defaults, and no debug flags.
 *
 * @module config/defaults
 */

import type {
  NovaDLConfig,
  ServerConfig,
  CacheConfig,
  QueueConfig,
  SecurityConfig,
  ExtractionConfig,
  MonitoringConfig,
  PluginConfig,
} from '../types/index';

// ─── Server Defaults ──────────────────────────────────────────────────

/** Default server configuration — production-ready HTTP settings. */
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3000,
  host: '0.0.0.0',
  logLevel: 'info',
  debug: false,
  cors: {
    enabled: true,
    origins: ['*'],
  },
};

// ─── Cache Defaults ────────────────────────────────────────────────────

/** Default cache configuration — in-memory LRU with 30-minute TTL. */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  adapter: 'memory',
  ttlMs: 30 * 60 * 1000,       // 30 minutes
  maxEntries: 10_000,
};

// ─── Queue Defaults ────────────────────────────────────────────────────

/** Default queue configuration — in-memory with 4 concurrent workers. */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  adapter: 'memory',
  concurrency: 4,
};

// ─── Security Defaults ─────────────────────────────────────────────────

/** Default security configuration — conservative rate limiting and SSRF protection. */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  rateLimit: {
    max: 100,                    // 100 requests per window
    windowMs: 60 * 1000,         // 1 minute
  },
  maxUrlLength: 2048,
  ssrfBlockedHosts: [
    '127.0.0.1',
    'localhost',
    '0.0.0.0',
    '::1',
    '169.254.0.0/16',            // AWS metadata endpoint
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    'metadata.google.internal',
  ],
  requestSigning: {
    enabled: false,
  },
  abuseDetection: {
    enabled: true,
    threshold: 5,                // Flag after 5 rapid identical requests
    windowMs: 10 * 1000,         // 10-second detection window
  },
};

// ─── Extraction Defaults ───────────────────────────────────────────────

/** Default extraction configuration — 30s timeout, 3 retries with backoff. */
export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  defaultTimeoutMs: 30_000,     // 30 seconds
  maxRetries: 3,
  retryBackoffMs: 1_000,        // 1 second (doubles on each retry)
  parallelProviderTests: false,
  streamBufferSize: 64 * 1024,  // 64 KB
  ytdlpPath: 'yt-dlp',
  ytdlpTimeoutMs: 60_000,      // 60 seconds
};

// ─── Monitoring Defaults ───────────────────────────────────────────────

/** Default monitoring configuration — health checks every 30s, metrics enabled. */
export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  healthCheckIntervalMs: 30_000, // 30 seconds
  metricsEnabled: true,
  profilingEnabled: false,
};

// ─── Plugin Defaults ────────────────────────────────────────────────────

/** Default plugin configuration — auto-load disabled for production safety. */
export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  autoLoad: false,
};

// ─── Full Configuration ─────────────────────────────────────────────────

/**
 * The complete default NovaDL Engine configuration.
 *
 * Every sub-config is defined above individually so consumers can import
 * just the section they need (e.g., `DEFAULT_SERVER_CONFIG` for testing).
 * This composite object is used by the loader as the baseline before
 * merging environment overrides.
 */
export const DEFAULT_CONFIG: NovaDLConfig = {
  server: DEFAULT_SERVER_CONFIG,
  providers: [],
  cache: DEFAULT_CACHE_CONFIG,
  queue: DEFAULT_QUEUE_CONFIG,
  security: DEFAULT_SECURITY_CONFIG,
  extraction: DEFAULT_EXTRACTION_CONFIG,
  monitoring: DEFAULT_MONITORING_CONFIG,
  plugins: DEFAULT_PLUGIN_CONFIG,
};
