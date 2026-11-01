import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditE2ERegistry } from './check-e2e-registry.mjs';

function fixture(fn) {
 const root=mkdtempSync(join(tmpdir(),'dynasty-registry-'));
 try {
  mkdirSync(join(root,'e2e')); mkdirSync(join(root,'tools'));
  writeFileSync(join(root,'e2e/a.spec.ts'),'test("a",()=>{});');
  writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{e2e:'playwright test e2e/a.spec.ts'}}));
  writeFileSync(join(root,'tools/e2e-exclusions.json'),JSON.stringify({version:1,exclusions:[]}));
  fn(root);
 } finally { rmSync(root,{recursive:true,force:true}); }
}
test('valid complete registry',()=>fixture(root=>assert.deepEqual(auditE2ERegistry(root).errors,[])));
test('new spec cannot slip into suite silently',()=>fixture(root=>{
 writeFileSync(join(root,'e2e/new.spec.ts'),'test("new",()=>{});');
 assert.match(auditE2ERegistry(root).errors.join('\n'),/Unclassified spec.*new.spec.ts/);
}));
test('excluded functional spec must have reason and issue',()=>fixture(root=>{
 writeFileSync(join(root,'e2e/deferred.spec.ts'),'test("b",()=>{});');
 writeFileSync(join(root,'tools/e2e-exclusions.json'),JSON.stringify({version:1,exclusions:[{
  file:'e2e/deferred.spec.ts',category:'deferred-functional',reason:' ',tracking_issue:0
 }]}));
 const errors=auditE2ERegistry(root).errors.join('\n');
 assert.match(errors,/specific reason/); assert.match(errors,/tracking issue/);
}));
test('duplicate/phantom registration rejected',()=>fixture(root=>{
 writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{e2e:'playwright test e2e/a.spec.ts e2e/a.spec.ts e2e/absent.spec.ts'}}));
 const errors=auditE2ERegistry(root).errors.join('\n');
 assert.match(errors,/Repeated e2e spec/); assert.match(errors,/nonexistent spec/);
}));
test('same spec cannot be registered and excluded',()=>fixture(root=>{
 writeFileSync(join(root,'tools/e2e-exclusions.json'),JSON.stringify({version:1,exclusions:[{
  file:'e2e/a.spec.ts',category:'manual-visual',reason:'Reserved for reviewed visual milestones only.',tracking_issue:9
 }]}));
 assert.match(auditE2ERegistry(root).errors.join('\n'),/both registered and excluded/);
}));