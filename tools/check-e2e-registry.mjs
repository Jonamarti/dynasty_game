#!/usr/bin/env node
/**
 * M16 R26 / #9: every e2e/*.spec.ts must be run by npm run e2e
 * or explicitly excluded with a reviewable reason and tracking issue.
 * Node built-ins only: runs before npm install and works in GitHub Actions.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function auditE2ERegistry(root) {
  const errors = [];
  const packageData = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(root, 'tools/e2e-exclusions.json'), 'utf8'));
  const command = packageData.scripts?.e2e;
  if (typeof command !== 'string' || !/^playwright test(?:\s|$)/.test(command)) {
    errors.push('package.json scripts.e2e must invoke playwright test');
  }
  const tokens = typeof command === 'string' ? command.trim().split(/\s+/) : [];
  const named = tokens.filter(token => token.startsWith('e2e/'));
  const malformed = named.filter(token => !/^e2e\/[A-Za-z0-9_-]+\.spec\.ts$/.test(token));
  for (const token of malformed) errors.push('Malformed e2e argument: ' + token);
  const registered = named.filter(token => /^e2e\/[A-Za-z0-9_-]+\.spec\.ts$/.test(token));
  if (registered.length !== new Set(registered).size) errors.push('Repeated e2e spec in scripts.e2e');
  const registeredSet = new Set(registered);
  const onDisk = readdirSync(join(root, 'e2e'))
    .filter(name => name.endsWith('.spec.ts')).map(name => 'e2e/' + name).sort();
  const onDiskSet = new Set(onDisk);

  if (manifest.version !== 1 || !Array.isArray(manifest.exclusions)) {
    errors.push('tools/e2e-exclusions.json requires version 1 and exclusions array');
  }
  const exceptions = new Map();
  for (const exclusion of Array.isArray(manifest.exclusions) ? manifest.exclusions : []) {
    if (!exclusion || typeof exclusion !== 'object' || Array.isArray(exclusion)) {
      errors.push('Invalid exclusion entry');
      continue;
    }
    const { file, category, reason, tracking_issue: issue } = exclusion;
    if (typeof file !== 'string' || !/^e2e\/[A-Za-z0-9_-]+\.spec\.ts$/.test(file)) {
      errors.push('Exclusion has invalid path: ' + String(file));
      continue;
    }
    if (exceptions.has(file)) errors.push('Repeated exclusion: ' + file);
    if (category !== 'manual-visual' && category !== 'deferred-functional') {
      errors.push('Invalid exclusion category: ' + file);
    }
    if (typeof reason !== 'string' || reason.trim().length < 25) {
      errors.push('Exclusion lacks a specific reason: ' + file);
    }
    if (!Number.isSafeInteger(issue) || issue < 1) {
      errors.push('Exclusion lacks tracking issue: ' + file);
    }
    exceptions.set(file, exclusion);
    if (!onDiskSet.has(file)) errors.push('Exclusion references a nonexistent spec: ' + file);
    if (registeredSet.has(file)) errors.push('Spec both registered and excluded: ' + file);
  }
  for (const file of registeredSet) if (!onDiskSet.has(file)) {
    errors.push('scripts.e2e references a nonexistent spec: ' + file);
  }
  for (const file of onDisk) if (!registeredSet.has(file) && !exceptions.has(file)) {
    errors.push('Unclassified spec (R26): ' + file);
  }
  if (registeredSet.size === 0) errors.push('scripts.e2e contains no specs');
  const deferred = [...exceptions.values()].filter(e => e.category === 'deferred-functional').length;
  return {
    version: 1,
    total: onDisk.length,
    registered: registeredSet.size,
    manual_visual: exceptions.size - deferred,
    deferred_functional: deferred,
    registered_files: [...registeredSet].sort(),
    excluded_files: [...exceptions.keys()].sort(),
    errors,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(new URL('..', import.meta.url).pathname);
  const report = auditE2ERegistry(root);
  const jsonIndex = process.argv.indexOf('--json');
  if (jsonIndex !== -1 && process.argv[jsonIndex + 1]) {
    writeFileSync(resolve(process.argv[jsonIndex + 1]), JSON.stringify(report, null, 2) + '\n');
  }
  console.log('E2E registry: ' + report.registered + '/' + report.total + ' registered, ' +
              report.deferred_functional + ' deferred functional, ' +
              report.manual_visual + ' manual visual.');
  for (const error of report.errors) console.error('E2E registry ERROR: ' + error);
  if (report.errors.length) process.exitCode = 1;
}
