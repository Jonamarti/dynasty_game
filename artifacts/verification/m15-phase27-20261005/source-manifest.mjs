import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const evidence = dirname(fileURLToPath(import.meta.url));
const workspace = process.cwd();
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
function manifest(root) {
  return files(join(root, 'src')).concat(files(join(root, 'tools')))
    .sort().map(path => ({
      path: relative(root, path).replaceAll('\\', '/'),
      sha256: createHash('sha256').update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')).digest('hex'),
    }));
}
const baseline = manifest(join(evidence, 'baseline'));
const final = manifest(join(evidence, 'final'));
const current = new Map(manifest(workspace).map(row => [row.path, row.sha256]));
const mismatches = final.filter(row => current.get(row.path) !== row.sha256);
const allowed = new Set(['src/sim/systems/MovementSystem.ts', 'src/sim/__tests__/slopes.test.ts']);
if (mismatches.some(row => !allowed.has(row.path))) {
  throw new Error('Unexpected snapshot difference: ' + mismatches.map(row => row.path).join(', '));
}
// Undo exactly the documented telemetry-only edit in memory. Equality with
// the frozen file then proves that no other movement code changed while the
// cost cohort was running; no simulation is executed or rewritten here.
const movementPath = 'src/sim/systems/MovementSystem.ts';
const projected = readFileSync(join(workspace, movementPath), 'utf8').replaceAll('\r\n', '\n')
  .replace('const wadingFactor = world.isWadeTile(proposedX, proposedY) ? 0.4 : 1;\n  speed *= factor * wadingFactor;',
    'speed *= factor * (world.isWadeTile(proposedX, proposedY) ? 0.4 : 1);')
  .replace("    // Wading is a separate cost: counting it as part of a downhill slope\n" +
    "    // made crowded's slope check claim that descending no longer helps.\n" +
    "    // Divide out only that applied multiplier; movement and RNG stay intact.\n" +
    "    telemetry.count('step_slope_' + kind + '_ratio', moved / (asked * wadingFactor));",
    "    telemetry.count('step_slope_' + kind + '_ratio', moved / asked);");
const projectedHash = createHash('sha256').update(projected).digest('hex');
if (projectedHash !== final.find(row => row.path === movementPath).sha256) {
  throw new Error('Movement gameplay projection differs from frozen cohort source.');
}
writeFileSync(join(evidence, 'source-manifest.json'), JSON.stringify({
  baselineCommit: 'cf903f7', finalImplementationCommit: '4a0b798', measurementFollowupCommit: '4b05a55',
  normalizedLineEndings: 'LF', baseline, final, finalMatchesWorkspace: mismatches.length === 0,
  measurementOnlyFollowup: mismatches.map(row => ({ ...row, currentSha256: current.get(row.path) })),
  movementGameplayProjectionMatchesFrozenSource: true,
}, null, 2) + '\n');
console.log('Frozen gameplay matches current source; telemetry/test followup isolated; ' + final.length + ' file hashes recorded.');
