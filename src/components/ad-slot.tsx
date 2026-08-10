'use client';

/**
 * AdSlot — centralized, page-aware ad renderer.
 * ------------------------------------------------------------------
 * Drop this anywhere in any page:
 *
 *   <AdSlot page="about" placement="after_intro" />
 *   <AdSlot page="about" placement="between_sections" className="my-4" />
 *
 * The component:
 *  - Lazily fetches ad config from /api/config/ads?pages=<page> on mount.
 *  - Shares a single fetch per page across all AdSlot instances on that
 *    page (module-level cache promise, keyed by page id).
 *  - Filters ads by `placement`, picks the highest-priority enabled ad.
 *  - Renders nothing (null) when no matching ad exists — silent fallback.
 *  - NEVER blocks page render, video fetch, or any user interaction.
 *  - Uses the existing sanitizeAdHtml() pipeline for safe HTML rendering.
 *
 * Backwards compatible with the homepage's existing ad rendering — the
 * homepage still uses its own landingAds state because it needs the
 * interstitial popup config bundled in the same fetch.
 */

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { sanitizeAdHtml } from '@/lib/sanitize';

export interface AdSlotProps {
  /** Page id from PAGE_KEYS (homepage, about, contact, privacy, terms, dmca). */
  page: string;
  /** Placement id from PLACEMENT_KEYS (header_banner, after_intro, above_cta, ...). */
  placement: string;
  /** Optional className to control outer wrapper styling. */
  className?: string;
  /**
   * Optional max-width hint derived from the ad's `dimensions` field. When
   * false, the wrapper stretches to fill its parent. Default: true.
   */
  constrainWidth?: boolean;
}

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

interface AdsByPageResponse {
  success?: boolean;
  adsByPage?: Record<string, PublicAd[]>;
}

/**
 * Module-level fetch cache: page id -> settled promise.
 * Multiple AdSlot instances on the same page share one network round-trip.
 * The cache persists for the lifetime of the JS module (i.e. the page
 * session), so navigating to another page triggers a fresh fetch.
 */
const pageAdsCache = new Map<string, Promise<PublicAd[]>>();

function fetchAdsForPage(page: string): Promise<PublicAd[]> {
  const cached = pageAdsCache.get(page);
  if (cached) return cached;

  const promise = fetch(`/api/config/ads?pages=${encodeURIComponent(page)}`, {
    // Always fetch fresh ad config; never the SWR cache. Ads are tiny.
    cache: 'no-store',
  })
    .then(r => r.json() as Promise<AdsByPageResponse>)
    .then(data => data.adsByPage?.[page] ?? [])
    .catch(err => {
      // Network or server error: log and return empty — render nothing.
      // Never throw to the component tree; ads must not break the page.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[AdSlot] Failed to fetch ads for page "${page}":`, err);
      }
      return [] as PublicAd[];
    });

  pageAdsCache.set(page, promise);
  return promise;
}

/**
 * Parse a "WxH" dimensions string into numeric width/height.
 * Falls back to 300x250 on any parsing error.
 */
function parseDimensions(dim: string | undefined): { w: number; h: number } {
  if (!dim || dim === 'responsive') return { w: 0, h: 0 };
  const parts = dim.split('x');
  const w = parseInt(parts[0], 10);
  const h = parseInt(parts[1], 10);
  if (Number.isNaN(w) || Number.isNaN(h)) return { w: 0, h: 0 };
  return { w, h };
}

export function AdSlot({
  page,
  placement,
  className,
  constrainWidth = true,
}: AdSlotProps) {
  const [ad, setAd] = useState<PublicAd | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdsForPage(page).then(ads => {
      if (cancelled) return;
      // Filter by placement; API already sorts by priority asc so first match wins.
      const match = ads.find(a => a.placement === placement);
      setAd(match ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [page, placement]);

  // No matching ad configured — render nothing. This is the normal case for
  // any page where the admin hasn't yet assigned an ad to this slot.
  if (!ad) return null;

  const { w, h } = parseDimensions(ad.dimensions);

  // ----- Sanitized HTML render path -----
  if (ad.adCode) {
    const safeHtml = sanitizeAdHtml(ad.adCode);
    return (
      <div
        className={className ?? 'ad-slot-inline'}
        style={constrainWidth && w > 0 ? { maxWidth: Math.min(w, 728), margin: '0 auto' } : undefined}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  // ----- Placeholder render path (no adCode configured) -----
  // Show a subtle placeholder card so admins can see where the slot lives
  // without breaking the page layout for end users. End users on production
  // typically will not see this because production ads always have adCode.
  return (
    <div
      className={className ?? 'ad-slot-inline'}
      style={{
        maxWidth: constrainWidth && w > 0 ? Math.min(w, 728) : '100%',
        margin: '0 auto',
        minHeight: h > 0 ? Math.min(h, 120) : 60,
      }}
    >
      <div
        className="flex flex-col items-center justify-center gap-1 h-full text-gray-500"
        style={{ minHeight: h > 0 ? Math.min(h, 120) : 60 }}
      >
        <Globe size={16} className="text-gray-600" />
        <span className="text-xs">{ad.name || 'Advertisement'}</span>
        {w > 0 && h > 0 && <span className="text-[10px] text-gray-600">{w} × {h}</span>}
      </div>
    </div>
  );
}

export default AdSlot;
