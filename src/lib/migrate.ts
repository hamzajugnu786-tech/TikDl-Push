/**
 * Runtime Schema Reconciliation — Production-Safe Additive Migration
 *
 * WHY THIS EXISTS
 * ===============
 * The production Turso/libSQL database schema drifted behind the Prisma schema.
 * Symptoms:
 *   - "The column `page` does not exist in the current database" (or any missing column)
 *   - `prisma.adPlacement.create()` failures
 *   - `prisma.downloadLog.create()` failures
 *   - Dashboard analytics stuck at 0 because DownloadLog writes silently fail
 *
 * STRATEGY
 * ========
 * SQLite does NOT support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
 * Prisma migrations require `prisma migrate deploy` to run, which only works
 * if the build pipeline has the `DATABASE_AUTH_TOKEN` env var available at
 * build time (Vercel build-time vs runtime distinction is fragile).
 *
 * This module performs a SAFE, IDEMPOTENT runtime reconciliation:
 *   1. Use raw SQL via `db.$executeRawUnsafe` to query `PRAGMA table_info(<table>)`
 *   2. Compute the set of missing columns
 *   3. For each missing column, run `ALTER TABLE <table> ADD COLUMN <name> <type> DEFAULT <value>`
 *   4. Skip columns that already exist (no error)
 *
 * All operations are ADDITIVE. No destructive changes. No data loss.
 * The function is safe to call on every cold start — it only adds missing columns.
 *
 * PRIVACY / SAFETY
 * ================
 * - Never drops columns, tables, or indexes
 * - Never truncates data
 * - Never uses `--accept-data-loss`
 * - All added columns have DEFAULT values so existing rows backfill cleanly
 */

import { db } from '@/lib/db';

// ============================================================================
// EXPECTED SCHEMA — must match prisma/schema.prisma exactly
// ============================================================================

interface ExpectedColumn {
  name: string;
  type: string; // SQLite type
  default: string; // SQL literal for DEFAULT clause, or 'NULL' to make column nullable
  nullable: boolean; // if true, column is created without NOT NULL
}

const EXPECTED_SCHEMA: Record<string, ExpectedColumn[]> = {
  AdPlacement: [
    { name: 'id', type: 'TEXT', default: "''", nullable: false },
    { name: 'name', type: 'TEXT', default: "'Untitled Ad'", nullable: false },
    { name: 'template', type: 'TEXT', default: "'medium_rectangle'", nullable: false },
    { name: 'enabled', type: 'BOOLEAN', default: '1', nullable: false },
    { name: 'type', type: 'TEXT', default: "'display'", nullable: false },
    { name: 'page', type: 'TEXT', default: "'all'", nullable: false },
    { name: 'placement', type: 'TEXT', default: "'interstitial_popup'", nullable: false },
    { name: 'position', type: 'TEXT', default: "'center'", nullable: false },
    { name: 'dimensions', type: 'TEXT', default: "'300x250'", nullable: false },
    { name: 'adCode', type: 'TEXT', default: "''", nullable: false },
    { name: 'description', type: 'TEXT', default: "''", nullable: false },
    { name: 'priority', type: 'INTEGER', default: '1', nullable: false },
    { name: 'createdAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
    { name: 'updatedAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
  ],
  DownloadLog: [
    { name: 'id', type: 'TEXT', default: "''", nullable: false },
    { name: 'videoId', type: 'TEXT', default: 'NULL', nullable: true },
    { name: 'videoTitle', type: 'TEXT', default: 'NULL', nullable: true },
    { name: 'provider', type: 'TEXT', default: 'NULL', nullable: true },
    { name: 'platform', type: 'TEXT', default: "'tiktok'", nullable: false },
    { name: 'success', type: 'BOOLEAN', default: '0', nullable: false },
    { name: 'responseTime', type: 'INTEGER', default: 'NULL', nullable: true },
    { name: 'error', type: 'TEXT', default: 'NULL', nullable: true },
    { name: 'ipAddress', type: 'TEXT', default: 'NULL', nullable: true },
    { name: 'requestId', type: 'TEXT', default: 'NULL', nullable: true },
    { name: 'device', type: 'TEXT', default: 'NULL', nullable: true },
    { name: 'createdAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
  ],
  ProviderStatus: [
    { name: 'id', type: 'TEXT', default: "''", nullable: false },
    { name: 'name', type: 'TEXT', default: "''", nullable: false },
    { name: 'platform', type: 'TEXT', default: "'tiktok'", nullable: false },
    { name: 'active', type: 'BOOLEAN', default: '1', nullable: false },
    { name: 'successRate', type: 'REAL', default: '0.0', nullable: false },
    { name: 'avgResponseMs', type: 'INTEGER', default: '0', nullable: false },
    { name: 'lastCheck', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
    { name: 'createdAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
    { name: 'updatedAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
  ],
  InterstitialConfig: [
    { name: 'id', type: 'TEXT', default: "''", nullable: false },
    { name: 'enabled', type: 'BOOLEAN', default: '1', nullable: false },
    { name: 'countdownDuration', type: 'INTEGER', default: '5', nullable: false },
    { name: 'autoDownload', type: 'BOOLEAN', default: '1', nullable: false },
    { name: 'popupTitle', type: 'TEXT', default: "'Support free downloads'", nullable: false },
    { name: 'popupDescription', type: 'TEXT', default: "'Your download will start automatically...'", nullable: false },
    { name: 'createdAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
    { name: 'updatedAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
  ],
  Analytics: [
    { name: 'id', type: 'TEXT', default: "''", nullable: false },
    { name: 'date', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
    { name: 'totalDownloads', type: 'INTEGER', default: '0', nullable: false },
    { name: 'successCount', type: 'INTEGER', default: '0', nullable: false },
    { name: 'failCount', type: 'INTEGER', default: '0', nullable: false },
    { name: 'avgResponseMs', type: 'INTEGER', default: '0', nullable: false },
    { name: 'uniqueVisitors', type: 'INTEGER', default: '0', nullable: false },
    { name: 'createdAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
    { name: 'updatedAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
  ],
  Settings: [
    { name: 'id', type: 'TEXT', default: "''", nullable: false },
    { name: 'key', type: 'TEXT', default: "''", nullable: false },
    { name: 'value', type: 'TEXT', default: "''", nullable: false },
    { name: 'updatedAt', type: 'DATETIME', default: 'CURRENT_TIMESTAMP', nullable: false },
  ],
};

// ============================================================================
// TABLE EXISTENCE + COLUMN INTROSPECTION (via raw SQL — adapter-safe)
// ============================================================================

/**
 * Returns the set of existing columns for a table, or null if the table doesn't exist.
 * Works with both Turso/libSQL and local SQLite via the PrismaLibSQL adapter.
 */
async function getExistingColumns(tableName: string): Promise<Set<string> | null> {
  try {
    // PRAGMA table_info returns rows: { name, type, notnull, dflt_value, pk }
    const result = await db.$queryRawUnsafe<{ name: string }[]>(
      `PRAGMA table_info(${tableName})`
    );
    if (!Array.isArray(result) || result.length === 0) {
      // Could be empty array (table doesn't exist OR has no columns — treat as missing)
      // Verify by checking sqlite_master
      const masterCheck = await db.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      );
      const exists = masterCheck?.[0]?.count > 0;
      return exists ? new Set() : null;
    }
    return new Set(result.map(r => r.name));
  } catch (error) {
    console.error(`[Migration] Failed to introspect ${tableName}:`, error);
    return null;
  }
}

/**
 * Create a table if it doesn't exist, using a minimal schema.
 * This is only used as a fallback if a table is entirely missing.
 */
async function createTableIfMissing(tableName: string): Promise<boolean> {
  try {
    const exists = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );
    if (exists?.[0]?.count > 0) {
      return true; // Already exists
    }

    // Minimal CREATE TABLE statements (Prisma will fill in defaults at insert time)
    const createStatements: Record<string, string> = {
      AdPlacement: `CREATE TABLE "AdPlacement" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL DEFAULT 'Untitled Ad',
        "template" TEXT NOT NULL DEFAULT 'medium_rectangle',
        "enabled" BOOLEAN NOT NULL DEFAULT 1,
        "type" TEXT NOT NULL DEFAULT 'display',
        "page" TEXT NOT NULL DEFAULT 'all',
        "placement" TEXT NOT NULL DEFAULT 'interstitial_popup',
        "position" TEXT NOT NULL DEFAULT 'center',
        "dimensions" TEXT NOT NULL DEFAULT '300x250',
        "adCode" TEXT NOT NULL DEFAULT '',
        "description" TEXT NOT NULL DEFAULT '',
        "priority" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      DownloadLog: `CREATE TABLE "DownloadLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "videoId" TEXT,
        "videoTitle" TEXT,
        "provider" TEXT,
        "platform" TEXT NOT NULL DEFAULT 'tiktok',
        "success" BOOLEAN NOT NULL DEFAULT 0,
        "responseTime" INTEGER,
        "error" TEXT,
        "ipAddress" TEXT,
        "requestId" TEXT,
        "device" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      ProviderStatus: `CREATE TABLE "ProviderStatus" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "platform" TEXT NOT NULL DEFAULT 'tiktok',
        "active" BOOLEAN NOT NULL DEFAULT 1,
        "successRate" REAL NOT NULL DEFAULT 0,
        "avgResponseMs" INTEGER NOT NULL DEFAULT 0,
        "lastCheck" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      InterstitialConfig: `CREATE TABLE "InterstitialConfig" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "enabled" BOOLEAN NOT NULL DEFAULT 1,
        "countdownDuration" INTEGER NOT NULL DEFAULT 5,
        "autoDownload" BOOLEAN NOT NULL DEFAULT 1,
        "popupTitle" TEXT NOT NULL DEFAULT 'Support free downloads',
        "popupDescription" TEXT NOT NULL DEFAULT 'Your download will start automatically...',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      Analytics: `CREATE TABLE "Analytics" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "date" DATETIME NOT NULL,
        "totalDownloads" INTEGER NOT NULL DEFAULT 0,
        "successCount" INTEGER NOT NULL DEFAULT 0,
        "failCount" INTEGER NOT NULL DEFAULT 0,
        "avgResponseMs" INTEGER NOT NULL DEFAULT 0,
        "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      Settings: `CREATE TABLE "Settings" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL DEFAULT '',
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      User: `CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "name" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    };

    const stmt = createStatements[tableName];
    if (!stmt) return false;

    await db.$executeRawUnsafe(stmt);
    console.log(`[Migration] Created missing table: ${tableName}`);
    return true;
  } catch (error) {
    console.error(`[Migration] Failed to create table ${tableName}:`, error);
    return false;
  }
}

/**
 * Add a missing column to an existing table.
 * Uses ALTER TABLE ADD COLUMN — additive only, never destructive.
 */
async function addColumn(tableName: string, col: ExpectedColumn): Promise<boolean> {
  try {
    // SQLite ALTER TABLE ADD COLUMN:
    //   - NOT NULL columns require a non-NULL DEFAULT
    //   - Nullable columns can be added without NOT NULL (no DEFAULT needed)
    const sql = col.nullable
      ? `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.type}`
      : `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.type} NOT NULL DEFAULT ${col.default}`;
    await db.$executeRawUnsafe(sql);
    console.log(`[Migration] Added column: ${tableName}.${col.name} (nullable: ${col.nullable})`);
    return true;
  } catch (error: unknown) {
    // If column already exists, SQLite returns "duplicate column name"
    // This is safe to ignore — the column is already there
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('duplicate column name') || msg.includes('already exists')) {
      return true;
    }
    console.error(`[Migration] Failed to add column ${tableName}.${col.name}:`, msg);
    return false;
  }
}

// ============================================================================
// MAIN RECONCILIATION FUNCTION
// ============================================================================

let reconciliationDone = false;
let reconciliationPromise: Promise<void> | null = null;

/**
 * Reconcile the production DB schema with the Prisma schema.
 *
 * Safe to call on every cold start. Only adds missing tables/columns.
 * Never drops or modifies existing data.
 *
 * Idempotent: skips work that has already been done in this process.
 */
export async function reconcileSchema(): Promise<void> {
  if (reconciliationDone) return;
  if (reconciliationPromise) return reconciliationPromise;

  reconciliationPromise = (async () => {
    const summary: string[] = [];

    for (const [tableName, expectedColumns] of Object.entries(EXPECTED_SCHEMA)) {
      // Step 1: ensure table exists
      const tableCreated = await createTableIfMissing(tableName);
      if (!tableCreated) {
        summary.push(`${tableName}: TABLE MISSING (could not create)`);
        continue;
      }

      // Step 2: introspect existing columns
      const existingColumns = await getExistingColumns(tableName);
      if (!existingColumns) {
        summary.push(`${tableName}: INTROSPECTION FAILED`);
        continue;
      }

      // Step 3: add missing columns
      const missingColumns = expectedColumns.filter(
        col => !existingColumns.has(col.name)
      );

      if (missingColumns.length === 0) {
        summary.push(`${tableName}: OK (no missing columns)`);
        continue;
      }

      const added: string[] = [];
      for (const col of missingColumns) {
        const ok = await addColumn(tableName, col);
        if (ok) added.push(col.name);
      }
      summary.push(`${tableName}: added [${added.join(', ')}]`);
    }

    // Also create missing indexes (additive, idempotent via IF NOT EXISTS)
    const indexesToCreate = [
      'CREATE INDEX IF NOT EXISTS "DownloadLog_createdAt_idx" ON "DownloadLog"("createdAt")',
      'CREATE INDEX IF NOT EXISTS "DownloadLog_createdAt_success_idx" ON "DownloadLog"("createdAt", "success")',
      'CREATE INDEX IF NOT EXISTS "DownloadLog_provider_idx" ON "DownloadLog"("provider")',
      'CREATE INDEX IF NOT EXISTS "DownloadLog_device_idx" ON "DownloadLog"("device")',
      'CREATE INDEX IF NOT EXISTS "AdPlacement_placement_enabled_idx" ON "AdPlacement"("placement", "enabled")',
      'CREATE INDEX IF NOT EXISTS "AdPlacement_page_placement_enabled_idx" ON "AdPlacement"("page", "placement", "enabled")',
      'CREATE INDEX IF NOT EXISTS "AdPlacement_page_enabled_idx" ON "AdPlacement"("page", "enabled")',
    ];
    for (const stmt of indexesToCreate) {
      try {
        await db.$executeRawUnsafe(stmt);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('already exists')) {
          console.error('[Migration] Index creation failed:', msg);
        }
      }
    }

    console.log('[Migration] Schema reconciliation summary:');
    for (const line of summary) {
      console.log(`[Migration]   - ${line}`);
    }

    reconciliationDone = true;
  })();

  return reconciliationPromise;
}
