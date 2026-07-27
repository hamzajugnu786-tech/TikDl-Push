/**
 * Admin Logout API Route — Production Security & Infrastructure
 *
 * POST /api/admin/auth/logout
 *
 * Clears the HttpOnly admin session cookie.
 * Requires authentication to perform logout.
 */

import { NextResponse } from 'next/server';
import { clearAdminSession, requireAuth } from '@/lib/auth';

export async function POST() {
  // Verify authentication before allowing logout
  const authError = await requireAuth();
  if (authError) return authError;

  await clearAdminSession();

  return NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });
}
