/**
 * Phase 2 Batch Regression — /api/config/settings observability (P2-F3).
 *
 * Verifies the catch-block hardening applied to the public settings endpoint:
 *   CASE 1: Normal success path (DB returns settings) → HTTP 200, success:true,
 *           settings populated, NO degraded flag, NO error string, console.error
 *           NOT called.
 *   CASE 2: DB returns empty settings → HTTP 200, success:true, settings:{},
 *           NO degraded flag, console.error NOT called.
 *   CASE 3: DB failure (db.settings.findMany throws) → HTTP 200, success:true,
 *           degraded:true, error:'Settings temporarily unavailable',
 *           settings:{}, console.error called once with the
 *           [Public Settings] scope tag and the actual Error.
 *   CASE 4: Verify the Cache-Control: no-store header is preserved on
 *           both success and degraded paths (admin changes must propagate
 *           immediately even on DB failure).
 *   SECRET-LEAK: response bodies + console.error args contain no
 *                TIKHUB_API_KEY / RAPIDAPI_KEY / ADMIN_PASSWORD /
 *                DATABASE_URL / AUTH_SECRET values, and no ADMIN_PASSWORD
 *                key string anywhere.
 *
 * Strategy: jiti-load the route with stubbed next/server + @/lib/db +
 * @/lib/migrate, mock console.error to capture calls. The route is
 * public + unauthenticated (no requireAuth), so no auth stub needed.
 *
 * Run via: `npm test` (or `node tests/regression/config-settings-degraded.mjs`)
 *
 * Phase 2 Batch hardening (P2-F3) — verification harness.
 */

import { resolve } from 'path';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const REPO = process.env.TIKDL_REPO_ROOT || resolve(process.cwd());
const ROUTE_PATH = resolve(REPO, 'src/app/api/config/settings/route.ts');

const testResults = [];
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  testResults.push({ pass: true, msg });
  console.log(`  PASS: ${msg}`);
}

// --- Stubs --------------------------------------------------------------

const stubDir = mkdtempSync(resolve(tmpdir(), 'tikdl-config-settings-test-'));

const stubServerPath = resolve(stubDir, 'next-server.mjs');
writeFileSync(stubServerPath, `
class MockNextResponse {
  constructor(body, init = {}) {
    this._body = body;
    this._init = init;
    this.status = init.status ?? 200;
    this.headers = new Map(Object.entries(init.headers || {}));
  }
  static json(data, init = {}) {
    return new MockNextResponse(data, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  }
  async json() { return this._body; }
  async text() { return JSON.stringify(this._body); }
}
export { MockNextResponse as NextResponse };
`);

// DB stub — exposes test-controllable resolvers.
globalThis.__TIKDL_DB_STATE__ = {
  settingsFindMany: async () => [],
};

const stubDbPath = resolve(stubDir, 'db.mjs');
writeFileSync(stubDbPath, `
export const db = {
  settings: {
    findMany: (...args) => globalThis.__TIKDL_DB_STATE__.settingsFindMany(...args),
  },
};
`);

const stubMigratePath = resolve(stubDir, 'migrate.mjs');
writeFileSync(stubMigratePath, `
export async function reconcileSchema() { /* no-op for tests */ }
`);

const createRequire = (await import('module')).default.createRequire;
const requireFromRepo = createRequire(resolve(REPO, 'package.json'));
const createJiti = requireFromRepo('jiti').default || requireFromRepo('jiti');
const jiti = createJiti(resolve(REPO, 'tsconfig.json'), {
  alias: {
    'next/server':   stubServerPath,
    '@/lib/db':      stubDbPath,
    '@/lib/migrate': stubMigratePath,
  },
  interopDefault: true,
});

// --- Mock console.error -------------------------------------------------
let consoleErrorCalls = [];
const originalConsoleError = console.error;
function captureConsoleError() {
  consoleErrorCalls = [];
  console.error = (...args) => { consoleErrorCalls.push(args); };
}
function restoreConsoleError() {
  console.error = originalConsoleError;
}

// Pre-flight: snapshot secret env values + key names (DO NOT print values).
const SENSITIVE_ENV_VALUES = [
  process.env.TIKHUB_API_KEY,
  process.env.RAPIDAPI_KEY,
  process.env.ADMIN_PASSWORD,
  process.env.DATABASE_URL,
  process.env.AUTH_SECRET,
].filter(Boolean);

// Settings endpoint must NEVER leak these key NAMES either (e.g. an error
// string like "ADMIN_PASSWORD lookup failed" would leak the key name).
const SENSITIVE_KEY_NAMES = [
  'ADMIN_PASSWORD',
  'TIKHUB_API_KEY',
  'RAPIDAPI_KEY',
  'AUTH_SECRET',
  'DATABASE_URL',
];

function assertNoSecrets(label, payload) {
  const text = typeof payload === 'string'
    ? payload
    : (() => { try { return JSON.stringify(payload); } catch { return String(payload); } })();
  for (const v of SENSITIVE_ENV_VALUES) {
    if (v && text.includes(v)) {
      throw new Error(`ASSERT FAILED: ${label} leaked a secret env value`);
    }
  }
  // Settings response must never mention secret key names anywhere
  // (the route's job is to expose only PUBLIC_SETTING_KEYS, but a regression
  // could leak a key name in an error message).
  for (const k of SENSITIVE_KEY_NAMES) {
    if (text.includes(k)) {
      throw new Error(`ASSERT FAILED: ${label} leaked secret key name "${k}"`);
    }
  }
  if (/(Bearer\s+[A-Za-z0-9_\-]{8,})/i.test(text)) {
    throw new Error(`ASSERT FAILED: ${label} contains a Bearer token pattern`);
  }
  console.log(`  PASS: ${label} contains no secrets`);
}

async function main() {
  process.env.NODE_ENV = 'production';

  const routeModule = jiti(ROUTE_PATH);
  assert(typeof routeModule.GET === 'function', 'route module exports GET');

  // CASE 1 — Normal success path with real settings
  console.log('\n==========================================');
  console.log('CASE 1 — Normal success path (DB returns real settings)');
  console.log('==========================================');
  globalThis.__TIKDL_DB_STATE__.settingsFindMany = async () => [
    { key: 'siteName', value: 'TikDL Test' },
    { key: 'logoText', value: 'TikDL' },
    { key: 'primaryColor', value: '#FE2C55' },
    { key: 'metaTitle', value: 'TikDL — Free TikTok Downloader' },
    { key: 'maintenanceMode', value: 'false' },
    { key: 'maxFileSize', value: '100' },
    // A SECRET row that must be filtered out by PUBLIC_SETTING_KEYS allowlist
    { key: 'ADMIN_PASSWORD', value: 'should-never-leak-value' },
    { key: 'TIKHUB_API_KEY', value: 'should-never-leak-value' },
  ];

  captureConsoleError();
  const res1 = await routeModule.GET();
  restoreConsoleError();

  assert(res1.status === 200, 'CASE 1: HTTP 200');
  const body1 = await res1.json();
  assert(body1.success === true, 'CASE 1: success=true');
  assert(body1.degraded === undefined, 'CASE 1: no degraded flag on success path');
  assert(body1.error === undefined, 'CASE 1: no error string on success path');
  assert(typeof body1.settings === 'object' && body1.settings !== null, 'CASE 1: settings is object');
  assert(body1.settings.siteName === 'TikDL Test', 'CASE 1: siteName returned');
  assert(body1.settings.logoText === 'TikDL', 'CASE 1: logoText returned');
  assert(body1.settings.primaryColor === '#FE2C55', 'CASE 1: primaryColor returned');
  assert(body1.settings.maintenanceMode === 'false', 'CASE 1: maintenanceMode returned');
  assert(body1.settings.ADMIN_PASSWORD === undefined, 'CASE 1: ADMIN_PASSWORD filtered out by allowlist');
  assert(body1.settings.TIKHUB_API_KEY === undefined, 'CASE 1: TIKHUB_API_KEY filtered out by allowlist');
  assert(consoleErrorCalls.length === 0, 'CASE 1: console.error NOT called on success path');
  // Verify Cache-Control header preserved
  const cache1 = res1.headers.get('Cache-Control');
  assert(typeof cache1 === 'string' && cache1.includes('no-store'), 'CASE 1: Cache-Control: no-store header present');
  assertNoSecrets('CASE 1 response body', body1);

  // CASE 2 — DB returns empty settings
  console.log('\n==========================================');
  console.log('CASE 2 — DB returns empty settings (no settings configured yet)');
  console.log('==========================================');
  globalThis.__TIKDL_DB_STATE__.settingsFindMany = async () => [];

  captureConsoleError();
  const res2 = await routeModule.GET();
  restoreConsoleError();

  assert(res2.status === 200, 'CASE 2: HTTP 200');
  const body2 = await res2.json();
  assert(body2.success === true, 'CASE 2: success=true');
  assert(body2.degraded === undefined, 'CASE 2: no degraded flag');
  assert(typeof body2.settings === 'object' && Object.keys(body2.settings).length === 0, 'CASE 2: settings={} (empty)');
  assert(consoleErrorCalls.length === 0, 'CASE 2: console.error NOT called');
  assertNoSecrets('CASE 2 response body', body2);

  // CASE 3 — DB failure → degraded path
  console.log('\n==========================================');
  console.log('CASE 3 — DB failure (db.settings.findMany throws)');
  console.log('==========================================');
  const dbErr3 = new Error('libSQL: SQLITE_BUSY (synthetic)');
  globalThis.__TIKDL_DB_STATE__.settingsFindMany = async () => { throw dbErr3; };

  captureConsoleError();
  const res3 = await routeModule.GET();
  restoreConsoleError();

  assert(res3.status === 200, 'CASE 3: HTTP 200 (fail-open preserved)');
  const body3 = await res3.json();
  assert(body3.success === true, 'CASE 3: success=true (fail-open preserved)');
  assert(body3.degraded === true, 'CASE 3: degraded=true present');
  assert(typeof body3.error === 'string' && body3.error.length > 0, 'CASE 3: error is non-empty string');
  assert(body3.error === 'Settings temporarily unavailable', 'CASE 3: error message matches expected');
  assert(typeof body3.settings === 'object' && Object.keys(body3.settings).length === 0, 'CASE 3: settings={} (empty fallback)');
  assert(consoleErrorCalls.length === 1, 'CASE 3: console.error called exactly once');
  const errArgs3 = consoleErrorCalls[0] || [];
  const firstArg3 = String(errArgs3[0] || '');
  assert(firstArg3.includes('[Public Settings]'), 'CASE 3: console.error scope tag is [Public Settings]');
  assert(firstArg3.includes('Failed to fetch settings'), 'CASE 3: console.error message includes "Failed to fetch settings"');
  assert(errArgs3[1] === dbErr3, 'CASE 3: console.error second arg is the actual Error object');

  assertNoSecrets('CASE 3 response body', body3);
  assertNoSecrets('CASE 3 console.error args', errArgs3);

  // CASE 4 — Verify Cache-Control header is preserved on degraded path
  console.log('\n==========================================');
  console.log('CASE 4 — Cache-Control: no-store preserved on degraded path');
  console.log('==========================================');
  const cache3 = res3.headers.get('Cache-Control');
  assert(typeof cache3 === 'string' && cache3.includes('no-store'), 'CASE 4: Cache-Control: no-store present on degraded path');
  assert(cache3.includes('must-revalidate'), 'CASE 4: Cache-Control includes must-revalidate');
  assert(cache3.includes('proxy-revalidate'), 'CASE 4: Cache-Control includes proxy-revalidate');
}

try {
  await main();
  console.log('\n========================================');
  console.log('ALL CASES PASSED — config-settings-degraded.mjs');
  console.log('========================================');
  process.exit(0);
} catch (e) {
  console.error('\n========================================');
  console.error('TEST FAILURE — config-settings-degraded.mjs');
  console.error('========================================');
  console.error(e.stack || e.message);
  process.exit(1);
}
