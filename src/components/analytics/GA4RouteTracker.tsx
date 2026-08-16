'use client';

/**
 * ====================================================================
 * TikDL — GA4 Client-Side Route Tracker
 * ====================================================================
 *
 * Phase 12: Fix production client-side navigation regression
 *
 * WHAT THIS IS
 * ------------
 *  A Client Component that listens to usePathname() changes and fires a
 *  GA4 `page_view` event for each client-side App Router navigation.
 *
 *  This component renders NO DOM. It returns null. Because it renders
 *  nothing, it cannot trigger a React DOM reconciliation mismatch —
 *  which was the root cause of the Phase 12 production bug:
 *
 *    "Application error: a client-side exception has occurred while
 *     loading tikdl.leadforgeai.site (see the browser console for more
 *     information)."
 *
 *  with the underlying browser exception:
 *
 *    NotFoundError: Failed to execute 'insertBefore' on 'Node': The
 *    node before which the new node is to be inserted is not a child of
 *    this node.
 *
 * WHY A SEPARATE COMPONENT
 * -------------------------
 *  The previous GA4.tsx combined <Script> tags + useEffect in a single
 *  Client Component. The <Script strategy="afterInteractive"> element
 *  from next/script imperatively injects its <script> tag into <head>
 *  outside of React's awareness. When the component re-rendered on a
 *  client-side route change (because usePathname() updates), React tried
 *  to reconcile its <Script> element against a DOM that next/script had
 *  already mutated — throwing NotFoundError during commit.
 *
 *  Fix: <Script> tags are now in GA4Scripts.tsx (a Server Component that
 *  renders once from the root layout, never re-renders on navigation).
 *  This Route Tracker component handles only the route-change side effect
 *  and renders nothing.
 *
 * GUARANTEES
 * ----------
 *  - No-op on the server (typeof window === 'undefined')
 *  - No-op if NEXT_PUBLIC_GA_MEASUREMENT_ID is unset
 *  - No-op if window.gtag is not a function (script blocked / not yet loaded)
 *  - Never throws — failures are swallowed silently
 *  - Sends only the page path (no PII, no query strings by default)
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { GA_MEASUREMENT_ID } from '@/lib/analytics';

export default function GA4RouteTracker() {
  const pathname = usePathname();

  // Fire page_view on client-side route changes. The initial page_view is
  // sent automatically by `gtag('config', GA_ID)` in GA4Scripts.tsx — this
  // effect only fires for subsequent route changes (e.g. user clicks
  // /about → /privacy).
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    if (typeof window === 'undefined') return;
    if (typeof window.gtag !== 'function') return;
    try {
      window.gtag('event', 'page_view', { page_path: pathname });
    } catch {
      // Never throw from analytics.
    }
  }, [pathname]);

  // This component renders nothing — it exists only for its effect.
  return null;
}
