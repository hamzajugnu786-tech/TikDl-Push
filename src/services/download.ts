/**
 * NovaDL Download Service — Integrated with Real NovaDL Engine
 *
 * The UI communicates ONLY with DownloadService.
 * Never directly with providers.
 *
 * Provider priority:
 *   1. tiktok-api-dl (FREE, primary — V1 ∥ V2 ∥ V3 parallel, first success wins)
 *   2. NovaDLEngine (PAID fallback — TikHub, RapidAPI — ONLY if primary fails)
 *
 * The engine (TikHub/RapidAPI) is NEVER raced simultaneously with the primary
 * provider. This prevents:
 *   - Wasting paid API credits when the free provider would succeed
 *   - Content-level error codes from the engine (e.g. DELETED_CONTENT mapped
 *     from TikHub's NOT_FOUND) aborting the primary provider prematurely
 *   - Race conditions where the engine's transient failure kills the primary
 *
 * DownloadService handles:
 * 1. Platform detection (PlatformDetector.identify())
 * 2. URL validation per-platform rules
 * 3. Try primary provider (tiktok-api-dl) first
 * 4. If primary fails with a transient error, try engine as fallback
 * 5. If primary fails with a content-level error, return immediately (no fallback)
 * 6. Error standardisation (NovaDLError)
 * 7. Logging (DownloadLogger)
 * 8. Returns unified ServiceResult
 */

import { getRegistry } from './providers/registry';
import { PlatformDetector } from './platform-detector';
import { getLogger } from './logger';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from './errors';
import { ServiceResult, NovaDLErrorInfo, NovaDLResult } from './types';
import { extractWithEngine } from './engine-bridge';

// ============================================================================
// DOWNLOAD SERVICE CLASS
// ============================================================================

export class DownloadService {
  private registry = getRegistry();
  private logger = getLogger();

  /**
   * Fetch video/content from a URL.
   *
   * Provider priority (STRICT):
   *   1. tiktok-api-dl (FREE, primary — V1 ∥ V2 ∥ V3 parallel, first success wins)
   *   2. NovaDLEngine (PAID fallback — TikHub, RapidAPI — ONLY if primary fails)
   *
   * The engine is NEVER raced simultaneously with the primary. This prevents
   * the engine's incorrectly-mapped content-level errors (e.g. DELETED_CONTENT
   * from TikHub's NOT_FOUND) from aborting the primary provider.
   */
  async fetch(url: string, options?: { ipAddress?: string; userAgent?: string }): Promise<ServiceResult> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    // Step 1: Detect platform
    const platformInfo = PlatformDetector.identify(url);

    if (platformInfo.platform === 'unknown') {
      const errorInfo: NovaDLErrorInfo = {
        code: NovaDLErrorCode.UNSUPPORTED_PLATFORM,
        message: 'This platform is not supported yet',
        platform: 'unknown',
        requestId,
      };

      await this.logger.log({
        requestId,
        timestamp: new Date(),
        platform: 'unknown',
        provider: 'none',
        url,
        status: 'error',
        executionTime: Date.now() - startTime,
        error: NovaDLErrorCode.UNSUPPORTED_PLATFORM,
        errorMessage: errorInfo.message,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      });

      return {
        success: false,
        error: errorInfo,
        provider: 'none',
        platform: 'unknown',
        duration: Date.now() - startTime,
        requestId,
      };
    }

    // Step 2: Validate URL for the detected platform
    if (!PlatformDetector.validateForPlatform(url, platformInfo.platform)) {
      const errorInfo: NovaDLErrorInfo = {
        code: NovaDLErrorCode.INVALID_URL,
        message: `Invalid URL format for ${platformInfo.platform}`,
        platform: platformInfo.platform,
        requestId,
      };

      await this.logger.log({
        requestId,
        timestamp: new Date(),
        platform: platformInfo.platform,
        provider: 'none',
        url,
        status: 'error',
        executionTime: Date.now() - startTime,
        error: NovaDLErrorCode.INVALID_URL,
        errorMessage: errorInfo.message,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      });

      return {
        success: false,
        error: errorInfo,
        provider: 'none',
        platform: platformInfo.platform,
        duration: Date.now() - startTime,
        requestId,
      };
    }

    // ──── PRIMARY: tiktok-api-dl (FREE provider) ────
    // Try the free primary provider first. Within tiktok-api-dl, V1 ∥ V2 ∥ V3
    // race in parallel (first success wins). We NEVER race paid providers
    // (TikHub/RapidAPI) simultaneously — they are fallback only.
    const allProviders = this.registry.getProviders(platformInfo.platform);

    // Content-level error codes — if the primary returns these, do NOT try fallback
    const contentLevelCodes = new Set([
      NovaDLErrorCode.PRIVATE_CONTENT,
      NovaDLErrorCode.DELETED_CONTENT,
      NovaDLErrorCode.AGE_RESTRICTED,
      NovaDLErrorCode.GEO_BLOCKED,
      NovaDLErrorCode.AUTH_REQUIRED,
      NovaDLErrorCode.INVALID_URL,
      NovaDLErrorCode.UNSUPPORTED_PLATFORM,
    ]);

    // Get the primary provider (tiktok-api-dl)
    const primaryProvider = allProviders.find(p => p.name === 'tiktok-api-dl');

    if (!primaryProvider) {
      // No primary provider registered — this shouldn't happen but handle gracefully
      const errorInfo: NovaDLErrorInfo = {
        code: NovaDLErrorCode.UNSUPPORTED_PLATFORM,
        message: `No providers registered for ${platformInfo.platform}`,
        platform: platformInfo.platform,
        requestId,
      };

      await this.logger.log({
        requestId,
        timestamp: new Date(),
        platform: platformInfo.platform,
        provider: 'none',
        url,
        status: 'error',
        executionTime: Date.now() - startTime,
        error: NovaDLErrorCode.UNSUPPORTED_PLATFORM,
        errorMessage: errorInfo.message,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      });

      return {
        success: false,
        error: errorInfo,
        provider: 'none',
        platform: platformInfo.platform,
        duration: Date.now() - startTime,
        requestId,
      };
    }

    // ──── Step 3: Try PRIMARY provider (tiktok-api-dl) ────
    let primaryError: NovaDLError | null = null;

    try {
      const result = await primaryProvider.fetchVideo(platformInfo.canonicalUrl);
      const hasAnyMedia = result.formats.length > 0 || result.audio.length > 0 ||
        (result.metadata.slideImages && result.metadata.slideImages.length > 0);

      if (hasAnyMedia) {
        // PRIMARY SUCCEEDED — return immediately, no fallback needed
        const duration = Date.now() - startTime;
        await this.logger.log({
          requestId,
          timestamp: new Date(),
          platform: platformInfo.platform,
          provider: primaryProvider.name,
          url,
          status: 'success',
          executionTime: duration,
          ipAddress: options?.ipAddress,
          userAgent: options?.userAgent,
          videoId: result.metadata.videoId,
          videoTitle: result.title,
        });

        return {
          success: true,
          data: result,
          provider: primaryProvider.name,
          platform: platformInfo.platform,
          duration,
          requestId,
        };
      }

      // Primary returned empty result — treat as failure, try fallback
      primaryError = new NovaDLError(
        NovaDLErrorCode.DOWNLOAD_FAILED,
        'Primary provider returned empty result',
        platformInfo.platform,
        requestId,
        { provider: primaryProvider.name }
      );
    } catch (err: unknown) {
      primaryError = err instanceof NovaDLError ? err : new NovaDLError(
        NovaDLErrorCode.DOWNLOAD_FAILED,
        err instanceof Error ? err.message : 'Unknown error',
        platformInfo.platform,
        requestId,
        { provider: primaryProvider.name, originalError: err instanceof Error ? err : undefined }
      );
    }

    // ──── Step 4: Check if PRIMARY's error is content-level ────
    // If the primary says the video is private/deleted/unavailable, trust it.
    // Do NOT try paid fallback providers — they would just waste credits
    // and would return the same content-level error anyway.
    if (primaryError && contentLevelCodes.has(primaryError.code)) {
      const duration = Date.now() - startTime;
      const errorInfo: NovaDLErrorInfo = {
        code: primaryError.code,
        message: primaryError.message,
        platform: platformInfo.platform,
        provider: primaryProvider.name,
        requestId,
      };

      await this.logger.log({
        requestId,
        timestamp: new Date(),
        platform: platformInfo.platform,
        provider: primaryProvider.name,
        url,
        status: 'error',
        executionTime: duration,
        error: primaryError.code,
        errorMessage: primaryError.message,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      });

      return {
        success: false,
        error: errorInfo,
        provider: primaryProvider.name,
        platform: platformInfo.platform,
        duration,
        requestId,
      };
    }

    // ──── Step 5: PRIMARY failed with transient error — try FALLBACK ────
    // Only use the engine (TikHub/RapidAPI) as a fallback when the primary
    // genuinely failed with a transient error (timeout, rate limit, network).
    // extractWithEngine() handles lazy engine init via getEngine() — the
    // engine may still be initializing in the background from initializeNovaDL().
    console.log(`[DownloadService] Primary (${primaryProvider.name}) failed with transient error, trying engine fallback`);

    try {
      const result = await extractWithEngine(platformInfo.canonicalUrl, platformInfo.platform);
      const hasAnyMedia = result.formats.length > 0 || result.audio.length > 0 ||
        (result.metadata.slideImages && result.metadata.slideImages.length > 0);

      if (hasAnyMedia) {
        // FALLBACK SUCCEEDED
        const duration = Date.now() - startTime;
        await this.logger.log({
          requestId,
          timestamp: new Date(),
          platform: platformInfo.platform,
          provider: 'novadl-engine',
          url,
          status: 'success',
          executionTime: duration,
          ipAddress: options?.ipAddress,
          userAgent: options?.userAgent,
          videoId: result.metadata.videoId,
          videoTitle: result.title,
        });

        return {
          success: true,
          data: result,
          provider: 'novadl-engine',
          platform: platformInfo.platform,
          duration,
          requestId,
        };
      }
    } catch (engineErr: unknown) {
      // Engine fallback also failed — fall through to return primary's error
      const msg = engineErr instanceof Error ? engineErr.message : String(engineErr);
      console.warn(`[DownloadService] Engine fallback also failed: ${msg.slice(0, 200)}`);
    }

    // ──── Step 6: ALL providers failed — return PRIMARY's error ────
    // Always return the primary's error, not the engine's. The primary is
    // authoritative. The engine is just a best-effort fallback.
    const duration = Date.now() - startTime;
    const lastProviderName = primaryProvider.name;

    // Rate-limited is a special case
    if (primaryError && primaryError.code === NovaDLErrorCode.RATE_LIMITED) {
      const errorInfo: NovaDLErrorInfo = {
        code: primaryError.code,
        message: primaryError.message,
        platform: platformInfo.platform,
        provider: lastProviderName,
        requestId,
      };

      await this.logger.log({
        requestId,
        timestamp: new Date(),
        platform: platformInfo.platform,
        provider: lastProviderName,
        url,
        status: 'error',
        executionTime: duration,
        error: primaryError.code,
        errorMessage: primaryError.message,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      });

      return {
        success: false,
        error: errorInfo,
        provider: lastProviderName,
        platform: platformInfo.platform,
        duration,
        requestId,
      };
    }

    const errorInfo: NovaDLErrorInfo = primaryError
      ? {
        code: primaryError.code,
        message: primaryError.message || 'All providers failed',
        platform: platformInfo.platform,
        provider: lastProviderName,
        requestId,
      }
      : {
        code: NovaDLErrorCode.DOWNLOAD_FAILED,
        message: 'All download attempts failed',
        platform: platformInfo.platform,
        provider: lastProviderName,
        requestId,
      };

    await this.logger.log({
      requestId,
      timestamp: new Date(),
      platform: platformInfo.platform,
      provider: lastProviderName,
      url,
      status: 'error',
      executionTime: duration,
      error: (errorInfo.code as NovaDLErrorCode) || NovaDLErrorCode.DOWNLOAD_FAILED,
      errorMessage: errorInfo.message,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    return {
      success: false,
      error: errorInfo,
      provider: lastProviderName,
      platform: platformInfo.platform,
      duration,
      requestId,
    };
  }

  /**
   * Run health checks on all registered providers.
   * Returns a map of provider name → ProviderHealth.
   */
  async healthCheckAll(): Promise<Map<string, any>> {
    return this.registry.healthCheckAll();
  }
}

// ============================================================================
// GLOBAL DOWNLOAD SERVICE SINGLETON
// ============================================================================

let globalService: DownloadService | null = null;

export function getDownloadService(): DownloadService {
  if (!globalService) {
    globalService = new DownloadService();
  }
  return globalService;
}
