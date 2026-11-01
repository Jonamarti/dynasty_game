import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PINNED_NODE,runtimeRecord,assertSupportedRuntime} from './runtime-contract.mjs';
test('pins Node 22.23.3',()=>assert.equal(PINNED_NODE,'22.23.3'));
test('records V8 and runtime identity',()=>{const r=runtimeRecord('matrix',{node:PINNED_NODE,v8:'12.4'});assert.equal(r.compatible,true);assert.equal(r.v8,'12.4')});
test('rejects Node 23 and 24 without changing baseline',()=>{for(const node of ['23.7.0','24.0.0'])assert.throws(()=>assertSupportedRuntime({node,v8:'12.8'}),/Unsupported Node/)});
test('rejects unreported V8',()=>assert.throws(()=>runtimeRecord('matrix',{node:PINNED_NODE}),/Node and V8/));
