/**
 * /api/health Route — Production Security & Infrastructure (Enhanced)
 *
 * Public health endpoint for monitoring tools.
 * Provides comprehensive system status without exposing sensitive data.
 *
 * Response includes:
 * - Overall system status (ok/degraded/offline)
 * - Database connectivity
 * - Provider health status
 * - Memory usage
 * - Build version
 * - Application uptime
 * - Overall health score (0-100)
 *
 * ⚠️  This endpoint is PUBLIC — no authentication required.
 *     Monitoring tools (UptimeRobot, PagerDuty, etc.) need unauthenticated access.
 *     However, no secrets, IPs, or internal error details are exposed.
 *
 * The response is kept lightweight (< 2KB) for fast monitoring checks.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reconcileSchema } from '@/lib/migrate';
import { initializeNovaDL, getRegistry } from '@/services';

// Always run dynamically — health must reflect real DB state at request time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ============================================================================
// APPLICATION STARTUP TIME
// ============================================================================

const appStartTime = Date.now();

// ============================================================================
// BUILD VERSION
// ============================================================================

// Read from package.json version — set at build time
const BUILD_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.2.1';

// ============================================================================
// HEALTH CHECK FUNCTION
// ============================================================================

export async function GET() {
  const timestamp = new Date().toISOString();
  const uptimeSeconds = Math.floor((Date.now() - appStartTime) / 1000);

  // Initialize NovaDL if not already done
  await initializeNovaDL();

  // Reconcile DB schema (idempotent, additive only — adds missing columns/tables)
  try {
    await reconcileSchema();
  } catch (error) {
    console.error('[Health] Schema reconciliation failed:', error);
  }

  try {
    // ========================================================================
    // 1. DATABASE CHECK — REAL Prisma query against production DB
    // ========================================================================
    // Use Settings.count() instead of User.count() — Settings is a small table
    // that always exists in production (populated by admin Settings tab).
    // User table was the old default-model table and may not exist on older DBs.
    // Settings.count() proves Prisma can actually query the production DB.
    const dbStart = Date.now();
    await db.settings.count();
    const dbLatency = Date.now() - dbStart;

    // ========================================================================
    // 2. PROVIDER HEALTH CHECKS
    // ========================================================================
    const registry = getRegistry();
    const providerHealths = await registry.healthCheckAll();

    const providerStatuses: Record<string, any> = {};
    let providersOnline = 0;
    let providersTotal = 0;

    for (const [name, health] of providerHealths.entries()) {
      // Per-provider enabled state from the registry — this is the runtime
      // truth, NOT the persisted DB row. A disabled provider can still be
      // healthy (its API works) but won't be selected for downloads.
      const enabled = registry.isProviderEnabled(name);
      providerStatuses[name] = {
        status: health.status,
        latency: health.latency,
        availability: health.availability,
        platform: health.platform,
        // Surface enabled state so the admin UI can distinguish
        // "Enabled & Healthy" from "Disabled & Healthy" from "Enabled & Offline".
        enabled,
      };

      providersTotal++;
      if (health.status === 'online' && enabled) providersOnline++;

      // Persist to ProviderStatus in DB. NOTE: we only UPSERT rows for
      // providers that exist in the registry — we do NOT touch rows for
      // providers that were once registered but are no longer in the registry
      // (those rows will become stale and the Dashboard UI must read the
      // `enabled` field from /api/admin/config or /api/health rather than
      // relying solely on ProviderStatus.active).
      try {
        await db.providerStatus.upsert({
          where: { name },
          update: {
            platform: health.platform,
            // 'active' here means "telemetry says the provider responded OK".
            // It does NOT mean "enabled in config". The admin UI MUST consult
            // the `enabled` field exposed above for config state.
            active: health.status !== 'offline',
            successRate: health.successRate,
            avgResponseMs: health.latency,
            lastCheck: health.lastCheck,
          },
          create: {
            name,
            platform: health.platform,
            active: health.status !== 'offline',
            successRate: health.successRate,
            avgResponseMs: health.latency,
            lastCheck: health.lastCheck,
          },
        });
      } catch (dbError) {
        console.error(`[Health] Failed to persist status for ${name}:`, dbError);
      }
    }

    // Also surface the full configured-provider list (with enabled state) so
    // the admin UI can ALWAYS show every configured provider, even when
    // telemetry has not yet been generated for one of them. This is the
    // authoritative list the Provider Management tab uses.
    const configuredProviders = registry.getConfiguredProviders();

    // ========================================================================
    // 3. MEMORY USAGE
    // ========================================================================
    const memoryUsage = process.memoryUsage();
    const memoryMb = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    };

    // ========================================================================
    // 4. OVERALL STATUS DETERMINATION
    // ========================================================================
    const allProvidersOffline = providersTotal > 0 && providersOnline === 0;
    const anyProviderDegraded = Array.from(providerHealths.values()).some(p => p.status === 'degraded');

    let status: 'ok' | 'degraded' | 'offline';
    if (allProvidersOffline) {
      status = 'offline';
    } else if (anyProviderDegraded || dbLatency > 1000) {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    // ========================================================================
    // 5. HEALTH SCORE CALCULATION
    // ========================================================================
    let healthScore = 100;

    // Database latency impact (up to -20 points)
    if (dbLatency > 500) healthScore -= 20;
    else if (dbLatency > 200) healthScore -= 10;
    else if (dbLatency > 100) healthScore -= 5;

    // Provider availability impact (up to -40 points)
    if (providersTotal > 0) {
      const providerAvailability = providersOnline / providersTotal;
      healthScore -= Math.round((1 - providerAvailability) * 40);
    }

    // Memory pressure impact (up to -20 points)
    const heapUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
    if (heapUsagePercent > 0.9) healthScore -= 20;
    else if (heapUsagePercent > 0.8) healthScore -= 10;
    else if (heapUsagePercent > 0.7) healthScore -= 5;

    // Ensure score is within bounds
    healthScore = Math.max(0, Math.min(100, healthScore));

    // ========================================================================
    // 6. BUILD LIGHTWEIGHT RESPONSE
    // ========================================================================
    return NextResponse.json({
      status,
      healthScore,
      version: BUILD_VERSION,
      uptime: formatUptime(uptimeSeconds),
      timestamp,
      database: {
        status: 'connected',
        latency: dbLatency,
      },
      providers: providerStatuses,
      // Authoritative configured-provider list — admin UI uses this to ALWAYS
      // show every configured provider in the Provider Management table, even
      // when telemetry has not yet been generated. `enabled` reflects the
      // runtime registry state (mutated by admin toggles + reloadConfig).
      configuredProviders,
      memory: memoryMb,
      providerSummary: {
        total: providersTotal,
        online: providersOnline,
        offline: providersTotal - providersOnline,
      },
    });
  } catch (error) {
    // DB connectivity failed — system is offline
    const memoryUsage = process.memoryUsage();
    return NextResponse.json(
      {
        status: 'offline',
        healthScore: 0,
        version: BUILD_VERSION,
        uptime: formatUptime(uptimeSeconds),
        timestamp,
        database: {
          status: 'disconnected',
          latency: null,
        },
        providers: {},
        configuredProviders: [],
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
        },
        providerSummary: {
          total: 0,
          online: 0,
          offline: 0,
        },
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : String(error),
      },
      { status: 503 }
    );
  }
}

// ============================================================================
// HELPER: FORMAT UPTIME
// ============================================================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
