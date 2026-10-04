const fs = require('node:fs');
const path = require('node:path');
function read(filename) {
  const rows = [];
  const checks = {};
  let current;
  for (const line of fs.readFileSync(path.join(__dirname, filename), 'utf8').split(/\r?\n/)) {
    const header = /WORLD HEALTH REPORT\s+-\s+scenario "([^"]+)"/.exec(line);
    if (header) { current = header[1]; checks[current] = []; }
    const check = /^\s{2}(PASS|FAIL|n\/a)\s+(.+)$/.exec(line);
    if (check && current && !check[2].startsWith('perf-budget')) checks[current].push(check[1] + ' ' + check[2]);
    const match = /^\s{2}(\S+)\s+(\d+)\/(\d+)\s+[\d,]+\s+(.+)$/.exec(line);
    if (match) rows.push({scenario: match[1], passed: Number(match[2]), applicable: Number(match[3]),
      failures: match[4].trim() === '-' ? [] : match[4].trim().split(/,\s*/)});
  }
  if (rows.length !== 27) throw new Error(`Incomplete matrix: ${filename}, ${rows.length} scenarios`);
  // food-news/conflicts intentionally publish only their one targeted check.
  if (Object.keys(checks).length !== 27 || Object.values(checks).some(values => values.length === 0)) throw new Error('Incomplete verbose checks');
  return { rows, checks };
}
const baseline = read('baseline-verbose.log');
const final = read('final-closure-verbose.log');
const before = baseline.rows;
const after = final.rows;
const differences = after.flatMap((row, index) => JSON.stringify(row) === JSON.stringify(before[index]) ? [] : [{before: before[index], after: row}]);
const checkDifferences = Object.keys(final.checks).filter(name => JSON.stringify(final.checks[name]) !== JSON.stringify(baseline.checks[name]));
const result = {scenarios: after.length, comparison: 'applicable checks, passed counts, ordered failed IDs and full verbose PASS/FAIL/n-a metrics; perf-budget and throughput excluded',
  baselineFailures: before.reduce((sum, row) => sum + row.failures.length, 0),
  finalFailures: after.reduce((sum, row) => sum + row.failures.length, 0), differences, checkDifferences, before, after,
  beforeChecks: baseline.checks, afterChecks: final.checks};
fs.writeFileSync(path.join(__dirname, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({scenarios: result.scenarios, baselineFailures: result.baselineFailures, finalFailures: result.finalFailures, differences: differences.length, fullCheckDifferences: checkDifferences}));
process.exitCode = differences.length || checkDifferences.length ? 1 : 0;

