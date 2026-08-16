import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/site-config";
import { GA4Scripts } from "@/components/analytics/GA4Scripts";
import GA4RouteTracker from "@/components/analytics/GA4RouteTracker";
import "./globals.css";

// Force dynamic rendering so admin-saved settings (siteName, metaTitle,
// maintenanceMode, primaryColor, etc.) are read fresh from the DB on every
// request. Without this, Next.js may statically render the layout at build
// time and admin changes wouldn't propagate to the user-facing site until a
// redeploy — which is exactly the symptom reported in Bug #4D.
export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ============================================================================
// DYNAMIC METADATA FROM DB SETTINGS
// ============================================================================

// Default values — used when DB is unavailable or settings don't exist.
// `siteUrl` is sourced from the central src/lib/site-config.ts module so
// the production canonical URL is defined in exactly one place. It is NOT
// overridable from the admin DB (see policy note above generateMetadata()).
const DEFAULTS = {
  siteName: 'TikDL',
  siteUrl: SITE_URL,
  metaTitle: 'TikDL — TikTok Video Downloader Without Watermark',
  metaDescription: 'Download TikTok videos without watermark instantly. Free, unlimited, HD quality. Save videos, audio, and cover images in seconds. No signup required.',
  ogImageUrl: '',
  primaryColor: '#FE2C55',
  robotsDirective: 'index, follow',
};

/**
 * Read site settings from the database.
 * Returns a map of key→value for all settings, or empty map on failure.
 */
async function getSiteSettings(): Promise<Record<string, string>> {
  try {
    // Dynamic import to avoid circular dependency issues at build time
    const { db } = await import('@/lib/db');
    const settings = await db.settings.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  } catch {
    // DB unavailable — use defaults
    return {};
  }
}

/**
 * Generate metadata dynamically from DB settings.
 * This replaces the static `metadata` export so that admin settings
 * (siteName, metaTitle, metaDescription, ogImageUrl, primaryColor, etc.)
 * take effect on the frontend in real-time.
 *
 * CANONICAL URL POLICY:
 * The canonical production URL (metadataBase, alternates.canonical,
 * openGraph.url) is sourced UNCONDITIONALLY from src/lib/site-config.ts,
 * which reads NEXT_PUBLIC_SITE_URL with a fallback to
 * https://tikdl.leadforgeai.site. The DB `siteUrl` setting is NOT used
 * for canonical/OG URL output — it remains editable from /admin → Settings
 * for backwards compatibility and is still surfaced in the admin UI, but
 * the canonical URL is a deployment-level concern (set via Vercel env var)
 * and must never be silently overridden by stale DB state from a previous
 * domain. This prevents exactly the bug we just fixed: a previous admin
 * save had stored `https://tikdl.app` in the production DB, and that stale
 * value was being served as the canonical URL even after the code was
 * updated to use the new domain.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  const siteName = settings['siteName'] || DEFAULTS.siteName;
  // Canonical URL — always sourced from env / hardcoded fallback.
  // See policy note above. DB `siteUrl` is intentionally NOT used here.
  const siteUrl = SITE_URL;
  const metaTitle = settings['metaTitle'] || DEFAULTS.metaTitle;
  const metaDescription = settings['metaDescription'] || DEFAULTS.metaDescription;
  const ogImageUrl = settings['ogImageUrl'] || DEFAULTS.ogImageUrl;
  const primaryColor = settings['primaryColor'] || DEFAULTS.primaryColor;
  const robotsDirective = settings['robotsDirective'] || DEFAULTS.robotsDirective;

  const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    // Phase 3 P3-F2 — canonical for the homepage. Defends against query-string
    // variants (?utm_source=..., ?ref=share) being treated as separate pages
    // by search engines. Content pages set their own canonical in their
    // per-page static `metadata` exports.
    alternates: { canonical: siteUrl },
    title: metaTitle,
    description: metaDescription,
    keywords: [
      "tiktok downloader",
      "tiktok video without watermark",
      "save tiktok video",
      "tiktok mp3",
      "tiktok mp4 download",
      "download tiktok no watermark",
      "tiktok audio extractor",
      "tiktok cover image",
      "tiktok saver",
      "free tiktok downloader",
    ],
    authors: [{ name: siteName }],
    icons: {
      icon: [
        { url: "/favicon.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: "/apple-touch-icon.png",
    },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      url: siteUrl,
      siteName,
      type: "website",
      ...(ogImageUrl ? {
        images: [{
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${siteName} - TikTok Downloader`,
        }],
      } : {
        images: [{
          url: "/icon-512.png",
          width: 512,
          height: 512,
          alt: `${siteName} - TikTok Downloader`,
        }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDescription,
      images: [ogImageUrl || "/icon-512.png"],
    },
    manifest: "/manifest.json",
    robots: robotsDirective,
    // Phase 11A — Google Search Console ownership verification.
    //
    // Why use `verification.google` instead of a literal <meta> tag in <head>:
    //  - Next.js Metadata API emits the tag server-side via the proper
    //    `<meta name="google-site-verification" content="...">` form
    //    (see https://nextjs.org/docs/app/api-reference/functions/generate-metadata#verification)
    //  - It composes correctly with the dynamic `generateMetadata()` flow
    //    already in use here (DB-backed siteName/metaTitle/etc.)
    //  - The verification token is INTENTIONALLY PUBLIC — Google requires
    //    it to be visible in raw server-rendered HTML. It is NOT a secret,
    //    grants no access to GA4 data, and cannot be used to modify the
    //    site. It only proves to Google that the site owner controls the
    //    HTML at this domain.
    //
    // DO NOT remove or alter this token. It was issued by Google Search
    // Console for the URL-prefix property https://tikdl.leadforgeai.site/
    // and is bound to that property.
    verification: {
      google: "OFl83K9u-oddgOWFwkUaOn7nJYfXPnMXa1EAxduS1oI",
    },
  };

  return metadata;
}

// ============================================================================
// ROOT LAYOUT
// ============================================================================

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read settings that affect the HTML layout (primary color, site name)
  const settings = await getSiteSettings();
  const primaryColor = settings['primaryColor'] || DEFAULTS.primaryColor;
  const siteName = settings['siteName'] || DEFAULTS.siteName;
  const maintenanceMode = settings['maintenanceMode'] === 'true';

  // Determine the current route path so the admin dashboard can bypass
  // maintenance mode. Without this, an admin who enables maintenance mode
  // cannot reach /admin to turn it back off. The pathname is exposed by
  // src/middleware.ts as a request header (x-route-pathname).
  let pathname = '';
  try {
    const headerList = await headers();
    pathname = headerList.get('x-route-pathname') || '';
  } catch {
    // headers() not available in this context — skip
  }
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  const showMaintenance = maintenanceMode && !isAdminRoute;

  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <meta name="theme-color" content={primaryColor} />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Inject DB-backed brand colors as CSS custom properties.
            This allows admin to change primaryColor/accentColor in Settings
            and have them propagate to the user-facing site on next page load.
            Components can use `var(--brand-primary)` / `var(--brand-accent)` in inline styles. */}
        <style dangerouslySetInnerHTML={{
          __html: `:root{--brand-primary:${primaryColor};--brand-accent:${settings['accentColor'] || '#25F4EE'};}`
        }} />
        {/* ====================================================================
            PWA SPLASH OVERLAY
            ====================================================================
            WHY: The Android Chrome PWA native splash only shows the icon +
            manifest `name`. It cannot render a tagline. After the native
            splash dismisses, the WebView shows the page HTML — but React
            hasn't hydrated yet, so users see a brief flash of unstyled
            content. This overlay covers that gap with a premium splash:

              [ TikDL logo (transparent icon-512.png) ]
                            TikDL
                  Free TikTok Downloader

            Scope:
              - Only visible when running as installed PWA
                (`@media (display-mode: standalone)`)
              - Never shown in regular browser tabs
              - Auto-dismissed on first paint + window.load
              - Respects prefers-reduced-motion (no fade animation)
              - Hard 4-second safety timeout so it never sticks
              - Removed from DOM after fade completes (no lingering overlay)
            ==================================================================== */}
        <style dangerouslySetInnerHTML={{
          __html: `
            .tikdl-app-splash {
              position: fixed;
              inset: 0;
              background: #000000;
              z-index: 2147483647;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 14px;
              opacity: 1;
              transition: opacity 320ms ease-out;
              pointer-events: none;
              -webkit-font-smoothing: antialiased;
            }
            .tikdl-app-splash.is-dismissing {
              opacity: 0;
            }
            .tikdl-app-splash__logo {
              width: 96px;
              height: 96px;
              max-width: 28vw;
              max-height: 28vw;
              object-fit: contain;
              user-select: none;
              -webkit-user-drag: none;
              /* Subtle entrance — only when motion is allowed */
              animation: tikdl-splash-rise 480ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
            }
            .tikdl-app-splash__title {
              color: #ffffff;
              font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              font-size: 22px;
              font-weight: 600;
              letter-spacing: 0.18em;
              margin: 0;
              text-transform: uppercase;
              text-indent: 0.18em; /* visual balance for letter-spacing */
            }
            .tikdl-app-splash__tagline {
              color: rgba(255, 255, 255, 0.55);
              font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              font-size: 11px;
              font-weight: 300;
              letter-spacing: 0.34em;
              margin: 0;
              text-transform: uppercase;
              text-indent: 0.34em;
              animation: tikdl-splash-fade 600ms ease-out 200ms both;
            }
            @keyframes tikdl-splash-rise {
              from { opacity: 0; transform: translateY(6px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0)   scale(1);    }
            }
            @keyframes tikdl-splash-fade {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            /* Only show the splash in standalone (installed PWA) mode. */
            @media not all and (display-mode: standalone) {
              .tikdl-app-splash { display: none !important; }
            }
            /* Respect reduced-motion preferences — no animation, instant fade. */
            @media (prefers-reduced-motion: reduce) {
              .tikdl-app-splash,
              .tikdl-app-splash__logo,
              .tikdl-app-splash__tagline {
                animation: none !important;
                transition: none !important;
              }
            }
          `
        }} />
      </head>
      <body className="min-h-full flex flex-col bg-[#000000] text-white font-[family-name:var(--font-geist-sans)]">
        {/* ====================================================================
            Phase 10 — Google Analytics 4 (Phase 12 split-component fix)
            ====================================================================
            <GA4Scripts /> is a Server Component that renders the gtag.js
            <Script> tags ONCE — never re-renders on client-side navigation,
            so React never has to reconcile next/script's imperatively
            injected <script> nodes against a DOM that has been mutated.

            <GA4RouteTracker /> is a Client Component that listens to
            usePathname() and fires page_view on client-side route changes.
            It renders null (no DOM) so it cannot cause a reconciliation
            mismatch.

            Phase 12 root cause: the previous single-component GA4.tsx
            combined <Script> tags + usePathname() in one Client Component.
            On every route change, React re-rendered the <Script> element,
            but next/script had already imperatively moved its <script> tag
            into <head> outside of React's awareness — so React's commit
            phase threw NotFoundError on insertBefore/removeChild, surfacing
            to users as:
              "Application error: a client-side exception has occurred while
               loading tikdl.leadforgeai.site"

            Both components render nothing when NEXT_PUBLIC_GA_MEASUREMENT_ID
            is unset. Analytics is strictly non-critical: if GA4 fails to
            load, downloads still work, form submission still works, and no
            user-visible error appears. See:
              - src/components/analytics/GA4Scripts.tsx
              - src/components/analytics/GA4RouteTracker.tsx
              - src/lib/analytics.ts
            ==================================================================== */}
        <GA4Scripts />
        {/* Splash overlay — only visible in installed-PWA (standalone) mode.
            Inline script dismisses it after first paint + window.load,
            with a hard 4-second safety timeout so it never blocks the UI. */}
        <div
          id="tikdl-app-splash"
          className="tikdl-app-splash"
          aria-hidden="true"
          role="presentation"
        >
          <img
            src="/icon-512.png"
            alt=""
            className="tikdl-app-splash__logo"
            // Prevent layout shift by reserving dimensions up front
            width={96}
            height={96}
            decoding="async"
          />
          <p className="tikdl-app-splash__title">TikDL</p>
          <p className="tikdl-app-splash__tagline">Free TikTok Downloader</p>
        </div>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){
            var splash = document.getElementById('tikdl-app-splash');
            if (!splash) return;
            var dismissed = false;
            function dismiss() {
              if (dismissed) return;
              dismissed = true;
              splash.classList.add('is-dismissing');
              // Phase 12 — do NOT call splash.parentNode.removeChild(splash).
              // Removing the splash DOM node imperatively breaks React's
              // reconciliation on client-side navigation: when the body's
              // first client component (e.g. <GA4RouteTracker />) re-renders
              // on a usePathname() change, React walks the body's children
              // to update them and finds the splash div missing — throwing
              // NotFoundError on insertBefore / removeChild. Hide via CSS
              // display:none + visibility:hidden + pointer-events:none so
              // the DOM node is preserved for React's tree but is invisible
              // to users. The CSS @media not all and (display-mode: standalone)
              // rule already keeps it display:none in non-PWA browsers.
              window.setTimeout(function() {
                splash.style.display = 'none';
                splash.style.visibility = 'hidden';
                splash.style.pointerEvents = 'none';
              }, 360);
            }
            // Dismiss as soon as the page has finished loading (deferred to
            // next tick so React hydration can start). Hard safety timeout
            // of 4s ensures the splash never sticks on a slow device.
            if (document.readyState === 'complete') {
              window.requestAnimationFrame(function(){ window.setTimeout(dismiss, 250); });
            } else {
              window.addEventListener('load', function() {
                window.setTimeout(dismiss, 250);
              });
            }
            window.setTimeout(dismiss, 4000);
          })();`
        }} />
        <GA4RouteTracker />
        {showMaintenance ? (
          <div className="min-h-screen flex items-center justify-center bg-black text-white">
            <div className="text-center p-8">
              <h1 className="text-2xl font-bold mb-4">{siteName}</h1>
              <p className="text-gray-400">We&apos;re currently performing maintenance. Please check back soon.</p>
            </div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
