/**
 * /api/proxy — Download Proxy Endpoint
 *
 * Streams a remote file to the browser with Content-Disposition: attachment,
 * forcing the browser to download the file instead of playing it inline.
 *
 * This is necessary because the HTML `download` attribute on <a> tags is
 * ignored by browsers for cross-origin URLs. By proxying through our backend,
 * we control the Content-Disposition header and guarantee a download.
 *
 * Query params:
 *   - url:       The remote file URL to stream (required)
 *   - filename:  The filename for Content-Disposition (required)
 *
 * Security:
 *   - Only allows HTTPS URLs (no http, no file://, etc.)
 *   - Only allows known CDN/file host patterns to prevent SSRF
 *   - 30-second timeout on upstream fetch
 *   - Streams response body — no buffering in memory
 */

import { NextRequest, NextResponse } from 'next/server';

// Allowed host patterns for remote URLs (prevents SSRF to internal services)
const ALLOWED_HOST_PATTERNS = [
  '.tiktokcdn.com',
  '.tiktokv.com',
  '.muscdn.com',
  '.ibytedtos.com',
  '.byteimg.com',
  '.bytedance.com',
  '.tikhub.io',
  '.rapidapi.com',
  '.p16.bktgdn.win',
  '.p19.bktgdn.win',
  '.p77.bktgdn.win',
  '.p3.bktgdn.win',
  '.p9.bktgdn.win',
  '.p5.bktgdn.win',
  '.p6.bktgdn.win',
  '.p7.bktgdn.win',
  '.p8.bktgdn.win',
  '.ak.bktgdn.win',
  '.aweme.bktgdn.win',
  '.bytecdn.com',
  '.bytecdn.',
  'tiktokcdn',
  'tiktokv',
  'ibytedtos',
  'byteimg',
  'muscdn',
];

function isAllowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_HOST_PATTERNS.some(pattern => lower.includes(pattern));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const remoteUrl = searchParams.get('url');
  const filename = searchParams.get('filename');

  if (!remoteUrl || !filename) {
    return NextResponse.json(
      { error: 'Missing required query parameters: url, filename' },
      { status: 400 }
    );
  }

  // Validate URL scheme — only HTTPS allowed
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(remoteUrl);
  } catch {
    return NextResponse.json(
      { error: 'Invalid URL format' },
      { status: 400 }
    );
  }

  if (parsedUrl.protocol !== 'https:') {
    return NextResponse.json(
      { error: 'Only HTTPS URLs are allowed' },
      { status: 400 }
    );
  }

  // Validate host to prevent SSRF
  if (!isAllowedHost(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: 'Host not allowed' },
      { status: 403 }
    );
  }

  try {
    // Fetch the remote file with a timeout
    const upstreamResponse = await fetch(remoteUrl, {
      headers: {
        'User-Agent': 'TikDL/1.0',
        // No Referer — some CDNs reject requests with referer
      },
      signal: AbortSignal.timeout(30000),
      redirect: 'follow',
    });

    if (!upstreamResponse.ok) {
      console.error(`[proxy] Upstream error: ${upstreamResponse.status} for ${remoteUrl.slice(0, 100)}`);
      return NextResponse.json(
        { error: `Upstream server returned ${upstreamResponse.status}` },
        { status: 502 }
      );
    }

    // Determine content type from upstream or infer from filename
    const upstreamContentType = upstreamResponse.headers.get('content-type') || '';
    let contentType = upstreamContentType;

    if (!contentType || contentType === 'application/octet-stream') {
      // Infer from filename extension
      if (filename.endsWith('.mp4')) contentType = 'video/mp4';
      else if (filename.endsWith('.mp3')) contentType = 'audio/mpeg';
      else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) contentType = 'image/jpeg';
      else if (filename.endsWith('.png')) contentType = 'image/png';
      else if (filename.endsWith('.webp')) contentType = 'image/webp';
      else contentType = 'application/octet-stream';
    }

    // Stream the response body with Content-Disposition: attachment
    const sanitizedFilename = filename.replace(/[^\w.-]/g, '_');

    return new Response(upstreamResponse.body, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        'Content-Type': contentType,
        // Cache for 1 hour — these are immutable CDN assets
        'Cache-Control': 'public, max-age=3600, immutable',
        // Security: prevent this response from being embedded
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[proxy] Fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch remote file' },
      { status: 502 }
    );
  }
}
