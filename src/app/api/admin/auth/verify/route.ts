/**
 * Admin Auth Verification API Route — Production Security & Infrastructure
 *
 * GET /api/admin/auth/verify
 *
 * Checks if the current HttpOnly cookie represents a valid admin session.
 * Used by the admin page to determine if the user is already authenticated
 * without relying on client-side sessionStorage.
 *
 * Response: { success: boolean, authenticated: boolean }
 */

import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  const authenticated = await isAuthenticated();

  return NextResponse.json({
    success: true,
    authenticated,
  });
}
