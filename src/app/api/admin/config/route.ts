import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const interstitialConfig = await db.interstitialConfig.findFirst();
    const adPlacements = await db.adPlacement.findMany({
      orderBy: { priority: 'asc' },
    });
    const settings = await db.settings.findMany();

    return NextResponse.json({
      success: true,
      interstitial: interstitialConfig
        ? {
            id: interstitialConfig.id,
            enabled: interstitialConfig.enabled,
            countdownDuration: interstitialConfig.countdownDuration,
            autoDownload: interstitialConfig.autoDownload,
            popupTitle: interstitialConfig.popupTitle,
            popupDescription: interstitialConfig.popupDescription,
          }
        : null,
      ads: adPlacements.map((ad) => ({
        id: ad.id,
        name: ad.name,
        template: ad.template,
        enabled: ad.enabled,
        type: ad.type,
        placement: ad.placement,
        position: ad.position,
        dimensions: ad.dimensions,
        adCode: ad.adCode,
        description: ad.description,
        priority: ad.priority,
      })),
      settings: settings.map((s) => ({ key: s.key, value: s.value })),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Upsert InterstitialConfig
    const interstitialData = {
      enabled: body.interstitial?.enabled ?? true,
      countdownDuration: body.interstitial?.countdownDuration ?? 5,
      autoDownload: body.interstitial?.autoDownload ?? true,
      popupTitle: body.interstitial?.popupTitle ?? 'Support free downloads',
      popupDescription:
        body.interstitial?.popupDescription ?? 'Your download will start automatically...',
    };

    const existingConfig = await db.interstitialConfig.findFirst();
    let interstitialConfig;

    if (existingConfig) {
      interstitialConfig = await db.interstitialConfig.update({
        where: { id: existingConfig.id },
        data: interstitialData,
      });
    } else {
      interstitialConfig = await db.interstitialConfig.create({
        data: interstitialData,
      });
    }

    // Upsert AdPlacement records
    if (body.ads && Array.isArray(body.ads)) {
      for (const adData of body.ads) {
        if (adData.id) {
          await db.adPlacement.update({
            where: { id: adData.id },
            data: {
              name: adData.name ?? 'Untitled Ad',
              template: adData.template ?? 'medium_rectangle',
              enabled: adData.enabled ?? true,
              type: adData.type ?? 'display',
              placement: adData.placement ?? 'interstitial_popup',
              position: adData.position ?? 'center',
              dimensions: adData.dimensions ?? '300x250',
              adCode: adData.adCode ?? '',
              description: adData.description ?? '',
              priority: adData.priority ?? 1,
            },
          });
        } else {
          await db.adPlacement.create({
            data: {
              name: adData.name ?? 'Untitled Ad',
              template: adData.template ?? 'medium_rectangle',
              enabled: adData.enabled ?? true,
              type: adData.type ?? 'display',
              placement: adData.placement ?? 'interstitial_popup',
              position: adData.position ?? 'center',
              dimensions: adData.dimensions ?? '300x250',
              adCode: adData.adCode ?? '',
              description: adData.description ?? '',
              priority: adData.priority ?? 1,
            },
          });
        }
      }
    }

    // Delete ad placements
    if (body.deleteAds && Array.isArray(body.deleteAds)) {
      for (const adId of body.deleteAds) {
        await db.adPlacement.delete({
          where: { id: adId },
        });
      }
    }

    // Upsert Settings entries
    if (body.settings && Array.isArray(body.settings)) {
      for (const setting of body.settings) {
        await db.settings.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: { key: setting.key, value: setting.value },
        });
      }
    }

    return NextResponse.json({
      success: true,
      interstitial: {
        id: interstitialConfig.id,
        enabled: interstitialConfig.enabled,
        countdownDuration: interstitialConfig.countdownDuration,
        autoDownload: interstitialConfig.autoDownload,
        popupTitle: interstitialConfig.popupTitle,
        popupDescription: interstitialConfig.popupDescription,
      },
    });
  } catch (error) {
    console.error('Failed to update config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update config' },
      { status: 500 }
    );
  }
}
