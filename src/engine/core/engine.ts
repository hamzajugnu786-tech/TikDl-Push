/**
 * NovaDL Engine — Core Engine
 *
 * This is THE engine. It orchestrates the entire extraction
 * pipeline: URL validation, platform detection, provider selection,
 * extraction execution with fallback/retry, caching, and result
 * delivery.
 *
 * Every subsystem is wired:
 *   ProviderScorer     — scores providers based on observed performance
 *   CircuitBreaker     — blocks failing providers to prevent cascading failures
 *   BrowserManager     — Playwright fallback when API/CLI providers fail
 *   PersistentCookieJar — per-domain cookie persistence and auto-refresh
 *   ProxyManager       — HTTP/HTTPS/SOCKS5 proxy rotation with geo routing
 *   DownloadManager    — full download pipeline with streaming + range requests
 *   WorkerPool         — concurrent extraction workers from a priority queue
 *   PrometheusExporter — Prometheus metrics endpoint
 *   OpenTelemetryTracer — distributed tracing spans
 *
 * Usage:
 *   const engine = new NovaDLEngine(config);
 *   await engine.initialize();
 *   const result = await engine.extract({ url: 'https://tiktok.com/...' });
 */

import { TypedEmitter } from '../utils/events';
import { v4 as uuid } from 'uuid';

import type {
  NovaDLConfig,
  ExtractionRequest,
  ExtractionResult,
  Platform,
  PipelineContext,
  ProviderAttempt,
  ProviderConfig,
  ProviderInfo,
  EngineMetrics,
} from '../types/index';

import { ProviderRegistry } from '../providers/registry';
import { YtdlpProvider } from '../providers/ytdlp';
import { TikHubProvider } from '../providers/tikhub';
import { RapidApiProvider } from '../providers/rapidapi';
import { CustomExtractorProvider } from '../providers/custom';
import type { CustomExtractorFn } from '../providers/custom';
import type { IProvider, ProviderError as ProviderErrorType } from '../providers/base';
import { ProviderScorer } from '../providers/scoring';
import { CircuitBreaker } from '../providers/circuit-breaker';
import type { ProviderErrorCode } from '../providers/base';

import {
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
} from '../providers/native/index';

import { PluginLoader } from '../plugins/sdk';
import type { IPlugin } from '../types/index';

import { MemoryCacheAdapter } from '../cache/memory';
import { RedisCacheAdapter } from '../cache/redis';
import { FileCacheAdapter } from '../cache/file';
import type { ICacheAdapter } from '../types/index';

import { NovaLogger } from '../monitoring/logger';
import { HealthMonitor } from '../monitoring/health';
import type { EngineHealthStatus } from '../monitoring/health';
import { MetricsCollector } from '../monitoring/metrics';
import { PrometheusExporter } from '../monitoring/prometheus';
import { OpenTelemetryTracer } from '../monitoring/otel';
import { StructuredTraceLogger, TraceTimer } from '../monitoring/structured-logs';

import { loadConfig, deepMerge } from '../config/loader';
import { validateConfig } from '../config/validator';

import { validateAndDetectUrl } from '../utils/url';
import { raceSuccessful, retryWithBackoff } from '../utils/parallel';

import { BrowserManager } from '../net/browser-manager';
import type { BrowserExtractOptions, BrowserExtractResult } from '../net/browser-manager';
import { PersistentCookieJar } from '../net/cookie-manager';
import { ProxyManager } from '../net/proxy-manager';
import type { ProxyConfig } from '../net/proxy-manager';

import { DownloadManager } from '../streaming/download-manager';
import type { DownloadOptions, DownloadResult } from '../streaming/types';

import { MemoryQueueAdapter } from '../queue/memory';
import { WorkerPool } from '../queue/worker';
import type { ExtractionHandler, WorkerPoolStats } from '../queue/worker';

// ─── Engine Events ────────────────────────────────────────────────────
export interface EngineEvents {
  'extraction:start': { contextId: string; url: string; platform: Platform };
  'extraction:success': { contextId: string; providerId: string; latencyMs: number };
  'extraction:fail': { contextId: string; providerId?: string; error: string };
  'extraction:cache_hit': { contextId: string; url: string };
  'extraction:cache_miss': { contextId: string; url: string };
  'provider:select': { contextId: string; providerIds: string[] };
  'provider:attempt': { contextId: string; providerId: string; attempt: number };
  'provider:success': { contextId: string; providerId: string; latencyMs: number };
  'provider:fail': { contextId: string; providerId: string; error: string };
  'provider:fallback': { contextId: string; fromProvider: string; toProvider: string };
  'provider:health_change': { providerId: string; oldStatus: string; newStatus: string };
  'queue:enqueue': { jobId: string; url: string };
  'queue:complete': { jobId: string; providerId: string };
  'queue:fail': { jobId: string; error: string };
  'plugin:install': { pluginId: string };
  'plugin:uninstall': { pluginId: string };
  'security:rate_limit': { key: string; remaining: number };
  'security:abuse_detected': { key: string; pattern: string };
  'security:ssrf_blocked': { url: string; reason: string };
  'download:complete': { extractionId: string; filePath: string; fileSize: number };
  'download:fail': { extractionId: string; error: string };
  'browser:fallback': { contextId: string; url: string; reason: string };
}

// ─── NovaDL Engine ────────────────────────────────────────────────────
export class NovaDLEngine {
  // ─── Core Components ────────────────────────────────────────────
  private _config: NovaDLConfig;
  private _registry: ProviderRegistry;
  private _cache: ICacheAdapter;
  private _logger: NovaLogger;
  private _healthMonitor: HealthMonitor;
  private _metrics: MetricsCollector;
  private _pluginLoader: PluginLoader;
  private _events: TypedEmitter<EngineEvents> = new TypedEmitter<EngineEvents>();

  // ─── Provider Intelligence ────────────────────────────────────────
  private _scorer: ProviderScorer;
  private _circuitBreaker: CircuitBreaker;

  // ─── Network Subsystem ────────────────────────────────────────────
  private _browserManager: BrowserManager;
  private _cookieJar: PersistentCookieJar;
  private _proxyManager: ProxyManager;

  // ─── Streaming / Download ─────────────────────────────────────────
  private _downloadManager: DownloadManager;

  // ─── Queue / Worker ───────────────────────────────────────────────
  private _queueAdapter: MemoryQueueAdapter;
  private _workerPool: WorkerPool | null = null;

  // ─── Monitoring ──────────────────────────────────────────────────
  private _prometheus: PrometheusExporter | null = null;
  private _otel: OpenTelemetryTracer | null = null;

  // ─── State ──────────────────────────────────────────────────────
  private _initialized = false;
  private _shuttingDown = false;
  private _startTime: Date = new Date();

  // ─── Constructor ────────────────────────────────────────────────
  constructor(config?: Partial<NovaDLConfig> | NovaDLConfig) {
    // Load and validate configuration
    if (!config) {
      this._config = loadConfig();
    } else {
      // Load defaults + env vars WITHOUT validation.
      // Validation is deferred to the final merged result below.
      // This prevents env vars like NOVA_SERVER_PORT=0 (set by hosting
      // platforms) from throwing before the caller's overrides can replace them.
      const loadedDefaults = loadConfig({ skipValidation: true });
      const mergedRaw: Record<string, unknown> = deepMerge(
        JSON.parse(JSON.stringify(loadedDefaults)) as Record<string, unknown>,
        JSON.parse(JSON.stringify(config)) as Record<string, unknown>,
      );
      this._config = loadConfig({ overrides: mergedRaw, skipValidation: false });
    }

    const validation = validateConfig(this._config);
    if (validation.errors.length > 0) {
      throw new Error(`Invalid NovaDL configuration: ${validation.errors.join(', ')}`);
    }
    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:', validation.warnings);
    }

    // Initialize components with config
    this._logger = new NovaLogger(this._config);
    this._registry = new ProviderRegistry();
    this._metrics = new MetricsCollector(this._logger, this._config.monitoring.metricsEnabled);
    this._healthMonitor = new HealthMonitor(
      this._registry,
      this._logger,
      this._config.monitoring.healthCheckIntervalMs,
    );
    this._pluginLoader = new PluginLoader(this, this._registry, this._logger);

    // Provider intelligence: scorer + circuit breaker
    this._scorer = new ProviderScorer(this._registry);
    this._circuitBreaker = new CircuitBreaker();

    // Network subsystem: browser fallback, cookie persistence, proxy rotation
    this._browserManager = new BrowserManager();
    this._cookieJar = new PersistentCookieJar();
    this._proxyManager = new ProxyManager();

    // Streaming / download pipeline
    this._downloadManager = new DownloadManager();

    // Queue / worker subsystem
    this._queueAdapter = new MemoryQueueAdapter(this._config.queue.concurrency);

    // Initialize cache adapter
    this._cache = this._createCacheAdapter();
  }

  // ─── Public Accessors ────────────────────────────────────────────

  getConfig(): NovaDLConfig { return this._config; }

  getSafeConfig(): Record<string, unknown> {
    const safe = JSON.parse(JSON.stringify(this._config)) as Record<string, unknown>;
    const providers = safe.providers as Array<Record<string, unknown>>;
    if (providers) {
      for (const provider of providers) {
        if (provider.apiKey && typeof provider.apiKey === 'string') {
          provider.apiKey = `${(provider.apiKey as string).substring(0, 4)}****`;
        }
      }
    }
    const security = safe.security as Record<string, unknown>;
    if (security) {
      const signing = security.requestSigning as Record<string, unknown>;
      if (signing?.secret && typeof signing.secret === 'string') {
        signing.secret = '****';
      }
    }
    return safe;
  }

  getLogger(): NovaLogger { return this._logger; }
  getRegistry(): ProviderRegistry { return this._registry; }
  getCache(): ICacheAdapter { return this._cache; }
  getHealthMonitor(): HealthMonitor { return this._healthMonitor; }
  getMetricsCollector(): MetricsCollector { return this._metrics; }
  getPluginLoader(): PluginLoader { return this._pluginLoader; }
  getEventEmitter(): TypedEmitter<EngineEvents> { return this._events; }

  getScorer(): ProviderScorer { return this._scorer; }
  getCircuitBreaker(): CircuitBreaker { return this._circuitBreaker; }
  getBrowserManager(): BrowserManager { return this._browserManager; }
  getCookieJar(): PersistentCookieJar { return this._cookieJar; }
  getProxyManager(): ProxyManager { return this._proxyManager; }
  getDownloadManager(): DownloadManager { return this._downloadManager; }
  getQueueAdapter(): MemoryQueueAdapter { return this._queueAdapter; }
  getWorkerPool(): WorkerPool | null { return this._workerPool; }
  getPrometheus(): PrometheusExporter | null { return this._prometheus; }
  getOpenTelemetry(): OpenTelemetryTracer | null { return this._otel; }

  // ─── Health & Metrics ────────────────────────────────────────────

  getHealth(): EngineHealthStatus { return this._healthMonitor.getStatus(); }
  getMetrics(): EngineMetrics { return this._metrics.getMetrics(); }
  getProviders(): ProviderInfo[] { return this._registry.getInfo(); }
  resetMetrics(): void { this._metrics.reset(); }
  getUptime(): number { return Date.now() - this._startTime.getTime(); }

  // ─── Initialization ──────────────────────────────────────────────
  async initialize(): Promise<void> {
    if (this._initialized) {
      this._logger.warn('Engine already initialized');
      return;
    }

    this._logger.info('Initializing NovaDL Engine...', { version: '1.0.0' });

    // Register built-in providers
    await this._registerBuiltinProviders();

    // Initialize cookie jar (load persisted cookies)
    await this._cookieJar.loadFromDisk();

    // Initialize proxy manager (add proxies from config)
    this._registerProxiesFromConfig();

    // Start health monitoring
    this._healthMonitor.start();

    // Initialize Prometheus exporter if monitoring is enabled
    if (this._config.monitoring.metricsEnabled) {
      this._prometheus = new PrometheusExporter(this._logger);
      await this._prometheus.initialize();
      this._logger.info('Prometheus exporter initialized');
    }

    // Initialize OpenTelemetry tracer if profiling is enabled
    if (this._config.monitoring.profilingEnabled) {
      this._otel = new OpenTelemetryTracer(this._logger);
      await this._otel.initialize('novadl-engine');
      this._logger.info('OpenTelemetry tracer initialized');
    }

    // Wire scorer events into engine metrics
    this._scorer.on('score:updated', ({ providerId, oldScore, newScore }) => {
      this._logger.debug('Provider score updated', { providerId, oldScore, newScore });
    });

    // Wire circuit breaker events
    this._circuitBreaker.on('circuit:opened', ({ providerId, reason, failures }) => {
      this._logger.warn('Circuit breaker opened', { providerId, reason, failures });
      this._metrics.recordExtractionFailure(providerId, 0, `circuit_opened:${reason}`);
    });
    this._circuitBreaker.on('circuit:closed', ({ providerId, successes }) => {
      this._logger.info('Circuit breaker closed', { providerId, successes });
    });
    this._circuitBreaker.on('circuit:rejected', ({ providerId, state }) => {
      this._logger.debug('Circuit breaker rejected request', { providerId, state });
    });

    // Wire browser manager events
    this._browserManager.on('browser:launched', () => {
      this._logger.info('Browser launched for fallback extraction');
    });
    this._browserManager.on('browser:shutdown', ({ reason }) => {
      this._logger.info('Browser shut down', { reason });
    });

    // Wire proxy manager events
    this._proxyManager.on('proxy:selected', ({ proxyId, region }) => {
      this._logger.debug('Proxy selected', { proxyId, region });
    });
    this._proxyManager.on('proxy:disabled', ({ proxyId, consecutiveFailures }) => {
      this._logger.warn('Proxy disabled', { proxyId, consecutiveFailures });
    });

    this._initialized = true;
    this._startTime = new Date();

    this._logger.info('NovaDL Engine initialized successfully', {
      providers: this._registry.size,
      enabledProviders: this._registry.enabledSize,
      cacheAdapter: this._config.cache.adapter,
      prometheus: this._prometheus !== null,
      openTelemetry: this._otel !== null,
    });
  }

  // ─── Main Extraction API ─────────────────────────────────────────
  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this._ensureReady();

    const context = this._createPipelineContext(request);

    const urlResult = validateAndDetectUrl(request.url, this._config.security.maxUrlLength);
    if (!urlResult.valid) {
      throw new Error(`Invalid URL: ${urlResult.errors.join(', ')}`);
    }

    context.platform = request.platform ?? urlResult.platform;
    context.request.url = urlResult.normalizedUrl;

    this._events.emit('extraction:start', {
      contextId: context.id,
      url: context.request.url,
      platform: context.platform,
    });

    this._healthMonitor.incrementActiveExtractions();

    // Start OTel span if tracer is available
    const span = this._otel?.startSpan('novadl.extract', {
      'url': context.request.url,
      'platform': context.platform,
    });

    const traceLogger = new StructuredTraceLogger(this._logger)
      .withTrace(context.id, { requestId: context.id, platform: context.platform });

    const traceTimer = new TraceTimer(traceLogger);

    try {
      // ── Stage 2: Cache Lookup ────────────────────────────────────
      const cacheKey = this._buildCacheKey(context.request);
      if (!context.request.options?.noCache) {
        const cached = await this._cache.get<ExtractionResult>(cacheKey);
        if (cached && cached.value) {
          traceLogger.info('Cache hit', { url: context.request.url, platform: context.platform });
          this._metrics.recordExtractionSuccess('cache', 0, true, false);
          this._events.emit('extraction:cache_hit', {
            contextId: context.id,
            url: context.request.url,
          });
          if (span) { span.setAttribute('cached', 'true'); span.end(); }
          return cached.value;
        }
      }

      this._events.emit('extraction:cache_miss', {
        contextId: context.id,
        url: context.request.url,
      });

      // ── Stage 3: Provider Selection (with scoring + circuit breaker) ──
      context.stage = 'select';
      const providers = this._selectProviders(context);

      if (providers.length === 0) {
        throw new Error(`No providers available for platform '${context.platform}'`);
      }

      context.selectedProviders = providers.map((p) => p.id);
      this._events.emit('provider:select', {
        contextId: context.id,
        providerIds: context.selectedProviders,
      });

      // ── Stage 4: Extraction Execution (with circuit breaker + fallback + browser) ──
      context.stage = 'extract';
      const result = await this._executeWithFallback(context, providers);

      // ── Stage 5: Process & Finalize ──────────────────────────────
      context.stage = 'finalize';
      context.result = result;
      context.endTime = new Date();

      // Cache the result
      if (!context.request.options?.noCache) {
        await this._cache.set(cacheKey, result, this._config.cache.ttlMs, [
          context.platform,
          result.provider,
        ]);
      }

      // Record metrics
      const latencyMs = context.endTime.getTime() - context.startTime.getTime();
      this._metrics.recordExtractionSuccess(
        result.provider,
        latencyMs,
        false,
        context.attempts.length > 1,
      );

      this._events.emit('extraction:success', {
        contextId: context.id,
        providerId: result.provider,
        latencyMs,
      });

      // Record successful extraction in Prometheus
      this._prometheus?.recordExtraction(context.platform, result.provider, latencyMs, 'success');

      if (span) { span.setStatus({ code: 1 }); span.end(); }

      return result;
    } catch (error) {
      context.endTime = new Date();
      const latencyMs = context.endTime.getTime() - context.startTime.getTime();
      const errorMessage = error instanceof Error ? error.message : String(error);

      this._metrics.recordExtractionFailure('unknown', latencyMs, errorMessage);
      this._events.emit('extraction:fail', {
        contextId: context.id,
        providerId: context.currentProvider,
        error: errorMessage,
      });

      this._prometheus?.recordExtraction(context.platform, context.currentProvider ?? 'unknown', latencyMs, 'error');

      if (span) { span.recordException(error instanceof Error ? error : new Error(errorMessage)); span.setStatus({ code: 2, message: errorMessage }); span.end(); }

      throw error;
    } finally {
      traceTimer.stopAndLog('info', 'extraction complete', { providerId: context.currentProvider });
      this._healthMonitor.decrementActiveExtractions();
    }
  }

  // ─── Download API ─────────────────────────────────────────────────
  async download(result: ExtractionResult, options: DownloadOptions): Promise<DownloadResult> {
    this._ensureReady();
    return this._downloadManager.downloadMedia(result, options);
  }

  // ─── Browser Fallback API ─────────────────────────────────────────
  async extractWithBrowser(
    url: string,
    options: BrowserExtractOptions = {},
  ): Promise<BrowserExtractResult> {
    this._ensureReady();

    // Get cookies for this domain from cookie jar
    const parsedUrl = new URL(url);
    const domainCookies = this._cookieJar.getValidCookiesForDomain(parsedUrl.hostname);
    const contextId = await this._browserManager.createContext(domainCookies);

    try {
      const browserResult = await this._browserManager.extractWithBrowser(url, contextId, options);

      // Store any new cookies from the browser session
      for (const cookie of browserResult.cookies) {
        this._cookieJar.setCookieEntry({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path ?? '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly ?? false,
          createdAt: Date.now(),
        });
      }

      this._events.emit('browser:fallback', {
        contextId: contextId,
        url,
        reason: 'provider_failure',
      });

      return browserResult;
    } finally {
      this._browserManager.closeContext(contextId).catch(() => {});
    }
  }

  // ─── Queue / Worker API ───────────────────────────────────────────
  async enqueue(request: ExtractionRequest): Promise<string> {
    this._ensureReady();
    const job = await this._queueAdapter.enqueue(request, 'normal');
    this._events.emit('queue:enqueue', { jobId: job.id, url: request.url });
    return job.id;
  }

  startWorkers(concurrency: number = this._config.queue.concurrency): void {
    if (this._workerPool) {
      this._logger.warn('Worker pool already running');
      return;
    }

    const handler: ExtractionHandler = async (request, signal, onProgress) => {
      onProgress('extraction', 0);
      const result = await this.extract(request);
      if (signal.aborted) throw new Error('Job cancelled');
      onProgress('extraction', 100);
      return result;
    };

    this._workerPool = new WorkerPool(this._queueAdapter, handler, this._logger, concurrency);
    this._workerPool.start();

    // Wire worker pool events
    this._workerPool.on('worker:job_completed', ({ jobId }) => {
      this._events.emit('queue:complete', { jobId, providerId: 'worker' });
    });
    this._workerPool.on('worker:job_failed', ({ jobId, error }) => {
      this._events.emit('queue:fail', { jobId, error });
    });

    this._logger.info('Worker pool started', { concurrency });
  }

  stopWorkers(): void {
    if (this._workerPool) {
      this._workerPool.stop();
      this._workerPool = null;
      this._logger.info('Worker pool stopped');
    }
  }

  getWorkerStats(): WorkerPoolStats | null {
    return this._workerPool?.getStats() ?? null;
  }

  // ─── Provider Management ──────────────────────────────────────────

  registerCustomExtractor(
    id: string,
    name: string,
    platforms: Platform[],
    extractorFn: CustomExtractorFn,
    options?: Partial<ProviderConfig>,
  ): void {
    const config: ProviderConfig = {
      id,
      name,
      type: 'custom',
      enabled: true,
      priority: options?.priority ?? 50,
      timeout: options?.timeout ?? this._config.extraction.defaultTimeoutMs,
      maxRetries: options?.maxRetries ?? this._config.extraction.maxRetries,
      platforms,
      ...options,
    };

    const provider = new CustomExtractorProvider(config, extractorFn, platforms);
    provider.initialize();
    this._registry.register(provider);

    this._logger.info(`Custom extractor registered: ${name}`, {
      providerId: id,
      platforms,
    });
  }

  enableProvider(providerId: string): boolean { return this._registry.enable(providerId); }
  disableProvider(providerId: string): boolean { return this._registry.disable(providerId); }
  setProviderPriority(providerId: string, priority: number): boolean { return this._registry.setPriority(providerId, priority); }

  // ─── Plugin Management ────────────────────────────────────────────

  async installPlugin(plugin: IPlugin, config?: Record<string, unknown>): Promise<void> {
    await this._pluginLoader.install(plugin, config ?? {});
  }

  async uninstallPlugin(pluginId: string): Promise<boolean> {
    return this._pluginLoader.uninstall(pluginId);
  }

  // ─── Shutdown ──────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this._shuttingDown) return;
    this._shuttingDown = true;

    this._logger.info('Shutting down NovaDL Engine...');

    // Stop health monitoring
    this._healthMonitor.stop();

    // Stop worker pool
    this.stopWorkers();

    // Shut down browser manager
    await this._browserManager.shutdown();

    // Save cookies to disk before shutting down providers
    await this._cookieJar.saveToDisk();

    // Shut down all providers
    for (const provider of this._registry.getAll()) {
      try {
        await provider.shutdown();
      } catch (error) {
        this._logger.warn(`Provider ${provider.id} shutdown failed`, {
          providerId: provider.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Shut down Prometheus exporter
    if (this._prometheus) {
      this._prometheus = null;
    }

    // Shut down OpenTelemetry tracer
    if (this._otel) {
      await this._otel.shutdown();
      this._otel = null;
    }

    // Cleanup cache adapter resources
    if (this._cache instanceof MemoryCacheAdapter) {
      this._cache.stopCleanup();
    }
    if (this._cache instanceof RedisCacheAdapter) {
      await this._cache.disconnect();
    }

    // Flush logger
    await this._logger.flush();

    this._initialized = false;
    this._logger.info('NovaDL Engine shut down complete');
  }

  // ─── Event Subscription ────────────────────────────────────────────

  on<K extends keyof EngineEvents>(
    event: K,
    handler: (data: EngineEvents[K]) => void,
  ): void {
    this._events.on(event, handler);
  }

  off<K extends keyof EngineEvents>(
    event: K,
    handler: (data: EngineEvents[K]) => void,
  ): void {
    this._events.off(event, handler);
  }

  // ─── Private: Provider Registration ──────────────────────────────────
  private async _registerBuiltinProviders(): Promise<void> {
    // Priority order: Native=1 → yt-dlp=5 → TikHub=10 → RapidAPI=15

    // Register yt-dlp (always available if binary exists)
    const ytdlpConfig: ProviderConfig = {
      id: 'ytdlp',
      name: 'yt-dlp CLI Extractor',
      type: 'cli',
      enabled: true,
      priority: 5,
      timeout: this._config.extraction.ytdlpTimeoutMs,
      maxRetries: this._config.extraction.maxRetries,
      platforms: [
        'youtube', 'youtube_shorts', 'tiktok', 'instagram', 'facebook',
        'x_twitter', 'pinterest', 'reddit', 'vimeo', 'dailymotion',
        'likee', 'bilibili', 'soundcloud', 'snapchat_spotlight', 'threads',
        'linkedin', 'capcut', 'spotify', 'lemon8',
      ],
      customOptions: {
        ytdlpPath: this._config.extraction.ytdlpPath,
      },
    };

    try {
      const ytdlp = new YtdlpProvider(ytdlpConfig);
      await ytdlp.initialize();
      this._registry.register(ytdlp);
      this._logger.info('yt-dlp provider initialized');
    } catch (error) {
      this._logger.warn('yt-dlp provider failed to initialize — will be unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Register TikHub (if API key provided) — Priority 10 (after yt-dlp)
    const tikHubApiKey = this._config.providers.find((p) => p.id === 'tikhub')?.apiKey ?? '';
    if (tikHubApiKey) {
      const tikhubConfig: ProviderConfig = {
        id: 'tikhub',
        name: 'TikHub API Provider',
        type: 'api',
        enabled: true,
        priority: 10,
        timeout: this._config.extraction.defaultTimeoutMs,
        maxRetries: this._config.extraction.maxRetries,
        platforms: ['tiktok', 'instagram', 'threads', 'snapchat_spotlight', 'likee', 'lemon8'],
        apiKey: tikHubApiKey,
      };

      try {
        const tikhub = new TikHubProvider(tikhubConfig);
        await tikhub.initialize();
        this._registry.register(tikhub);
        this._logger.info('TikHub provider initialized');
      } catch (error) {
        this._logger.warn('TikHub provider failed to initialize', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Register RapidAPI (if API key provided) — Priority 15 (after TikHub)
    const rapidApiKey = this._config.providers.find((p) => p.id === 'rapidapi')?.apiKey ?? '';
    if (rapidApiKey) {
      const rapidApiConfig: ProviderConfig = {
        id: 'rapidapi',
        name: 'RapidAPI Marketplace Provider',
        type: 'api',
        enabled: true,
        priority: 15,
        timeout: this._config.extraction.defaultTimeoutMs,
        maxRetries: this._config.extraction.maxRetries,
        platforms: ['tiktok', 'instagram', 'youtube', 'youtube_shorts', 'facebook', 'x_twitter', 'pinterest', 'reddit', 'vimeo', 'lemon8'],
        apiKey: rapidApiKey,
      };

      try {
        const rapidApi = new RapidApiProvider(rapidApiConfig);
        await rapidApi.initialize();
        this._registry.register(rapidApi);
        this._logger.info('RapidAPI provider initialized');
      } catch (error) {
        this._logger.warn('RapidAPI provider failed to initialize', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Register user-configured custom providers from config
    for (const providerConfig of this._config.providers) {
      if (providerConfig.type === 'custom' && !this._registry.has(providerConfig.id)) {
        this._logger.info(`Custom provider configured: ${providerConfig.id}`, {
          providerId: providerConfig.id,
        });
      }
    }

    // ── Register Native Extractors (Priority 1 — always attempted first) ──
    const nativeExtractors: Array<{ extractor: IProvider; platform: Platform }> = [
      { extractor: new TikTokNativeExtractor({ id: 'native_tiktok', name: 'TikTok Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['tiktok'] }), platform: 'tiktok' },
      { extractor: new InstagramNativeExtractor({ id: 'native_instagram', name: 'Instagram Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['instagram'] }), platform: 'instagram' },
      { extractor: new FacebookNativeExtractor({ id: 'native_facebook', name: 'Facebook Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['facebook'] }), platform: 'facebook' },
      { extractor: new TwitterNativeExtractor({ id: 'native_x_twitter', name: 'Twitter/X Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['x_twitter'] }), platform: 'x_twitter' },
      { extractor: new ThreadsNativeExtractor({ id: 'native_threads', name: 'Threads Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['threads'] }), platform: 'threads' },
      { extractor: new PinterestNativeExtractor({ id: 'native_pinterest', name: 'Pinterest Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['pinterest'] }), platform: 'pinterest' },
      { extractor: new RedditNativeExtractor({ id: 'native_reddit', name: 'Reddit Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['reddit'] }), platform: 'reddit' },
      { extractor: new VimeoNativeExtractor({ id: 'native_vimeo', name: 'Vimeo Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['vimeo'] }), platform: 'vimeo' },
      { extractor: new DailymotionNativeExtractor({ id: 'native_dailymotion', name: 'Dailymotion Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['dailymotion'] }), platform: 'dailymotion' },
      { extractor: new LikeeNativeExtractor({ id: 'native_likee', name: 'Likee Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['likee'] }), platform: 'likee' },
      { extractor: new BilibiliNativeExtractor({ id: 'native_bilibili', name: 'Bilibili Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['bilibili'] }), platform: 'bilibili' },
      { extractor: new SnapchatNativeExtractor({ id: 'native_snapchat', name: 'Snapchat Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['snapchat_spotlight'] }), platform: 'snapchat_spotlight' },
      { extractor: new SoundCloudNativeExtractor({ id: 'native_soundcloud', name: 'SoundCloud Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['soundcloud'] }), platform: 'soundcloud' },
      { extractor: new SpotifyNativeExtractor({ id: 'native_spotify', name: 'Spotify Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['spotify'] }), platform: 'spotify' },
      { extractor: new Lemon8NativeExtractor({ id: 'native_lemon8', name: 'Lemon8 Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['lemon8'] }), platform: 'lemon8' },
      { extractor: new CapCutNativeExtractor({ id: 'native_capcut', name: 'CapCut Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['capcut'] }), platform: 'capcut' },
      { extractor: new YouTubeNativeExtractor({ id: 'native_youtube', name: 'YouTube Metadata Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['youtube', 'youtube_shorts'] }), platform: 'youtube' },
      { extractor: new TumblrNativeExtractor({ id: 'native_tumblr', name: 'Tumblr Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['tumblr'] }), platform: 'tumblr' },
      { extractor: new StreamableNativeExtractor({ id: 'native_streamable', name: 'Streamable Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['streamable'] }), platform: 'streamable' },
      { extractor: new VKNativeExtractor({ id: 'native_vk', name: 'VK Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['vk'] }), platform: 'vk' },
      { extractor: new MixCloudNativeExtractor({ id: 'native_mixcloud', name: 'MixCloud Native Extractor', type: 'custom', enabled: true, priority: 1, timeout: this._config.extraction.defaultTimeoutMs, maxRetries: 2, platforms: ['mixcloud'] }), platform: 'mixcloud' },
    ];

    for (const { extractor, platform } of nativeExtractors) {
      try {
        await extractor.initialize();
        this._registry.register(extractor);
        this._logger.info(`Native extractor initialized: ${platform}`, {
          providerId: extractor.id,
          platform,
        });
      } catch (error) {
        this._logger.warn(`Native extractor failed to initialize: ${platform}`, {
          providerId: extractor.id,
          platform,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ─── Private: Register Proxies from Config ──────────────────────────
  private _registerProxiesFromConfig(): void {
    // Proxies from config are stored in provider customOptions or env vars
    // The proxy manager accepts explicit proxy registration
    const proxyConfigs = this._config.providers
      .filter((p) => p.customOptions?.proxies)
      .flatMap((p) => p.customOptions?.proxies as ProxyConfig[] ?? []);

    for (const proxyConfig of proxyConfigs) {
      this._proxyManager.addProxy(proxyConfig);
    }

    // Also add proxies from environment variables if present
    const envProxy = process.env.NOVA_PROXY_URL;
    if (envProxy) {
      const protocol = envProxy.startsWith('socks5') ? 'socks5' as const
        : envProxy.startsWith('https') ? 'https' as const
        : 'http' as const;
      this._proxyManager.addProxy({
        id: 'env_default',
        url: envProxy,
        protocol,
        weight: 10,
        enabled: true,
        healthStatus: 'unchecked',
      });
    }
  }

  // ─── Private: Provider Selection (scoring + circuit breaker) ──────────
  private _selectProviders(context: PipelineContext): IProvider[] {
    if (context.request.preferredProvider) {
      const provider = this._registry.get(context.request.preferredProvider);
      if (provider && provider.config.enabled && provider.supports(context.platform)) {
        // Check circuit breaker for the preferred provider
        if (!this._circuitBreaker.canExecute(provider.id)) {
          this._logger.warn(`Preferred provider '${provider.id}' has open circuit breaker`, {
            providerId: provider.id,
            platform: context.platform,
          });
          return [];
        }
        return [provider];
      }
      this._logger.warn(`Requested provider '${context.request.preferredProvider}' not available`, {
        providerId: context.request.preferredProvider,
        platform: context.platform,
      });
    }

    // Get providers for this platform, ordered by priority
    let providers = this._registry.getByPlatform(context.platform);

    // Filter out providers whose circuit breaker is open
    providers = providers.filter((p) => this._circuitBreaker.canExecute(p.id));

    // If scorer has data, re-sort by composite score (higher score = better)
    if (providers.length > 1) {
      const scored = providers.map((p) => ({
        provider: p,
        score: this._scorer.getScore(p.id),
      }));
      // Preserve native extractors at top (priority 1), then sort remaining by score
      scored.sort((a, b) => {
        // Providers with priority 1 (native) always come first
        if (a.provider.config.priority === 1 && b.provider.config.priority !== 1) return -1;
        if (b.provider.config.priority === 1 && a.provider.config.priority !== 1) return 1;
        // Among same-tier providers, sort by scorer composite score
        return b.score - a.score;
      });
      providers = scored.map((s) => s.provider);
    }

    // If no providers support this platform, try all providers as fallback
    if (providers.length === 0) {
      this._logger.warn(`No platform-specific providers for '${context.platform}', trying all`, {
        platform: context.platform,
      });
      providers = this._registry.getEnabled().filter((p) => this._circuitBreaker.canExecute(p.id));
    }

    // Filter by requested media type capabilities
    const opts = context.request.options;
    if (opts?.extractAudio && !opts?.extractVideo) {
      providers = providers.filter((p) => p.canDeliver('audio'));
    }

    // If no-fallback is requested, use only the top provider
    if (opts?.noFallback && providers.length > 0) {
      const first = providers[0];
      if (first) return [first];
      return [];
    }

    return providers;
  }

  // ─── Private: Extraction with Fallback + Circuit Breaker + Browser ──────
  private async _executeWithFallback(
    context: PipelineContext,
    providers: IProvider[],
  ): Promise<ExtractionResult> {
    // ── Strategy 1: Parallel Provider Testing ──────────────────────
    if (this._config.extraction.parallelProviderTests && providers.length > 1) {
      try {
        const result = await raceSuccessful(
          providers.map((provider) =>
            this._tryProvider(context, provider),
          ),
        );

        // Record success in scorer and circuit breaker
        this._scorer.recordSuccess(result.provider, Date.now() - context.startTime.getTime());
        this._circuitBreaker.recordSuccess(result.provider);

        return result;
      } catch {
        this._logger.debug('All parallel provider tests failed, falling back to sequential');
      }
    }

    // ── Strategy 2: Sequential Fallback ────────────────────────────
    for (const provider of providers) {
      try {
        const result = await this._tryProviderWithRetry(context, provider);

        // Record success in scorer and circuit breaker
        const latency = context.endTime
          ? context.endTime.getTime() - context.startTime.getTime()
          : Date.now() - context.startTime.getTime();
        this._scorer.recordSuccess(provider.id, latency);
        this._circuitBreaker.recordSuccess(provider.id);

        return result;
      } catch (error) {
        const providerError = error as ProviderErrorType;
        const latency = Date.now() - context.startTime.getTime();

        // Record failure in scorer and circuit breaker
        this._scorer.recordFailure(provider.id, latency, (providerError.code ?? 'UNKNOWN') as ProviderErrorCode);
        this._circuitBreaker.recordFailure(provider.id);

        const attempt: ProviderAttempt = {
          providerId: provider.id,
          providerName: provider.name,
          startTime: new Date(),
          endTime: new Date(),
          success: false,
          error: providerError.message,
          latencyMs: latency,
        };
        context.attempts.push(attempt);

        // Record fallback event
        const nextIdx = providers.indexOf(provider) + 1;
        const nextProvider = nextIdx < providers.length ? providers[nextIdx] : undefined;
        if (nextProvider) {
          this._events.emit('provider:fallback', {
            contextId: context.id,
            fromProvider: provider.id,
            toProvider: nextProvider.id,
          });
          this._logger.info(`Falling back from ${provider.id} to ${nextProvider.id}`, {
            fromProvider: provider.id,
            toProvider: nextProvider.id,
            error: providerError.message,
          });
        }

        // Continue to next provider
      }
    }

    // ── Strategy 3: Browser Fallback ──────────────────────────────
    // Only attempt browser fallback if noFallback is NOT set
    const opts = context.request.options;
    if (!opts?.noFallback) {
      // If all providers failed, try browser-based extraction as last resort
      let browserAvailable = false;
      try {
        browserAvailable = await this._browserManager.isAvailable();
      } catch {
        browserAvailable = false;
      }

      if (browserAvailable) {
      this._logger.info('All providers failed, attempting browser fallback', {
        url: context.request.url,
        platform: context.platform,
      });

      try {
        const browserResult = await this.extractWithBrowser(context.request.url, {
          waitUntil: 'domcontentloaded',
          timeoutMs: this._config.extraction.defaultTimeoutMs,
        });

        // Browser fallback produces raw HTML — we need to re-extract
        // by passing the HTML through native extractors that parse embedded JSON
        const result: ExtractionResult = {
          id: uuid(),
          url: context.request.url,
          platform: context.platform,
          provider: 'browser_fallback',
          timestamp: new Date(),
          media: [],
          metadata: {
            title: browserResult.title,
            platform: context.platform,
            extra: {
              html: browserResult.html,
              browserContextId: browserResult.contextId,
            },
          },
          rawResponse: browserResult,
        };

        this._events.emit('browser:fallback', {
          contextId: context.id,
          url: context.request.url,
          reason: 'all_providers_failed',
        });

        return result;
      } catch (browserError) {
        this._logger.warn('Browser fallback also failed', {
          url: context.request.url,
          error: browserError instanceof Error ? browserError.message : String(browserError),
        });
      }
    }

    // ── End browser fallback ──
    }

    // All providers + browser fallback exhausted
    throw new Error(
      `All providers and browser fallback failed for ${context.request.url} (platform: ${context.platform}). ` +
      `Attempts: ${context.attempts.length}. Last errors: ${context.attempts.map((a) => a.error).join('; ')}`,
    );
  }

  // ─── Private: Try a Single Provider ──────────────────────────────
  private async _tryProvider(
    context: PipelineContext,
    provider: IProvider,
  ): Promise<ExtractionResult> {
    context.currentProvider = provider.id;
    const startTime = Date.now();

    this._events.emit('provider:attempt', {
      contextId: context.id,
      providerId: provider.id,
      attempt: context.attempts.length + 1,
    });

    try {
      const result = await provider.extract(context.request);
      const latencyMs = Date.now() - startTime;

      context.attempts.push({
        providerId: provider.id,
        providerName: provider.name,
        startTime: new Date(startTime),
        endTime: new Date(),
        success: true,
        latencyMs,
        result,
      });

      return result;
    } catch (error) {
      const providerError = error as ProviderErrorType;
      throw providerError;
    }
  }

  // ─── Private: Try Provider with Retry ────────────────────────────
  private async _tryProviderWithRetry(
    context: PipelineContext,
    provider: IProvider,
  ): Promise<ExtractionResult> {
    const maxRetries = context.request.options?.maxRetries ?? provider.config.maxRetries ?? this._config.extraction.maxRetries;

    return retryWithBackoff(
      () => this._tryProvider(context, provider),
      {
        maxAttempts: maxRetries + 1,
        backoffMs: this._config.extraction.retryBackoffMs,
        retryableCheck: (error: unknown) => {
          if (error && typeof error === 'object' && 'retryable' in error) {
            return (error as ProviderErrorType).retryable;
          }
          return false;
        },
        onRetry: (attempt: number, error: unknown) => {
          this._logger.debug(`Retrying provider ${provider.id}`, {
            providerId: provider.id,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  }

  // ─── Private: Pipeline Context ────────────────────────────────────
  private _createPipelineContext(request: ExtractionRequest): PipelineContext {
    return {
      id: uuid(),
      request,
      platform: request.platform ?? 'unknown',
      selectedProviders: [],
      attempts: [],
      startTime: new Date(),
      stage: 'validate',
      metadata: {},
    };
  }

  // ─── Private: Cache ──────────────────────────────────────────────
  private _buildCacheKey(request: ExtractionRequest): string {
    const parts = [
      request.url,
      request.platform ?? '',
      request.preferredQuality ?? '',
      request.preferredFormat ?? '',
      request.preferredProvider ?? '',
      JSON.stringify({
        video: request.options?.extractVideo ?? true,
        audio: request.options?.extractAudio ?? false,
        subtitles: request.options?.extractSubtitles ?? false,
        watermark: request.options?.detectWatermark ?? false,
      }),
    ];
    return parts.join('|');
  }

  private _createCacheAdapter(): ICacheAdapter {
    switch (this._config.cache.adapter) {
      case 'redis':
        return new RedisCacheAdapter(
          this._config.cache.redisUrl ?? 'redis://localhost:6379',
          this._config.cache.ttlMs,
        );
      case 'file':
        return new FileCacheAdapter(
          undefined,
          this._config.cache.ttlMs,
        );
      case 'memory':
        return new MemoryCacheAdapter(
          this._config.cache.maxEntries,
          this._config.cache.ttlMs,
        );
      default:
        return new MemoryCacheAdapter(
          this._config.cache.maxEntries,
          this._config.cache.ttlMs,
        );
    }
  }

  // ─── Private: Utilities ──────────────────────────────────────────
  private _ensureReady(): void {
    if (!this._initialized) {
      throw new Error('NovaDL Engine not initialized. Call initialize() first.');
    }
    if (this._shuttingDown) {
      throw new Error('NovaDL Engine is shutting down. No new requests accepted.');
    }
  }
}
