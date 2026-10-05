import { readFileSync, writeFileSync } from 'node:fs';

function rows(path) {
  const result = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^  ([a-z][a-z-]*)\s+(\d+)\/(\d+)\s+[\d,]+\s+(.*)$/.exec(line);
    if (!match) continue;
    if (result.has(match[1])) throw new Error(`Duplicate scenario ${match[1]}`);
    result.set(match[1], { passed: Number(match[2]), applicable: Number(match[3]),
      failed: match[4] === '-' ? [] : match[4].split(', ').sort() });
  }
  if (result.size !== 30) throw new Error(`Incomplete matrix: ${result.size}/30 scenarios`);
  return result;
}

const before = rows(process.argv[2]);
const after = rows(process.argv[3]);
const comparison = [...before].map(([name, baseline]) => {
  const final = after.get(name);
  return { name, baseline, final, identical: JSON.stringify(baseline) === JSON.stringify(final) };
});
const result = {
  compared: 'Scenario pass/applicable counts and failed IDs; excludes timings and individual check metrics',
  scenarios: comparison.length,
  baselineFailures: comparison.reduce((sum, row) => sum + row.baseline.failed.length, 0),
  finalFailures: comparison.reduce((sum, row) => sum + (row.final?.failed.length ?? 0), 0),
  differences: comparison.filter(row => !row.identical),
  rows: comparison,
};
writeFileSync(process.argv[4], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
if (result.differences.length) process.exitCode = 1;
