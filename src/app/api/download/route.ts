import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/app/providers';

// Rate limiting (simple in-memory store)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 20; // 20 requests per hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now > entry.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up expired entries periodically
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of requestCounts.entries()) {
      if (now > entry.resetTime) {
        requestCounts.delete(ip);
      }
    }
  }, RATE_LIMIT_WINDOW);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate TikTok URL format
    const sanitizedUrl = url.trim().slice(0, 500);
    const tiktokRegex = /^https?:\/\/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/.+/i;
    if (!tiktokRegex.test(sanitizedUrl)) {
      return NextResponse.json(
        { success: false, error: 'Invalid TikTok URL format. Please use a valid TikTok link.' },
        { status: 400 }
      );
    }

    console.log(`[API] Download request for: ${sanitizedUrl} from IP: ${ip}`);

    const provider = getProvider();

    // Retry logic with exponential backoff (up to 3 attempts)
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const metadata = await provider.fetchVideo(sanitizedUrl);

        const duration = Date.now() - startTime;
        console.log(`[API] Success in ${duration}ms using ${provider.name}`);

        return NextResponse.json({
          success: true,
          data: metadata,
          provider: provider.name,
          duration,
        });
      } catch (err) {
        lastError = err as Error;
        console.error(`[API] Attempt ${attempt}/${3} failed:`, err);

        // Don't retry on client-type errors (private/deleted videos)
        if (lastError.message === 'PRIVATE_VIDEO' || lastError.message === 'DELETED_VIDEO') {
          return NextResponse.json(
            { success: false, error: 'This video is private or has been deleted.' },
            { status: 404 }
          );
        }

        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 800 * attempt)); // Exponential backoff
        }
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: lastError?.message || 'All attempts failed. Please try again later.',
      },
      { status: 500 }
    );
  } catch (error) {
    console.error('[API] Unhandled error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
