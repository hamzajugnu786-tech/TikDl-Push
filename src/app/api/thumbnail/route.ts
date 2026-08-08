/**
 * /api/thumbnail — Asynchronous TikTok Thumbnail Enrichment (NON-BLOCKING)
 *
 * ──────────────────────────────────────────────────────────────────────
 * ARCHITECTURE CONTRACT — DO NOT VIOLATE
 * ──────────────────────────────────────────────────────────────────────
 *
 * This endpoint is an OPTIONAL PRESENTATION ENRICHMENT for the success card.
 *
 *   - It is called ONLY by the frontend, ONLY after /api/download has
 *     already returned a successful video result with an EMPTY thumbnail.
 *   - It NEVER runs in the critical video-fetch path.
 *   - It NEVER blocks /api/download.
 *   - It NEVER touches init.ts / download.ts / engine-bridge.ts / tiktokApiDl.ts.
 *   - It NEVER consumes the user's download rate-limit quota.
 *   - It NEVER leaks internal errors to the client.
 *   - Failure is ALWAYS silent (placeholder remains on the UI).
 *
 * ──────────────────────────────────────────────────────────────────────
 * SOURCES (tried in parallel, animated preferred)
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. V1 dynamicCover (PREFERRED — animated WebP)
 *    Uses the same @tobyg74/tiktok-api-dl Downloader(version:"v1") that the
 *    main fetch already races. V1 returns video.dynamicCover = an animated
 *    WebP URL on TikTok CDN. When V2/V3 win the main race (the common case),
 *    V1's dynamicCover is discarded — this route re-fetches it so the
 *    success card can show a MOVING preview, matching the visual behaviour
 *    users had when V1 used to win the race.
 *
 *    V1 is FREE (no API key, no payment) and lightweight (single HTTP call).
 *    It is NOT an "expensive" provider (TikHub/RapidAPI/ytdlp/browser-automation
 *    are expensive). Calling it here does not duplicate expensive work.
 *
 * 2. TikTok oEmbed (FALLBACK — static JPEG)
 *    GET https://www.tiktok.com/oembed?url=<tiktok_video_url>
 *    Returns { thumbnail_url: "https://p16-sign-va.tiktokcdn.com/...", ... }
 *    Static only — used when V1 fails or doesn't return dynamicCover.
 *
 * Both URLs are hosted on TikTok CDN, already allowlisted in /api/proxy's
 * SSRF protection.
 *
 * ──────────────────────────────────────────────────────────────────────
 * ABUSE PROTECTION
 * ──────────────────────────────────────────────────────────────────────
 *
 *   - Strict TikTok video URL validation (same patterns as /api/download).
 *     Invalid URLs are rejected before any upstream fetch.
 *   - 5-second timeout per upstream source.
 *   - In-memory per-IP token-bucket (60 requests / minute). No DB writes.
 *     Does NOT consume download quota. Resets on server restart.
 *   - In-memory URL→thumbnail cache (5-minute TTL) so repeat views from
 *     Recent Downloads don't re-fetch.
 *
 * ──────────────────────────────────────────────────────────────────────
 * RESPONSE CONTRACT
 * ──────────────────────────────────────────────────────────────────────
 *
 *   Success: { success: true,  thumbnail: "<tiktok_cdn_url>" }
 *   Failure: { success: false }   (always HTTP 200 — never leaks error reason)
 *
 * The frontend treats both responses as terminal. On failure it leaves the
 * existing Play-icon placeholder in place.
 *
 * The returned thumbnail URL may be either an animated WebP (when V1
 * returned dynamicCover) or a static JPEG (oEmbed fallback). The frontend
 * <img> element renders animated WebP as animated automatically — no
 * client-side changes are needed for the moving-preview behaviour.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIpForRateLimit } from '@/lib/privacy';

// ============================================================================
// TIKTOK VIDEO URL VALIDATION  (mirrors /api/download — kept local to avoid
// touching the frozen download route)
// ============================================================================

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
// IN-MEMORY PER-IP TOKEN BUCKET (60 req/min, no DB, no quota sharing)
// ============================================================================

interface Bucket {
  tokens: number;
  refillAt: number;
}

const THUMBNAIL_RATE_LIMIT_MAX = 60;            // tokens per window
const THUMBNAIL_RATE_LIMIT_WINDOW_MS = 60_000;  // 1 minute
const thumbnailBuckets = new Map<string, Bucket>();

// Periodic cleanup — purge stale buckets every 5 minutes so the map cannot
// grow unboundedly across long-running server processes.
let lastBucketCleanup = Date.now();
function cleanupStaleBucketsIfDue(): void {
  const now = Date.now();
  if (now - lastBucketCleanup < 5 * 60_000) return;
  lastBucketCleanup = now;
  for (const [k, b] of thumbnailBuckets) {
    if (b.tokens >= THUMBNAIL_RATE_LIMIT_MAX && now > b.refillAt) {
      thumbnailBuckets.delete(k);
    }
  }
}

function thumbnailRateLimitAllows(ipKey: string): boolean {
  cleanupStaleBucketsIfDue();
  const now = Date.now();
  const existing = thumbnailBuckets.get(ipKey);
  if (!existing || now > existing.refillAt) {
    thumbnailBuckets.set(ipKey, {
      tokens: THUMBNAIL_RATE_LIMIT_MAX - 1,
      refillAt: now + THUMBNAIL_RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }
  if (existing.tokens <= 0) {
    return false;
  }
  existing.tokens -= 1;
  return true;
}

// ============================================================================
// IN-MEMORY URL → THUMBNAIL CACHE (5-minute TTL)
// Avoids re-calling V1/oEmbed when the user re-views a video from history.
// ============================================================================

interface CachedThumbnail {
  thumbnail: string;
  expiresAt: number;
}

const THUMBNAIL_CACHE_TTL_MS = 5 * 60_000;  // 5 minutes
const thumbnailCache = new Map<string, CachedThumbnail>();

let lastCacheCleanup = Date.now();
function cleanupStaleCacheIfDue(): void {
  const now = Date.now();
  if (now - lastCacheCleanup < 5 * 60_000) return;
  lastCacheCleanup = now;
  for (const [k, v] of thumbnailCache) {
    if (now > v.expiresAt) {
      thumbnailCache.delete(k);
    }
  }
}

function getCachedThumbnail(url: string): string | null {
  cleanupStaleCacheIfDue();
  const entry = thumbnailCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    thumbnailCache.delete(url);
    return null;
  }
  return entry.thumbnail;
}

function setCachedThumbnail(url: string, thumbnail: string): void {
  thumbnailCache.set(url, { thumbnail, expiresAt: Date.now() + THUMBNAIL_CACHE_TTL_MS });
}

// ============================================================================
// V1 dynamicCover FETCH (PREFERRED — animated WebP)
// ============================================================================

const V1_TIMEOUT_MS = 5000;

/**
 * V1 raw response shape (only the fields we read).
 * V1 returns video.dynamicCover as a string[] (url_list).
 */
interface V1ResultShape {
  status?: string;
  result?: {
    type?: string;
    video?: {
      cover?: string[];
      originCover?: string[];
      dynamicCover?: string[];
      playAddr?: string[];
      downloadAddr?: string[];
    };
  };
}

function firstString(arr: string | string[] | undefined | null): string {
  if (!arr) return '';
  if (typeof arr === 'string') return arr;
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (typeof item === 'string' && item.length > 0) return item;
    }
  }
  return '';
}

/**
 * Fetch V1's dynamicCover URL via @tobyg74/tiktok-api-dl.
 *
 * This is the SAME V1 call that the main fetch races in parallel — but here
 * it runs in a SEPARATE route, AFTER the success card has already rendered.
 * V1 is FREE (no API key) and lightweight (single HTTP call). When V2/V3
 * won the main race, V1's dynamicCover was discarded — this route re-fetches
 * it so the success card can show the animated WebP preview.
 *
 * Returns the dynamicCover URL (animated WebP) or null on any failure.
 */
async function fetchV1DynamicCover(tiktokUrl: string): Promise<string | null> {
  let tiktokPkg: any;
  try {
    // Dynamic import — same pattern as tiktokApiDl.ts to avoid loading
    // JSDOM-heavy modules at startup. Node.js caches the module after the
    // first import, so subsequent calls are instant.
    tiktokPkg = await import('@tobyg74/tiktok-api-dl');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[thumbnail] V1 package import failed: ${msg.slice(0, 200)}`);
    return null;
  }

  const Downloader = tiktokPkg?.default?.Downloader || tiktokPkg?.Downloader;
  if (typeof Downloader !== 'function') {
    console.warn('[thumbnail] V1 Downloader not available in package');
    return null;
  }

  let result: V1ResultShape;
  try {
    result = await Promise.race([
      Downloader(tiktokUrl, { version: 'v1' }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`V1 timed out after ${V1_TIMEOUT_MS}ms`)), V1_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // V1 failures are common (URL not accepted, rate limit, geo-block). Silent.
    console.warn(`[thumbnail] V1 fetch failed for ${tiktokUrl.slice(0, 80)}: ${msg.slice(0, 200)}`);
    return null;
  }

  if (!result || result.status !== 'success' || !result.result) {
    return null;
  }

  // PREFER dynamicCover (animated WebP) — this is what makes the preview "move".
  // Fall back to originCover / cover (static) if dynamicCover is missing.
  const dynamicCover = firstString(result.result.video?.dynamicCover);
  if (dynamicCover && /^https:\/\//i.test(dynamicCover)) {
    return dynamicCover;
  }

  // V1 succeeded but had no dynamicCover — return null so caller falls back to oEmbed.
  return null;
}

// ============================================================================
// TIKTOK OEMBED FETCH (FALLBACK — static JPEG)
// ============================================================================

const OEMBED_TIMEOUT_MS = 5000;
const OEMBED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface OEmbedResponse {
  thumbnail_url?: string;
  // Other fields exist (title, author_name, html, ...) but we only need thumbnail_url.
}

async function fetchTikTokThumbnailViaOEmbed(tiktokUrl: string): Promise<string | null> {
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(tiktokUrl)}`;

  let response: Response;
  try {
    response = await fetch(oembedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': OEMBED_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch (err) {
    // Network error, timeout, DNS failure, etc. — silent failure.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[thumbnail] oEmbed fetch failed for ${tiktokUrl.slice(0, 80)}: ${msg.slice(0, 200)}`);
    return null;
  }

  if (!response.ok) {
    // 403/404/5xx from oEmbed means the video is private/deleted/region-blocked.
    // Don't log this at error level — it's expected for unavailable videos.
    return null;
  }

  let json: OEmbedResponse;
  try {
    json = (await response.json()) as OEmbedResponse;
  } catch {
    console.warn(`[thumbnail] oEmbed returned non-JSON for ${tiktokUrl.slice(0, 80)}`);
    return null;
  }

  const thumb = typeof json.thumbnail_url === 'string' ? json.thumbnail_url.trim() : '';
  if (!thumb || !/^https:\/\//i.test(thumb)) {
    return null;
  }

  return thumb;
}

// ============================================================================
// COMBINED FETCH — V1 (animated) ∥ oEmbed (static), prefer V1
// ============================================================================
//
// Both sources are fired simultaneously. Whichever returns a useful result
// first wins; we prefer V1's dynamicCover (animated) over oEmbed's static
// thumbnail. The overall wait is bounded by max(V1, oEmbed) ≤ 5s.
//
// Implementation note: we resolve as soon as we have a PREFERRED (V1) result
// OR once both sources have settled (taking whichever is available).

interface CombinedResult {
  thumbnail: string | null;
  animated: boolean;
}

async function fetchThumbnailCombined(tiktokUrl: string): Promise<CombinedResult> {
  let v1Resolved = false;
  let v1Result: string | null = null;
  let oembedResolved = false;
  let oembedResult: string | null = null;

  const v1Promise = fetchV1DynamicCover(tiktokUrl)
    .then((url) => { v1Result = url; v1Resolved = true; return url; })
    .catch(() => { v1Resolved = true; return null; });

  const oembedPromise = fetchTikTokThumbnailViaOEmbed(tiktokUrl)
    .then((url) => { oembedResult = url; oembedResolved = true; return url; })
    .catch(() => { oembedResolved = true; return null; });

  // Poll every 50ms until we have a V1 result (preferred) or both have settled.
  // Cap at 6 seconds total (slightly above the 5s upstream timeouts to allow
  // for network jitter).
  const POLL_INTERVAL_MS = 50;
  const MAX_WAIT_MS = 6000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    // Preferred: V1 returned an animated dynamicCover → return immediately.
    if (v1Resolved && v1Result) {
      return { thumbnail: v1Result, animated: true };
    }
    // If V1 has settled (success or failure) with no dynamicCover, AND oEmbed
    // has a result, return oEmbed immediately — no point waiting further.
    if (v1Resolved && !v1Result && oembedResolved && oembedResult) {
      return { thumbnail: oembedResult, animated: false };
    }
    // If both have settled, return whichever has a result.
    if (v1Resolved && oembedResolved) {
      if (v1Result) return { thumbnail: v1Result, animated: true };
      if (oembedResult) return { thumbnail: oembedResult, animated: false };
      return { thumbnail: null, animated: false };
    }
    // Wait a short tick before re-checking.
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Timeout reached — return whatever we have.
  // If V1 returned late (race condition), prefer it; otherwise oEmbed.
  if (v1Result) return { thumbnail: v1Result, animated: true };
  if (oembedResult) return { thumbnail: oembedResult, animated: false };
  // Last-ditch: wait for both promises to settle (they should be near-done).
  try { await Promise.allSettled([v1Promise, oembedPromise]); } catch { /* ignore */ }
  if (v1Result) return { thumbnail: v1Result, animated: true };
  if (oembedResult) return { thumbnail: oembedResult, animated: false };
  return { thumbnail: null, animated: false };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  // ── Parse body ──
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }

  const url = (body as { url?: unknown })?.url;
  if (typeof url !== 'string' || url.length === 0) {
    return NextResponse.json({ success: false }, { status: 200 });
  }

  // Sanitize (same cap as /api/download)
  const sanitizedUrl = url.trim().slice(0, 500);

  // Strict TikTok video URL validation — invalid URLs are silently rejected.
  // This prevents abuse (arbitrary URL fetching) and matches /api/download behavior.
  if (!isValidTikTokVideoUrl(sanitizedUrl)) {
    return NextResponse.json({ success: false }, { status: 200 });
  }

  // ── Per-IP rate limit (in-memory, does NOT consume download quota) ──
  const ip = getClientIp(request);
  const ipKey = hashIpForRateLimit(ip);
  if (!thumbnailRateLimitAllows(ipKey)) {
    return NextResponse.json({ success: false }, { status: 200 });
  }

  // ── Cache lookup — repeat views from Recent Downloads hit the cache ──
  const cached = getCachedThumbnail(sanitizedUrl);
  if (cached) {
    return NextResponse.json(
      { success: true, thumbnail: cached },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'X-Thumbnail-Cache': 'HIT',
        },
      }
    );
  }

  // ── Combined fetch: V1 (animated) ∥ oEmbed (static), prefer V1 ──
  const combined = await fetchThumbnailCombined(sanitizedUrl);
  if (!combined.thumbnail) {
    return NextResponse.json({ success: false }, { status: 200 });
  }

  // Cache for 5 minutes so repeat views (history) don't re-fetch.
  setCachedThumbnail(sanitizedUrl, combined.thumbnail);

  return NextResponse.json(
    { success: true, thumbnail: combined.thumbnail },
    {
      status: 200,
      headers: {
        // Cache at the CDN edge for 1 hour — these are immutable CDN assets.
        'Cache-Control': 'public, max-age=3600',
        'X-Thumbnail-Cache': 'MISS',
      },
    }
  );
}
