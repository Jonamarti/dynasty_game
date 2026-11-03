import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePagesAuthorization } from './pages-authorization.mjs';
const sha='a'.repeat(40);
const run={id:12,run_attempt:1,repository:{full_name:'Jonamarti/dynasty_game'},
 head_repository:{full_name:'Jonamarti/dynasty_game'},name:'CI',event:'push',head_branch:'master',
 status:'completed',conclusion:'success',head_sha:sha};
const args={run,repository:'Jonamarti/dynasty_game',masterSha:sha,
 jobs:[{name:'Full verification verdict',status:'completed',conclusion:'success'}],
 artifacts:[{name:'ci-global-verdict-1',expired:false,size_in_bytes:850}]};
test('validated exact SHA of current master is authorized',()=>assert.equal(evaluatePagesAuthorization(args).allowed,true));
for(const [title,change] of [
 ['PR event',{run:{...run,event:'pull_request'}}],
 ['manual dispatch',{run:{...run,event:'workflow_dispatch'}}],
 ['wrong branch',{run:{...run,head_branch:'development'}}],
 ['failed CI',{run:{...run,conclusion:'failure'}}],
 ['cancelled CI',{run:{...run,conclusion:'cancelled'}}],
 ['unfinished CI',{run:{...run,status:'in_progress'}}],
 ['fork origin',{run:{...run,head_repository:{full_name:'stranger/fork'}}}],
 ['stale SHA',{masterSha:'b'.repeat(40)}],
 ['missing verdict',{jobs:[]}],
 ['skipped verdict',{jobs:[{name:'Full verification verdict',status:'completed',conclusion:'skipped'}]}],
 ['ambiguous verdict',{jobs:[...args.jobs,...args.jobs]}],
 ['missing artifact',{artifacts:[]}],
 ['wrong attempt artifact',{artifacts:[{name:'ci-global-verdict-2',expired:false,size_in_bytes:850}]}],
 ['empty artifact',{artifacts:[{name:'ci-global-verdict-1',expired:false,size_in_bytes:0}]}],
 ['expired artifact',{artifacts:[{name:'ci-global-verdict-1',expired:true,size_in_bytes:850}]}],
 ['duplicate artifact',{artifacts:[...args.artifacts,...args.artifacts]}],
 ['missing results',{jobs:undefined,artifacts:undefined}],
]) test('rejects '+title,()=>assert.equal(evaluatePagesAuthorization({...args,...change}).allowed,false));
