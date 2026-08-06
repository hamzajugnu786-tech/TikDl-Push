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
      // Return the same error message as the old route for non-TikTok URLs
      return NextResponse.json(
        { success: false, error: 'Invalid TikTok URL format. Please use a valid TikTok link.' },
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
    let statusCode = 500;

    if (serviceResult.error) {
      const errorCode = serviceResult.error.code;

      if (errorCode === NovaDLErrorCode.INVALID_URL || errorCode === NovaDLErrorCode.UNSUPPORTED_PLATFORM) {
        statusCode = 400;
        apiResponse.error = 'Invalid TikTok URL. Please check the URL and try again.';
      } else if (errorCode === NovaDLErrorCode.RATE_LIMITED) {
        statusCode = 429;
      } else if (
        errorCode === NovaDLErrorCode.PRIVATE_CONTENT ||
        errorCode === NovaDLErrorCode.DELETED_CONTENT ||
        errorCode === NovaDLErrorCode.AGE_RESTRICTED ||
        errorCode === NovaDLErrorCode.GEO_BLOCKED
      ) {
        statusCode = 404;
        apiResponse.error = 'This video is unavailable. It was removed by the creator or is no longer available on TikTok.';
      } else if (errorCode === NovaDLErrorCode.PROVIDER_OFFLINE) {
        statusCode = 503;
        apiResponse.error = 'Video not found. Please try again later.';
      } else {
        // All other errors — NEVER leak provider/API/quota details
        statusCode = 404;
        apiResponse.error = 'Video not found. Please check the URL and try again.';
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
