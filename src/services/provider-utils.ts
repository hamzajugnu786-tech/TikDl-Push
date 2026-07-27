/**
 * Shared HTTP Error Mapping Utility
 *
 * Extracted from the duplicated mapHttpError methods in
 * TikTokTikHubAdapter and TikTokRapidAPIAdapter. Both adapters
 * had identical switch-case logic for mapping HTTP status codes
 * to NovaDLErrorCode values.
 *
 * This shared utility eliminates the duplication while preserving
 * the same error mapping behavior.
 */

import { NovaDLError, NovaDLErrorCode } from './errors';

/**
 * Map an HTTP response status code to a NovaDLError.
 *
 * Standard mapping:
 *   403 → PRIVATE_CONTENT
 *   404 → DELETED_CONTENT
 *   429 → RATE_LIMITED
 *   default → DOWNLOAD_FAILED
 *
 * @param status HTTP status code from the provider API
 * @param platform Platform identifier (e.g. "tiktok")
 * @param requestId Request ID for correlation
 * @param providerName Provider name for error attribution
 */
export function mapHttpError(
  status: number,
  platform: string,
  requestId: string,
  providerName: string
): NovaDLError {
  switch (status) {
    case 403:
      return new NovaDLError(
        NovaDLErrorCode.PRIVATE_CONTENT,
        `This content is private and cannot be accessed`,
        platform,
        requestId,
        { provider: providerName }
      );
    case 404:
      return new NovaDLError(
        NovaDLErrorCode.DELETED_CONTENT,
        `This content has been deleted`,
        platform,
        requestId,
        { provider: providerName }
      );
    case 429:
      return new NovaDLError(
        NovaDLErrorCode.RATE_LIMITED,
        `Rate limit exceeded on ${providerName}`,
        platform,
        requestId,
        { provider: providerName }
      );
    default:
      return new NovaDLError(
        NovaDLErrorCode.DOWNLOAD_FAILED,
        `${providerName} returned status ${status}`,
        platform,
        requestId,
        { provider: providerName }
      );
  }
}

/**
 * Create an offline ProviderHealth object.
 *
 * Used by all provider adapters when the API key is missing
 * or the health check fetch fails. Eliminates the repeated
 * offline-health object construction across adapters.
 */
export function createOfflineHealth(): import('./providers/types').ProviderHealth {
  return {
    status: 'offline',
    latency: 0,
    availability: 0,
    version: undefined,
    lastCheck: new Date(),
    errorRate: 1,
    successRate: 0,
    retryCount: 0,
  };
}

/**
 * Wrap an unknown error into a NovaDLError.
 *
 * If the error is already a NovaDLError, it's returned as-is.
 * Otherwise, it's wrapped in a DOWNLOAD_FAILED NovaDLError.
 *
 * ⚠️  ALWAYS returns a NovaDLError — never throws.
 *     All callers use `throw wrapProviderError(...)`, so the outer throw
 *     handles re-throwing. This function should never throw internally,
 *     because that would make the API contract unpredictable.
 *
 * Used by all provider adapters in their catch blocks.
 * Eliminates the duplicated try/catch → NovaDLError wrapping pattern.
 */
export function wrapProviderError(
  error: unknown,
  platform: string,
  requestId: string,
  providerName: string
): NovaDLError {
  if (error instanceof NovaDLError) {
    // Return standardised errors as-is — caller will throw them
    return error;
  }

  return new NovaDLError(
    NovaDLErrorCode.DOWNLOAD_FAILED,
    error instanceof Error ? error.message : `${providerName} fetch failed`,
    platform,
    requestId,
    {
      provider: providerName,
      originalError: error instanceof Error ? error : undefined,
    }
  );
}
