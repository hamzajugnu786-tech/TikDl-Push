/**
 * NovaDL Download Service — Phase 1
 *
 * The UI communicates ONLY with DownloadService.
 * Never directly with providers.
 *
 * Current flow (OLD):
 *   Frontend → API → getProvider() → Provider
 *
 * New flow (Phase 1):
 *   Frontend → API → DownloadService → Provider Registry → Provider
 *
 * DownloadService handles:
 * 1. Platform detection (PlatformDetector.identify())
 * 2. URL validation per-platform rules
 * 3. Provider chain resolution (registry.getProviders())
 * 4. Execution with retry + fallback
 * 5. Error standardisation (NovaDLError)
 * 6. Logging (DownloadLogger)
 * 7. Returns unified ServiceResult
 */

import { getRegistry } from './providers/registry';
import { PlatformDetector } from './platform-detector';
import { getLogger } from './logger';
import { NovaDLError, NovaDLErrorCode, generateRequestId } from './errors';
import { ServiceResult, NovaDLErrorInfo } from './types';

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
   * 3. Check if platform is supported and has providers
   * 4. Try primary provider, fallback to next if primary fails
   * 5. Log the request (success or error)
   * 6. Return unified ServiceResult
   */
  async fetch(url: string, options?: { ipAddress?: string; userAgent?: string }): Promise<ServiceResult> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    // Step 1: Detect platform
    const platformInfo = PlatformDetector.identify(url);

    if (platformInfo.platform === 'unknown') {
      // Unsupported URL — return error immediately
      const errorInfo: NovaDLErrorInfo = {
        code: NovaDLErrorCode.UNSUPPORTED_PLATFORM,
        message: 'This platform is not supported yet',
        platform: 'unknown',
        requestId,
      };

      // Log the failed request
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

    // Step 3: Check if platform has registered providers
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

    // Step 4: Try providers in order (primary → fallback)
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
            if (
              err.code === NovaDLErrorCode.PRIVATE_CONTENT ||
              err.code === NovaDLErrorCode.DELETED_CONTENT ||
              err.code === NovaDLErrorCode.AGE_RESTRICTED ||
              err.code === NovaDLErrorCode.GEO_BLOCKED ||
              err.code === NovaDLErrorCode.AUTH_REQUIRED ||
              err.code === NovaDLErrorCode.INVALID_URL ||
              err.code === NovaDLErrorCode.UNSUPPORTED_PLATFORM
            ) {
              // These errors should not fall through to the fallback provider
              // They represent content-level issues that won't be resolved by trying another provider
              break; // Break retry loop, but continue to fallback provider for provider-level errors
            }

            // Retry on transient errors (DOWNLOAD_FAILED, PROVIDER_OFFLINE, RATE_LIMITED)
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 800 * attempt)); // Exponential backoff
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

      // Primary provider exhausted all retries — try fallback provider
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

    // Log failed request
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
