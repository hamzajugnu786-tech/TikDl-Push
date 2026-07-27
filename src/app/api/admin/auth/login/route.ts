/**
 * Admin Login API Route — Production Security & Infrastructure
 *
 * POST /api/admin/auth/login
 *
 * Replaces the insecure client-side password comparison.
 * The admin password is verified ONLY on the server.
 * On success, an HttpOnly cookie is set — the password is NEVER
 * exposed to browser JavaScript.
 *
 * Request body: { password: string }
 * Response: { success: boolean, message?: string }
 *
 * Security:
 * - Password never reaches client JavaScript
 * - HttpOnly cookie prevents XSS access
 * - SameSite=Strict prevents CSRF
 * - Timing-safe password comparison prevents timing attacks
 * - Rate-limited: max 5 login attempts per minute per IP (DB-backed, persists across restarts)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword, setAdminSession } from '@/lib/auth';
import { getLoginRateLimiter } from '@/lib/rate-limiter';
import { getClientIp, hashIpForRateLimit } from '@/lib/privacy';

export async function POST(request: NextRequest) {
  try {
    // Rate limit check — production-grade (DB-backed)
    // Use spoofing-resistant IP extraction (takes last IP in XFF chain)
    // ⚠️  Hash IP before rate limit key — raw IPs are NEVER stored anywhere (GDPR)
    const ip = getClientIp(request);
    const rateLimitKey = hashIpForRateLimit(ip);
    const rateLimiter = getLoginRateLimiter();
    const allowed = await rateLimiter.check(rateLimitKey);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
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
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }

    // Verify password on the server — never exposed to client
    const isValid = verifyAdminPassword(password);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid password. Please try again.' },
        { status: 401 }
      );
    }

    // Set HttpOnly session cookie
    await setAdminSession();

    return NextResponse.json({
      success: true,
      message: 'Admin access granted',
    });
  } catch (error) {
    console.error('[Auth/Login] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during authentication' },
      { status: 500 }
    );
  }
}
