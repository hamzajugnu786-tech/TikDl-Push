/**
 * Phase 2 Regression — /api/config/ads observability (P2-F2 + P2-F3 batch).
 *
 * Verifies the catch-block hardening on the public ads config endpoint:
 *   CASE 1: Normal success path (DB returns empty rows) → HTTP 200,
 *           success:true, NO degraded flag, NO error string, console.error
 *           NOT called.
 *   CASE 2: DB returns one enabled homepage hero ad → ad appears in ads +
 *           inlineAds buckets, no degraded flag.
 *   CASE 3: DB failure (interstitialConfig.findFirst throws) → HTTP 200,
 *           success:true, degraded:true, error string, console.error called
 *           with the [Public Ads Config] scope tag and the actual Error.
 *   CASE 4: DB failure (adPlacement.findMany throws) → same as CASE 3.
 *   CASE 5: Degraded path with ?pages= query → degraded:true, no crash.
 *   SECRET-LEAK: response bodies + console.error args contain no
 *                TIKHUB_API_KEY / RAPIDAPI_KEY / ADMIN_PASSWORD /
 *                DATABASE_URL / AUTH_SECRET values.
 *
 * Strategy: jiti-load the route with stubbed next/server + @/lib/db +
 * @/lib/migrate + @/lib/ad-registry, mock console.error to capture calls.
 *
 * Run via: `npm test` (or `node tests/regression/config-ads-degraded.mjs`)
 *
 * Phase 2 Part 3 hardening — verification harness (P2-F2).
 */

import { resolve } from 'path';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const REPO = process.env.TIKDL_REPO_ROOT || resolve(process.cwd());
const ROUTE_PATH = resolve(REPO, 'src/app/api/config/ads/route.ts');

const testResults = [];
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  testResults.push({ pass: true, msg });
  console.log(`  PASS: ${msg}`);
}

// --- Stubs --------------------------------------------------------------

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

const stubDir = mkdtempSync(resolve(tmpdir(), 'tikdl-config-ads-test-'));

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
  interstitialConfigFindFirst: async () => null,
  adPlacementFindMany: async () => [],
};

const stubDbPath = resolve(stubDir, 'db.mjs');
writeFileSync(stubDbPath, `
export const db = {
  interstitialConfig: {
    findFirst: (...args) => globalThis.__TIKDL_DB_STATE__.interstitialConfigFindFirst(...args),
  },
  adPlacement: {
    findMany: (...args) => globalThis.__TIKDL_DB_STATE__.adPlacementFindMany(...args),
  },
};
`);

const stubMigratePath = resolve(stubDir, 'migrate.mjs');
writeFileSync(stubMigratePath, `
export async function reconcileSchema() { /* no-op for tests */ }
`);

const stubAdRegistryPath = resolve(stubDir, 'ad-registry.mjs');
writeFileSync(stubAdRegistryPath, `
export const GLOBAL_PAGE_KEY = 'all';
export const KNOWN_PAGES = [
  { key: 'homepage', label: 'Homepage' },
  { key: 'about',    label: 'About' },
  { key: 'contact',  label: 'Contact' },
];
export const UNIVERSAL_PLACEMENTS = [
  { id: 'header_banner' },
  { id: 'above_footer' },
];
export const HOMEPAGE_ONLY_PLACEMENTS = [
  { id: 'hero_section' },
  { id: 'between_url_download' },
  { id: 'between_result_recent' },
  { id: 'between_recent_features' },
  { id: 'between_features_faq' },
  { id: 'left_sidebar' },
  { id: 'right_sidebar' },
  { id: 'interstitial_popup' },
  { id: 'native_content' },
  { id: 'history_interval' },
];
`);

const createRequire = (await import('module')).default.createRequire;
const requireFromRepo = createRequire(resolve(REPO, 'package.json'));
const createJiti = requireFromRepo('jiti').default || requireFromRepo('jiti');
const jiti = createJiti(resolve(REPO, 'tsconfig.json'), {
  alias: {
    'next/server':       stubServerPath,
    '@/lib/db':          stubDbPath,
    '@/lib/migrate':     stubMigratePath,
    '@/lib/ad-registry': stubAdRegistryPath,
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

// Pre-flight: snapshot secret env values (DO NOT print them).
const SENSITIVE_ENV_VALUES = [
  process.env.TIKHUB_API_KEY,
  process.env.RAPIDAPI_KEY,
  process.env.ADMIN_PASSWORD,
  process.env.DATABASE_URL,
  process.env.AUTH_SECRET,
].filter(Boolean);

function assertNoSecrets(label, payload) {
  const text = typeof payload === 'string'
    ? payload
    : (() => { try { return JSON.stringify(payload); } catch { return String(payload); } })();
  for (const v of SENSITIVE_ENV_VALUES) {
    if (v && text.includes(v)) {
      throw new Error(`ASSERT FAILED: ${label} leaked a secret env value`);
    }
  }
  if (/(Bearer\s+[A-Za-z0-9_\-]{8,})/i.test(text)) {
    throw new Error(`ASSERT FAILED: ${label} contains a Bearer token pattern`);
  }
  console.log(`  PASS: ${label} contains no secrets`);
}

function makeRequest(url) {
  return new Request(url || 'https://test.local/api/config/ads', { method: 'GET' });
}

async function main() {
  process.env.NODE_ENV = 'production';

  const routeModule = jiti(ROUTE_PATH);
  assert(typeof routeModule.GET === 'function', 'route module exports GET');

  // CASE 1 — Normal success path
  console.log('\n==========================================');
  console.log('CASE 1 — Normal success path (DB returns empty rows)');
  console.log('==========================================');
  globalThis.__TIKDL_DB_STATE__.interstitialConfigFindFirst = async () => null;
  globalThis.__TIKDL_DB_STATE__.adPlacementFindMany = async () => [];

  captureConsoleError();
  const res1 = await routeModule.GET(makeRequest());
  restoreConsoleError();

  assert(res1.status === 200, 'CASE 1: HTTP 200');
  const body1 = await res1.json();
  assert(body1.success === true, 'CASE 1: success=true');
  assert(body1.degraded === undefined, 'CASE 1: no degraded flag on success path');
  assert(body1.error === undefined, 'CASE 1: no error string on success path');
  assert(Array.isArray(body1.ads) && body1.ads.length === 0, 'CASE 1: ads=[]');
  assert(body1.interstitialAd === null, 'CASE 1: interstitialAd=null');
  assert(Array.isArray(body1.sidebarAds) && body1.sidebarAds.length === 0, 'CASE 1: sidebarAds=[]');
  assert(Array.isArray(body1.bannerAds) && body1.bannerAds.length === 0, 'CASE 1: bannerAds=[]');
  assert(Array.isArray(body1.inlineAds) && body1.inlineAds.length === 0, 'CASE 1: inlineAds=[]');
  assert(typeof body1.adsByPage === 'object' && body1.adsByPage !== null, 'CASE 1: adsByPage is object');
  assert(body1.interstitial && body1.interstitial.enabled === true, 'CASE 1: interstitial default config returned');
  assert(consoleErrorCalls.length === 0, 'CASE 1: console.error NOT called on success path');
  assertNoSecrets('CASE 1 response body', body1);

  // CASE 2 — DB returns one enabled homepage hero ad
  console.log('\n==========================================');
  console.log('CASE 2 — DB returns one enabled homepage hero ad');
  console.log('==========================================');
  const fakeAd = {
    id: 'ad-1', name: 'Hero Test', type: 'display',
    page: 'homepage', placement: 'hero_section', position: 'center',
    dimensions: '728x90', adCode: '<!-- HERO -->', priority: 1, enabled: true,
  };
  globalThis.__TIKDL_DB_STATE__.interstitialConfigFindFirst = async () => null;
  globalThis.__TIKDL_DB_STATE__.adPlacementFindMany = async () => [fakeAd];

  captureConsoleError();
  const res2 = await routeModule.GET(makeRequest());
  restoreConsoleError();

  assert(res2.status === 200, 'CASE 2: HTTP 200');
  const body2 = await res2.json();
  assert(body2.success === true, 'CASE 2: success=true');
  assert(body2.degraded === undefined, 'CASE 2: no degraded flag');
  assert(Array.isArray(body2.ads) && body2.ads.length === 1 && body2.ads[0].id === 'ad-1', 'CASE 2: hero ad in ads bucket');
  assert(Array.isArray(body2.inlineAds) && body2.inlineAds.length === 1, 'CASE 2: hero ad in inlineAds bucket');
  assert(consoleErrorCalls.length === 0, 'CASE 2: console.error NOT called');
  assertNoSecrets('CASE 2 response body', body2);

  // CASE 3 — DB failure on interstitialConfig.findFirst
  console.log('\n==========================================');
  console.log('CASE 3 — DB failure (interstitialConfig.findFirst throws)');
  console.log('==========================================');
  const dbErr3 = new Error('Turso: connection reset by peer (synthetic)');
  globalThis.__TIKDL_DB_STATE__.interstitialConfigFindFirst = async () => { throw dbErr3; };
  globalThis.__TIKDL_DB_STATE__.adPlacementFindMany = async () => [];

  captureConsoleError();
  const res3 = await routeModule.GET(makeRequest());
  restoreConsoleError();

  assert(res3.status === 200, 'CASE 3: HTTP 200 (fail-open preserved)');
  const body3 = await res3.json();
  assert(body3.success === true, 'CASE 3: success=true (fail-open preserved)');
  assert(body3.degraded === true, 'CASE 3: degraded=true present');
  assert(typeof body3.error === 'string' && body3.error.length > 0, 'CASE 3: error is non-empty string');
  assert(body3.error === 'Ad configuration temporarily unavailable', 'CASE 3: error message matches expected');
  assert(Array.isArray(body3.ads) && body3.ads.length === 0, 'CASE 3: ads=[]');
  assert(body3.interstitialAd === null, 'CASE 3: interstitialAd=null');
  assert(Array.isArray(body3.sidebarAds) && body3.sidebarAds.length === 0, 'CASE 3: sidebarAds=[]');
  assert(Array.isArray(body3.bannerAds) && body3.bannerAds.length === 0, 'CASE 3: bannerAds=[]');
  assert(Array.isArray(body3.inlineAds) && body3.inlineAds.length === 0, 'CASE 3: inlineAds=[]');
  assert(typeof body3.adsByPage === 'object' && Object.keys(body3.adsByPage).length === 0, 'CASE 3: adsByPage={} (empty)');
  assert(body3.interstitial && body3.interstitial.enabled === true, 'CASE 3: interstitial default config returned');

  assert(consoleErrorCalls.length === 1, 'CASE 3: console.error called exactly once');
  const errArgs3 = consoleErrorCalls[0] || [];
  const firstArg3 = String(errArgs3[0] || '');
  assert(firstArg3.includes('[Public Ads Config]'), 'CASE 3: console.error scope tag is [Public Ads Config]');
  assert(firstArg3.includes('Failed to fetch ads'), 'CASE 3: console.error message includes "Failed to fetch ads"');
  assert(errArgs3[1] === dbErr3, 'CASE 3: console.error second arg is the actual Error object');

  assertNoSecrets('CASE 3 response body', body3);
  assertNoSecrets('CASE 3 console.error args', errArgs3);

  // CASE 4 — DB failure on adPlacement.findMany
  console.log('\n==========================================');
  console.log('CASE 4 — DB failure (adPlacement.findMany throws)');
  console.log('==========================================');
  const dbErr4 = new Error('libSQL: SQLITE_BUSY (synthetic)');
  globalThis.__TIKDL_DB_STATE__.interstitialConfigFindFirst = async () => null;
  globalThis.__TIKDL_DB_STATE__.adPlacementFindMany = async () => { throw dbErr4; };

  captureConsoleError();
  const res4 = await routeModule.GET(makeRequest());
  restoreConsoleError();

  assert(res4.status === 200, 'CASE 4: HTTP 200');
  const body4 = await res4.json();
  assert(body4.success === true, 'CASE 4: success=true');
  assert(body4.degraded === true, 'CASE 4: degraded=true');
  assert(body4.error === 'Ad configuration temporarily unavailable', 'CASE 4: error message matches Part-1 pattern');
  assert(consoleErrorCalls.length === 1, 'CASE 4: console.error called exactly once');
  const errArgs4 = consoleErrorCalls[0] || [];
  assert(String(errArgs4[0]).includes('[Public Ads Config]'), 'CASE 4: scope tag present');
  assert(errArgs4[1] === dbErr4, 'CASE 4: second arg is the actual Error object');
  assertNoSecrets('CASE 4 response body', body4);
  assertNoSecrets('CASE 4 console.error args', errArgs4);

  // CASE 5 — Degraded path with ?pages= query
  console.log('\n==========================================');
  console.log('CASE 5 — Degraded path with ?pages=homepage,about query');
  console.log('==========================================');
  const dbErr5 = new Error('synthetic case 5');
  globalThis.__TIKDL_DB_STATE__.interstitialConfigFindFirst = async () => { throw dbErr5; };

  captureConsoleError();
  const res5 = await routeModule.GET(makeRequest('https://test.local/api/config/ads?pages=homepage,about'));
  restoreConsoleError();

  assert(res5.status === 200, 'CASE 5: HTTP 200');
  const body5 = await res5.json();
  assert(body5.degraded === true, 'CASE 5: degraded=true even with ?pages= query');
  assert(typeof body5.adsByPage === 'object' && Object.keys(body5.adsByPage).length === 0, 'CASE 5: adsByPage empty on degraded path');
  assert(consoleErrorCalls.length === 1, 'CASE 5: console.error called once');
  assertNoSecrets('CASE 5 response body', body5);
}

try {
  await main();
  console.log('\n========================================');
  console.log('ALL CASES PASSED — config-ads-degraded.mjs');
  console.log('========================================');
  process.exit(0);
} catch (e) {
  console.error('\n========================================');
  console.error('TEST FAILURE — config-ads-degraded.mjs');
  console.error('========================================');
  console.error(e.stack || e.message);
  process.exit(1);
}
