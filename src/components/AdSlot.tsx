'use client';

/**
 * AdSlot — single ad placement renderer for any page.
 *
 * Resolution order (first match wins, never throws):
 *   1. Ad with page=<currentPage> AND placement=<section>   (section-specific)
 *   2. Ad with page="all"   AND placement=<section>         (global default)
 *   3. No ad — render null (slot omitted)
 *
 * Lazy / non-blocking:
 *   - Fetches /api/config/ads?pages=<currentPage> once per page mount.
 *   - Multiple AdSlot instances on the same page share the same fetch
 *     (module-level cache) so we never hammer the API.
 *   - Ad HTML is sanitized client-side via DOMPurify (sanitizeAdHtml)
 *     before being injected via dangerouslySetInnerHTML.
 *   - Ads never block the page render — the slot starts empty and fills
 *     in once the fetch resolves.
 *
 * Used by:
 *   - Content pages (about/contact/privacy/terms/dmca) via ContentPageAds
 *   - Homepage interval slot in Recent Downloads
 *   - Anywhere a developer wants to drop an ad by placement id
 */

import { useEffect, useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { sanitizeAdHtml } from '@/lib/sanitize';
import { GLOBAL_PAGE_KEY, parseDimensions } from '@/lib/ad-registry';

interface PublicAd {
  id: string;
  name: string;
  type: string;
  page: string;
  placement: string;
  position: string;
  dimensions: string;
  adCode: string;
  priority: number;
}

interface AdsByPage {
  [page: string]: PublicAd[];
}

interface AdsResponse {
  success: boolean;
  adsByPage?: AdsByPage;
  // Legacy homepage buckets — also present in the response
  inlineAds?: PublicAd[];
  bannerAds?: PublicAd[];
  sidebarAds?: PublicAd[];
}

// ============================================================================
// Module-level fetch cache — multiple AdSlot instances on the same page
// share a single fetch promise so we never hit the API more than once per
// page load. The cache is keyed by the pathname (page key).
// ============================================================================

const cache = new Map<string, Promise<AdsByPage>>();

function pageKeyFromPath(pathname: string | null): string {
  if (!pathname || pathname === '/') return 'homepage';
  // /about → about, /privacy → privacy, /blog/post-1 → blog
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] || 'homepage';
}

async function fetchAdsForPage(pageKey: string): Promise<AdsByPage> {
  if (cache.has(pageKey)) {
    return cache.get(pageKey)!;
  }
  const promise = (async () => {
    try {
      const res = await fetch(`/api/config/ads?pages=${encodeURIComponent(pageKey)}`, {
        // Cache for the session — ads don't change mid-page-view
        cache: 'no-store',
      });
      const data: AdsResponse = await res.json();
      return data.adsByPage ?? {};
    } catch {
      // Network error — never crash the page, just return empty
      return {};
    }
  })();
  cache.set(pageKey, promise);
  return promise;
}

// ============================================================================
// AdSlot component
// ============================================================================

export interface AdSlotProps {
  /** Stable placement id (e.g. "above_footer", "after_intro"). */
  placement: string;
  /** Optional className for the outer wrapper. */
  className?: string;
  /**
   * Override the page key. If omitted, derives from usePathname().
   * Useful when a component is rendered inside a layout that doesn't
   * match the URL (rare).
   */
  page?: string;
}

export default function AdSlot({ placement, className, page }: AdSlotProps) {
  const pathname = usePathname();
  const pageKey = page ?? pageKeyFromPath(pathname);
  const [ad, setAd] = useState<PublicAd | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reset loading state when pageKey/placement changes so we don't briefly
    // show a stale ad from a previous page during the fetch window.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
    fetchAdsForPage(pageKey).then(adsByPage => {
      if (cancelled) return;
      // Resolution: section-specific (page=X, placement=Y) → global (page=all, placement=Y)
      const pageAds = adsByPage[pageKey] ?? [];
      const globalAds = adsByPage[GLOBAL_PAGE_KEY] ?? [];
      const candidates = [
        ...pageAds.filter(a => a.placement === placement),
        ...globalAds.filter(a => a.placement === placement),
      ];
      // Pick highest-priority enabled ad (lowest priority number wins)
      const winner = candidates.sort((a, b) => a.priority - b.priority)[0] ?? null;
      setAd(winner);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [pageKey, placement]);

  // Empty slot — render nothing. Don't reserve space.
  if (loaded && !ad) return null;
  if (!ad) return null;

  const dim = parseDimensions(ad.dimensions);
  const safeHtml = sanitizeAdHtml(ad.adCode);

  return (
    <div
      className={`tikdl-ad-slot ${className ?? ''}`}
      data-placement={placement}
      data-page={pageKey}
      style={{
        maxWidth: ad.dimensions === 'responsive' ? '100%' : `${dim.w}px`,
        margin: '0 auto',
      }}
    >
      {safeHtml ? (
        <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
      ) : (
        <div
          className="ad-placeholder"
          style={{
            width: '100%',
            minHeight: `${Math.min(dim.h, 250)}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            color: 'rgba(156,163,175,0.4)',
            fontSize: '11px',
          }}
        >
          Ad · {ad.dimensions === 'responsive' ? 'Responsive' : `${dim.w}×${dim.h}`}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Convenience hook — pre-resolve ads for a page so ContentPageAds can render
// multiple slots without each one re-fetching.
// ============================================================================

export function useAdsForPage(pageKey: string): { ads: PublicAd[]; loaded: boolean } {
  const [ads, setAds] = useState<PublicAd[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reset loading state when pageKey changes so we don't briefly show
    // a stale ad list from a previous page during the fetch window.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
    fetchAdsForPage(pageKey).then(adsByPage => {
      if (cancelled) return;
      const pageAds = adsByPage[pageKey] ?? [];
      const globalAds = adsByPage[GLOBAL_PAGE_KEY] ?? [];
      // Merge — page ads take priority over global ads of the same placement
      const merged = [...pageAds];
      for (const gAd of globalAds) {
        if (!merged.some(a => a.placement === gAd.placement)) {
          merged.push(gAd);
        }
      }
      setAds(merged);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [pageKey]);

  return { ads, loaded };
}
