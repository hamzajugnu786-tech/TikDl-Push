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

  // Initialize rate limiter (loads from DB on first call)
  const rateLimiter = getDownloadRateLimiter();

  const startTime = Date.now();

  try {
    // Rate limiting — production-grade (DB-backed, persists across restarts)
    // Use spoofing-resistant IP extraction (takes last IP in XFF chain)
    // ⚠️  Hash IP before rate limit key — raw IPs are NEVER stored anywhere (GDPR)
    const ip = getClientIp(request);
    const rateLimitKey = hashIpForRateLimit(ip);
    const allowed = await rateLimiter.check(rateLimitKey);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

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

    // Delegate to DownloadService
    // ⚠️  BACKWARD COMPATIBILITY: In Phase 1, the frontend still only accepts
    //     TikTok URLs. The PlatformDetector detects all platforms, but for
    //     backward compatibility, we validate that the URL is TikTok before
    //     passing it to DownloadService. This preserves the exact error message
    //     the frontend expects: "Invalid TikTok URL format."
    const platformInfo = PlatformDetector.identify(sanitizedUrl);

    if (platformInfo.platform !== 'tiktok') {
      // Return the same error message as the old route for non-TikTok URLs
      return NextResponse.json(
        { success: false, error: 'Invalid TikTok URL format. Please use a valid TikTok link.' },
        { status: 400 }
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

    // ──── STAGE D: API Response JSON ────
    if (apiResponse.success && apiResponse.data) {
      console.log('[TRACE-D] API response data (VideoInfo):', JSON.stringify({
        id: apiResponse.data.id,
        title: apiResponse.data.title,
        author: apiResponse.data.author,
        avatar: apiResponse.data.avatar ? apiResponse.data.avatar.slice(0, 80) : '(empty)',
        thumbnail: apiResponse.data.thumbnail ? apiResponse.data.thumbnail.slice(0, 80) : '(empty)',
        duration: apiResponse.data.duration,
        views: apiResponse.data.views,
        likes: apiResponse.data.likes,
        noWatermarkUrl: apiResponse.data.noWatermarkUrl ? apiResponse.data.noWatermarkUrl.slice(0, 80) : '(empty)',
        withWatermarkUrl: apiResponse.data.withWatermarkUrl ? apiResponse.data.withWatermarkUrl.slice(0, 80) : '(empty)',
        audioUrl: apiResponse.data.audioUrl ? apiResponse.data.audioUrl.slice(0, 80) : '(empty)',
        cover: apiResponse.data.cover ? apiResponse.data.cover.slice(0, 80) : '(empty)',
      }));
    } else {
      console.log('[TRACE-D] API response is error:', apiResponse.error);
    }

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
      } else if (errorCode === NovaDLErrorCode.RATE_LIMITED) {
        statusCode = 429;
      } else if (
        errorCode === NovaDLErrorCode.PRIVATE_CONTENT ||
        errorCode === NovaDLErrorCode.DELETED_CONTENT ||
        errorCode === NovaDLErrorCode.AGE_RESTRICTED ||
        errorCode === NovaDLErrorCode.GEO_BLOCKED
      ) {
        // Backward compat: old route returned 404 for private/deleted
        statusCode = 404;
      } else if (errorCode === NovaDLErrorCode.PROVIDER_OFFLINE) {
        statusCode = 503;
      }
    }

    // ⚠️  BACKWARD COMPATIBILITY: For private/deleted content, the old route
    //     returned: "This video is private or has been deleted."
    if (
      serviceResult.error?.code === NovaDLErrorCode.PRIVATE_CONTENT ||
      serviceResult.error?.code === NovaDLErrorCode.DELETED_CONTENT
    ) {
      apiResponse.error = 'This video is private or has been deleted.';
    }

    return NextResponse.json(apiResponse, { status: statusCode });
  } catch (error) {
    // Log the actual error server-side for debugging
    console.error('[API] Unhandled error:', error);
    // Return a generic message to the client — never leak internal error details
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    );
  }
}
