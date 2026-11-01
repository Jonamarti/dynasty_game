import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expectedProofs,makeProof,verifyFullGate} from './ci-full-verdict.mjs';

const env={GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'pull_request'};
const ok={contract:'success',unit:'success',matrix:'success',e2e:'success'};
function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'dynasty-global-'));
 try {
  for(const p of expectedProofs()){
   const proof=makeProof(p.kind,p.kind==='unit'?undefined:p.shard,env);
   writeFileSync(join(root,p.file),JSON.stringify(proof));
  }
  fn(root);
 }finally{rmSync(root,{recursive:true,force:true})}
}
test('all nine same-run proofs and successful jobs pass',()=>fixture(root=>{
 const report=verifyFullGate(ok,root,env);
 assert.equal(report.status,'success');assert.equal(report.expected_proofs,9);
}));
test('fails closed for missing, skipped, failed and cancelled jobs',()=>fixture(root=>{
 for(const state of [undefined,'skipped','failure','cancelled','neutral']){
  const report=verifyFullGate({...ok,e2e:state},root,env);
  assert.equal(report.status,'failure');
 }
}));
test('missing shard is not hidden by successful aggregate job',()=>fixture(root=>{
 unlinkSync(join(root,'matrix-3.json'));
 assert.match(verifyFullGate(ok,root,env).errors.join('\n'),/Missing proof: matrix-3/);
}));
test('other SHA, attempt and run ID cannot supply proof',()=>fixture(root=>{
 for(const [key,value] of [['GITHUB_SHA','b'.repeat(40)],['GITHUB_RUN_ID','234'],['GITHUB_RUN_ATTEMPT','2']]){
  const report=verifyFullGate(ok,root,{...env,[key]:value});
  assert.equal(report.status,'failure');
 }
}));
test('duplicate or unexpected artifacts cannot slip in',()=>fixture(root=>{
 writeFileSync(join(root,'matrix-5.json'),'{}');
 assert.match(verifyFullGate(ok,root,env).errors.join('\n'),/Unexpected proof file/);
}));
test('invalid identity and malformed JSON fail',()=>fixture(root=>{
 writeFileSync(join(root,'e2e-2.json'),'{');
 assert.match(verifyFullGate(ok,root,env).errors.join('\n'),/Unreadable proof/);
 writeFileSync(join(root,'e2e-2.json'),JSON.stringify({...makeProof('e2e',2,env),shard:3}));
 assert.match(verifyFullGate(ok,root,env).errors.join('\n'),/Invalid proof identity/);
}));
test('invalid shard rejected at source',()=>{
 assert.throws(()=>makeProof('matrix',5,env),/Unknown proof/);
});
