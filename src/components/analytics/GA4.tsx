'use client';

/**
 * ====================================================================
 * TikDL — Google Analytics 4 Component
 * ====================================================================
 *
 * Phase 10: GA4 + Search Console + SEO Measurement
 *
 * ARCHITECTURE
 * ------------
 *  This is a client component that:
 *   1. Injects the gtag.js loader script via `next/script` with
 *      `strategy="afterInteractive"` — non-render-blocking, async.
 *   2. Initializes gtag with the Measurement ID. The initial `page_view`
 *      event fires automatically via `gtag('config', GA_ID)`.
 *   3. Listens to `usePathname()` changes and fires a `page_view` event for
 *      subsequent client-side App Router navigations (so SPA-style nav
 *      between /about, /contact, /privacy etc. is tracked correctly).
 *
 * WHEN GA_MEASUREMENT_ID IS UNSET
 * ------------------------------
 *  If NEXT_PUBLIC_GA_MEASUREMENT_ID is missing or empty (e.g. dev, fresh
 *  clone, or a Vercel project that hasn't been configured yet), this
 *  component renders nothing and fires no events. The site continues to
 *  work normally — analytics is strictly non-critical.
 *
 * NO-LEAK GUARANTEE
 * -----------------
 *  - The Measurement ID is rendered into page HTML — this is by design
 *    (GA4 Measurement IDs are public identifiers, not credentials).
 *  - NO TikTok URLs, video IDs, usernames, or provider names are sent to
 *    GA4 by this component. Conversion events are fired by `src/lib/analytics.ts`
 *    with only aggregate parameters (download_type, download_result, platform).
 *  - NO service-account keys, NO OAuth tokens, NO database credentials are
 *    ever exposed by this component.
 */

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { GA_MEASUREMENT_ID } from '@/lib/analytics';

// Augment Window with gtag + dataLayer for TypeScript. GA4 ships its own
// runtime types, but we intentionally don't depend on @types/gtag.js to keep
// the implementation lightweight per Phase 10 requirements.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export default function GA4() {
  const pathname = usePathname();

  // Fire page_view on client-side route changes. The initial page_view is
  // sent automatically by `gtag('config', GA_ID)` below — this effect only
  // fires for subsequent route changes (e.g. user clicks /about → /privacy).
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    if (typeof window.gtag !== 'function') return;
    try {
      window.gtag('event', 'page_view', { page_path: pathname });
    } catch {
      // Never throw from analytics.
    }
  }, [pathname]);

  // If no Measurement ID is configured, render nothing. This keeps the
  // site analytics-free in dev / preview environments by default.
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          // send_page_view: true is the default — initial pageview is tracked
          // automatically. Subsequent client-side route changes are handled
          // by the useEffect in this component (see above).
          gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)}, { send_page_view: true });
        `}
      </Script>
    </>
  );
}
