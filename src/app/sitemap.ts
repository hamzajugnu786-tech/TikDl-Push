import { MetadataRoute } from 'next';
import { SITE_URL as SITE } from '@/lib/site-config';

// ============================================================================
// SITEMAP — Phase 3 Part 1
// ============================================================================
// Lists all public, indexable content routes. Excludes:
//   - /admin          (disallowed via robots.txt + auth-gated)
//   - /api/*          (disallowed via robots.txt)
//   - /tools          (internal auto-discovery scaffolding — noindex,nofollow
//                      via per-page metadata in src/app/tools/page.tsx)
//
// `lastModified` uses a fixed build-time Date so the route can be statically
// rendered (force-dynamic is unnecessary for the sitemap itself). Per-route
// changeFrequency/priority reflect real crawl intent:
//   - homepage          daily,   priority 1.0  (primary entry, frequently updated)
//   - about/contact     monthly, priority 0.7  (stable informational)
//   - privacy/terms/dmca yearly, priority 0.6  (legal pages, rarely changed)
//
// The canonical production domain is sourced from src/lib/site-config.ts
// (overridable via the NEXT_PUBLIC_SITE_URL env var). To change the domain:
//   1. Update DNS / Vercel domain config.
//   2. Set NEXT_PUBLIC_SITE_URL in Vercel Project Environment Variables.
//   3. Redeploy. No code change required.
// ============================================================================

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.6,
    },
    {
      url: `${SITE}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.6,
    },
    {
      url: `${SITE}/dmca`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.6,
    },
  ];
}
