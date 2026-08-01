/**
 * NovaDL Engine — Configuration Module
 *
 * Public API for the configuration system. Import everything from here:
 *
 * ```ts
 * import { loadConfig, validateConfig, NovaDLConfigSchema, DEFAULT_CONFIG } from '../config/index';
 * ```
 *
 * @module config
 */

export { DEFAULT_CONFIG, DEFAULT_SERVER_CONFIG, DEFAULT_CACHE_CONFIG, DEFAULT_QUEUE_CONFIG, DEFAULT_SECURITY_CONFIG, DEFAULT_EXTRACTION_CONFIG, DEFAULT_MONITORING_CONFIG, DEFAULT_PLUGIN_CONFIG } from './defaults';

export { NovaDLConfigSchema, ServerConfigSchema, CacheConfigSchema, QueueConfigSchema, SecurityConfigSchema, ExtractionConfigSchema, MonitoringConfigSchema, PluginConfigSchema, ProviderConfigSchema, CorsConfigSchema, RateLimitConfigSchema, RequestSigningConfigSchema, AbuseDetectionConfigSchema } from './schema';
export type { NovaDLConfigSchemaType } from './schema';

export { loadConfig, deepMerge, ConfigLoadError } from './loader';
export type { LoadConfigOptions } from './loader';

export { validateConfig } from './validator';
export type { ValidationResult, ValidationIssue } from './validator';
