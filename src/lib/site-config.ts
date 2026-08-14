/**
 * ====================================================================
 * CANONICAL PRODUCTION SITE URL — SINGLE SOURCE OF TRUTH
 * ====================================================================
 *
 * This is the ONE place in the codebase where the production site URL
 * is defined. Every SEO/canonical reference — sitemap.ts, layout.tsx
 * metadataBase/alternates/openGraph, page-level canonical URLs, the
 * WebApplication JSON-LD block on the homepage, robots.txt sitemap
 * pointer (via build-time env substitution), and the admin Settings
 * default fallback — imports SITE_URL from here.
 *
 * --------------------------------------------------------------------
 * HOW TO CHANGE THE DOMAIN IN THE FUTURE
 * --------------------------------------------------------------------
 * 1. Configure the new domain in Vercel (Project Settings → Domains)
 *    and point DNS at Vercel.
 * 2. In Vercel Project Settings → Environment Variables, set:
 *
 *        NEXT_PUBLIC_SITE_URL=https://your-new-domain.com
 *
 * 3. Trigger a redeploy (push to main, or click "Redeploy").
 * 4. Update Google Search Console property to the new domain.
 *
 * No code change is required for a domain swap. The fallback below
 * is only used when the env var is not set (e.g. local dev, fresh
 * clone without .env, or a Vercel project that hasn't been configured).
 *
 * --------------------------------------------------------------------
 * SECURITY
 * --------------------------------------------------------------------
 * This value is PUBLIC by design — it is embedded in SEO metadata,
 * JSON-LD structured data, sitemap.xml, and OpenGraph tags that
 * crawlers and browsers MUST see. NEVER put secrets in NEXT_PUBLIC_*
 * environment variables, and never extend this module to read
 * sensitive configuration.
 * --------------------------------------------------------------------
 */

const RAW_SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://tikdl.leadforgeai.site'
);

// Strip a single trailing slash so downstream `${SITE_URL}/path`
// composition always produces a clean URL without `//`.
export const SITE_URL: string = RAW_SITE_URL.replace(/\/+$/, '');

// Origin without trailing slash — useful when only the host is needed
// (e.g. for cookie domain attribute, CORS origin allowlist comparisons).
export const SITE_ORIGIN: string = new URL(SITE_URL).origin;
