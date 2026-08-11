#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Build-time Page Discovery
 * ============================================================
 * Scans `src/app/<dir>/page.tsx` and writes a JSON list of discovered
 * page directories. This list is bundled into the production build
 * so the Advertisement Management Center can auto-discover new pages
 * WITHOUT requiring a manual registry edit.
 *
 * Why this exists
 * ---------------
 * The runtime filesystem scan in `/api/config/pages` works in dev mode
 * but breaks on Vercel — `output: 'standalone'` does NOT ship `src/app/`.
 * Without this build-time scan, the admin would never see newly created
 * pages until an ad is first saved against them (DB-distinct fallback).
 *
 * Output
 * -----
 * Writes `src/lib/discovered-pages.json` — a JSON array of page keys.
 * This file is a build artifact and should NOT be hand-edited.
 *
 * Idempotent + safe — exits 0 on success, exits non-zero on hard error.
 * Missing src/app is treated as "no pages" (empty array) — never fails the build.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Resolve paths from the current working directory (project root) — NOT __dirname.
// This script is invoked as `node src/build/discover-pages.js` from the project root
// during `npm run build`, so process.cwd() is the repo root in both dev and CI/Vercel.
const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'src', 'app');
const OUT_FILE = path.join(ROOT, 'src', 'lib', 'discovered-pages.json');

// Directories that are NOT pages (internal/admin/api/special)
const SKIP_DIRS = new Set([
  'admin',
  'api',
  '_components',
  '_lib',
  '_hooks',
  '_styles',
]);

function discoverPages() {
  if (!fs.existsSync(APP_DIR)) {
    console.log('[discover-pages] src/app does not exist — writing empty list');
    return [];
  }
  const entries = fs.readdirSync(APP_DIR, { withFileTypes: true });
  const pages = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    // Confirm a page.tsx exists inside
    const pageFile = path.join(APP_DIR, entry.name, 'page.tsx');
    const pageFileJs = path.join(APP_DIR, entry.name, 'page.ts');
    if (fs.existsSync(pageFile) || fs.existsSync(pageFileJs)) {
      pages.push(entry.name);
    }
  }
  return pages.sort();
}

function main() {
  try {
    const pages = discoverPages();
    // Only write if changed (avoid spurious build cache invalidation)
    let existing = null;
    try {
      existing = fs.readFileSync(OUT_FILE, 'utf8');
    } catch {
      // File doesn't exist yet
    }
    const newContent = JSON.stringify(pages, null, 2) + '\n';
    if (existing !== newContent) {
      fs.writeFileSync(OUT_FILE, newContent, 'utf8');
      console.log(`[discover-pages] Wrote ${pages.length} page(s) to src/lib/discovered-pages.json: ${pages.join(', ')}`);
    } else {
      console.log(`[discover-pages] Unchanged — ${pages.length} page(s) already in src/lib/discovered-pages.json`);
    }
  } catch (err) {
    console.error('[discover-pages] FATAL:', err);
    process.exit(1);
  }
}

main();
