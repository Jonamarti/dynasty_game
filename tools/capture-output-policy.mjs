/**
 * Routine Playwright runs must not use the versioned milestone directory.
 * Check all Dynasty screenshot/capture overrides, not only DYNASTY_CAPTURE_DIR.
 */
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function resolvedWithSymlinks(path) {
  let parent = path;
  const missing = [];
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) return path;
    missing.unshift(basename(parent));
    parent = next;
  }
  return resolve(realpathSync(parent), ...missing);
}

function underOrEqual(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
}

/** @param {NodeJS.ProcessEnv} env @param {string} root */
export function assertSafeCaptureEnvironment(env = process.env, root = process.cwd()) {
  const history = resolve(root, 'artifacts', 'screenshots');
  const realHistory = resolvedWithSymlinks(history);
  for (const [name, value] of Object.entries(env)) {
    if (!/^DYNASTY_.*(?:CAPTURE|SCREENSHOT|SHOTS?)/i.test(name) || !value) continue;
    const candidate = resolve(root, value.replaceAll(String.fromCharCode(92), '/'));
    if (underOrEqual(history, candidate) ||
        underOrEqual(realHistory, resolvedWithSymlinks(candidate))) {
      throw new Error(name + ' must not point inside historical artifacts/screenshots; use Playwright output paths');
    }
  }
}
