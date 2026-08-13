import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  GLOBAL_PAGE_KEY,
  KNOWN_PAGES,
  UNIVERSAL_PLACEMENTS,
  HOMEPAGE_ONLY_PLACEMENTS,
} from '@/lib/ad-registry';
import { reconcileSchema } from '@/lib/migrate';

// Always run dynamically — ads config must reflect DB state at request time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_CONFIG = {
  enabled: true,
  countdownDuration: 5,
  autoDownload: true,
  popupTitle: 'Support free downloads',
  popupDescription: 'Your download will start automatically...',
};

/**
 * Strip internal fields that should never reach the public ad API.
 * `adCode` is intentionally included — the frontend needs it to render ads.
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

/**
 * Parse `?pages=` query parameter into a list of valid page ids.
 * Returns null when the parameter is missing — caller should fall back
 * to returning ads for every known page.
 */
function parsePagesParam(searchParams: URLSearchParams | undefined): string[] | null {
  if (!searchParams) return null;
  const raw = searchParams.get('pages');
  if (!raw) return null;
  const requested = raw
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);
  return requested.length > 0 ? requested : null;
}

export async function GET(request: Request) {
  // Reconcile DB schema (idempotent — ensures AdPlacement table + columns exist)
  try {
    await reconcileSchema();
  } catch (error) {
    console.error('[Public Ads Config] Schema reconciliation failed:', error);
  }

  try {
    const interstitialConfig = await db.interstitialConfig.findFirst();
    const allAds = await db.adPlacement.findMany({
      orderBy: { priority: 'asc' },
    });

    // ===== Backwards-compatible homepage buckets =====
    // Existing homepage code reads `ads`, `interstitialAd`, `sidebarAds`,
    // `bannerAds`, `inlineAds`. We MUST keep returning these in the same
    // shape so the homepage JSX keeps rendering with zero regression.
    const homepageAds = allAds.filter(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === GLOBAL_PAGE_KEY)
        && [...UNIVERSAL_PLACEMENTS, ...HOMEPAGE_ONLY_PLACEMENTS].some(p => p.id === ad.placement)
    );

    const interstitialAd = allAds.find(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === GLOBAL_PAGE_KEY)
        && ad.placement === 'interstitial_popup'
    );

    const sidebarAds = allAds.filter(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === GLOBAL_PAGE_KEY)
        && (ad.placement === 'left_sidebar' || ad.placement === 'right_sidebar')
    );

    const bannerAds = allAds.filter(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === GLOBAL_PAGE_KEY)
        && ['header_banner', 'above_footer'].includes(ad.placement)
    );

    const inlineAds = allAds.filter(
      (ad) => ad.enabled
        && (ad.page === 'homepage' || ad.page === GLOBAL_PAGE_KEY)
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
    // `adsByPage[page]` = enabled ads whose `page` is either that page OR
    // the global fallback "all". Used by the AdSlot component on content
    // pages. Resolution (section → page → global) happens client-side.
    const requestedPages = parsePagesParam(new URL(request.url).searchParams);
    const knownPageKeys = KNOWN_PAGES.map(p => p.key);
    const dbPageKeys = allAds
      .map(ad => ad.page)
      .filter(p => p && p !== GLOBAL_PAGE_KEY && !knownPageKeys.includes(p));
    const pagesToList = requestedPages ?? Array.from(new Set([...knownPageKeys, ...dbPageKeys]));

    const adsByPage: Record<string, ReturnType<typeof publicAd>[]> = {};
    for (const pageId of pagesToList) {
      adsByPage[pageId] = allAds
        .filter(ad => ad.enabled && (ad.page === pageId || ad.page === GLOBAL_PAGE_KEY))
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
      // Legacy homepage buckets — preserved for zero regression
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
      // New page-aware bucket — used by content pages via AdSlot component.
      // Empty for any page with no configured ads (AdSlot renders null).
      adsByPage,
    });
  } catch (error) {
    // Never crash the public ads endpoint — return safe empty defaults.
    // Surface the failure to Vercel runtime logs (was previously silent)
    // and add a `degraded` flag for any future monitoring/admin tooling.
    // The HTTP 200 + success:true contract is preserved — existing
    // consumers (homepage, AdSlot) continue to render with no ads and
    // do not crash. The fail-open behavior is intentional and unchanged.
    // (Mirrors the Phase-2 Part-1 hardening applied to /api/analytics.)
    console.error('[Public Ads Config] Failed to fetch ads:', error);
    return NextResponse.json({
      success: true,
      degraded: true,
      error: 'Ad configuration temporarily unavailable',
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
