/**
 * NovaDL Engine — Configuration Loader
 *
 * Loads, merges, and validates the engine configuration from multiple sources:
 *
 *   1. **Defaults** — sensible production values defined in `defaults.ts`.
 *   2. **Environment variables** — any variable prefixed with `NOVA_` is
 *      mapped to the corresponding config key (e.g., `NOVA_SERVER_PORT=8080`).
 *   3. **`.env` file** — if present at the working directory, variables are
 *      loaded before process.env is consulted (same `NOVA_` prefix rule).
 *
 * After merging, the full config is validated against the Zod schema. If the
 * config is invalid, a `ConfigLoadError` is thrown with a human-readable
 * message listing every failed field.
 *
 * @module config/loader
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NovaDLConfigSchema } from './schema';
import { DEFAULT_CONFIG } from './defaults';
import type { NovaDLConfig } from '../types/index';

// ─── Error Class ────────────────────────────────────────────────────────

/**
 * Thrown when the configuration cannot be loaded or is invalid.
 *
 * The `details` property contains the full Zod error tree so callers can
 * programmatically inspect which fields failed.
 */
export class ConfigLoadError extends Error {
  /** The Zod error issues (field-level details). */
  public readonly details: ReadonlyArray<{
    path: string;
    message: string;
  }>;

  constructor(zodIssues: Array<{ path: (string | number)[]; message: string }>) {
    const formatted = zodIssues.map(
      (i) => `  • ${i.path.join('.')}: ${i.message}`,
    );
    super(
      `NovaDL configuration is invalid:\n${formatted.join('\n')}\n\n` +
      'Please fix the above fields or check your environment variables (NOVA_* prefix).',
    );
    this.name = 'ConfigLoadError';
    this.details = zodIssues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
  }
}

// ─── Env Mapping ────────────────────────────────────────────────────────

/**
 * Maps `NOVA_`-prefixed environment variable names to deep config keys.
 *
 * Convention:
 *   - `NOVA_SERVER_PORT`        → `server.port`
 *   - `NOVA_SERVER_LOG_LEVEL`   → `server.logLevel`
 *   - `NOVA_SERVER_DEBUG`       → `server.debug`
 *   - `NOVA_SERVER_CORS_ENABLED`→ `server.cors.enabled`
 *   - `NOVA_CACHE_ADAPTER`      → `cache.adapter`
 *   - `NOVA_CACHE_TTL_MS`       → `cache.ttlMs`
 *   - `NOVA_CACHE_MAX_ENTRIES`  → `cache.maxEntries`
 *   - `NOVA_CACHE_REDIS_URL`    → `cache.redisUrl`
 *   - `NOVA_QUEUE_ADAPTER`      → `queue.adapter`
 *   - `NOVA_QUEUE_CONCURRENCY`  → `queue.concurrency`
 *   - `NOVA_QUEUE_REDIS_URL`    → `queue.redisUrl`
 *   - `NOVA_SECURITY_RATE_LIMIT_MAX` → `security.rateLimit.max`
 *   - `NOVA_SECURITY_RATE_LIMIT_WINDOW_MS` → `security.rateLimit.windowMs`
 *   - `NOVA_SECURITY_MAX_URL_LENGTH` → `security.maxUrlLength`
 *   - `NOVA_SECURITY_REQUEST_SIGNING_ENABLED` → `security.requestSigning.enabled`
 *   - `NOVA_SECURITY_REQUEST_SIGNING_SECRET` → `security.requestSigning.secret`
 *   - `NOVA_SECURITY_ABUSE_DETECTION_ENABLED` → `security.abuseDetection.enabled`
 *   - `NOVA_SECURITY_ABUSE_DETECTION_THRESHOLD` → `security.abuseDetection.threshold`
 *   - `NOVA_SECURITY_ABUSE_DETECTION_WINDOW_MS` → `security.abuseDetection.windowMs`
 *   - `NOVA_EXTRACTION_DEFAULT_TIMEOUT_MS` → `extraction.defaultTimeoutMs`
 *   - `NOVA_EXTRACTION_MAX_RETRIES` → `extraction.maxRetries`
 *   - `NOVA_EXTRACTION_RETRY_BACKOFF_MS` → `extraction.retryBackoffMs`
 *   - `NOVA_EXTRACTION_PARALLEL_PROVIDER_TESTS` → `extraction.parallelProviderTests`
 *   - `NOVA_EXTRACTION_STREAM_BUFFER_SIZE` → `extraction.streamBufferSize`
 *   - `NOVA_EXTRACTION_YTDLP_PATH` → `extraction.ytdlpPath`
 *   - `NOVA_EXTRACTION_YTDLP_TIMEOUT_MS` → `extraction.ytdlpTimeoutMs`
 *   - `NOVA_MONITORING_HEALTH_CHECK_INTERVAL_MS` → `monitoring.healthCheckIntervalMs`
 *   - `NOVA_MONITORING_METRICS_ENABLED` → `monitoring.metricsEnabled`
 *   - `NOVA_MONITORING_PROFILING_ENABLED` → `monitoring.profilingEnabled`
 *   - `NOVA_PLUGINS_DIRECTORY` → `plugins.directory`
 *   - `NOVA_PLUGINS_AUTO_LOAD` → `plugins.autoLoad`
 *
 * @param envKey - The environment variable name (e.g., `'NOVA_SERVER_PORT'`).
 * @returns The dot-separated config path (e.g., `'server.port'`), or `null`
 *          if the variable doesn't follow the `NOVA_` prefix convention.
 */
function envKeyToConfigPath(envKey: string): string | null {
  if (!envKey.startsWith('NOVA_')) return null;

  // Strip the NOVA_ prefix and split into segments
  const segments = envKey.slice(5).split('_');

  // The first segment is the top-level config section
  // Remaining segments form the nested path (camelCased where appropriate)
  const section = segments[0]?.toLowerCase();
  if (!section) return null;
  const rest = segments.slice(1);

  // Handle multi-word nested paths by grouping consecutive short segments
  // e.g., RATE_LIMIT_MAX → rateLimit.max
  const pathParts: string[] = [section];
  let i = 0;
  while (i < rest.length) {
    // Look ahead: if the next two tokens form a known compound key,
    // join them in camelCase. Otherwise, take a single token.
    const current = rest[i]?.toLowerCase();
    if (!current) { i += 1; continue; }
    const next = rest[i + 1]?.toLowerCase();

    // Known compound patterns
    const compounds: Record<string, string> = {
      'rate_limit': 'rateLimit',
      'request_signing': 'requestSigning',
      'abuse_detection': 'abuseDetection',
      'log_level': 'logLevel',
      'max_url_length': 'maxUrlLength',
      'default_timeout': 'defaultTimeout',
      'retry_backoff': 'retryBackoff',
      'parallel_provider': 'parallelProvider',
      'stream_buffer': 'streamBuffer',
      'health_check': 'healthCheck',
      'max_entries': 'maxEntries',
      'ytdlp_timeout': 'ytdlpTimeout',
      'ytdlp_path': 'ytdlpPath',
      'cors_origins': 'corsOrigins',
      'redis_url': 'redisUrl',
      'file_path': 'filePath',
      'auto_load': 'autoLoad',
      'enabled_plugins': 'enabledPlugins',
      'disabled_plugins': 'disabledPlugins',
    };

    if (next !== undefined) {
      const compound = `${current}_${next}`;
      if (compounds[compound]) {
        pathParts.push(compounds[compound]);
        i += 2;
        continue;
      }
    }

    pathParts.push(current);
    i += 1;
  }

  return pathParts.join('.');
}

// ─── Env Parsing ────────────────────────────────────────────────────────

/**
 * Attempts to coerce a raw string value from an environment variable into
 * a primitive suitable for config merging.
 *
 * - `'true'` / `'1'` → `true`
 * - `'false'` / `'0'` → `false`
 * - Numeric strings → `number`
 * - Everything else → `string`
 *
 * @param value - The raw environment variable value.
 * @returns The coerced primitive value.
 */
function coerceEnvValue(value: string): string | number | boolean {
  // Boolean
  if (value.toLowerCase() === 'true' || value === '1') return true;
  if (value.toLowerCase() === 'false' || value === '0') return false;

  // Number
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') return num;

  // String
  return value;
}

// ─── .env File Loader ───────────────────────────────────────────────────

/**
 * Minimal `.env` file parser.
 *
 * Supports:
 *   - Simple `KEY=VALUE` lines
 *   - Quoted values (`"..."` and `'...'`)
 *   - Comments (lines starting with `#`)
 *   - Blank lines (skipped)
 *
 * Does **not** support multi-line values or variable interpolation;
 * those features belong to a dedicated dotenv library. This minimal
 * parser is intentionally dependency-free.
 *
 * @param filePath - Absolute or relative path to the `.env` file.
 * @returns A map of key→value pairs parsed from the file.
 */
function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};

  const content = readFileSync(filePath, 'utf-8');
  const result: Record<string, string> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // Skip blanks and comments
    if (line === '' || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue; // malformed line — skip silently

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

// ─── Deep Merge ──────────────────────────────────────────────────────────

/**
 * Recursively merges `source` into `target`.
 *
 * - Plain objects are merged recursively.
 * - Arrays in `source` **replace** arrays in `target` (no concatenation).
 * - Primitives in `source` overwrite primitives in `target`.
 * - `undefined` values in `source` are ignored (target value preserved).
 *
 * @param target - The base object (defaults).
 * @param source - The override object (env / user-supplied).
 * @returns A new object — neither input is mutated.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    if (sourceVal === undefined) continue; // preserve target

    const targetVal = result[key];

    if (
      typeof sourceVal === 'object' &&
      sourceVal !== null &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      // Both are plain objects → recurse
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      // Arrays and primitives → source wins
      result[key] = sourceVal;
    }
  }

  return result as T;
}

// ─── Env-to-Config Builder ──────────────────────────────────────────────

/**
 * Converts a flat map of environment variables (filtered to `NOVA_` prefix)
 * into a nested config object suitable for deep-merging with defaults.
 *
 * @param env - A map of env var names to raw string values.
 * @returns A partially-populated nested config object.
 */
function buildConfigFromEnv(env: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [envKey, rawValue] of Object.entries(env)) {
    const configPath = envKeyToConfigPath(envKey);
    if (configPath === null) continue;

    const coerced = coerceEnvValue(rawValue);
    const segments = configPath.split('.');
    let current: Record<string, unknown> = result;

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i] ?? '';
      if (seg === '' || typeof current[seg] !== 'object' || current[seg] === null) {
        current[seg] = {};
      }
      current = current[seg] as Record<string, unknown>;
    }

    const lastKey = segments[segments.length - 1] ?? '';
    if (lastKey !== '') {
      current[lastKey] = coerced;
    }
  }

  return result;
}

// ─── SSRF Hosts Special Handling ────────────────────────────────────────

/**
 * The `NOVA_SECURITY_SSRF_BLOCKED_HOSTS` env var is a comma-separated string.
 * It must be parsed into an array before merging.
 *
 * @param envConfig - The config object built from env vars.
 */
function postProcessEnvConfig(envConfig: Record<string, unknown>): void {
  const ssrf = envConfig.security as Record<string, unknown> | undefined;
  if (ssrf && typeof ssrf.ssrfBlockedHosts === 'string') {
    ssrf.ssrfBlockedHosts = (ssrf.ssrfBlockedHosts as string)
      .split(',')
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
  }

  const server = envConfig.server as Record<string, unknown> | undefined;
  if (server && typeof server.cors === 'object' && server.cors !== null) {
    const cors = server.cors as Record<string, unknown>;
    if (typeof cors.origins === 'string') {
      cors.origins = (cors.origins as string)
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
    }
  }
}

// ─── Main Loader ─────────────────────────────────────────────────────────

/**
 * Options for the configuration loader.
 */
export interface LoadConfigOptions {
  /** Absolute or relative path to a `.env` file. Defaults to `.env` in cwd. */
  envFile?: string;
  /** Extra config to merge (e.g., from a JSON/YAML config file). */
  overrides?: Record<string, unknown>;
  /** If `true`, skip validation and return the raw merged object. Default: `false`. */
  skipValidation?: boolean;
}

/**
 * Loads and validates the NovaDL Engine configuration.
 *
 * Resolution order (later sources win):
 *   1. Built-in defaults (`DEFAULT_CONFIG`)
 *   2. `.env` file values (`NOVA_` prefix)
 *   3. Process environment variables (`NOVA_` prefix)
 *   4. `overrides` object (programmatically supplied)
 *
 * After merging all sources, the result is validated through the Zod schema.
 * If validation fails, a `ConfigLoadError` is thrown with field-level details.
 *
 * @param options - Loader options (see `LoadConfigOptions`).
 * @returns A fully typed, validated `NovaDLConfig` object.
 * @throws {ConfigLoadError} If the merged config fails Zod validation.
 *
 * @example
 * ```ts
 * import { loadConfig } from './loader';
 *
 * const config = loadConfig();                       // defaults + env
 * const config = loadConfig({ envFile: '/app/.env' }); // custom .env path
 * const config = loadConfig({ overrides: { server: { port: 8080 } } });
 * ```
 */
export function loadConfig(options?: LoadConfigOptions): NovaDLConfig {
  const envFilePath = options?.envFile ?? resolve(process.cwd(), '.env');

  // 1. Start with defaults
  const base: Record<string, unknown> = { ...DEFAULT_CONFIG } as Record<string, unknown>;

  // 2. Load .env file
  const dotEnvVars = parseDotEnvFile(envFilePath);

  // 3. Combine .env + process.env (process.env wins)
  const combinedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(dotEnvVars)) {
    combinedEnv[key] = value;
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      combinedEnv[key] = value;
    }
  }

  // 4. Build config from env vars
  const envConfig = buildConfigFromEnv(combinedEnv);
  postProcessEnvConfig(envConfig);

  // 5. Merge: defaults ← env
  const mergedWithEnv = deepMerge(base, envConfig);

  // 6. Merge with programmatic overrides (if any)
  const finalRaw = options?.overrides
    ? deepMerge(mergedWithEnv, options.overrides)
    : mergedWithEnv;

  // 7. Validate against Zod schema
  if (options?.skipValidation) {
    return finalRaw as unknown as NovaDLConfig;
  }

  const result = NovaDLConfigSchema.safeParse(finalRaw);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path as (string | number)[],
      message: issue.message,
    }));
    throw new ConfigLoadError(issues);
  }

  return result.data as NovaDLConfig;
}
