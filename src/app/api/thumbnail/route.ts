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
 * SOURCE
 * ──────────────────────────────────────────────────────────────────────
 *
 * Uses TikTok's public oEmbed endpoint:
 *   GET https://www.tiktok.com/oembed?url=<tiktok_video_url>
 *
 *   - Public, no API key, no payment, no SDK.
 *   - Returns JSON: { thumbnail_url: "https://p16-sign-va.tiktokcdn.com/...", ... }
 *   - The returned thumbnail_url is hosted on TikTok CDN, which is already
 *     allowlisted in /api/proxy's SSRF protection.
 *
 * ──────────────────────────────────────────────────────────────────────
 * ABUSE PROTECTION
 * ──────────────────────────────────────────────────────────────────────
 *
 *   - Strict TikTok video URL validation (same patterns as /api/download).
 *     Invalid URLs are rejected before any upstream fetch.
 *   - 5-second upstream timeout via AbortSignal.timeout().
 *   - In-memory per-IP token-bucket (60 requests / minute). No DB writes.
 *     Does NOT consume download quota. Resets on server restart.
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
// UPSTREAM OEMBED FETCH
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

  // ── Upstream oEmbed fetch ──
  const thumbnail = await fetchTikTokThumbnailViaOEmbed(sanitizedUrl);
  if (!thumbnail) {
    return NextResponse.json({ success: false }, { status: 200 });
  }

  return NextResponse.json(
    { success: true, thumbnail },
    {
      status: 200,
      headers: {
        // oEmbed responses are immutable per video — cache at the CDN edge
        // for 1 hour to avoid re-fetching on history re-renders.
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}
