const fs = require('node:fs');
const path = require('node:path');
function read(filename) {
  const rows = [];
  for (const line of fs.readFileSync(path.join(__dirname, filename), 'utf8').split(/\r?\n/)) {
    const match = /^\s{2}(\S+)\s+(\d+)\/(\d+)\s+[\d,]+\s+(.+)$/.exec(line);
    if (match) rows.push({ scenario: match[1], passed: Number(match[2]), applicable: Number(match[3]),
      failures: match[4].trim() === '-' ? [] : match[4].trim().split(/,\s*/) });
  }
  if (rows.length !== 27) throw new Error(`Incomplete matrix: ${filename}, ${rows.length} scenarios`);
  return rows;
}
const before = read('baseline-matrix.log');
const after = read('final-matrix.log');
const differences = after.flatMap((row, index) => JSON.stringify(row) === JSON.stringify(before[index]) ? [] : [{ before: before[index], after: row }]);
const result = { scenarios: after.length, comparison: 'applicable checks, passed counts and ordered failed IDs; throughput excluded; does not compare individual check metrics',
  baselineFailures: before.reduce((sum, row) => sum + row.failures.length, 0),
  finalFailures: after.reduce((sum, row) => sum + row.failures.length, 0), differences, before, after };
fs.writeFileSync(path.join(__dirname, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ scenarios: result.scenarios, baselineFailures: result.baselineFailures, finalFailures: result.finalFailures, differences: differences.length }));
process.exitCode = differences.length ? 1 : 0;
