#!/usr/bin/env node
/** #24: catch both edits to tracked milestones and additions under ignored historic folders. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HISTORY = 'artifacts/screenshots';

function walk(folder) {
  if (!existsSync(folder)) return [];
  const result = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else if (entry.isFile() || entry.isSymbolicLink()) result.push(path);
  }
  return result;
}

/** An empty result means the working tree has not changed historical captures. */
export function checkHistoricalCaptures(cwd = process.cwd()) {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z', '--', HISTORY], { cwd })
      .toString('utf8').split('\0').filter(Boolean).map(p => p.replaceAll('\\', '/'))
  );
  const additions = walk(resolve(cwd, HISTORY))
    .map(path => relative(cwd, path).split(sep).join('/'))
    .filter(path => !tracked.has(path));
  // HEAD comparison catches both staged and unstaged edits to tracked files.
  const diff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', HISTORY], {
    cwd, encoding: 'utf8',
  });
  if (diff.status !== 0) {
    throw new Error('Unable to check historical screenshot diff: ' + (diff.stderr || diff.error));
  }
  return [...new Set([...diff.stdout.split('\n').filter(Boolean), ...additions])].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const unsafe = checkHistoricalCaptures();
  if (unsafe.length) {
    console.error('Historical screenshots were modified or added by E2E:');
    for (const path of unsafe) console.error(' - ' + path);
    process.exitCode = 1;
  } else {
    console.log('history guard: no historical screenshots changed or added');
  }
}
