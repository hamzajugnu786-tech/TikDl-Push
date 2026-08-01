/**
 * NovaDL Engine — Custom Extractor Provider
 * 
 * This is the "bring your own logic" provider. It allows developers
 * to create ad-hoc extractors for platforms that aren't covered by
 * built-in providers, without going through the full plugin system.
 * 
 * Custom extractors are registered at runtime via the engine's
 * `registerCustomExtractor()` method. They receive validated URLs
 * and must return ExtractionResult objects.
 * 
 * Use cases:
 * - Quick prototype for a new platform
 * - Platform-specific logic that doesn't fit other providers
 * - Internal/private platform extraction
 * - Testing and debugging
 */

import { v4 as uuid } from 'uuid';
import type {
  Platform,
  ExtractionRequest,
  ExtractionResult,
  ProviderConfig,
  ProviderCapabilities,
  ProviderFeature,
} from '../types/index';
import { BaseProvider } from './base';

// ─── Custom Extractor Function ────────────────────────────────────────
/**
 * The function signature for a custom extractor.
 * 
 * Receives the validated extraction request and must return a
 * complete ExtractionResult. Errors are caught by the engine's
 * retry/fallback system.
 */
export type CustomExtractorFn = (
  request: ExtractionRequest,
) => Promise<ExtractionResult>;

// ─── Provider Implementation ──────────────────────────────────────────
export class CustomExtractorProvider extends BaseProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'custom' = 'custom';

  private _extractorFn: CustomExtractorFn;
  private _supportedPlatforms: Platform[];
  private _capabilities: ProviderCapabilities;

  constructor(
    config: ProviderConfig,
    extractorFn: CustomExtractorFn,
    supportedPlatforms: Platform[] = [],
    capabilities?: Partial<ProviderCapabilities>,
  ) {
    super(config);
    this.id = config.id;
    this.name = config.name;
    this._extractorFn = extractorFn;
    this._supportedPlatforms = supportedPlatforms;
    this._capabilities = {
      platforms: supportedPlatforms,
      mediaTypes: capabilities?.mediaTypes ?? ['video', 'audio', 'metadata', 'image'],
      formats: capabilities?.formats ?? ['mp4', 'mp3', 'jpeg', 'png'],
      qualities: capabilities?.qualities ?? ['best'],
      features: capabilities?.features ?? ['video_download', 'metadata_extraction'] as ProviderFeature[],
      maxConcurrent: capabilities?.maxConcurrent ?? 5,
    };
  }

  async initialize(): Promise<void> {
    // Custom extractors are considered ready immediately
    this._initialized = true;
    this._health = {
      status: 'healthy',
      lastChecked: new Date(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this.ensureInitialized();

    const startTime = Date.now();

    try {
      const result = await this.withTimeout(
        this._extractorFn(request),
        this.config.timeout,
      );

      // Ensure the result has proper provider attribution
      result.id = result.id ?? uuid();
      result.provider = this.id;
      result.timestamp = new Date();

      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.recordFailure(
        error instanceof Error ? error.message : String(error),
        latency,
      );
      throw error;
    }
  }

  supports(platform: Platform): boolean {
    return this._supportedPlatforms.includes(platform);
  }

  getCapabilities(): ProviderCapabilities {
    return this._capabilities;
  }

  /** Update the extractor function at runtime */
  updateExtractor(fn: CustomExtractorFn): void {
    this._extractorFn = fn;
  }

  /** Add a platform to this extractor's supported list */
  addPlatform(platform: Platform): void {
    if (!this._supportedPlatforms.includes(platform)) {
      this._supportedPlatforms.push(platform);
      this._capabilities.platforms = [...this._supportedPlatforms];
      this.config.platforms = [...this._supportedPlatforms];
    }
  }

  /** Remove a platform from this extractor's supported list */
  removePlatform(platform: Platform): void {
    this._supportedPlatforms = this._supportedPlatforms.filter((p) => p !== platform);
    this._capabilities.platforms = [...this._supportedPlatforms];
    this.config.platforms = [...this._supportedPlatforms];
  }
}
