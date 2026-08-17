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
    // ===== Stage 3 SEO — new feature & informational landing pages =====
    // All five pages are user-purpose-driven (no doorway pages) and were
    // added in Stage 3 of the SEO growth plan. Change-frequency reflects
    // how often the editorial content is expected to change: feature
    // pages get monthly review; the how-to and legal pages get yearly
    // review unless real GSC data demands a refresh.
    {
      url: `${SITE}/tiktok-no-watermark`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE}/tiktok-mp3-downloader`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE}/how-to-download-tiktok-videos`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE}/tiktok-photo-downloader`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE}/is-it-legal-to-download-tiktok-videos`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.7,
    },
    // ===== Existing content pages =====
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
