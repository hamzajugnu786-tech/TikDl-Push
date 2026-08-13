/**
 * Phase 2 Regression — TikHub debug endpoint auth guard (P2-F6).
 *
 * Verifies the /api/debug/tikhub-raw POST handler:
 *   CASE 1: No auth cookie → HTTP 401, NO TikHub API fetch attempted.
 *   CASE 2: Valid admin session cookie → request proceeds, TikHub fetch
 *           attempted with Bearer ${TIKHUB_API_KEY} Authorization header.
 *   CASE 3: Malformed HMAC token → HTTP 401, NO TikHub fetch.
 *   CASE 4: 401 response body + headers contain no TIKHUB_API_KEY,
 *           no ADMIN_PASSWORD, no "Bearer", no "api_key".
 *
 * Strategy: jiti-load the route with stubbed next/headers + next/server,
 * intercept global.fetch so no real network call is made.
 *
 * Run via: `npm test` (or `node tests/regression/tikhub-raw-auth.mjs`)
 *
 * Phase 2 Part 2 hardening — verification harness.
 */

import { resolve } from 'path';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { createHmac, randomBytes } from 'crypto';

// Resolve repo root from CWD so the test is portable across machines.
const REPO = process.env.TIKDL_REPO_ROOT || resolve(process.cwd());
const ROUTE_PATH = resolve(REPO, 'src/app/api/debug/tikhub-raw/route.ts');

const testResults = [];
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  testResults.push({ pass: true, msg });
  console.log(`  PASS: ${msg}`);
}

// --- Stubs -------------------------------------------------------------

globalThis.__mockCookieStore = {};

let tikhubFetchAttempted = false;
let tikhubFetchArgs = null;

const stubDir = mkdtempSync(resolve(tmpdir(), 'tikhub-raw-test-'));
const stubHeadersPath = resolve(stubDir, 'next-headers.mjs');
const stubServerPath = resolve(stubDir, 'next-server.mjs');

writeFileSync(stubHeadersPath, `
export const cookies = async () => ({
  get: (name) => (globalThis.__mockCookieStore && globalThis.__mockCookieStore[name]
    ? { value: globalThis.__mockCookieStore[name] }
    : undefined),
  set: (name, value) => {
    globalThis.__mockCookieStore = globalThis.__mockCookieStore || {};
    globalThis.__mockCookieStore[name] = value;
  },
  delete: (name) => {
    if (globalThis.__mockCookieStore) delete globalThis.__mockCookieStore[name];
  },
});
`);

writeFileSync(stubServerPath, `
class MockNextResponse {
  constructor(body, init = {}) {
    this._body = body;
    this._init = init;
    this.status = init.status ?? 200;
    this.headers = new Map(Object.entries(init.headers || {}));
  }
  static json(data, init = {}) {
    return new MockNextResponse(JSON.stringify(data), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  }
  async json() { return JSON.parse(this._body); }
  async text() { return this._body; }
}
class MockNextRequest {
  constructor(url, init = {}) {
    this.url = url;
    this.init = init;
    this._body = init.body;
  }
  async json() {
    if (typeof this._body === 'string') return JSON.parse(this._body);
    if (this._body && typeof this._body === 'object') return this._body;
    throw new SyntaxError('Unexpected end of JSON input');
  }
}
export { MockNextResponse as NextResponse, MockNextRequest as NextRequest };
`);

const createRequire = (await import('module')).default.createRequire;
const requireFromRepo = createRequire(resolve(REPO, 'package.json'));
const createJiti = requireFromRepo('jiti').default || requireFromRepo('jiti');
const jiti = createJiti(resolve(REPO, 'tsconfig.json'), {
  alias: {
    '@': resolve(REPO, 'src'),
    'next/headers': stubHeadersPath,
    'next/server': stubServerPath,
  },
  interopDefault: true,
});

function makeValidToken(secret) {
  const timestamp = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const message = `${timestamp}.${nonce}`;
  const hmac = createHmac('sha256', secret).update(message).digest('hex');
  return `${message}.${hmac}`;
}

function makeMalformedToken() {
  return `${Date.now()}.${randomBytes(16).toString('hex')}.deadbeef`;
}

// --- Mock global.fetch --------------------------------------------------
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  tikhubFetchAttempted = true;
  tikhubFetchArgs = { url, init };
  return {
    status: 200,
    json: async () => ({
      code: 200,
      message: 'mocked',
      data: { aweme_detail: { aweme_id: 'mock', desc: 'mock' } },
    }),
  };
};

async function main() {
  process.env.ADMIN_PASSWORD = 'test-admin-password-for-p2p2';
  process.env.NODE_ENV = 'production';
  process.env.TIKHUB_API_KEY = 'test-tikhub-key-do-not-leak';

  const routeModule = jiti(ROUTE_PATH);
  const POST = routeModule.POST;
  assert(typeof POST === 'function', 'POST handler is exported');

  // CASE 1 — Unauthenticated request
  console.log('\n==========================================');
  console.log('CASE 1 — Unauthenticated (no cookie) → 401, no TikHub call');
  console.log('==========================================');
  tikhubFetchAttempted = false;
  tikhubFetchArgs = null;
  globalThis.__mockCookieStore = {};

  const MockNextRequest = (await import(stubServerPath)).NextRequest;
  const req1 = new MockNextRequest('http://localhost/api/debug/tikhub-raw', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://www.tiktok.com/@someuser/video/1234567890' }),
  });
  const res1 = await POST(req1);

  assert(res1.status === 401, `CASE 1: status === 401 (got ${res1.status})`);
  assert(tikhubFetchAttempted === false, 'CASE 1: NO TikHub fetch attempted');
  const body1 = await res1.json();
  assert(body1.success === false, 'CASE 1: body.success=false');
  assert(typeof body1.error === 'string' && body1.error.length > 0, 'CASE 1: body.error is non-empty string');

  // CASE 2 — Authenticated admin request
  console.log('\n==========================================');
  console.log('CASE 2 — Valid admin session → auth passes, TikHub fetch attempted');
  console.log('==========================================');
  tikhubFetchAttempted = false;
  tikhubFetchArgs = null;
  const token = makeValidToken(process.env.ADMIN_PASSWORD);
  globalThis.__mockCookieStore = { tikdl_admin_session: token };

  const req2 = new MockNextRequest('http://localhost/api/debug/tikhub-raw', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://www.tiktok.com/@someuser/video/1234567890' }),
  });
  const res2 = await POST(req2);

  assert(res2.status !== 401, `CASE 2: status !== 401 (got ${res2.status})`);
  assert(tikhubFetchAttempted === true, 'CASE 2: TikHub fetch attempted (auth passed)');
  assert(
    tikhubFetchArgs?.init?.headers?.Authorization === `Bearer ${process.env.TIKHUB_API_KEY}`,
    'CASE 2: TikHub call uses production Bearer key correctly'
  );
  const body2 = await res2.json();
  assert(typeof body2.trace === 'object', 'CASE 2: existing trace response shape preserved');

  // CASE 3 — Malformed HMAC token
  console.log('\n==========================================');
  console.log('CASE 3 — Malformed token → 401, no TikHub call');
  console.log('==========================================');
  tikhubFetchAttempted = false;
  globalThis.__mockCookieStore = { tikdl_admin_session: makeMalformedToken() };

  const req3 = new MockNextRequest('http://localhost/api/debug/tikhub-raw', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://www.tiktok.com/@someuser/video/1234567890' }),
  });
  const res3 = await POST(req3);

  assert(res3.status === 401, `CASE 3: status === 401 (got ${res3.status})`);
  assert(tikhubFetchAttempted === false, 'CASE 3: NO TikHub fetch attempted');

  // CASE 4 — No secrets leaked in 401 response
  console.log('\n==========================================');
  console.log('CASE 4 — 401 response contains no secrets');
  console.log('==========================================');
  tikhubFetchAttempted = false;
  globalThis.__mockCookieStore = {};

  const req4 = new MockNextRequest('http://localhost/api/debug/tikhub-raw', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://www.tiktok.com/@someuser/video/1234567890' }),
  });
  const res4 = await POST(req4);

  const body4Str = await res4.text();
  const headerStr = JSON.stringify(Object.fromEntries(res4.headers.entries()));

  assert(!body4Str.includes(process.env.TIKHUB_API_KEY), 'CASE 4: 401 body has no TIKHUB_API_KEY value');
  assert(!headerStr.includes(process.env.TIKHUB_API_KEY), 'CASE 4: 401 headers have no TIKHUB_API_KEY value');
  assert(!body4Str.includes(process.env.ADMIN_PASSWORD), 'CASE 4: 401 body has no ADMIN_PASSWORD value');
  assert(!body4Str.toLowerCase().includes('bearer'), 'CASE 4: 401 body has no "bearer"');
  assert(!body4Str.toLowerCase().includes('api_key'), 'CASE 4: 401 body has no "api_key"');

  globalThis.fetch = originalFetch;
}

try {
  await main();
  console.log('\n========================================');
  console.log('ALL CASES PASSED — tikhub-raw-auth.mjs');
  console.log('========================================');
  process.exit(0);
} catch (e) {
  console.error('\n========================================');
  console.error('TEST FAILURE — tikhub-raw-auth.mjs');
  console.error('========================================');
  console.error(e.stack || e.message);
  process.exit(1);
}
