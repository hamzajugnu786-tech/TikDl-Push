/**
 * ====================================================================
 * TikDL — Google Analytics 4 Component
 * ====================================================================
 *
 * Phase 10: GA4 + Search Console + SEO Measurement
 * Phase 12: Fix production client-side navigation regression
 *
 * ARCHITECTURE
 * ------------
 *  GA4 is split into TWO concerns, each in its own component:
 *
 *   1. <GA4Scripts /> — Server Component (no 'use client').
 *      Renders the gtag.js <Script> tags via next/script with
 *      strategy="afterInteractive". Rendered ONCE from the root layout.
 *      Never re-renders on client-side navigation because it is a Server
 *      Component, so React never has to reconcile its <Script> elements
 *      against a DOM that next/script has already mutated imperatively.
 *
 *      This is the fix for the Phase 12 production bug where client-side
 *      navigation between /about, /contact, /privacy etc. threw:
 *
 *        NotFoundError: Failed to execute 'insertBefore' on 'Node': The
 *        node before which the new node is to be inserted is not a child
 *        of this node.
 *
 *      Root cause of that bug: rendering <Script strategy="afterInteractive">
 *      inside a Client Component that uses usePathname() causes React to
 *      re-render the <Script> element on every route change. next/script
 *      imperatively injects the script tag into <head> outside of React's
 *      awareness, then on the next render React tries to reconcile the
 *      element it thinks is there but has been moved/removed — throwing
 *      NotFoundError during commit. Refreshing the destination page works
 *      because the page is fully re-rendered from scratch (no client-side
 *      reconciliation).
 *
 *   2. <GA4RouteTracker /> — Client Component.
 *      Uses usePathname() + useEffect to fire a `page_view` event for
 *      client-side App Router navigations. Renders NO DOM — returns null.
 *      Because it renders nothing, it cannot cause a DOM reconciliation
 *      mismatch. The useEffect only invokes window.gtag() if it exists.
 *
 * WHEN GA_MEASUREMENT_ID IS UNSET
 * ------------------------------
 *  If NEXT_PUBLIC_GA_MEASUREMENT_ID is missing or empty (e.g. dev, fresh
 *  clone, or a Vercel project that hasn't been configured yet), BOTH
 *  components render nothing and fire no events. The site continues to
 *  work normally — analytics is strictly non-critical.
 *
 * NO-LEAK GUARANTEE
 * -----------------
 *  - The Measurement ID is rendered into page HTML — this is by design
 *    (GA4 Measurement IDs are public identifiers, not credentials).
 *  - NO TikTok URLs, video IDs, usernames, or provider names are sent to
 *    GA4 by this component. Conversion events are fired by src/lib/analytics.ts
 *    with only aggregate parameters (download_type, download_result, platform).
 *  - NO service-service keys, NO OAuth tokens, NO database credentials are
 *    ever exposed by this component.
 */

import Script from 'next/script';
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

/**
 * GA4Scripts — Server Component (no 'use client').
 *
 * Renders the gtag.js loader script + inline init script via next/script.
 * Rendered ONCE from the root layout; never re-renders on client-side
 * navigation. This avoids the Phase 12 NotFoundError regression caused by
 * React reconciling next/script's imperatively-mutated DOM nodes.
 *
 * When GA_MEASUREMENT_ID is unset, renders null (no scripts emitted).
 */
export function GA4Scripts() {
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
          // by the GA4RouteTracker useEffect.
          gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)}, { send_page_view: true });
        `}
      </Script>
    </>
  );
}
