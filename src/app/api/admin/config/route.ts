import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { sanitizeAdHtmlServer } from '@/lib/sanitize';

export async function GET() {
  // Authentication guard — unauthenticated users receive 401
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    // Parallelise independent DB queries for better performance
    const [interstitialConfig, adPlacements, settings] = await Promise.all([
      db.interstitialConfig.findFirst(),
      db.adPlacement.findMany({ orderBy: { priority: 'asc' } }),
      db.settings.findMany(),
    ]);

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
        page: ad.page,
        placement: ad.placement,
        position: ad.position,
        dimensions: ad.dimensions,
        adCode: ad.adCode,
        description: ad.description,
        priority: ad.priority,
      })),
      settings: settings.map((s) => ({ key: s.key, value: s.value })),
    });
  } catch (error) {
    console.error('Failed to fetch config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Authentication guard — unauthenticated users receive 401
  const authError = await requireAuth();
  if (authError) return authError;

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

    // Upsert AdPlacement records — use DB lookup to determine create vs update
    const savedAds: Array<{ id: string; name: string; template: string; enabled: boolean; type: string; page: string; placement: string; position: string; dimensions: string; adCode: string; description: string; priority: number }> = [];

    if (body.ads && Array.isArray(body.ads)) {
      // Fetch all existing ad IDs for efficient lookup
      const existingAds = await db.adPlacement.findMany({ select: { id: true } });
      const existingIds = new Set(existingAds.map(a => a.id));

      for (const adData of body.ads) {
        const isExisting = adData.id && typeof adData.id === 'string' && existingIds.has(adData.id);

        if (isExisting) {
          // Update existing ad
          const updated = await db.adPlacement.update({
            where: { id: adData.id },
            data: {
              name: adData.name ?? 'Untitled Ad',
              template: adData.template ?? 'medium_rectangle',
              enabled: adData.enabled ?? true,
              type: adData.type ?? 'display',
              page: typeof adData.page === 'string' && adData.page ? adData.page : 'homepage',
              placement: adData.placement ?? 'interstitial_popup',
              position: adData.position ?? 'center',
              dimensions: adData.dimensions ?? '300x250',
              adCode: sanitizeAdHtmlServer(adData.adCode ?? ''),  // Server-side defense-in-depth
              description: adData.description ?? '',
              priority: adData.priority ?? 1,
            },
          });
          savedAds.push({
            id: updated.id, name: updated.name, template: updated.template,
            enabled: updated.enabled, type: updated.type, page: updated.page,
            placement: updated.placement, position: updated.position,
            dimensions: updated.dimensions, adCode: updated.adCode,
            description: updated.description, priority: updated.priority,
          });
        } else {
          // Create new ad (ignore any stale/invalid id)
          const created = await db.adPlacement.create({
            data: {
              name: adData.name ?? 'Untitled Ad',
              template: adData.template ?? 'medium_rectangle',
              enabled: adData.enabled ?? true,
              type: adData.type ?? 'display',
              page: typeof adData.page === 'string' && adData.page ? adData.page : 'homepage',
              placement: adData.placement ?? 'interstitial_popup',
              position: adData.position ?? 'center',
              dimensions: adData.dimensions ?? '300x250',
              adCode: sanitizeAdHtmlServer(adData.adCode ?? ''),  // Server-side defense-in-depth
              description: adData.description ?? '',
              priority: adData.priority ?? 1,
            },
          });
          savedAds.push({
            id: created.id, name: created.name, template: created.template,
            enabled: created.enabled, type: created.type, page: created.page,
            placement: created.placement, position: created.position,
            dimensions: created.dimensions, adCode: created.adCode,
            description: created.description, priority: created.priority,
          });
        }
      }
    }

    // Delete ad placements — validate each ID is a string before DB lookup
    if (body.deleteAds && Array.isArray(body.deleteAds)) {
      for (const adId of body.deleteAds) {
        if (typeof adId !== 'string' || !adId.trim()) continue; // Skip invalid IDs
        // Verify the ad exists before deleting to avoid Prisma errors
        const exists = await db.adPlacement.findUnique({ where: { id: adId } });
        if (exists) {
          await db.adPlacement.delete({
            where: { id: adId },
          });
        }
      }
    }

    // Upsert Settings entries
    if (body.settings && Array.isArray(body.settings)) {
      for (const setting of body.settings) {
        if (setting.key && typeof setting.key === 'string') {
          await db.settings.upsert({
            where: { key: setting.key },
            update: { value: String(setting.value ?? '') },
            create: { key: setting.key, value: String(setting.value ?? '') },
          });
        }
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
      ads: savedAds,
    });
  } catch (error) {
    console.error('Failed to update config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update config' },
      { status: 500 }
    );
  }
}
