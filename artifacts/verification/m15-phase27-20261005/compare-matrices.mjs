import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
function parse(file) {
  const rows = readFileSync(join(root, file), 'utf8').split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s{2}(\S+)\s+(\d+)\/(\d+)\s+[\d,]+\s+(.+)$/);
    if (!match) return [];
    return [{ scenario: match[1], passed: Number(match[2]), applicable: Number(match[3]),
      failed: match[4] === '-' ? [] : match[4].split(', ') }];
  });
  if (!rows.length) throw new Error('Matrix not complete: ' + file);
  return rows;
}
const baseline = parse('baseline-matrix.log');
const finalFile = process.argv.find(value => value.startsWith('--final='))?.slice(8) ?? 'matrix-final-v4.log';
const final = parse(finalFile);
const before = new Map(baseline.map(row => [row.scenario, row]));
const comparison = final.map(row => {
  const previous = before.get(row.scenario);
  return { scenario: row.scenario, baseline: previous ?? null, final: row,
    newFailures: previous ? row.failed.filter(id => !previous.failed.includes(id)) : row.failed,
    absentFailures: previous ? previous.failed.filter(id => !row.failed.includes(id)) : [],
    applicableDelta: previous ? row.applicable - previous.applicable : null,
    // A disappearing failure may have become n/a; the compact matrix cannot
    // distinguish that from a pass. Do not call these checks fixed.
    absenceIsNotEvidenceOfPass: true };
});
const report = { baselineFile: 'baseline-matrix.log', finalFile, baselineCount: baseline.length, finalCount: final.length,
  baselineFailures: baseline.reduce((sum, row) => sum + row.failed.length, 0),
  finalFailures: final.reduce((sum, row) => sum + row.failed.length, 0), comparison };
writeFileSync(join(root, 'matrix-comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
