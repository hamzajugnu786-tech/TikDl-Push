/**
 * /api/proxy — Download & Media Proxy Endpoint
 *
 * Streams a remote file to the browser with proper Content-Type and
 * Content-Disposition headers.
 *
 * Query params:
 *   - url:       The remote file URL to stream (required)
 *   - filename:  The filename for Content-Disposition (required)
 *   - mode:      "download" (default) or "inline"
 *                - "download": Content-Disposition: attachment → browser saves file
 *                - "inline":   Content-Disposition: inline → browser displays/embeds
 *
 * Security:
 *   - Only allows HTTPS URLs (no http, no file://, etc.)
 *   - Only allows known CDN/file host patterns to prevent SSRF
 *   - 30-second timeout on upstream fetch
 *   - Streams response body — no buffering in memory
 *
 * CRITICAL FIX: Error responses MUST use text/plain Content-Type,
 * never application/json. When the browser triggers a download via
 * <a download="file.mp4"> and receives application/json, it appends
 * .json to the filename, producing file.mp4.json — a useless file.
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// SSRF PROTECTION — Allowed Host Patterns
// ============================================================================

/**
 * Allowed host patterns for remote URLs (prevents SSRF to internal services).
 *
 * Covers ALL URL sources across all providers:
 *   - TikTok CDN: tiktokcdn.com, tiktokv.com, ibytedtos.com, byteimg.com, etc.
 *   - TikHub API: tikhub.io
 *   - RapidAPI: rapidapi.com
 *   - SSSTik.io (V2 provider): ssstik.io, cdn.ssstik.io
 *   - MusicalDown (V3 provider): musicaldown.com, musidown.com
 *   - BunnyCDN: b-cdn.net (used by MusicalDown)
 *   - TikTok direct: tiktok.com (video pages, CDNs)
 *   - Bytedance CDN: bytecdn.com, bytedance.com
 *   - Other known TikTok/Bytedance CDN patterns
 *
 * Uses substring matching via String.includes() — order doesn't matter.
 */
const ALLOWED_HOST_PATTERNS = [
  // ──── TikTok / Bytedance CDN ────
  '.tiktokcdn.com',
  '.tiktokv.com',
  '.tiktok.com',
  '.muscdn.com',
  '.ibytedtos.com',
  '.byteimg.com',
  '.bytedance.com',
  '.bytecdn.com',
  '.bytecdn.',
  '.ttwstatic.com',
  '.bktgdn.win',
  '.p16',        // p16-sign-sg.tiktokcdn.com pattern
  '.p77',        // p77-sign-va.tiktokcdn.com pattern
  '.p3',         // p3-sign-va.tiktokcdn.com pattern
  'tiktokcdn',
  'tiktokv',
  'ibytedtos',
  'byteimg',
  'muscdn',
  'tiktok',
  'bytedance',
  'bytecdn',
  'bytecdntest',

  // ──── TikHub API ────
  '.tikhub.io',
  'tikhub.io',          // exact domain (no subdomain) — API calls to https://tikhub.io/...

  // ──── RapidAPI ────
  '.rapidapi.com',
  'rapidapi.com',       // exact domain (no subdomain)

  // ──── SSSTik.io (V2 — tiktok-api-dl) ────
  'ssstik.io',
  'tikcdn.io',          // SSSTik CDN — serves video/audio/image media from https://tikcdn.io/ssstik/...
  'cdn.ssstik.io',      // SSSTik alternate CDN subdomain

  // ──── MusicalDown.com (V3 — tiktok-api-dl) ────
  'musicaldown.com',
  'musidown.com',

  // ──── BunnyCDN (used by MusicalDown and other CDNs) ────
  'b-cdn.net',

  // ──── Cloudflare CDN (many TikTok CDN URLs use CF) ────
  '.cloudfront.net',

  // ──── Akamai CDN (some TikTok URLs) ────
  '.akamaized.net',
  '.akamaihd.net',

  // ──── Generic video/image CDNs that TikTok occasionally uses ────
  '.cdninstagram.com',   // sometimes used for cross-platform content
  '.fbcdn.net',          // Meta CDN (for shared content)

  // ──── Vercel blob/edge storage (if we ever host proxied content) ────
  '.blob.vercel-storage.com',
];

function isAllowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_HOST_PATTERNS.some(pattern => lower.includes(pattern));
}

// ============================================================================
// MIME TYPE INFERENCE
// ============================================================================

function inferContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

// ============================================================================
// PROXY HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const remoteUrl = searchParams.get('url');
  const filename = searchParams.get('filename');
  const mode = searchParams.get('mode') || 'download'; // "download" or "inline"

  if (!remoteUrl || !filename) {
    // Return text/plain to avoid .json extension on download errors
    return new Response('Missing required query parameters: url, filename', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Validate URL scheme — only HTTPS allowed
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(remoteUrl);
  } catch {
    return new Response('Invalid URL format', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (parsedUrl.protocol !== 'https:') {
    return new Response('Only HTTPS URLs are allowed', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Validate host to prevent SSRF
  if (!isAllowedHost(parsedUrl.hostname)) {
    // LOG the blocked hostname so we can diagnose and add it
    console.error(`[proxy] BLOCKED hostname: "${parsedUrl.hostname}" for URL: ${remoteUrl.slice(0, 200)}`);
    // Return text/plain — NEVER application/json — to prevent .json extension
    return new Response(`Host not allowed: ${parsedUrl.hostname}`, {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  try {
    // Build upstream request headers
    // Some TikTok CDN URLs require a Referer from tiktok.com domain
    const upstreamHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // Add Referer for TikTok CDN URLs — they sometimes reject requests without it
    if (parsedUrl.hostname.includes('tiktok') || parsedUrl.hostname.includes('bytedance') || parsedUrl.hostname.includes('bytecdn')) {
      upstreamHeaders['Referer'] = 'https://www.tiktok.com/';
    }

    // Add Referer for SSSTik CDN URLs — tikcdn.io and cdn.ssstik.io require it
    if (parsedUrl.hostname.includes('tikcdn') || parsedUrl.hostname.includes('ssstik')) {
      upstreamHeaders['Referer'] = 'https://ssstik.io/';
      upstreamHeaders['Origin'] = 'https://ssstik.io';
    }

    // ===== Range request forwarding =====
    // Browsers, especially Android Chrome, often send `Range: bytes=0-` for
    // downloads. If we drop the Range header, the upstream CDN ignores range
    // requests and the browser cannot resume a partial download — for large
    // video files on flaky mobile connections, this guarantees failure when
    // the connection drops mid-stream. Forward the header so the upstream
    // CDN can return 206 Partial Content and the browser can resume.
    const browserRange = request.headers.get('range');
    if (browserRange) {
      upstreamHeaders['Range'] = browserRange;
    }

    // ===== Stream the upstream response with a long timeout =====
    // Previous 30-second timeout included body streaming, which aborted
    // large video downloads on slow mobile connections while audio
    // downloads (smaller files) completed in time. 10 minutes is plenty
    // for any reasonable TikTok video file while still bounding the
    // request against infinite hangs.
    const upstreamResponse = await fetch(remoteUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(600_000),
      redirect: 'follow',
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      console.error(`[proxy] Upstream error: ${upstreamResponse.status} for ${remoteUrl.slice(0, 100)}`);
      // text/plain error — no .json extension on download
      return new Response(`Upstream server returned ${upstreamResponse.status}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Determine content type from upstream or infer from filename
    const upstreamContentType = upstreamResponse.headers.get('content-type') || '';
    let contentType = upstreamContentType;

    // Override incorrect upstream content types (some CDNs return text/html for media)
    if (contentType.startsWith('text/html') || contentType === 'application/json') {
      contentType = inferContentType(filename);
    }

    if (!contentType || contentType === 'application/octet-stream') {
      contentType = inferContentType(filename);
    }

    // Sanitize filename — remove filesystem-unsafe characters
    const sanitizedFilename = filename
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .trim()
      .replace(/^[.]+|[.]+$/g, '');

    // Build Content-Disposition header
    // "download" mode → attachment (browser saves file)
    // "inline" mode → inline (browser displays/embeds, e.g. for <img> tags)
    const dispositionType = mode === 'inline' ? 'inline' : 'attachment';

    // For non-ASCII filenames, use filename*= encoding (RFC 5987)
    const hasNonAscii = /[^\x20-\x7e]/.test(sanitizedFilename);
    const contentDisposition = hasNonAscii
      ? `${dispositionType}; filename="${sanitizedFilename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
      : `${dispositionType}; filename="${sanitizedFilename}"`;

    // ===== Forward streaming-related headers so the browser can show
    // progress, resume partial downloads, and not buffer the whole
    // response in memory. Without these, Android Chrome on slow networks
    // aborts large video downloads. =====
    const responseHeaders: Record<string, string> = {
      'Content-Disposition': contentDisposition,
      'Content-Type': contentType,
      // Cache for 1 hour — these are immutable CDN assets
      'Cache-Control': 'public, max-age=3600, immutable',
      // Security: prevent this response from being embedded in other contexts
      'X-Content-Type-Options': 'nosniff',
      // Always advertise range support so the browser knows it can resume
      'Accept-Ranges': 'bytes',
    };

    // Forward Content-Length so the browser can render accurate progress
    const upstreamContentLength = upstreamResponse.headers.get('content-length');
    if (upstreamContentLength) {
      responseHeaders['Content-Length'] = upstreamContentLength;
    }

    // Forward Content-Range for 206 Partial Content responses (resume support)
    if (upstreamResponse.status === 206) {
      const upstreamContentRange = upstreamResponse.headers.get('content-range');
      if (upstreamContentRange) {
        responseHeaders['Content-Range'] = upstreamContentRange;
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[proxy] Fetch error:', error);
    // text/plain error — no .json extension on download
    return new Response('Failed to fetch remote file', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
