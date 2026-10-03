// Evidence parser: keeps new failures and lost applicability distinct.
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
function matrix(input) {
  const rows = [];
  for (const line of input.split(/\r?\n/)) {
    const m = /^\s{2}(\S+)\s+(\d+)\/(\d+)\s+[\d,]+\s+(.+)$/.exec(line);
    if (m) rows.push({ scenario: m[1], passed: +m[2], applicable: +m[3],
      failures: m[4] === '-' ? [] : m[4].split(', ') });
  }
  return rows;
}
const before = matrix(read('baseline-matrix.log'));
const after = matrix(read('final-matrix-pass4.log'));
if (before.length !== 27 || after.length !== 27) throw Error('Incomplete matrix');
const legacy = read('matrix-legacy-applicability.ndjson').split(/\r?\n/)
  .filter(line => line.startsWith('{')).map(line => JSON.parse(line));
if (legacy.length !== 12) throw Error('Incomplete ablation');
const chunks = new Map();
let current;
for (const line of read('final-matrix-pass4.log').split(/\r?\n/)) {
  const title = /^WORLD HEALTH REPORT  -  scenario "([^"]+)"/.exec(line);
  if (title) { current = []; chunks.set(title[1], current); }
  if (current && /^  (?:PASS|FAIL|n\/a)\s/.test(line)) current.push(line);
}
const deltas = after.map(row => {
  const old = before.find(v => v.scenario === row.scenario);
  const previous = legacy.find(v => v.scenario === row.scenario);
  const lostApplicability = [], gainedApplicability = [];
  if (previous) for (const check of previous.checks) {
    const line = chunks.get(row.scenario)?.find(v =>
      v.startsWith('  PASS  ' + check.id) || v.startsWith('  FAIL  ' + check.id) ||
      v.startsWith('  n/a   ' + check.id));
    if (!line) throw Error(`Missing ${row.scenario}/${check.id}`);
    const skipped = line.startsWith('  n/a');
    if (skipped && !check.skipped) lostApplicability.push({ id: check.id, before: check.detail,
      after: line.slice(line.indexOf(check.id) + check.id.length).trim() });
    if (!skipped && check.skipped) gainedApplicability.push({ id: check.id, before: check.detail,
      after: line.slice(line.indexOf(check.id) + check.id.length).trim() });
  }
  return { scenario: row.scenario, applicableBefore: old.applicable,
    applicableAfter: row.applicable,
    addedFailures: row.failures.filter(id => !old.failures.includes(id)),
    removedFailures: old.failures.filter(id => !row.failures.includes(id)),
    lostApplicability, gainedApplicability };
});
const result = { baselineFailures: before.reduce((n, row) => n + row.failures.length, 0),
  currentFailures: after.reduce((n, row) => n + row.failures.length, 0),
  scenarios: 27, applicabilityAuditedScenarios: 12,
  deltas: deltas.filter(row => row.addedFailures.length || row.removedFailures.length ||
    row.lostApplicability.length || row.gainedApplicability.length) };
fs.writeFileSync(path.join(__dirname, 'matrix-final-delta.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
