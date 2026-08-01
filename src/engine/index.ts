/**
 * NovaDL Engine — Main Entry Point
 * 
 * This is the public API of the NovaDL Engine package.
 * Import from here when using the engine as an npm package:
 * 
 *   import { NovaDLEngine, providers, createServer } from 'novadl-engine';
 */

// ─── Core Engine ────────────────────────────────────────────────────
export { NovaDLEngine } from './core/engine';
export type { EngineEvents } from './core/engine';

// ─── Provider System ────────────────────────────────────────────────
export type { IProvider, IProviderFactory } from './providers/index';
export {
  ProviderError,
  BaseProvider,
  ProviderRegistry,
  YtdlpProvider,
  TikHubProvider,
  RapidApiProvider,
  CustomExtractorProvider,
  ProviderScorer,
  CircuitBreaker,
  WeightedRouter,
  TikTokNativeExtractor,
  InstagramNativeExtractor,
  FacebookNativeExtractor,
  TwitterNativeExtractor,
  ThreadsNativeExtractor,
  PinterestNativeExtractor,
  RedditNativeExtractor,
  VimeoNativeExtractor,
  DailymotionNativeExtractor,
  LikeeNativeExtractor,
  BilibiliNativeExtractor,
  SnapchatNativeExtractor,
  SoundCloudNativeExtractor,
  SpotifyNativeExtractor,
  Lemon8NativeExtractor,
  CapCutNativeExtractor,
  YouTubeNativeExtractor,
  TumblrNativeExtractor,
  StreamableNativeExtractor,
  VKNativeExtractor,
  MixCloudNativeExtractor,
} from './providers/index';

export type {
  ProviderErrorCode,
  CustomExtractorFn,
  ScorerEvents,
  ScoringConfig,
  ProviderScoringMetrics,
  CircuitState,
  CircuitBreakerConfig,
  ProviderCircuitInfo,
  CircuitBreakerEvents,
  WeightedRoutingConfig,
  ProviderSelection,
  WeightedRoutingEvents,
} from './providers/index';

// ─── Plugin SDK ──────────────────────────────────────────────────────
export { PluginLoader, PluginContextImpl } from './plugins/index';
export type { PluginEntry, PluginState, EngineLike, PluginLoaderEvents } from './plugins/index';

// ─── Cache Adapters ──────────────────────────────────────────────────
export { MemoryCacheAdapter, RedisCacheAdapter, FileCacheAdapter } from './cache/index';

// ─── Queue & Worker ──────────────────────────────────────────────────
export { MemoryQueueAdapter, WorkerPool } from './queue/index';
export type { WorkerPoolEvents, WorkerPoolStats, JobProgress, ExtractionHandler } from './queue/index';

// ─── Monitoring ──────────────────────────────────────────────────────
export {
  NovaLogger,
  HealthMonitor,
  MetricsCollector,
  PrometheusExporter,
  OpenTelemetryTracer,
  StructuredTraceLogger,
  TraceTimer,
  RequestLoggerFactory,
} from './monitoring/index';
export type {
  NovaLogEntry,
  EngineHealthStatus,
  HealthMonitorEvents,
  SecurityEventType,
  OTelTracerEvents,
  CorrelationFields,
} from './monitoring/index';

// ─── API Server ──────────────────────────────────────────────────────
export { createServer, startServer } from './api/server';
export type { NovaDLServerOptions } from './api/server';

// ─── Configuration ───────────────────────────────────────────────────
export { loadConfig, validateConfig, DEFAULT_CONFIG } from './config/index';

// ─── Utilities ───────────────────────────────────────────────────────
export {
  detectPlatform,
  validateAndDetectUrl,
  getSupportedPlatforms,
  isPlatformSupported,
  raceSuccessful,
  parallelWithConcurrency,
  withTimeout,
  TimeoutError,
  retryWithBackoff,
  sleep,
  parseResolution,
  formatResolution,
  heightToQuality,
  qualityToHeight,
  bitrateToAudioQuality,
  sortQualitiesByResolution,
  isVideoFormat,
  isAudioFormat,
  isImageFormat,
  formatFileSize,
  formatDuration,
} from './utils/index';

// ─── Streaming Download ──────────────────────────────────────────────────
export {
  StreamDownloader,
  DownloadError,
  DownloadTimeoutError,
  NetworkError,
  DiskError,
  DownloadQueue,
  DownloadManager,
} from './streaming/index';

export type {
  DownloadOptions,
  DownloadIncludeFlags,
  DownloadResult,
  DownloadedItemResult,
  DownloadCategory,
  DownloadProgress,
  DownloadStatus,
  DownloadJob,
  DownloadPriority,
  DownloadJobStatus,
  StreamDownloaderEvents,
  DownloadQueueEvents,
  DownloadManagerEvents,
  ChunkDownloadInfo,
  ResolvedMediaUrl,
} from './streaming/index';

// ─── Network Subsystem ────────────────────────────────────────────────
export {
  PersistentCookieJar,
  DEFAULT_COOKIE_MANAGER_CONFIG,
  ProxyManager,
  DEFAULT_PROXY_MANAGER_CONFIG,
  BrowserManager,
  DEFAULT_BROWSER_MANAGER_CONFIG,
} from './net/index';

export type {
  CookieEntry,
  CookieJarState,
  CookieManagerConfig,
  CookieManagerEvents,
  ProxyProtocol,
  ProxyHealthStatus,
  ProxyConfig,
  ProxyStats,
  ProxyManagerConfig,
  ProxyManagerEvents,
  ProxyAgentDescriptor,
  BrowserManagerConfig,
  PlaywrightLaunchOptions,
  BrowserProxyConfig,
  BrowserContextConfig,
  BrowserExtractOptions,
  BrowserExtractResult,
  BrowserCookieResult,
  BrowserManagerEvents,
} from './net/index';

// ─── All Types ───────────────────────────────────────────────────────
export type {
  Platform,
  VideoFormat,
  AudioFormat,
  ImageFormat,
  SubtitleFormat,
  MediaFormat,
  MediaType,
  VideoQuality,
  AudioQuality,
  Resolution,
  CodecInfo,
  ExtractionResult,
  MediaItem,
  ExtractionMetadata,
  SubtitleTrack,
  CoverImage,
  Thumbnail,
  QualityOption,
  WatermarkInfo,
  ProviderStatus,
  ProviderType,
  ProviderHealth,
  ProviderConfig,
  ProviderCapabilities,
  ProviderFeature,
  ExtractionRequest,
  ExtractionOptions,
  PipelineStage,
  PipelineContext,
  ProviderAttempt,
  PluginHook,
  PluginManifest,
  IPlugin,
  PluginContext,
  PluginHookHandler,
  CacheEntry,
  ICacheAdapter,
  QueuePriority,
  QueueJob,
  IQueueAdapter,
  RateLimitEntry,
  IRateLimitAdapter,
  RateLimitResult,
  EngineMetrics,
  ProviderMetrics,
  NovaDLConfig,
  ServerConfig,
  CacheConfig,
  QueueConfig,
  SecurityConfig,
  ExtractionConfig,
  MonitoringConfig,
  PluginConfig,
  EngineEvent,
  ApiExtractionRequest,
  ApiExtractionResponse,
  ApiHealthResponse,
  ApiProvidersResponse,
  ProviderInfo,
  ApiMetricsResponse,
  ApiErrorResponse,
} from './types/index';
