import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { sanitizeAdHtmlServer } from '@/lib/sanitize';
import { GLOBAL_PAGE_KEY } from '@/lib/ad-registry';
import { reconcileSchema } from '@/lib/migrate';
// BUG #4 fix: import the provider registry so the POST handler can call
// reloadConfig() after persisting provider_enabled_<name>
// settings. Without this, warm serverless invocations keep using the
// previously-loaded provider list and ignore the admin's new enable/disable
// state until the next cold start.
import { initializeNovaDL, getRegistry } from '@/services';

// Always run dynamically — admin config must reflect DB state at request time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ============================================================================
// Ad field normalizer — guarantees every saved ad has valid field values,
// even if the client sends partial / malformed data. This is the primary
// defense against "Failed to update config" errors caused by missing or
// invalid fields. Never throws — always returns a safe, persistable shape.
// ============================================================================

function normalizeAdFields(adData: any) {
  return {
    name:        typeof adData.name === 'string' && adData.name.trim() ? adData.name.slice(0, 200) : 'Untitled Ad',
    template:    typeof adData.template === 'string' && adData.template ? adData.template : 'medium_rectangle',
    enabled:     typeof adData.enabled === 'boolean' ? adData.enabled : true,
    type:        typeof adData.type === 'string' && adData.type ? adData.type : 'display',
    page:        typeof adData.page === 'string' && adData.page.trim() ? adData.page.trim().toLowerCase() : GLOBAL_PAGE_KEY,
    placement:   typeof adData.placement === 'string' && adData.placement ? adData.placement : 'interstitial_popup',
    position:    typeof adData.position === 'string' && adData.position ? adData.position : 'center',
    dimensions:  typeof adData.dimensions === 'string' && adData.dimensions ? adData.dimensions : '300x250',
    adCode:      sanitizeAdHtmlServer(typeof adData.adCode === 'string' ? adData.adCode : ''),
    description: typeof adData.description === 'string' ? adData.description.slice(0, 2000) : '',
    priority:    Number.isInteger(adData.priority) ? adData.priority : (typeof adData.priority === 'number' ? Math.floor(adData.priority) : 1),
  };
}

export async function GET() {
  // Authentication guard — unauthenticated users receive 401
  const authError = await requireAuth();
  if (authError) return authError;

  // Reconcile DB schema (idempotent — adds missing columns/tables if drifted)
  try {
    await reconcileSchema();
  } catch (error) {
    console.error('[Admin Config] Schema reconciliation failed:', error);
  }

  try {
    // Ensure provider registry is initialized so getConfiguredProviders() works.
    // On Vercel serverless, this is a no-op after the first cold start.
    await initializeNovaDL();

    // Parallelise independent DB queries for better performance
    const [interstitialConfig, adPlacements, settings] = await Promise.all([
      db.interstitialConfig.findFirst(),
      db.adPlacement.findMany({ orderBy: { priority: 'asc' } }),
      db.settings.findMany(),
    ]);

    // Build a quick lookup map of settings keys → values (for provider enabled state)
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));

    // List ALL configured providers from the registry with their real enabled state.
    // This is the source of truth for the Provider Management tab — independent
    // of whether telemetry has been generated yet.
    const registry = getRegistry();
    const configuredProviders = registry.getConfiguredProviders().map(p => ({
      name: p.name,
      platform: p.platform,
      enabled: p.enabled,
      // Expose the persisted config value too, so the UI can show the raw state
      // even before reloadConfig() runs.
      configValue: settingsMap.get(`provider_enabled_${p.name}`) ?? null,
    }));

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
      // Source of truth for the Provider Management tab.
      configuredProviders,
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

  // Reconcile DB schema before any write — ensures missing columns are added
  // so creates/updates don't fail with "column X does not exist"
  try {
    await reconcileSchema();
  } catch (error) {
    console.error('[Admin Config POST] Schema reconciliation failed:', error);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  try {
    // ===== Upsert InterstitialConfig =====
    const interstitialData = {
      enabled:           body.interstitial?.enabled ?? true,
      countdownDuration: body.interstitial?.countdownDuration ?? 5,
      autoDownload:      body.interstitial?.autoDownload ?? true,
      popupTitle:        body.interstitial?.popupTitle ?? 'Support free downloads',
      popupDescription:  body.interstitial?.popupDescription ?? 'Your download will start automatically...',
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

    // ===== Upsert AdPlacement records =====
    // Use DB lookup to determine create vs update — never blindly trust
    // the client-provided id; if it doesn't exist in the DB, create a new
    // row instead of crashing with "record not found".
    const savedAds: Array<{
      id: string; name: string; template: string; enabled: boolean;
      type: string; page: string; placement: string; position: string;
      dimensions: string; adCode: string; description: string; priority: number;
    }> = [];

    if (body.ads && Array.isArray(body.ads)) {
      const existingAds = await db.adPlacement.findMany({ select: { id: true } });
      const existingIds = new Set(existingAds.map(a => a.id));

      for (const adData of body.ads) {
        // Normalize all fields — never throw on bad input
        const normalized = normalizeAdFields(adData);
        const isExisting = typeof adData.id === 'string' && adData.id && existingIds.has(adData.id);

        if (isExisting) {
          const updated = await db.adPlacement.update({
            where: { id: adData.id },
            data: normalized,
          });
          savedAds.push({
            id: updated.id, name: updated.name, template: updated.template,
            enabled: updated.enabled, type: updated.type, page: updated.page,
            placement: updated.placement, position: updated.position,
            dimensions: updated.dimensions, adCode: updated.adCode,
            description: updated.description, priority: updated.priority,
          });
        } else {
          const created = await db.adPlacement.create({
            data: normalized,
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

    // ===== Delete ad placements =====
    // Validate each ID is a string before DB lookup — skip silently on
    // invalid input rather than crashing the whole save.
    if (body.deleteAds && Array.isArray(body.deleteAds)) {
      for (const adId of body.deleteAds) {
        if (typeof adId !== 'string' || !adId.trim()) continue;
        try {
          await db.adPlacement.delete({ where: { id: adId } });
        } catch {
          // Record already gone — not an error, just skip
        }
      }
    }

    // ===== Upsert Settings entries =====
    // Track whether any provider-related setting was persisted so we can
    // conditionally trigger a registry reload afterwards (BUG #4 fix).
    let providerSettingsChanged = false;
    if (body.settings && Array.isArray(body.settings)) {
      for (const setting of body.settings) {
        if (setting && typeof setting.key === 'string' && setting.key) {
          await db.settings.upsert({
            where: { key: setting.key },
            update: { value: String(setting.value ?? '') },
            create: { key: setting.key, value: String(setting.value ?? '') },
          });
          // Detect provider enable/disable / primary / fallback settings —
          // these are the keys the registry's loadFromConfig() reads.
          if (setting.key.startsWith('provider_')) {
            providerSettingsChanged = true;
          }
        }
      }
    }

    // ===== BUG #4 fix: reload the provider registry if any provider
    // setting was persisted. The registry is a long-lived server-side
    // singleton with a `configLoaded` flag — once it loads config the
    // first time, it never re-reads the DB unless reloadConfig() is
    // called. In a warm serverless invocation this means the admin's
    // newly-saved enable/disable state would be ignored until the
    // instance is recycled. reloadConfig() resets the flag and re-reads
    // the DB, so the very next download request picks up the change.
    // This is non-blocking on success — registry.loadFromConfig() is
    // already idempotent and gracefully falls back to env defaults on
    // any error, so a failed reload can never break the download path.
    //
    // We also call initializeNovaDL() (no-op if already initialized) to
    // make sure the registry has been created and providers registered
    // before attempting the reload — this is important on the very first
    // admin save after a cold start, before any /api/download or
    // /api/health request has triggered init.
    if (providerSettingsChanged) {
      try {
        await initializeNovaDL(); // no-op if already initialized
        await getRegistry().reloadConfig();
        console.log('[Admin Config POST] Provider registry reloaded after settings update');
      } catch (error) {
        // Log but never fail the admin save — the change is persisted
        // to the DB and will be picked up on the next cold start.
        console.error('[Admin Config POST] Provider registry reload failed:', error);
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
    // Surface the actual Prisma error message so the admin can see what
    // failed (instead of the generic "Failed to update config" that hid
    // the real cause during the previous build).
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to update config:', message, error);
    return NextResponse.json(
      { success: false, error: `Failed to update config: ${message}` },
      { status: 500 }
    );
  }
}
