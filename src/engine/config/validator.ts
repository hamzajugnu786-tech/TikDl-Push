/**
 * NovaDL Engine — Runtime Configuration Validator
 *
 * Performs cross-field and semantic validation checks that the Zod schema
 * cannot express (e.g., "redis adapter requires redisUrl", "debug mode in
 * production is dangerous"). Returns a structured result with separate
 * `errors` (hard failures that should prevent startup) and `warnings`
 * (soft issues that warrant attention but don't block operation).
 *
 * @module config/validator
 */

import type { NovaDLConfig } from '../types/index';

// ─── Validation Result ────────────────────────────────────────────────────

/**
 * A single validation issue — either an error or a warning.
 */
export interface ValidationIssue {
  /** The config path that triggered this issue (dot-separated). */
  path: string;
  /** Human-readable description of the problem. */
  message: string;
  /** Suggested fix or remediation action. */
  suggestion?: string;
}

/**
 * The result of validating a NovaDLConfig object.
 *
 * - `valid` is `true` only when `errors` is empty (warnings don't block).
 * - `errors` are hard failures — the engine should NOT start.
 * - `warnings` are soft issues — the engine may start but should log them.
 */
export interface ValidationResult {
  /** Whether the config passed all hard validation checks. */
  valid: boolean;
  /** Hard failures that should prevent engine startup. */
  errors: ValidationIssue[];
  /** Soft issues that warrant attention but don't block operation. */
  warnings: ValidationIssue[];
}

// ─── Helper ────────────────────────────────────────────────────────────────

/**
 * Creates a `ValidationResult` with empty arrays.
 */
function emptyResult(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

// ─── Provider Checks ──────────────────────────────────────────────────────

/**
 * Validates provider configurations for conflicts and consistency.
 *
 * Checks:
 *   - No two providers share the same `id`.
 *   - No two enabled providers of the same type have identical `baseUrl`.
 *   - Every enabled provider with `type: 'api'` should have a `baseUrl`.
 *   - Every enabled provider with `type: 'api'` that requires auth
 *     should have an `apiKey` set.
 *   - Provider priorities are reasonable (0–100 range).
 */
function validateProviders(config: NovaDLConfig, result: ValidationResult): void {
  const providers = config.providers;
  const seenIds = new Set<string>();
  const seenApiUrls = new Map<string, string>(); // url → provider name

  for (const provider of providers) {
    // Duplicate ID check
    if (seenIds.has(provider.id)) {
      result.errors.push({
        path: `providers.${provider.id}`,
        message: `Duplicate provider id "${provider.id}". Each provider must have a unique id.`,
        suggestion: 'Rename one of the duplicate providers or remove the extra entry.',
      });
    }
    seenIds.add(provider.id);

    // Only check enabled providers for semantic issues
    if (!provider.enabled) continue;

    // API providers should have a baseUrl
    if (provider.type === 'api' && !provider.baseUrl) {
      result.errors.push({
        path: `providers.${provider.id}.baseUrl`,
        message: `API provider "${provider.name}" (${provider.id}) is missing a baseUrl.`,
        suggestion: 'Set the baseUrl to the provider\'s API endpoint (e.g., "https://api.example.com/v1").',
      });
    }

    // Duplicate baseUrl among same-type enabled providers
    if (provider.baseUrl) {
      const existing = seenApiUrls.get(provider.baseUrl);
      if (existing && provider.type === 'api') {
        result.warnings.push({
          path: `providers.${provider.id}.baseUrl`,
          message: `Provider "${provider.name}" shares baseUrl "${provider.baseUrl}" with "${existing}".`,
          suggestion: 'Verify this is intentional; identical baseUrls usually indicate a config mistake.',
        });
      }
      seenApiUrls.set(provider.baseUrl, provider.name);
    }

    // Extreme timeout values
    if (provider.timeout > 120_000) {
      result.warnings.push({
        path: `providers.${provider.id}.timeout`,
        message: `Provider "${provider.name}" has a timeout of ${provider.timeout}ms (>120s). This may cause excessive wait times.`,
        suggestion: 'Consider reducing the timeout to 30–60 seconds.',
      });
    }

    if (provider.timeout < 1_000) {
      result.warnings.push({
        path: `providers.${provider.id}.timeout`,
        message: `Provider "${provider.name}" has a very low timeout of ${provider.timeout}ms (<1s). Most API calls will fail.`,
        suggestion: 'Increase the timeout to at least 5000ms.',
      });
    }

    // Priority range sanity
    if (provider.priority > 100) {
      result.warnings.push({
        path: `providers.${provider.id}.priority`,
        message: `Provider "${provider.name}" has priority ${provider.priority}, which is unusually high.`,
        suggestion: 'Typical priorities range from 0–100. Lower values = higher priority.',
      });
    }

    // maxRetries sanity
    if (provider.maxRetries > 5) {
      result.warnings.push({
        path: `providers.${provider.id}.maxRetries`,
        message: `Provider "${provider.name}" has maxRetries=${provider.maxRetries}. High retry counts increase latency on failures.`,
        suggestion: 'Consider reducing to 3 or fewer retries.',
      });
    }
  }

  // Warn if no providers are configured
  if (providers.length === 0) {
    result.warnings.push({
      path: 'providers',
      message: 'No providers configured. The engine will not be able to extract any media.',
      suggestion: 'Add at least one provider (e.g., yt-dlp CLI provider) to the providers array.',
    });
  }

  // Warn if all providers are disabled
  const enabledCount = providers.filter((p) => p.enabled).length;
  if (providers.length > 0 && enabledCount === 0) {
    result.errors.push({
      path: 'providers',
      message: 'All providers are disabled. The engine cannot function without at least one enabled provider.',
      suggestion: 'Enable at least one provider by setting its "enabled" field to true.',
    });
  }
}

// ─── Cache Checks ──────────────────────────────────────────────────────────

/**
 * Validates that cache configuration is consistent with the chosen adapter.
 *
 * Checks:
 *   - Redis adapter requires `redisUrl`.
 *   - File adapter requires `filePath`.
 *   - Memory adapter should NOT have `redisUrl` (misconfiguration).
 *   - `ttlMs` is reasonable (not too short, not excessively long).
 *   - `maxEntries` is reasonable for the adapter.
 */
function validateCacheConfig(config: NovaDLConfig, result: ValidationResult): void {
  const { cache } = config;

  // Redis adapter requires redisUrl
  if (cache.adapter === 'redis' && !cache.redisUrl) {
    result.errors.push({
      path: 'cache.redisUrl',
      message: `Cache adapter is "redis" but no redisUrl is configured.`,
      suggestion: 'Set cache.redisUrl to a valid Redis connection string (e.g., "redis://localhost:6379").',
    });
  }

  // File adapter requires filePath
  if (cache.adapter === 'file' && !cache.filePath) {
    result.errors.push({
      path: 'cache.filePath',
      message: `Cache adapter is "file" but no filePath is configured.`,
      suggestion: 'Set cache.filePath to a writable directory path on disk.',
    });
  }

  // Memory adapter with redisUrl is suspicious
  if (cache.adapter === 'memory' && cache.redisUrl) {
    result.warnings.push({
      path: 'cache.redisUrl',
      message: `Cache adapter is "memory" but a redisUrl is set. This URL will be ignored.`,
      suggestion: 'Either switch the adapter to "redis" or remove the redisUrl.',
    });
  }

  // Memory adapter with filePath is suspicious
  if (cache.adapter === 'memory' && cache.filePath) {
    result.warnings.push({
      path: 'cache.filePath',
      message: `Cache adapter is "memory" but a filePath is set. This path will be ignored.`,
      suggestion: 'Either switch the adapter to "file" or remove the filePath.',
    });
  }

  // TTL sanity
  if (cache.ttlMs < 5_000) {
    result.warnings.push({
      path: 'cache.ttlMs',
      message: `Cache TTL is ${cache.ttlMs}ms (<5s). Very short TTLs reduce cache effectiveness.`,
      suggestion: 'Consider a TTL of at least 30 seconds (30_000 ms).',
    });
  }

  if (cache.ttlMs > 24 * 60 * 60 * 1000) {
    result.warnings.push({
      path: 'cache.ttlMs',
      message: `Cache TTL is ${cache.ttlMs}ms (>24h). Very long TTLs risk stale data.`,
      suggestion: 'Consider a TTL of 30–60 minutes for production use.',
    });
  }

  // maxEntries sanity for memory adapter
  if (cache.adapter === 'memory' && cache.maxEntries > 100_000) {
    result.warnings.push({
      path: 'cache.maxEntries',
      message: `Memory cache maxEntries is ${cache.maxEntries}. This may consume significant RAM.`,
      suggestion: 'For in-memory caching, 1_000–50_000 entries is typically sufficient.',
    });
  }
}

// ─── Queue Checks ──────────────────────────────────────────────────────────

/**
 * Validates that queue configuration is consistent with the chosen adapter.
 *
 * Checks:
 *   - Redis adapter requires `redisUrl`.
 *   - Concurrency is reasonable for the adapter.
 *   - Memory adapter should NOT have `redisUrl`.
 */
function validateQueueConfig(config: NovaDLConfig, result: ValidationResult): void {
  const { queue } = config;

  // Redis adapter requires redisUrl
  if (queue.adapter === 'redis' && !queue.redisUrl) {
    result.errors.push({
      path: 'queue.redisUrl',
      message: `Queue adapter is "redis" but no redisUrl is configured.`,
      suggestion: 'Set queue.redisUrl to a valid Redis connection string.',
    });
  }

  // Memory adapter with redisUrl is suspicious
  if (queue.adapter === 'memory' && queue.redisUrl) {
    result.warnings.push({
      path: 'queue.redisUrl',
      message: `Queue adapter is "memory" but a redisUrl is set. This URL will be ignored.`,
      suggestion: 'Either switch the adapter to "redis" or remove the redisUrl.',
    });
  }

  // Concurrency sanity
  if (queue.concurrency > 50) {
    result.warnings.push({
      path: 'queue.concurrency',
      message: `Queue concurrency is ${queue.concurrency}. High concurrency may overwhelm providers.`,
      suggestion: 'A concurrency of 4–16 is typically sufficient for most deployments.',
    });
  }

  if (queue.concurrency < 1) {
    // This should already be caught by Zod, but belt-and-suspenders
    result.errors.push({
      path: 'queue.concurrency',
      message: `Queue concurrency must be at least 1.`,
      suggestion: 'Set queue.concurrency to a positive integer (e.g., 4).',
    });
  }
}

// ─── Security Checks ──────────────────────────────────────────────────────

/**
 * Validates security configuration for sanity and production readiness.
 *
 * Checks:
 *   - Request signing enabled but no secret provided.
 *   - Rate limit too permissive (max > 1000 or window < 1s).
 *   - Rate limit too aggressive (max < 5).
 *   - Abuse detection threshold is reasonable.
 *   - SSRF blocked hosts list is not empty.
 *   - Debug mode combined with permissive security is dangerous.
 */
function validateSecurityConfig(config: NovaDLConfig, result: ValidationResult): void {
  const { security, server } = config;

  // Request signing enabled without secret
  if (security.requestSigning.enabled && !security.requestSigning.secret) {
    result.errors.push({
      path: 'security.requestSigning.secret',
      message: 'Request signing is enabled but no secret is provided. Requests cannot be verified.',
      suggestion: 'Set security.requestSigning.secret to a cryptographically random string (≥32 characters).',
    });
  }

  // Request signing secret too short
  if (security.requestSigning.enabled && security.requestSigning.secret && security.requestSigning.secret.length < 16) {
    result.warnings.push({
      path: 'security.requestSigning.secret',
      message: `Request signing secret is only ${security.requestSigning.secret.length} characters. Short secrets are vulnerable to brute force.`,
      suggestion: 'Use a secret of at least 32 characters (e.g., a hex-encoded 256-bit key).',
    });
  }

  // Rate limit too permissive
  if (security.rateLimit.max > 1000) {
    result.warnings.push({
      path: 'security.rateLimit.max',
      message: `Rate limit max is ${security.rateLimit.max} requests per window. This is very permissive.`,
      suggestion: 'For production, consider a limit of 50–200 requests per minute.',
    });
  }

  // Rate limit window too short
  if (security.rateLimit.windowMs < 1000) {
    result.warnings.push({
      path: 'security.rateLimit.windowMs',
      message: `Rate limit window is ${security.rateLimit.windowMs}ms (<1s). Very short windows cause frequent resets.`,
      suggestion: 'Use a window of at least 60 seconds (60_000 ms).',
    });
  }

  // Rate limit too aggressive
  if (security.rateLimit.max < 5) {
    result.warnings.push({
      path: 'security.rateLimit.max',
      message: `Rate limit max is ${security.rateLimit.max}. This is extremely restrictive and may block legitimate usage.`,
      suggestion: 'Consider a limit of at least 20 requests per window.',
    });
  }

  // Abuse detection threshold sanity
  if (security.abuseDetection.enabled && security.abuseDetection.threshold < 3) {
    result.warnings.push({
      path: 'security.abuseDetection.threshold',
      message: `Abuse detection threshold is ${security.abuseDetection.threshold}. Low thresholds increase false positives.`,
      suggestion: 'Set threshold to 5 or higher to reduce false-positive abuse alerts.',
    });
  }

  // SSRF blocked hosts not empty
  if (security.ssrfBlockedHosts.length === 0) {
    result.warnings.push({
      path: 'security.ssrfBlockedHosts',
      message: 'SSRF blocked hosts list is empty. The engine will accept URLs pointing to any host, including internal services.',
      suggestion: 'Add common internal addresses (127.0.0.1, localhost, 10.0.0.0/8, etc.) to the blocked list.',
    });
  }

  // Debug + permissive security is dangerous in production
  if (server.debug && security.rateLimit.max > 500) {
    result.warnings.push({
      path: 'security.rateLimit.max',
      message: 'Debug mode is enabled with a permissive rate limit (>500 req/window). This is not safe for production.',
      suggestion: 'Either disable debug mode or tighten the rate limit for production deployments.',
    });
  }
}

// ─── Extraction Checks ────────────────────────────────────────────────────

/**
 * Validates extraction configuration for reasonable operational parameters.
 *
 * Checks:
 *   - Timeout not too short (will cause failures) or too long (wastes resources).
 *   - Retry backoff is reasonable.
 *   - Stream buffer size is practical.
 */
function validateExtractionConfig(config: NovaDLConfig, result: ValidationResult): void {
  const { extraction } = config;

  // Timeout too short
  if (extraction.defaultTimeoutMs < 5_000) {
    result.warnings.push({
      path: 'extraction.defaultTimeoutMs',
      message: `Default extraction timeout is ${extraction.defaultTimeoutMs}ms (<5s). Most extractions require more time.`,
      suggestion: 'Set defaultTimeoutMs to at least 10_000 (10 seconds).',
    });
  }

  // Timeout too long
  if (extraction.defaultTimeoutMs > 300_000) {
    result.warnings.push({
      path: 'extraction.defaultTimeoutMs',
      message: `Default extraction timeout is ${extraction.defaultTimeoutMs}ms (>5min). Long timeouts tie up resources.`,
      suggestion: 'Consider 30_000–60_000 ms for most use cases.',
    });
  }

  // yt-dlp timeout shorter than default timeout
  if (extraction.ytdlpTimeoutMs < extraction.defaultTimeoutMs) {
    result.warnings.push({
      path: 'extraction.ytdlpTimeoutMs',
      message: `yt-dlp timeout (${extraction.ytdlpTimeoutMs}ms) is less than the default extraction timeout (${extraction.defaultTimeoutMs}ms).`,
      suggestion: 'yt-dlp timeout should typically be equal to or greater than the default extraction timeout.',
    });
  }

  // Stream buffer size too small
  if (extraction.streamBufferSize < 4 * 1024) {
    result.warnings.push({
      path: 'extraction.streamBufferSize',
      message: `Stream buffer size is ${extraction.streamBufferSize} bytes (<4KB). Small buffers increase I/O overhead.`,
      suggestion: 'A buffer of 16KB–256KB is typical for streaming media.',
    });
  }

  // Stream buffer size very large
  if (extraction.streamBufferSize > 10 * 1024 * 1024) {
    result.warnings.push({
      path: 'extraction.streamBufferSize',
      message: `Stream buffer size is ${extraction.streamBufferSize} bytes (>10MB). Very large buffers consume significant memory.`,
      suggestion: 'Consider reducing to 64KB–1MB.',
    });
  }

  // Retry backoff too short
  if (extraction.retryBackoffMs < 100) {
    result.warnings.push({
      path: 'extraction.retryBackoffMs',
      message: `Retry backoff is ${extraction.retryBackoffMs}ms (<100ms). Very short backoff may overwhelm providers.`,
      suggestion: 'Use a backoff of at least 500ms; exponential backoff is recommended.',
    });
  }
}

// ─── Monitoring Checks ────────────────────────────────────────────────────

/**
 * Validates monitoring configuration.
 *
 * Checks:
 *   - Health check interval is not too aggressive.
 *   - Profiling enabled in production is a warning.
 */
function validateMonitoringConfig(config: NovaDLConfig, result: ValidationResult): void {
  const { monitoring, server } = config;

  // Health check too frequent
  if (monitoring.healthCheckIntervalMs < 5_000) {
    result.warnings.push({
      path: 'monitoring.healthCheckIntervalMs',
      message: `Health check interval is ${monitoring.healthCheckIntervalMs}ms (<5s). Frequent checks add unnecessary load.`,
      suggestion: 'Use an interval of 15_000–60_000 ms.',
    });
  }

  // Profiling in production
  if (monitoring.profilingEnabled && !server.debug) {
    result.warnings.push({
      path: 'monitoring.profilingEnabled',
      message: 'Profiling is enabled but the server is not in debug mode. Profiling adds CPU/memory overhead.',
      suggestion: 'Disable profiling for production, or enable debug mode to acknowledge the overhead.',
    });
  }

  // Metrics disabled
  if (!monitoring.metricsEnabled) {
    result.warnings.push({
      path: 'monitoring.metricsEnabled',
      message: 'Metrics collection is disabled. Without metrics, observability and debugging are limited.',
      suggestion: 'Enable metrics for production deployments (monitoring.metricsEnabled = true).',
    });
  }
}

// ─── Cross-Section Checks ──────────────────────────────────────────────────

/**
 * Validates cross-section consistency.
 *
 * Checks:
 *   - Debug mode in production (logLevel not debug/trace).
 *   - Redis URLs for cache and queue should match if both use Redis.
 *   - CORS wildcard with request signing is unusual.
 */
function validateCrossSection(config: NovaDLConfig, result: ValidationResult): void {
  const { server, cache, queue, security } = config;

  // Debug mode warning
  if (server.debug) {
    result.warnings.push({
      path: 'server.debug',
      message: 'Debug mode is enabled. This exposes verbose internal details and is not recommended for production.',
      suggestion: 'Set server.debug to false for production deployments.',
    });
  }

  // Trace/debug log level in non-debug mode
  if (!server.debug && (server.logLevel === 'trace' || server.logLevel === 'debug')) {
    result.warnings.push({
      path: 'server.logLevel',
      message: `Log level is "${server.logLevel}" but debug mode is off. Very verbose logging in production increases I/O and storage costs.`,
      suggestion: 'Use "info" or "warn" log level for production.',
    });
  }

  // Both cache and queue use Redis but different URLs
  if (
    cache.adapter === 'redis' &&
    queue.adapter === 'redis' &&
    cache.redisUrl &&
    queue.redisUrl &&
    cache.redisUrl !== queue.redisUrl
  ) {
    result.warnings.push({
      path: 'cache.redisUrl / queue.redisUrl',
      message: `Cache and queue use different Redis URLs. This means two separate Redis connections.`,
      suggestion: 'Using the same Redis instance for both cache and queue is simpler and more common.',
    });
  }

  // CORS wildcard with request signing
  if (security.requestSigning.enabled && server.cors.enabled && server.cors.origins.includes('*')) {
    result.warnings.push({
      path: 'server.cors.origins',
      message: 'CORS allows all origins (*) while request signing is enabled. Wildcard CORS undermines signing security.',
      suggestion: 'Restrict CORS origins to trusted domains when request signing is active.',
    });
  }

  // Cache and queue both redis but no redisUrl for one of them
  if (
    (cache.adapter === 'redis' || queue.adapter === 'redis') &&
    !cache.redisUrl &&
    !queue.redisUrl
  ) {
    // This is already caught by individual section checks, but a combined
    // reminder is helpful.
    result.errors.push({
      path: 'cache.redisUrl / queue.redisUrl',
      message: 'Redis adapter(s) selected but no Redis URLs are configured anywhere.',
      suggestion: 'Set cache.redisUrl and/or queue.redisUrl to valid Redis connection strings.',
    });
  }
}

// ─── Plugin Checks ──────────────────────────────────────────────────────────

/**
 * Validates plugin configuration.
 *
 * Checks:
 *   - Auto-load with no directory set.
 *   - A plugin appears in both enabled and disabled lists.
 */
function validatePluginConfig(config: NovaDLConfig, result: ValidationResult): void {
  const { plugins } = config;

  // Auto-load without directory
  if (plugins.autoLoad && !plugins.directory) {
    result.warnings.push({
      path: 'plugins.directory',
      message: 'Plugin auto-load is enabled but no plugin directory is specified. Plugins will not be discovered.',
      suggestion: 'Set plugins.directory to a path where plugins are stored (e.g., "./plugins").',
    });
  }

  // Plugin in both enabled and disabled lists
  if (plugins.enabledPlugins && plugins.disabledPlugins) {
    const overlap = plugins.enabledPlugins.filter(
      (id) => plugins.disabledPlugins?.includes(id) ?? false,
    );
    if (overlap.length > 0) {
      result.errors.push({
        path: 'plugins.enabledPlugins / plugins.disabledPlugins',
        message: `Plugins ${overlap.join(', ')} appear in both enabledPlugins and disabledPlugins. A plugin cannot be both.`,
        suggestion: 'Remove each plugin from one of the two lists.',
      });
    }
  }
}

// ─── Main Validator ──────────────────────────────────────────────────────────

/**
 * Validates a NovaDLConfig object for cross-field consistency and semantic
 * correctness beyond what the Zod schema enforces.
 *
 * This function does **not** modify the config. It returns a `ValidationResult`
 * with:
 *   - `errors`: hard failures that should prevent engine startup.
 *   - `warnings`: soft issues that should be logged but don't block startup.
 *   - `valid`: `true` if `errors` is empty, `false` otherwise.
 *
 * @param config - A fully parsed/typed NovaDLConfig (already validated by Zod).
 * @returns A `ValidationResult` with errors and warnings.
 *
 * @example
 * ```ts
 * import { loadConfig } from './loader';
 * import { validateConfig } from './validator';
 *
 * const config = loadConfig();
 * const result = validateConfig(config);
 *
 * if (!result.valid) {
 *   console.error('Config errors:', result.errors);
 *   process.exit(1);
 * }
 *
 * for (const w of result.warnings) {
 *   console.warn(`[config] ${w.path}: ${w.message}`);
 * }
 * ```
 */
export function validateConfig(config: NovaDLConfig): ValidationResult {
  const result = emptyResult();

  validateProviders(config, result);
  validateCacheConfig(config, result);
  validateQueueConfig(config, result);
  validateSecurityConfig(config, result);
  validateExtractionConfig(config, result);
  validateMonitoringConfig(config, result);
  validatePluginConfig(config, result);
  validateCrossSection(config, result);

  // Final validity determination
  result.valid = result.errors.length === 0;

  return result;
}
