import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DEFAULT_CONFIG = {
  enabled: true,
  countdownDuration: 5,
  autoDownload: true,
  popupTitle: 'Support free downloads',
  popupDescription: 'Your download will start automatically...',
};

// Landing page placements — which placements to show on public pages
const LANDING_PLACEMENTS = [
  'header_banner',
  'hero_section',
  'between_url_download',
  'between_features_faq',
  'above_footer',
  'left_sidebar',
  'right_sidebar',
  'interstitial_popup',
  'native_content',
];

export async function GET() {
  try {
    const interstitialConfig = await db.interstitialConfig.findFirst();
    const allAds = await db.adPlacement.findMany({
      orderBy: { priority: 'asc' },
    });

    // Separate: enabled ads for landing page vs. all ads for admin
    const landingAds = allAds.filter(
      (ad) => ad.enabled && LANDING_PLACEMENTS.includes(ad.placement)
    );

    // Interstitial popup ad (for the countdown popup)
    const interstitialAd = allAds.find(
      (ad) => ad.enabled && ad.placement === 'interstitial_popup'
    );

    // Sidebar ads (desktop only)
    const sidebarAds = allAds.filter(
      (ad) => ad.enabled && (ad.placement === 'left_sidebar' || ad.placement === 'right_sidebar')
    );

    // Banner ads
    const bannerAds = allAds.filter(
      (ad) => ad.enabled && ['header_banner', 'above_footer'].includes(ad.placement)
    );

    // Inline ads
    const inlineAds = allAds.filter(
      (ad) => ad.enabled && ['hero_section', 'between_url_download', 'between_features_faq', 'native_content'].includes(ad.placement)
    );

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
      ads: landingAds.map((ad) => ({
        id: ad.id,
        name: ad.name,
        type: ad.type,
        placement: ad.placement,
        position: ad.position,
        dimensions: ad.dimensions,
        adCode: ad.adCode,
        priority: ad.priority,
      })),
      interstitialAd: interstitialAd ? {
        id: interstitialAd.id,
        dimensions: interstitialAd.dimensions,
        adCode: interstitialAd.adCode,
      } : null,
      sidebarAds: sidebarAds.map((ad) => ({
        id: ad.id,
        name: ad.name,
        dimensions: ad.dimensions,
        adCode: ad.adCode,
        placement: ad.placement,
      })),
      bannerAds: bannerAds.map((ad) => ({
        id: ad.id,
        name: ad.name,
        dimensions: ad.dimensions,
        adCode: ad.adCode,
        placement: ad.placement,
      })),
      inlineAds: inlineAds.map((ad) => ({
        id: ad.id,
        name: ad.name,
        dimensions: ad.dimensions,
        adCode: ad.adCode,
        placement: ad.placement,
      })),
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
    });
  }
}
