import {describe,it,expect} from 'vitest';
import {validateScenarioOutputs} from '../../../tools/scenario-output.ts';
describe('scenario output file safety',()=>{
  it('permits independent disposable output paths',()=>{
    const v=validateScenarioOutputs('matrix.json','diagnostics/report.json','/project');
    expect(v.matrix).toBe('/project/matrix.json');
    expect(v.details).toBe('/project/diagnostics/report.json');
  });
  it('refuses direct and nested pinned fixtures',()=>{
    for(const p of ['fixtures/matrix-baseline.json','fixtures/nested/saved.json','fixtures/../fixtures/switches-off.json']){
      expect(()=>validateScenarioOutputs(p,undefined,'/project')).toThrow(/pinned fixtures/);
    }
  });
  it('refuses output aliasing and bad missing values',()=>{
    expect(()=>validateScenarioOutputs('a.json','a.json','/project')).toThrow(/different output/);
    expect(()=>validateScenarioOutputs('--shard',undefined,'/project')).toThrow(/valid output/);
    expect(()=>validateScenarioOutputs('',undefined,'/project')).toThrow(/valid output/);
  });
});
