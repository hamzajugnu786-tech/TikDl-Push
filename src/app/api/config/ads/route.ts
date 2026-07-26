import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DEFAULT_CONFIG = {
  enabled: true,
  countdownDuration: 5,
  autoDownload: true,
  popupTitle: 'Support free downloads',
  popupDescription: 'Your download will start automatically...',
};

export async function GET() {
  try {
    const interstitialConfig = await db.interstitialConfig.findFirst();
    const enabledAds = await db.adPlacement.findMany({
      where: { enabled: true },
      orderBy: { priority: 'asc' },
    });

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
      ads: enabledAds.map((ad) => ({
        id: ad.id,
        type: ad.type,
        position: ad.position,
        dimensions: ad.dimensions,
        priority: ad.priority,
      })),
    });
  } catch {
    return NextResponse.json({
      success: true,
      interstitial: DEFAULT_CONFIG,
      ads: [],
    });
  }
}
