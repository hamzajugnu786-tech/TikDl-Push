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
import { ServiceResult, NovaDLErrorInfo, NovaDLResult } from './types';
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

    // ──── RACE ALL PROVIDERS SIMULTANEOUSLY ────
    // Engine (TikHub ∥ RapidAPI) AND registry (tiktok-api-dl V1∥V2∥V3) all
    // start at the same instant. First success wins, return immediately.
    // No sequential stages. No waiting for one path to fail before trying another.
    const allProviders = this.registry.getProviders(platformInfo.platform);
    const engineReady = isEngineInitialized();

    // Content-level error codes that should never be retried across providers
    const noRetryCodes = new Set([
      NovaDLErrorCode.PRIVATE_CONTENT,
      NovaDLErrorCode.DELETED_CONTENT,
      NovaDLErrorCode.AGE_RESTRICTED,
      NovaDLErrorCode.GEO_BLOCKED,
      NovaDLErrorCode.AUTH_REQUIRED,
      NovaDLErrorCode.INVALID_URL,
      NovaDLErrorCode.UNSUPPORTED_PLATFORM,
    ]);

    // Collect all provider promises
    type ProviderAttempt = { providerName: string; result: NovaDLResult } | { providerName: string; error: NovaDLError };
    const attempts: Promise<ProviderAttempt>[] = [];

    // 1. Engine path (TikHub ∥ RapidAPI) — if available
    if (engineReady) {
      attempts.push(
        extractWithEngine(platformInfo.canonicalUrl, platformInfo.platform)
          .then((result) => {
            const hasAnyMedia = result.formats.length > 0 || result.audio.length > 0 ||
              (result.metadata.slideImages && result.metadata.slideImages.length > 0);
            if (hasAnyMedia) {
              return { providerName: 'novadl-engine', result };
            }
            // Empty result — treat as failure
            const err = new NovaDLError(NovaDLErrorCode.DOWNLOAD_FAILED, 'Engine returned empty result', platformInfo.platform, requestId);
            return { providerName: 'novadl-engine', error: err };
          })
          .catch((err: unknown) => {
            const error = err instanceof NovaDLError ? err : new NovaDLError(
              NovaDLErrorCode.DOWNLOAD_FAILED,
              err instanceof Error ? err.message : String(err),
              platformInfo.platform,
              requestId,
            );
            return { providerName: 'novadl-engine', error };
          })
      );
    }

    // 2. Registry providers (tiktok-api-dl) — skip TikHub/RapidAPI if engine already covers them
    const registryProviders = engineReady
      ? allProviders.filter(p => p.name === 'tiktok-api-dl')
      : allProviders;

    for (const provider of registryProviders) {
      attempts.push(
        provider.fetchVideo(platformInfo.canonicalUrl)
          .then((result) => ({ providerName: provider.name, result }))
          .catch((err: unknown) => {
            const error = err instanceof NovaDLError ? err : new NovaDLError(
              NovaDLErrorCode.UNKNOWN_ERROR,
              err instanceof Error ? err.message : 'Unknown error',
              platformInfo.platform,
              requestId,
              { provider: provider.name, originalError: err instanceof Error ? err : undefined }
            );
            return { providerName: provider.name, error };
          })
      );
    }

    if (attempts.length === 0) {
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

    // Race: first success wins. Content-level errors (private/deleted) abort immediately.
    // Transient errors are ignored if any provider is still running.
    const raceResult = await new Promise<ProviderAttempt | null>((resolveRace) => {
      let settled = false;
      let completedCount = 0;

      for (const attemptPromise of attempts) {
        attemptPromise.then((attempt) => {
          if (settled) return; // Already resolved — ignore

          if ('result' in attempt) {
            // SUCCESS — return immediately
            settled = true;
            resolveRace(attempt);
          } else {
            // FAILURE — check type
            const error = attempt.error;

            // Content-level error (private/deleted/invalid) — abort ALL providers
            if (error instanceof NovaDLError && noRetryCodes.has(error.code)) {
              settled = true;
              resolveRace(attempt); // Return the content-level error
              return;
            }

            // Transient failure — keep waiting for other providers
            completedCount++;
            if (completedCount === attempts.length) {
              // ALL providers failed
              settled = true;
              resolveRace(attempt); // Return last error
            }
          }
        });
      }
    });

    const duration = Date.now() - startTime;

    if (raceResult && 'result' in raceResult) {
      // SUCCESS
      const result = raceResult.result;
      await this.logger.log({
        requestId,
        timestamp: new Date(),
        platform: platformInfo.platform,
        provider: raceResult.providerName,
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
        provider: raceResult.providerName,
        platform: platformInfo.platform,
        duration,
        requestId,
      };
    }

    // ALL providers failed (or content-level error)
    const lastError = raceResult?.error;
    const lastProviderName = raceResult?.providerName || 'none';

    // Rate-limited is a special case — return it directly
    if (lastError instanceof NovaDLError && lastError.code === NovaDLErrorCode.RATE_LIMITED) {
      const errorInfo: NovaDLErrorInfo = {
        code: lastError.code,
        message: lastError.message,
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
        error: lastError.code,
        errorMessage: lastError.message,
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
