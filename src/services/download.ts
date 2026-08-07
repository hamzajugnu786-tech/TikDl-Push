/**
 * NovaDL Download Service — Integrated with Real NovaDL Engine
 *
 * The UI communicates ONLY with DownloadService.
 * Never directly with providers.
 *
 * Flow (NEW — with real engine):
 *   Frontend → API → DownloadService → NovaDLEngine (native extractors → TikHub → RapidAPI)
 *
 * Fallback (if engine fails):
 *   Frontend → API → DownloadService → Provider Registry → Old Adapters
 *
 * DownloadService handles:
 * 1. Platform detection (PlatformDetector.identify())
 * 2. URL validation per-platform rules
 * 3. Try the real NovaDL engine first (native extractors → TikHub → RapidAPI)
 * 4. Fall back to old provider registry if engine fails
 * 5. Error standardisation (NovaDLError)
 * 6. Logging (DownloadLogger)
 * 7. Returns unified ServiceResult
 */

import { getRegistry } from './providers/registry';
import { PlatformDetector } from './platform-detector';
import { getLogger } from './logger';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from './errors';
import { ServiceResult, NovaDLErrorInfo } from './types';
import { extractWithEngine, isEngineInitialized } from './engine-bridge';

// ============================================================================
// DOWNLOAD SERVICE CLASS
// ============================================================================

export class DownloadService {
  private registry = getRegistry();
  private logger = getLogger();

  /**
   * Fetch video/content from a URL.
   *
   * Process:
   * 1. Detect platform from URL
   * 2. Validate URL against platform rules
   * 3. Try the real NovaDL engine (native extractors → TikHub → RapidAPI)
   * 4. If engine fails, fall back to old provider registry
   * 5. Log the request (success or error)
   * 6. Return unified ServiceResult
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

    // Step 3: Try the real NovaDL engine first
    // The engine races all providers in parallel (parallelProviderTests: true).
    // Providers: TikHub ∥ RapidAPI (parallel, no retries).
    // If the engine succeeds, return immediately — no double-fallback.
    if (isEngineInitialized()) {
      try {
        const result = await extractWithEngine(platformInfo.canonicalUrl, platformInfo.platform);
        const duration = Date.now() - startTime;

        // If the engine returned a result but with NO downloadable content at all
        // (no video formats, no audio, no slide images), this is a failed extraction.
        // Fall through to the tiktok-api-dl provider only (NOT TikHub/RapidAPI —
        // the engine already tried those).
        const hasAnyMedia = result.formats.length > 0 || result.audio.length > 0 ||
          (result.metadata.slideImages && result.metadata.slideImages.length > 0);

        if (!hasAnyMedia) {
          console.warn('[DownloadService] NovaDL engine returned empty result (no formats, no audio, no images). Falling back to tiktok-api-dl only.');
          // Fall through to Step 4 — but only try tiktok-api-dl, skip TikHub/RapidAPI
        } else {
          // Engine returned usable media — use it
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
      } catch (engineError) {
        // Engine failed — log and fall through to old provider registry
        const engineErrorMsg = engineError instanceof Error ? engineError.message : String(engineError);
        console.warn(`[DownloadService] NovaDL engine failed: ${engineErrorMsg}. Falling back to tiktok-api-dl only.`);

        // If the error is a content-level error (private/deleted), don't retry with other providers
        if (engineError instanceof NovaDLError) {
          const noRetryCodes = [
            NovaDLErrorCode.PRIVATE_CONTENT,
            NovaDLErrorCode.DELETED_CONTENT,
            NovaDLErrorCode.AGE_RESTRICTED,
            NovaDLErrorCode.GEO_BLOCKED,
            NovaDLErrorCode.AUTH_REQUIRED,
            NovaDLErrorCode.INVALID_URL,
            NovaDLErrorCode.UNSUPPORTED_PLATFORM,
            NovaDLErrorCode.RATE_LIMITED,
          ];

          if (noRetryCodes.includes(engineError.code)) {
            // Content-level error — return immediately
            const duration = Date.now() - startTime;
            const errorInfo: NovaDLErrorInfo = {
              code: engineError.code,
              message: engineError.message,
              platform: platformInfo.platform,
              provider: 'novadl-engine',
              requestId,
            };

            await this.logger.log({
              requestId,
              timestamp: new Date(),
              platform: platformInfo.platform,
              provider: 'novadl-engine',
              url,
              status: 'error',
              executionTime: duration,
              error: engineError.code,
              errorMessage: engineError.message,
              ipAddress: options?.ipAddress,
              userAgent: options?.userAgent,
            });

            return {
              success: false,
              error: errorInfo,
              provider: 'novadl-engine',
              platform: platformInfo.platform,
              duration,
              requestId,
            };
          }
        }

        // Transient error — fall through to tiktok-api-dl only (skip TikHub/RapidAPI)
      }
    }

    // Step 4: Fallback to provider registry
    // If the engine was initialized (Step 3 ran), only try tiktok-api-dl since
    // the engine already covered TikHub and RapidAPI. This eliminates the
    // double-fallback that caused 30-45s of duplicate provider calls.
    // If the engine was NOT initialized (Step 3 skipped), use all providers.
    const allProviders = this.registry.getProviders(platformInfo.platform);
    const engineWasUsed = isEngineInitialized();
    const providers = engineWasUsed
      ? allProviders.filter(p => p.name === 'tiktok-api-dl')
      : allProviders;

    if (providers.length === 0) {
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

    // Try providers in order (primary → fallback)
    let lastError: NovaDLError | null = null;
    let lastProviderName = 'none';

    for (const provider of providers) {
      lastProviderName = provider.name;

      // PERFORMANCE: Only 1 attempt per provider.
      // The tiktok-api-dl adapter already has V2→V3→V1 internal fallback.
      // Retrying the same provider that already exhausted its internal fallback
      // just adds latency without improving success rate.
      // For paid fallback providers (TikHub, RapidAPI), 1 attempt is sufficient
      // since they either work or return a definitive error.
      try {
        const result = await provider.fetchVideo(platformInfo.canonicalUrl);

        const duration = Date.now() - startTime;

        // Log successful request
        await this.logger.log({
          requestId,
          timestamp: new Date(),
          platform: platformInfo.platform,
          provider: provider.name,
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
          provider: provider.name,
          platform: platformInfo.platform,
          duration,
          requestId,
        };
      } catch (err) {
        // Handle NovaDLError (standardised)
        if (err instanceof NovaDLError) {
          lastError = err;

          // Don't try next provider on client-type errors (private/deleted content)
          if (
            err.code === NovaDLErrorCode.PRIVATE_CONTENT ||
            err.code === NovaDLErrorCode.DELETED_CONTENT ||
            err.code === NovaDLErrorCode.AGE_RESTRICTED ||
            err.code === NovaDLErrorCode.GEO_BLOCKED ||
            err.code === NovaDLErrorCode.AUTH_REQUIRED ||
            err.code === NovaDLErrorCode.INVALID_URL ||
            err.code === NovaDLErrorCode.UNSUPPORTED_PLATFORM ||
            err.code === NovaDLErrorCode.RATE_LIMITED
          ) {
            break;
          }
        } else {
          // Handle unknown errors
          lastError = new NovaDLError(
            NovaDLErrorCode.UNKNOWN_ERROR,
            err instanceof Error ? err.message : 'Unknown error',
            platformInfo.platform,
            requestId,
            { provider: provider.name, originalError: err instanceof Error ? err : undefined }
          );
        }
      }

      console.warn(`[DownloadService] Provider "${provider.name}" failed, trying next provider`);
    }

    // All providers failed
    const duration = Date.now() - startTime;

    const errorInfo: NovaDLErrorInfo = lastError
      ? {
        code: lastError.code,
        message: lastError.message || 'All providers failed',
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
