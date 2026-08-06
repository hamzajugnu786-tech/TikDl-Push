/**
 * /api/download Route — NovaDL-Ready (Phase 1)
 *
 * REFACTORED to use DownloadService instead of the old getProvider().
 *
 * ⚠️  The API response shape is EXACTLY the same as before:
 *     { success: boolean, data: VideoInfo, provider: string, duration: number }
 *
 * The frontend still receives the same data. No UI changes.
 *
 * Changes from old route:
 * - Uses DownloadService instead of getProvider()
 * - Uses PlatformDetector instead of hardcoded TikTok regex
 * - Uses NovaDLError standardisation instead of hardcoded error strings
 * - Rate limiting now uses production-grade RateLimiter (DB-backed, persists across restarts)
 * - Same 20/hr/IP limit — no change to user-facing behavior
 * - Request ID generation for log correlation
 * - Structured logging via DownloadLogger
 *
 * Backward compatibility:
 * - The response shape { success, data, provider, duration } is unchanged
 * - The VideoInfo fields (noWatermarkUrl, withWatermarkUrl, audioUrl, cover) are unchanged
 * - Error messages for private/deleted content are unchanged
 * - Rate limit response (429) is unchanged
 * - Invalid URL response (400) is unchanged
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDownloadService, initializeNovaDL, PlatformDetector } from '@/services';
import { serviceResultToApiResponse } from '@/lib/result-to-display';
import { NovaDLErrorCode } from '@/services/errors';
import { getDownloadRateLimiter } from '@/lib/rate-limiter';
import { getClientIp, hashIpForRateLimit } from '@/lib/privacy';

// ============================================================================
// STRICT TIKTOK URL VALIDATION
// ============================================================================

/**
 * Validate that a URL is not just on tiktok.com domain, but is a specific
 * video/content URL that could potentially be downloaded.
 *
 * This runs BEFORE rate limiting to ensure invalid URLs ALWAYS get a 400
 * response, never a 429 "Too many requests" response.
 *
 * Valid TikTok URL structures:
 *   - https://www.tiktok.com/@username/video/123456
 *   - https://www.tiktok.com/@username/photo/123456
 *   - https://vm.tiktok.com/SHORTCODE/
 *   - https://vt.tiktok.com/SHORTCODE/
 *   - https://m.tiktok.com/v/123456
 *   - https://m.tiktok.com/video/123456
 *
 * Invalid (domain only, non-video paths):
 *   - https://www.tiktok.com/
 *   - https://www.tiktok.com/trending
 *   - https://www.tiktok.com/@username (profile page)
 *   - https://www.tiktok.com/foryou
 *   - https://www.tiktok.com/discover
 */
const TIKTOK_VIDEO_URL_PATTERNS = [
  // Full URLs: /@username/video/ID or /@username/photo/ID
  /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[^/]+\/(?:video|photo)\/\d+/i,
  // Short URLs: /SHORTCODE (vm.tiktok.com, vt.tiktok.com)
  /^https?:\/\/(?:vm\.|vt\.)tiktok\.com\/[A-Za-z0-9]+\/?/i,
  // Mobile URLs: /v/ID or /video/ID
  /^https?:\/\/m\.tiktok\.com\/(?:v|video)\/\d+/i,
];

function isValidTikTokVideoUrl(url: string): boolean {
  return TIKTOK_VIDEO_URL_PATTERNS.some(pattern => pattern.test(url));
}

export async function POST(request: NextRequest) {
  // Initialize NovaDL service layer on first request
  await initializeNovaDL();

  const startTime = Date.now();

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body. JSON expected.' },
        { status: 400 }
      );
    }
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // URL sanitization (preserved from old route)
    const sanitizedUrl = url.trim().slice(0, 500);

    // ──── URL VALIDATION BEFORE RATE LIMITING ────
    // Invalid URLs must ALWAYS show the correct "Invalid TikTok URL" error,
    // even if the user is rate-limited. Rate limits should only apply to
    // valid download attempts, not to URL validation errors.
    // This ensures that an invalid URL never triggers the 429 response.
    const platformInfo = PlatformDetector.identify(sanitizedUrl);

    if (platformInfo.platform !== 'tiktok') {
      // Not even a TikTok domain
      return NextResponse.json(
        { success: false, error: 'Invalid TikTok URL format. Please use a valid TikTok link.' },
        { status: 400 }
      );
    }

    // Stricter validation: Check that the URL is a specific video/content URL,
    // not just a TikTok domain page (like /trending, /foryou, /@username profile).
    // This prevents URLs like "https://www.tiktok.com/trending" from reaching
    // the rate limiter and showing "Too many requests" to the user.
    if (!isValidTikTokVideoUrl(sanitizedUrl)) {
      return NextResponse.json(
        { success: false, error: 'Invalid TikTok URL. Please check the URL and try again.' },
        { status: 400 }
      );
    }

    // ──── Rate limiting — AFTER URL validation ────
    // Only rate-limit valid download attempts (not invalid URL probes)
    // Production-grade (DB-backed, persists across restarts)
    // Use spoofing-resistant IP extraction (takes last IP in XFF chain)
    // ⚠️  Hash IP before rate limit key — raw IPs are NEVER stored anywhere (GDPR)
    const rateLimiter = getDownloadRateLimiter();
    const ip = getClientIp(request);
    const rateLimitKey = hashIpForRateLimit(ip);
    const allowed = await rateLimiter.check(rateLimitKey);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Delegate to DownloadService
    const downloadService = getDownloadService();
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const serviceResult = await downloadService.fetch(sanitizedUrl, {
      ipAddress: ip,
      userAgent,
    });

    // Convert ServiceResult into frontend-expected API response
    const apiResponse = serviceResultToApiResponse(serviceResult);

    // Determine HTTP status code based on result
    if (apiResponse.success) {
      // Success — same response shape as old route
      console.log(`[API] Success in ${Date.now() - startTime}ms using ${apiResponse.provider}`);
      return NextResponse.json(apiResponse);
    }

    // Error — map NovaDLErrorCode to appropriate HTTP status
    // NEVER return 500 or 502 — these leak infrastructure details.
    // All errors map to 400 (client error) or 404 (content not found).
    let statusCode = 404;

    if (serviceResult.error) {
      const errorCode = serviceResult.error.code;

      if (errorCode === NovaDLErrorCode.INVALID_URL || errorCode === NovaDLErrorCode.UNSUPPORTED_PLATFORM) {
        statusCode = 400;
        apiResponse.error = 'Invalid TikTok URL. Please check the URL and try again.';
      } else if (errorCode === NovaDLErrorCode.RATE_LIMITED) {
        // Rate-limited — return 429 but with generic user message
        // Frontend will show "Video unavailable" for ALL errors including 429
        statusCode = 429;
        apiResponse.error = 'Video unavailable';
      } else if (
        errorCode === NovaDLErrorCode.PRIVATE_CONTENT ||
        errorCode === NovaDLErrorCode.DELETED_CONTENT ||
        errorCode === NovaDLErrorCode.AGE_RESTRICTED ||
        errorCode === NovaDLErrorCode.GEO_BLOCKED
      ) {
        statusCode = 404;
        apiResponse.error = 'This video is unavailable. It was removed by the creator or is no longer available on TikTok.';
      } else {
        // All other errors (PROVIDER_OFFLINE, DOWNLOAD_FAILED, UNKNOWN_ERROR, etc.)
        // NEVER leak provider/API/quota details. Always 404 with generic message.
        statusCode = 404;
        apiResponse.error = 'Video unavailable';
      }
    }

    return NextResponse.json(apiResponse, { status: statusCode });
  } catch (error) {
    // Log the actual error server-side for debugging
    console.error('[API] Unhandled error:', error);
    // Return a generic message to the client — never leak internal error details
    return NextResponse.json(
      {
        success: false,
        error: 'Video not found. Please check the URL and try again.',
      },
      { status: 404 }
    );
  }
}
