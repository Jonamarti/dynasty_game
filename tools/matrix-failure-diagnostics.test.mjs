import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRegressions,renderMarkdown} from './matrix-failure-diagnostics.mjs';
const diff={verdict:'regression',regressions:[{scenario:'lean',from:'na',to:'failed',checks:['research-is-social','techs-are-refined']}]};
const details={scenarios:[{name:'lean',checks:[{id:'research-is-social',status:'failed',detail:'10 alone, 0 together'},{id:'techs-are-refined',status:'failed',detail:'0 refinements'}]}]};
test('links each regressed check to its actual measurement',()=>{const report=summarizeRegressions(diff,details);assert.equal(report.rows.length,2);assert.equal(report.errors.length,0);assert.match(renderMarkdown(report),/10 alone, 0 together/)});
test('does not invent measurements for missing checks',()=>{const report=summarizeRegressions(diff,{scenarios:[]});assert.equal(report.rows.length,0);assert.equal(report.errors.length,2)});
test('detects mismatched statuses',()=>{const report=summarizeRegressions(diff,{scenarios:[{name:'lean',checks:[{id:'research-is-social',status:'passed',detail:'unreliable'}]}]});assert.equal(report.errors.length,2)});
test('rejects malformed inputs',()=>assert.throws(()=>summarizeRegressions({},{}),TypeError));
