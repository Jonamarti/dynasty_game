#!/usr/bin/env node
// #8: preserve the raw measurements next to each baseline regression.
// This is diagnostic evidence only; no thresholds or baselines are modified.
import {readFileSync,writeFileSync} from 'node:fs';

export function summarizeRegressions(diff, details) {
  if (!diff || !Array.isArray(diff.regressions) ||
      !details || !Array.isArray(details.scenarios)) throw new TypeError('Invalid diagnostic inputs');
  const byScenario=new Map(details.scenarios.map(s=>[s.name,new Map((s.checks||[]).map(c=>[c.id,c]))]));
  const errors=[];
  const rows=[];
  for(const transition of diff.regressions) {
    for(const id of transition.checks) {
      const observed=byScenario.get(transition.scenario)?.get(id);
      if (!observed) {
        errors.push('Missing measurement for '+transition.scenario+'/'+id);
      } else if (observed.status !== transition.to) {
        errors.push('Status mismatch for '+transition.scenario+'/'+id);
      } else {
        rows.push({scenario:transition.scenario,check:id,from:transition.from,to:transition.to,detail:observed.detail});
      }
    }
  }
  return {version:1,verdict:diff.verdict,rows,errors};
}
export function renderMarkdown(report) {
  const escape=s=>String(s).replaceAll('|','\\|').replace(/[\r\n]+/g,' ');
  const lines=['# Scenario regression measurements','',
    'Verdict: **'+report.verdict+'**', 'Regressed checks: '+report.rows.length,'',
    '| Scenario | Check | Before | Now | Actual measurement |',
    '| --- | --- | --- | --- | --- |'];
  for(const r of report.rows) lines.push('| '+[r.scenario,r.check,r.from,r.to,r.detail].map(escape).join(' | ')+' |');
  for(const error of report.errors) lines.push('','ERROR: '+escape(error));
  return lines.join('\n')+'\n';
}
if (process.argv[1]?.endsWith('/matrix-failure-diagnostics.mjs')) {
  const [diffPath,detailsPath,output]=process.argv.slice(2);
  if (!diffPath || !detailsPath || !output) {console.error('Usage: matrix-failure-diagnostics.mjs <diff.json> <details.json> <report.md>');process.exit(2)}
  try{
    const report=summarizeRegressions(JSON.parse(readFileSync(diffPath,'utf8')),JSON.parse(readFileSync(detailsPath,'utf8')));
    writeFileSync(output,renderMarkdown(report));
    console.log('Regression observations: '+report.rows.length);
    if(report.errors.length){report.errors.forEach(e=>console.error(e));process.exitCode=2}
  }catch(e){console.error(String(e));process.exitCode=2}
}
