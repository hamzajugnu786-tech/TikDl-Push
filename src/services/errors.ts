/**
 * NovaDL Error Standardisation — Phase 1 Core Interfaces
 *
 * Standardised error codes and the NovaDLError class that every
 * provider must throw on failure. No raw Error objects, no
 * provider-specific error strings in the service layer.
 */

// ============================================================================
// ERROR CODES
// ============================================================================

export enum NovaDLErrorCode {
  /** The URL is malformed or empty */
  INVALID_URL = 'INVALID_URL',

  /** The URL belongs to a platform not yet supported */
  UNSUPPORTED_PLATFORM = 'UNSUPPORTED_PLATFORM',

  /** No provider for this platform is currently online */
  PROVIDER_OFFLINE = 'PROVIDER_OFFLINE',

  /** The download failed after all retry attempts */
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',

  /** The user has exceeded the rate limit */
  RATE_LIMITED = 'RATE_LIMITED',

  /** The content is private and cannot be accessed */
  PRIVATE_CONTENT = 'PRIVATE_CONTENT',

  /** The content has been deleted by the author */
  DELETED_CONTENT = 'DELETED_CONTENT',

  /** The content is age-restricted */
  AGE_RESTRICTED = 'AGE_RESTRICTED',

  /** The content is blocked in the user's region */
  GEO_BLOCKED = 'GEO_BLOCKED',

  /** The content requires authentication/login */
  AUTH_REQUIRED = 'AUTH_REQUIRED',

  /** The content is a live stream (not downloadable yet) */
  LIVE_STREAM = 'LIVE_STREAM',

  /** Catch-all for unexpected errors */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================================================
// NOVADL ERROR CLASS
// ============================================================================

export class NovaDLError extends Error {
  /** Standardised error code */
  code: NovaDLErrorCode;

  /** Which platform this error relates to */
  platform: string;

  /** Which provider threw this error (if known) */
  provider?: string;

  /** Request ID for log correlation */
  requestId: string;

  /** The original error from the provider (for debugging) */
  originalError?: Error;

  constructor(
    code: NovaDLErrorCode,
    message: string,
    platform: string,
    requestId: string,
    options?: { provider?: string; originalError?: Error }
  ) {
    super(message);
    this.name = 'NovaDLError';
    this.code = code;
    this.platform = platform;
    this.requestId = requestId;
    this.provider = options?.provider;
    this.originalError = options?.originalError;
  }

  /** Convert to structured JSON for API responses */
  toJSON(): object {
    return {
      code: this.code,
      message: this.message,
      platform: this.platform,
      provider: this.provider,
      requestId: this.requestId,
    };
  }

  /** Convert to user-friendly display message */
  toDisplayMessage(): string {
    const messages: Record<NovaDLErrorCode, string> = {
      INVALID_URL: 'The URL you entered is not valid. Please check and try again.',
      UNSUPPORTED_PLATFORM: 'This platform is not supported yet. Stay tuned for future updates!',
      PROVIDER_OFFLINE: 'Our download service is temporarily unavailable. Please try again later.',
      DOWNLOAD_FAILED: 'We couldn\'t process this content. Please try again or try a different link.',
      RATE_LIMITED: 'You\'ve made too many requests. Please wait a moment and try again.',
      PRIVATE_CONTENT: 'This content is private and cannot be downloaded.',
      DELETED_CONTENT: 'This content has been deleted and is no longer available.',
      AGE_RESTRICTED: 'This content is age-restricted and cannot be downloaded.',
      GEO_BLOCKED: 'This content is not available in your region.',
      AUTH_REQUIRED: 'This content requires login to view and cannot be downloaded.',
      LIVE_STREAM: 'Live streams cannot be downloaded. Try again after the stream ends.',
      UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
    };
    return messages[this.code] || this.message;
  }
}

// ============================================================================
// REQUEST ID GENERATOR
// ============================================================================

/**
 * Generate a unique request ID for log correlation.
 * Uses a simple UUID v4-like format for request tracing.
 */
export function generateRequestId(): string {
  return `novadl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
