#!/usr/bin/env node
/**
 * TikDL Phase-2 Regression Test Runner
 * =====================================
 * Minimal, dependency-light test runner for the Phase-2 hardening
 * regression suite. Lives inside the repo so `npm test` works on any
 * developer machine and on CI without introducing a heavyweight test
 * framework (Vitest/Jest/Playwright).
 *
 * What this runner does:
 *   1. Discovers every `tests/regression/*.mjs` file.
 *   2. Runs each in a child process so a crash in one doesn't abort the others.
 *   3. Collects exit codes, prints a summary, exits non-zero if any failed.
 *
 * What this runner does NOT do:
 *   - It does not spin up a dev server. Each test is responsible for its
 *     own jiti-based module loading / stubbing (see existing harness style).
 *   - It does not run CI matrix / coverage / snapshot testing.
 *   - It does not require any test framework devDependency.
 *
 * Adding a new regression test:
 *   - Drop a new `tests/regression/<name>.mjs` file.
 *   - It must `process.exit(0)` on success or `process.exit(1)` on failure.
 *   - It will be picked up automatically by this runner.
 *
 * Run via: `npm test` (or `node tests/regression/run-all.mjs`)
 */

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REGRESSION_DIR = resolve(__dirname);

async function listTests() {
  const entries = await readdir(REGRESSION_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.mjs') && e.name !== 'run-all.mjs')
    .map(e => resolve(REGRESSION_DIR, e.name))
    .sort();
}

function runOne(testPath) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [testPath], {
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('close', code => resolve({ testPath, code }));
    child.on('error', err => {
      console.error(`Failed to launch ${testPath}:`, err);
      resolve({ testPath, code: -1 });
    });
  });
}

async function main() {
  const tests = await listTests();
  if (tests.length === 0) {
    console.log('No regression tests found under tests/regression/.');
    process.exit(0);
  }

  console.log('========================================');
  console.log('TikDL Phase-2 Regression Suite');
  console.log('========================================');
  console.log(`Discovered ${tests.length} test file(s):`);
  for (const t of tests) console.log(`  - ${t.replace(process.cwd() + '/', '')}`);
  console.log('');

  const results = [];
  for (const t of tests) {
    console.log(`\n>>> Running ${t.replace(process.cwd() + '/', '')}`);
    console.log('---');
    const r = await runOne(t);
    results.push(r);
  }

  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    const shortPath = r.testPath.replace(process.cwd() + '/', '');
    const ok = r.code === 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${shortPath}`);
    if (ok) passCount++;
    else failCount++;
  }
  console.log('');
  console.log(`${passCount} passed, ${failCount} failed (of ${tests.length} total).`);

  if (failCount > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error('Runner crashed:', err);
  process.exit(2);
});
