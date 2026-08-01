/**
 * NovaDL Engine — Zod Validation Schema
 *
 * Defines the complete validation schema for NovaDLConfig and all sub-configs.
 * Every field is validated with appropriate constraints and transformations.
 * The schema is used by the loader to ensure config correctness before the
 * engine starts, and can also be used at runtime for dynamic config updates.
 *
 * @module config/schema
 */

import { z } from 'zod';

// ─── Server Schema ─────────────────────────────────────────────────────

/**
 * Valid log levels matching the ServerConfig.logLevel union type.
 */
const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

/**
 * Schema for the CORS sub-config within ServerConfig.
 */
export const CorsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  origins: z.array(z.string().min(1)).default(['*']),
});

/**
 * Schema for ServerConfig.
 *
 * - `port` must be a valid TCP/UDP port (1–65535), coerced from string.
 * - `host` must be a non-empty hostname or IP.
 * - `logLevel` must be one of the seven recognised levels.
 * - `debug` is a boolean flag; defaults to `false`.
 * - `cors` is validated via its own sub-schema.
 */
export const ServerConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  host: z.string().min(1).default('0.0.0.0'),
  logLevel: z.enum(LOG_LEVELS).default('info'),
  debug: z.boolean().default(false),
  cors: CorsConfigSchema.default({ enabled: true, origins: ['*'] }),
});

// ─── Provider Schema ────────────────────────────────────────────────────

/**
 * Valid provider types matching the ProviderType union.
 */
const PROVIDER_TYPES = ['api', 'cli', 'custom'] as const;

/**
 * Valid platform names matching the Platform union type.
 */
const PLATFORMS = [
  'tiktok', 'instagram', 'facebook', 'youtube', 'youtube_shorts',
  'x_twitter', 'pinterest', 'threads', 'snapchat_spotlight', 'reddit',
  'linkedin', 'vimeo', 'dailymotion', 'likee', 'bilibili', 'capcut',
  'soundcloud', 'spotify', 'lemon8', 'unknown',
] as const;

/**
 * Schema for an individual ProviderConfig entry.
 *
 * - `id` must be a non-empty identifier string.
 * - `name` must be a non-empty human-readable label.
 * - `type` must be one of 'api', 'cli', 'custom'.
 * - `enabled` defaults to `true`.
 * - `priority` must be ≥ 0 (lower = higher priority).
 * - `timeout` must be > 0 ms.
 * - `maxRetries` must be ≥ 0.
 * - `platforms` must be a non-empty array of known platforms.
 * - `apiKey` and `baseUrl` are optional strings.
 * - `customOptions` is an optional free-form record.
 */
export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(PROVIDER_TYPES),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  timeout: z.number().int().positive().default(30_000),
  maxRetries: z.number().int().min(0).default(3),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.string().min(1).optional()),
  customOptions: z.record(z.string(), z.unknown()).optional(),
});

// ─── Cache Schema ──────────────────────────────────────────────────────

/**
 * Valid cache adapters matching the CacheConfig.adapter union type.
 */
const CACHE_ADAPTERS = ['memory', 'redis', 'file', 'custom'] as const;

/**
 * Schema for CacheConfig.
 *
 * - `adapter` must be one of the recognised adapter names.
 * - `ttlMs` must be > 0 (coerced from string if needed).
 * - `maxEntries` must be ≥ 1.
 * - `redisUrl` is required **only** when adapter is 'redis'; otherwise optional.
 *   The loader/validator handles the cross-field constraint; here we only
 *   validate the shape.
 * - `filePath` is required **only** when adapter is 'file'; same approach.
 */
export const CacheConfigSchema = z.object({
  adapter: z.enum(CACHE_ADAPTERS).default('memory'),
  ttlMs: z.coerce.number().int().positive().default(30 * 60 * 1000),
  maxEntries: z.coerce.number().int().min(1).default(10_000),
  redisUrl: z.string().url().optional(),
  filePath: z.string().min(1).optional(),
});

// ─── Queue Schema ──────────────────────────────────────────────────────

/**
 * Valid queue adapters matching the QueueConfig.adapter union type.
 */
const QUEUE_ADAPTERS = ['memory', 'redis', 'custom'] as const;

/**
 * Schema for QueueConfig.
 *
 * - `adapter` must be one of the recognised adapter names.
 * - `concurrency` must be ≥ 1 (coerced from string).
 * - `redisUrl` is required only when adapter is 'redis'.
 */
export const QueueConfigSchema = z.object({
  adapter: z.enum(QUEUE_ADAPTERS).default('memory'),
  concurrency: z.coerce.number().int().min(1).default(4),
  redisUrl: z.string().url().optional(),
});

// ─── Security Schema ────────────────────────────────────────────────────

/**
 * Schema for the rate-limit sub-config within SecurityConfig.
 */
export const RateLimitConfigSchema = z.object({
  max: z.coerce.number().int().min(1).default(100),
  windowMs: z.coerce.number().int().positive().default(60 * 1000),
});

/**
 * Schema for the request-signing sub-config within SecurityConfig.
 */
export const RequestSigningConfigSchema = z.object({
  enabled: z.boolean().default(false),
  secret: z.string().min(8).optional(),
});

/**
 * Schema for the abuse-detection sub-config within SecurityConfig.
 */
export const AbuseDetectionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  threshold: z.coerce.number().int().min(1).default(5),
  windowMs: z.coerce.number().int().positive().default(10 * 1000),
});

/**
 * Schema for SecurityConfig.
 *
 * - `maxUrlLength` must be ≥ 1 (URLs must have some length).
 * - `ssrfBlockedHosts` is an array of host patterns; defaults to private ranges.
 * - `requestSigning.secret` must be ≥ 8 chars if signing is enabled.
 */
export const SecurityConfigSchema = z.object({
  rateLimit: RateLimitConfigSchema.default({ max: 100, windowMs: 60_000 }),
  maxUrlLength: z.coerce.number().int().min(1).max(65_536).default(2048),
  ssrfBlockedHosts: z.array(z.string().min(1)).default([
    '127.0.0.1', 'localhost', '0.0.0.0', '::1',
    '169.254.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
    'metadata.google.internal',
  ]),
  requestSigning: RequestSigningConfigSchema.default({ enabled: false }),
  abuseDetection: AbuseDetectionConfigSchema.default({ enabled: true, threshold: 5, windowMs: 10_000 }),
});

// ─── Extraction Schema ──────────────────────────────────────────────────

/**
 * Schema for ExtractionConfig.
 *
 * - All timeouts must be positive integers.
 * - `ytdlpPath` must be a non-empty string (the binary name or full path).
 * - `streamBufferSize` must be ≥ 1024 bytes (1 KB minimum).
 */
export const ExtractionConfigSchema = z.object({
  defaultTimeoutMs: z.coerce.number().int().positive().default(30_000),
  maxRetries: z.coerce.number().int().min(0).max(10).default(3),
  retryBackoffMs: z.coerce.number().int().positive().default(1_000),
  parallelProviderTests: z.boolean().default(false),
  streamBufferSize: z.coerce.number().int().min(1024).default(64 * 1024),
  ytdlpPath: z.string().min(1).default('yt-dlp'),
  ytdlpTimeoutMs: z.coerce.number().int().positive().default(60_000),
});

// ─── Monitoring Schema ──────────────────────────────────────────────────

/**
 * Schema for MonitoringConfig.
 *
 * - `healthCheckIntervalMs` must be ≥ 5000 (5 s minimum to avoid thrashing).
 * - `metricsEnabled` and `profilingEnabled` are boolean flags.
 */
export const MonitoringConfigSchema = z.object({
  healthCheckIntervalMs: z.coerce.number().int().min(5_000).default(30_000),
  metricsEnabled: z.boolean().default(true),
  profilingEnabled: z.boolean().default(false),
});

// ─── Plugin Schema ──────────────────────────────────────────────────────

/**
 * Schema for PluginConfig.
 *
 * - `directory` is an optional filesystem path for plugin discovery.
 * - `autoLoad` defaults to `false` for production safety.
 * - `enabledPlugins` / `disabledPlugins` are optional arrays of plugin IDs.
 */
export const PluginConfigSchema = z.object({
  directory: z.string().min(1).optional(),
  autoLoad: z.boolean().default(false),
  enabledPlugins: z.array(z.string().min(1)).optional(),
  disabledPlugins: z.array(z.string().min(1)).optional(),
});

// ─── Root Schema ────────────────────────────────────────────────────────

/**
 * The complete NovaDLConfig Zod schema.
 *
 * This is the top-level validation entry point. It composes all sub-schemas
 * and adds defaults where appropriate. The `providers` array defaults to
 * empty; the `custom` record is optional.
 *
 * Usage:
 * ```ts
 * import { NovaDLConfigSchema } from './schema';
 * const parsed = NovaDLConfigSchema.parse(rawConfig);
 * // parsed is fully typed as NovaDLConfig
 * ```
 */
export const NovaDLConfigSchema = z.object({
  server: ServerConfigSchema,
  providers: z.array(ProviderConfigSchema).default([]),
  cache: CacheConfigSchema,
  queue: QueueConfigSchema,
  security: SecurityConfigSchema,
  extraction: ExtractionConfigSchema,
  monitoring: MonitoringConfigSchema,
  plugins: PluginConfigSchema,
  custom: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Inferred TypeScript type from the Zod schema.
 * Should match the hand-written `NovaDLConfig` interface exactly.
 * Exported so downstream code can use it without importing from types.
 */
export type NovaDLConfigSchemaType = z.infer<typeof NovaDLConfigSchema>;
