import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reconcileSchema } from '@/lib/migrate';

// Always run dynamically — settings must reflect DB state at request time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * /api/config/settings — Public site configuration endpoint
 *
 * Returns ONLY settings that are safe to expose to the browser:
 *   - siteName, siteUrl
 *   - metaTitle, metaDescription, ogImageUrl, robotsDirective
 *   - logoText
 *   - primaryColor, accentColor
 *   - maintenanceMode
 *   - maxFileSize
 *
 * NEVER returns:
 *   - ADMIN_PASSWORD or any auth secrets
 *   - API keys (TIKHUB_API_KEY, RAPIDAPI_KEY)
 *   - Provider configuration internals
 *   - IP hashes, request IDs, or any user data
 *
 * This endpoint is fetched by client-side components (SiteNavbar, SiteFooter,
 * homepage) so they can render using DB-backed runtime configuration
 * instead of hardcoded values. This makes admin Settings take effect on
 * the user-facing site on the next page load — no redeploy required.
 *
 * Cache: no-store — admin changes must propagate immediately.
 */

// Allowlist of settings keys that are safe to expose to the browser.
// Anything NOT in this list is filtered out.
const PUBLIC_SETTING_KEYS = new Set([
  'siteName',
  'siteUrl',
  'metaTitle',
  'metaDescription',
  'ogImageUrl',
  'robotsDirective',
  'logoText',
  'primaryColor',
  'accentColor',
  'maintenanceMode',
  'maxFileSize',
  'allowedFormats',
]);

export async function GET() {
  // Reconcile DB schema (idempotent — ensures Settings table exists)
  try {
    await reconcileSchema();
  } catch (error) {
    console.error('[Public Settings] Schema reconciliation failed:', error);
  }

  try {
    const settings = await db.settings.findMany();
    const publicSettings: Record<string, string> = {};

    for (const s of settings) {
      if (PUBLIC_SETTING_KEYS.has(s.key)) {
        publicSettings[s.key] = s.value;
      }
    }

    return NextResponse.json({
      success: true,
      settings: publicSettings,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch {
    // DB unavailable — return empty settings so frontend falls back to defaults
    return NextResponse.json({
      success: true,
      settings: {},
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  }
}
