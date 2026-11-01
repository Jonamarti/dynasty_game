import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflows = ['ci.yml', 'deploy.yml', 'e2e-registry.yml'];
const pin = readFileSync('.nvmrc', 'utf8').trim();

test('all production workflows use the exact shared Node version', () => {
  assert.match(pin, /^\d+\.\d+\.\d+$/);
  for (const name of workflows) {
    const yaml = readFileSync('.github/workflows/' + name, 'utf8');
    const setups = yaml.match(/uses: actions\/setup-node@v4/g) ?? [];
    const pins = yaml.match(/node-version-file: \.nvmrc/g) ?? [];
    assert.ok(setups.length > 0, name + ' must run setup-node');
    assert.equal(pins.length, setups.length, name + ' must use .nvmrc for EVERY setup-node');
    assert.doesNotMatch(yaml, /^\s*node-version:\s*22\s*$/m, name + ' must not float Node 22');
  }
});

test('cross-runtime comparison remains explicitly multi-version', () => {
  const yaml = readFileSync('.github/workflows/runtime-compatibility.yml', 'utf8');
  assert.match(yaml, /matrix:\s*\n\s*node: \['22\.23\.3', '24'\]/);
  assert.match(yaml, /node-version: \{\{ matrix\.node \}\}/);
});
