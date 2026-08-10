-- ============================================================================
-- Migration: Add `page` column to AdPlacement + `device` column to DownloadLog
-- ============================================================================
--
-- This migration is ADDITIVE and NON-DESTRUCTIVE:
--   - Adds the `page` column to AdPlacement with default 'all' (so existing
--     rows are automatically populated with the global fallback value)
--   - Adds the `device` column to DownloadLog as nullable (so historical rows
--     keep NULL — the UI shows "unknown" rather than fabricating a category)
--   - Adds two new indexes for the new columns
--
-- Apply this to the production Turso DB with ONE of these methods:
--
--   METHOD 1 (preferred — Prisma-managed):
--     DATABASE_URL="libsql://<your-turso-host>" \
--     DATABASE_AUTH_TOKEN="<your-token>" \
--     npx prisma db push
--
--   METHOD 2 (raw SQL — via Turso CLI):
--     turso db shell <your-db-name> < prisma/migrations/20260810_add_page_and_device_columns/migration.sql
--
--   METHOD 3 (raw SQL — via libSQL HTTP API):
--     POST https://<your-turso-host>/v2/pipeline
--     with each statement as a separate "execute" request.
--
-- Existing ads are PRESERVED. Existing download logs are PRESERVED.
-- No data is lost. The new `page` column gets 'all' for all pre-existing rows
-- (additive default). The new `device` column stays NULL for historical rows.
-- ============================================================================

-- Step 1: Add `page` column to AdPlacement.
-- SQLite's ALTER TABLE ADD COLUMN with a DEFAULT is non-destructive —
-- existing rows are populated with the default value automatically.
ALTER TABLE `AdPlacement` ADD COLUMN `page` TEXT NOT NULL DEFAULT 'all';

-- Step 2: Add `device` column to DownloadLog.
-- Nullable on purpose — historical rows have no device info. The analytics
-- UI distinguishes "unknown" (NULL) from real "mobile"/"desktop"/"tablet".
ALTER TABLE `DownloadLog` ADD COLUMN `device` TEXT;

-- Step 3: Add indexes for the new columns. CREATE INDEX IF NOT EXISTS is
-- idempotent — safe to re-run.
CREATE INDEX IF NOT EXISTS `AdPlacement_page_placement_enabled_idx` ON `AdPlacement`(`page`, `placement`, `enabled`);
CREATE INDEX IF NOT EXISTS `AdPlacement_page_enabled_idx` ON `AdPlacement`(`page`, `enabled`);
CREATE INDEX IF NOT EXISTS `DownloadLog_device_idx` ON `DownloadLog`(`device`);

-- ============================================================================
-- Verification queries (run after migration to confirm):
--
--   PRAGMA table_info(AdPlacement);  -- should list `page` column
--   PRAGMA table_info(DownloadLog);  -- should list `device` column
--   SELECT DISTINCT page FROM AdPlacement;  -- should include 'all'
--   SELECT COUNT(*) FROM AdPlacement WHERE page IS NULL;  -- should be 0
-- ============================================================================
