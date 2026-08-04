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
    if (isEngineInitialized()) {
      try {
        const result = await extractWithEngine(platformInfo.canonicalUrl, platformInfo.platform);
        const duration = Date.now() - startTime;

        // REGRESSION FIX: If the engine returned a result but with NO downloadable
        // content at all (no video formats, no audio, no slide images), this is
        // effectively a failed extraction. Fall through to the provider registry
        // (TikHub adapter) which may have better data.
        // This fixes the case where the native_tiktok extractor returns empty
        // results but success=true, preventing the TikHub API from being called.
        const hasAnyMedia = result.formats.length > 0 || result.audio.length > 0 ||
          (result.metadata.slideImages && result.metadata.slideImages.length > 0);

        if (!hasAnyMedia) {
          console.warn('[DownloadService] NovaDL engine returned empty result (no formats, no audio, no images). Falling back to provider registry.');
          // Fall through to Step 4 (provider registry)
        } else {
          // Engine returned usable media — use it
          // Log successful request
          await this.logger.log({
            requestId,
            timestamp: new Date(),
            platform: platformInfo.platform,
            provider: result.metadata.videoId ? 'novadl-engine' : 'novadl-engine',
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
        console.warn(`[DownloadService] NovaDL engine failed: ${engineErrorMsg}. Falling back to provider registry.`);

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

        // Transient error — fall through to old provider registry
      }
    }

    // Step 4: Fallback to old provider registry
    const providers = this.registry.getProviders(platformInfo.platform);

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

      // Retry logic: up to 3 attempts with exponential backoff
      for (let attempt = 1; attempt <= 3; attempt++) {
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

            // Don't retry on client-type errors (private/deleted content)
            // Also don't retry on RATE_LIMITED (API quota exceeded — retrying won't help)
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

            // Retry on transient errors (DOWNLOAD_FAILED, PROVIDER_OFFLINE)
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 800 * attempt));
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

            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 800 * attempt));
            }
          }
        }
      }

      console.warn(`[DownloadService] Provider "${provider.name}" failed after 3 attempts, trying next provider`);
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
