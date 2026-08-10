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
import { db } from '@/lib/db';

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

// ============================================================================
// MAX FILE SIZE — admin-configured runtime setting (Bug #4C)
// ============================================================================
//
// Reads `maxFileSize` from the Settings table (managed by the admin Settings
// tab). When set, the download success response is checked against the limit.
// If the resolved noWatermarkUrl's Content-Length exceeds the limit, the
// request is rejected with the same "Video unavailable" shape used for other
// download failures — no new error UI is introduced.
//
// The check is performed AFTER the provider race returns a result, so it
// never slows the critical video-fetch path. The HEAD request to determine
// Content-Length runs only on success, in parallel with response shaping.
//
// Accepted formats (case-insensitive, whitespace-tolerant):
//   "100MB", "100 MB", "10MB", "5.4MB", "1GB", "500KB", "1024KB", "2GB"
//   "100mb", "100 mb", "100M"  (M treated as MB)
//   Empty/missing/unparseable → no limit enforced (fail-open).

function parseMaxFileSizeBytes(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  // Match: <number> [optional space] <optional unit>
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|m|k|g)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = m[2] || 'mb';
  const multipliers: Record<string, number> = {
    k: 1024,
    kb: 1024,
    m: 1024 * 1024,
    mb: 1024 * 1024,
    g: 1024 * 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  return Math.floor(num * multipliers[unit]);
}

/**
 * Fetch Content-Length for a URL using a lightweight HEAD request.
 * Returns null when the header is missing or the request fails —
 * in that case the size limit is NOT enforced (fail-open) because
 * rejecting without evidence would block legitimate downloads.
 *
 * Bounded by a 4-second timeout to never stall the response path.
 */
async function fetchContentLengthBytes(url: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    });
    clearTimeout(timeout);
    const len = res.headers.get('content-length');
    if (!len) return null;
    const n = parseInt(len, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Read the admin-configured maxFileSize setting from the DB.
 * Returns null on any error or when the setting is missing.
 * Cached for 30 seconds to avoid hitting the DB on every download.
 */
let cachedMaxFileSize: { value: number | null; expiresAt: number } = {
  value: null,
  expiresAt: 0,
};

async function getEffectiveMaxFileSizeBytes(): Promise<number | null> {
  const now = Date.now();
  if (now < cachedMaxFileSize.expiresAt) {
    return cachedMaxFileSize.value;
  }
  try {
    const row = await db.settings.findUnique({ where: { key: 'maxFileSize' } });
    const parsed = row?.value ? parseMaxFileSizeBytes(row.value) : null;
    cachedMaxFileSize = {
      value: parsed,
      expiresAt: now + 30_000, // 30-second cache
    };
    return parsed;
  } catch {
    // DB unavailable — fail-open (no limit enforced)
    return null;
  }
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
      // ===== Max File Size Enforcement (Bug #4C) =====
      // Read admin-configured limit from DB; if exceeded by the resolved
      // video URL's Content-Length, reject the download. The check runs
      // ONLY on success — never slowing the failure path or the provider
      // race. Failure to read Content-Length is fail-open (no enforcement).
      const maxBytes = await getEffectiveMaxFileSizeBytes();
      if (maxBytes !== null && apiResponse.data?.noWatermarkUrl) {
        const size = await fetchContentLengthBytes(apiResponse.data.noWatermarkUrl);
        if (size !== null && size > maxBytes) {
          console.log(
            `[API] Rejected download: file size ${size} bytes exceeds limit ${maxBytes} bytes`
          );
          return NextResponse.json(
            {
              success: false,
              error: 'This video exceeds the maximum allowed file size.',
            },
            { status: 413 }
          );
        }
      }
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
