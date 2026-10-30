#!/usr/bin/env node
// #24: historical milestone captures are immutable during routine Playwright runs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const HISTORICAL = ['artifacts', 'screenshots'].join('/');

function unsafeSource(source) {
  // Reject any reference, including dynamic path construction, to the historical root.
  return source.includes(HISTORICAL) ||
    /artifacts[\\\\\\/]+screenshots/i.test(source);
}

function checkFixture() {
  assert.equal(unsafeSource("const shots = 'artifacts/screenshots/historical';"), true);
  assert.equal(unsafeSource("const shots = 'artifacts\\\\screenshots\\\\old';"), true);
  assert.equal(unsafeSource("test.info().outputPath('captures', '01.png')"), false);
  assert.equal(unsafeSource("const shots = 'artifacts/playwright/captures/spec'"), false);
  console.log('capture guard fixture: ok (unsafe historical path rejected)');
}

checkFixture();
const root = new URL('../e2e/', import.meta.url);
const failures = [];
for (const file of readdirSync(root).filter(name => name.endsWith('.spec.ts'))) {
  const source = readFileSync(new URL(file, root), 'utf8');
  if (unsafeSource(source)) failures.push(join('e2e', file));
}
if (failures.length) {
  console.error('Historical screenshot paths forbidden in ordinary E2E specs:');
  failures.forEach(file => console.error(' - ' + file));
  process.exitCode = 1;
} else {
  console.log('capture guard: no E2E spec references historical screenshots');
}
