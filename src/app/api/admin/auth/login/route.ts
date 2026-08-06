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
 * - Rate-limited: max 10 FAILED login attempts per 10 minutes per IP
 *   - Successful login RESETS the failed-attempt counter
 *   - Only failed attempts count toward the limit
 *   - DB-backed, persists across restarts
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword, setAdminSession } from '@/lib/auth';
import { getLoginRateLimiter } from '@/lib/rate-limiter';
import { getClientIp, hashIpForRateLimit } from '@/lib/privacy';

export async function POST(request: NextRequest) {
  try {
    // Diagnostic: Check if ADMIN_PASSWORD is configured
    const adminPasswordConfigured = !!process.env.ADMIN_PASSWORD;
    console.log('[Auth/Login] ADMIN_PASSWORD configured:', adminPasswordConfigured, 'NODE_ENV:', process.env.NODE_ENV);

    // Parse request body FIRST (before rate limit check)
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

    // Rate limit check — only check if already blocked (do NOT increment here)
    // We only count FAILED attempts, so we use isLimited() to check
    // and increment() only after a failed password verification.
    const ip = getClientIp(request);
    const rateLimitKey = hashIpForRateLimit(ip);
    const rateLimiter = getLoginRateLimiter();
    const isBlocked = await rateLimiter.isLimited(rateLimitKey);

    // Diagnostic: Log rate limit status
    const rlStatus = rateLimiter.getStatus(rateLimitKey);
    console.log('[Auth/Login] Rate limit:', !isBlocked ? 'allowed' : 'BLOCKED', 'remaining:', rlStatus?.remaining, 'Banned for:', rlStatus ? Math.max(0, Math.round((rlStatus.resetTime - Date.now()) / 1000)) + 's' : 'n/a');

    if (isBlocked) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Verify password on the server — never exposed to client
    const isValid = verifyAdminPassword(password);

    if (!isValid) {
      // ──── FAILED LOGIN — increment the failed-attempt counter ────
      await rateLimiter.increment(rateLimitKey);

      // If ADMIN_PASSWORD is not configured in production, all logins will fail.
      // Include a hint so the admin knows to check their environment configuration.
      const adminPassword = process.env.ADMIN_PASSWORD;
      const isProduction = process.env.NODE_ENV === 'production';
      const hint = (!adminPassword && isProduction)
        ? 'Server configuration issue: ADMIN_PASSWORD not set. Contact the administrator.'
        : 'Invalid password. Please try again.';

      return NextResponse.json(
        { success: false, error: hint },
        { status: 401 }
      );
    }

    // ──── SUCCESSFUL LOGIN — reset the failed-attempt counter ────
    // This ensures that a user who eventually enters the correct password
    // is not penalized for earlier typos within the same window.
    await rateLimiter.reset(rateLimitKey);

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
