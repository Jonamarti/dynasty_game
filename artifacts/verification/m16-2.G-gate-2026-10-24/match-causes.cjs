// Match every diff transition that needs a cause line (pass->fail, pass->na,
// na->fail) against the same scenario's verbose capture line.
const fs = require('fs');
const p = 'artifacts/verification/m16-2.G-gate-2026-10-24';
const csv = fs.readFileSync(p + '/transitions.csv', 'utf8').trim().split(/\r?\n/);
const rows = csv.slice(1).map(l => {
  const [scenario, from, to, check] = l.match(/"([^"]*)"/g).map(s => s.slice(1, -1));
  return { scenario, from, to, check };
});
const needing = rows.filter(r =>
  (r.from === 'passed' && r.to === 'failed') ||
  (r.from === 'passed' && r.to === 'na') ||
  (r.from === 'na' && r.to === 'failed'));

function parseVerbose(file) {
  let t;
  try { t = fs.readFileSync(file, 'utf8'); } catch (e) { return new Map(); }
  // simcheck's verbose table glue-strips: "the-wise-avoid-baneberries2 baneberry"
  // meals..." — the check name can run straight into the reason with no space,
  // so match against the exact check names rather than a generic token.
  const allChecks = [...new Set(needing.map(r => r.check))];
  const m0 = new Map();
  const lines = t.split(/\r?\n/);
  for (const line of lines) {
    const sm = /^[ \t]*(PASS|FAIL|n\/a)[ \t]*(.*)$/.exec(line);
    if (!sm) continue;
    const [, status, rest] = sm;
    for (const name of allChecks) {
      if (rest.startsWith(name)) {
        const reason = rest.slice(name.length).trim();
        const e = m0.get(name);
        if (!e || e.status === 'PASS') m0.set(name, { status, reason });
        break;
      }
    }
  }
  return m0;
}

const scenRows = {};
for (const r of needing) (scenRows[r.scenario] = scenRows[r.scenario] || []).push(r);
const out = [];
const missing = [];
for (const [s, rs] of Object.entries(scenRows)) {
  const v = parseVerbose(p + '/verbose-' + s + '.log');
  for (const r of rs) {
    const h = v.get(r.check);
    if (h) out.push({ s, from: r.from, to: r.to, c: r.check, st: h.status, rs: h.reason });
    else missing.push(s + ': ' + r.check);
  }
}
out.sort((a, b) => a.c.localeCompare(b.c) || a.s.localeCompare(b.s));
for (const o of out) console.log(o.s + ' | ' + o.from + '->' + o.to + ' | ' + o.c + ' | ' + o.st + ' | ' + o.rs);
console.log('---MISSING---');
for (const m of missing) console.log(m);
console.log('counted:', out.length, 'missing:', missing.length);
