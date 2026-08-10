import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  PAGE_IDS,
  HOMEPAGE_PLACEMENTS,
} from '@/lib/ad-placements';

const DEFAULT_CONFIG = {
  enabled: true,
  countdownDuration: 5,
  autoDownload: true,
  popupTitle: 'Support free downloads',
  popupDescription: 'Your download will start automatically...',
};

/**
 * Parse `?pages=` query parameter into a list of valid page ids.
 * Returns null when the parameter is missing — caller should fall back
 * to the legacy "homepage-only" behavior so existing callers keep working.
 */
function parsePagesParam(searchParams: URLSearchParams | undefined): string[] | null {
  if (!searchParams) return null;
  const raw = searchParams.get('pages');
  if (!raw) return null;
  const requested = raw
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);
  if (requested.length === 0) return null;
  // Only accept known page ids; unknown values are silently ignored to avoid
  // leaking data about pages that don't exist.
  const valid = requested.filter(p => PAGE_IDS.includes(p));
  // Always include 'all' ads in the per-page response so an admin can show a
  // single ad across every page without re-creating it. The 'all' bucket is
  // merged into each requested page's array below.
  return valid.length > 0 ? valid : null;
}

/**
 * Strip fields that should never reach the public ad API.
 * adCode is intentionally included — the frontend needs it to render ads.
 */
function publicAd(ad: any) {
  return {
    id: ad.id,
    name: ad.name,
    type: ad.type,
    page: ad.page,
    placement: ad.placement,
    position: ad.position,
    dimensions: ad.dimensions,
    adCode: ad.adCode,
    priority: ad.priority,
  };
}

export async function GET(request: Request) {
  try {
    const interstitialConfig = await db.interstitialConfig.findFirst();
    const allAds = await db.adPlacement.findMany({
      orderBy: { priority: 'asc' },
    });

    // ===== Backwards-compatible homepage buckets =====
    // Existing homepage code reads `ads`, `interstitialAd`, `sidebarAds`,
    // `bannerAds`, `inlineAds`. We must keep returning these in the same
    // shape so the homepage keeps rendering with zero regression.
    const homepageAds = allAds.filter(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === 'all')
        && HOMEPAGE_PLACEMENTS.includes(ad.placement)
    );

    const interstitialAd = allAds.find(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === 'all')
        && ad.placement === 'interstitial_popup'
    );

    const sidebarAds = allAds.filter(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === 'all')
        && (ad.placement === 'left_sidebar' || ad.placement === 'right_sidebar')
    );

    const bannerAds = allAds.filter(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === 'all')
        && ['header_banner', 'above_footer'].includes(ad.placement)
    );

    // Inline ads on homepage — every inline/content placement that the
    // homepage JSX actually renders. Includes the new `history_interval`
    // slot used inside the Recent Downloads grid.
    const inlineAds = allAds.filter(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === 'all')
        && [
          'hero_section',
          'between_url_download',
          'between_result_recent',
          'between_recent_features',
          'between_features_faq',
          'native_content',
          'history_interval',
        ].includes(ad.placement)
    );

    // ===== New page-aware bucket =====
    // `adsByPage[page]` = enabled ads assigned to that page OR to 'all'.
    // Used by the AdSlot component on content pages. Backwards compatible
    // (homepage can also use this if/when migrated).
    const requestedPages = parsePagesParam(new URL(request.url).searchParams);
    const pagesToList = requestedPages ?? PAGE_IDS;
    const adsByPage: Record<string, ReturnType<typeof publicAd>[]> = {};
    for (const pageId of pagesToList) {
      adsByPage[pageId] = allAds
        .filter(ad => ad.enabled && (ad.page === pageId || ad.page === 'all'))
        .map(publicAd);
    }

    return NextResponse.json({
      success: true,
      interstitial: interstitialConfig
        ? {
            enabled: interstitialConfig.enabled,
            countdownDuration: interstitialConfig.countdownDuration,
            autoDownload: interstitialConfig.autoDownload,
            popupTitle: interstitialConfig.popupTitle,
            popupDescription: interstitialConfig.popupDescription,
          }
        : DEFAULT_CONFIG,
      ads: homepageAds.map(publicAd),
      interstitialAd: interstitialAd
        ? {
            id: interstitialAd.id,
            dimensions: interstitialAd.dimensions,
            adCode: interstitialAd.adCode,
          }
        : null,
      sidebarAds: sidebarAds.map(publicAd),
      bannerAds: bannerAds.map(publicAd),
      inlineAds: inlineAds.map(publicAd),
      // Page-aware bucket — used by content pages via the AdSlot component.
      // Empty for any page with no configured ads (the AdSlot renders null).
      adsByPage,
    });
  } catch {
    return NextResponse.json({
      success: true,
      interstitial: DEFAULT_CONFIG,
      ads: [],
      interstitialAd: null,
      sidebarAds: [],
      bannerAds: [],
      inlineAds: [],
      adsByPage: {},
    });
  }
}
