#!/usr/bin/env node
/**
 * #24: explicit, non-destructive promotion of reviewed Playwright captures to a
 * new historical milestone. Routine Playwright tests must never call this.
 *
 * Usage: node tools/archive-e2e-milestone.mjs <source-in-artifacts/playwright> <YYYY-MM-DD-slug>
 * The resulting PNGs are ignored by git until explicitly added with git add -f
 * in a separately reviewed milestone PR.
 */
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, realpathSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

function collectPngs(root, dir = root) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlink not allowed in capture source: ' + entry.name);
    if (entry.isDirectory()) files.push(...collectPngs(root, full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) files.push(relative(root, full));
    else throw new Error('Milestone source must contain PNGs only: ' + entry.name);
  }
  return files.sort();
}

export function archiveMilestone(root, source, milestone) {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(milestone)) {
    throw new Error('Milestone must be YYYY-MM-DD-lowercase-slug');
  }
  const date = milestone.slice(0, 10);
  if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid milestone date');
  }

  const workspace = realpathSync(root);
  const outputRoot = resolve(workspace, 'artifacts', 'playwright');
  const sourcePath = resolve(workspace, source);
  if (!inside(outputRoot, sourcePath)) throw new Error('Source must be inside artifacts/playwright');
  if (!existsSync(sourcePath) || !lstatSync(sourcePath).isDirectory()) {
    throw new Error('Source capture directory does not exist');
  }
  const actualSource = realpathSync(sourcePath);
  if (!inside(realpathSync(outputRoot), actualSource)) throw new Error('Source escapes Playwright via symlink');

  const files = collectPngs(actualSource);
  if (!files.length) throw new Error('Source has no PNG images');

  const historical = resolve(workspace, 'artifacts', 'screenshots');
  const destination = join(historical, milestone);
  // mkdir without recursive is an atomic no-overwrite guard for existing milestones.
  mkdirSync(destination);
  for (const file of files) {
    const destinationFile = join(destination, file);
    mkdirSync(dirname(destinationFile), { recursive: true });
    copyFileSync(join(actualSource, file), destinationFile, constants.COPYFILE_EXCL);
  }
  return { destination: relative(workspace, destination).split(sep).join('/'), files };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) {
    console.error('Usage: node tools/archive-e2e-milestone.mjs artifacts/playwright/captures/<spec> YYYY-MM-DD-slug');
    process.exitCode = 2;
  } else {
    try {
      const result = archiveMilestone(process.cwd(), process.argv[2], process.argv[3]);
      console.log('Created new reviewed milestone: ' + result.destination);
      for (const file of result.files) console.log('  ' + file);
      console.log('Commit separately with git add -f ' + result.destination);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
