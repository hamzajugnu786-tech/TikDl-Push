import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { KNOWN_PAGES, GLOBAL_PAGE_KEY, pageLabel, type PageMeta } from '@/lib/ad-registry';
import { requireAuth } from '@/lib/auth';

/**
 * Returns the complete list of pages that should appear as tabs in the
 * Advertisement Management Center.
 *
 * Page sources (union, deduplicated):
 *   1. KNOWN_PAGES — built-in pages with friendly labels
 *   2. AdPlacement.page values from the DB — ads assigned to a custom
 *      page key (e.g. "blog") make that key automatically tab-eligible
 *   3. Filesystem scan of src/app/<dir>/page.tsx — newly created content
 *      pages are auto-discovered at runtime
 *
 * Auth: admin-only. This exposes the existence of pages, which is not
 * sensitive, but the route is admin-only to avoid leaking internal
 * filesystem structure publicly.
 */
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    // 1. Built-in pages
    const pages: PageMeta[] = [...KNOWN_PAGES];

    // 2. Distinct page values from AdPlacement table
    const dbAds = await db.adPlacement.findMany({ select: { page: true } });
    const dbPageKeys = Array.from(new Set(dbAds.map(a => a.page).filter(Boolean))) as string[];
    for (const key of dbPageKeys) {
      if (key === GLOBAL_PAGE_KEY) continue;
      if (pages.some(p => p.key === key)) continue;
      pages.push({ key, label: pageLabel(key) });
    }

    // 3. Filesystem scan — find content pages under src/app/<dir>/page.tsx.
    // Skipped in production (Vercel) where source files may not exist.
    // In production, only KNOWN_PAGES + DB-distinct keys are returned.
    try {
      const fs = await import('fs');
      const path = await import('path');
      const appDir = path.join(process.cwd(), 'src', 'app');
      const entries = fs.readdirSync(appDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirName = entry.name;
        // Skip internal / non-page directories
        if (dirName.startsWith('_') || dirName === 'admin' || dirName === 'api') continue;
        // Skip if already known
        if (pages.some(p => p.key === dirName)) continue;
        // Confirm a page.tsx exists inside
        const pageFile = path.join(appDir, dirName, 'page.tsx');
        try {
          if (fs.existsSync(pageFile)) {
            pages.push({ key: dirName, label: pageLabel(dirName) });
          }
        } catch {
          // Skip if check failed
        }
      }
    } catch {
      // Filesystem scan not available (production Vercel) — that's fine,
      // KNOWN_PAGES + DB-distinct covers all practical cases.
    }

    // Always include the "all" (global) tab at the END so admins can
    // configure global default ads that render on every page.
    pages.push({ key: GLOBAL_PAGE_KEY, label: 'Global (All Pages)' });

    return NextResponse.json({ success: true, pages });
  } catch (error) {
    console.error('Failed to list pages:', error);
    // Safe fallback — return at least the known pages + global
    return NextResponse.json({
      success: true,
      pages: [...KNOWN_PAGES, { key: GLOBAL_PAGE_KEY, label: 'Global (All Pages)' }],
    });
  }
}
