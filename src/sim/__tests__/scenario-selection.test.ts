import { describe, expect, it } from 'vitest';
import { selectScenarios } from '../../../tools/scenario-selection.ts';

describe('verification area selection', () => {
  const scenarios = [
    { name: 'local', areas: ['world'] },
    { name: 'long', areas: ['world'], slow: true },
    { name: 'other', areas: ['objects'] },
  ];
  it('selects an area, preserves order, and includes slow worlds only explicitly', () => {
    expect(selectScenarios(scenarios, 'world').map(s => s.name)).toEqual(['local']);
    expect(selectScenarios(scenarios, 'world', true).map(s => s.name)).toEqual(['local', 'long']);
    expect(selectScenarios(scenarios).map(s => s.name)).toEqual(['local', 'other']);
    expect(selectScenarios(scenarios, undefined, true)).toEqual(scenarios);
    expect(() => selectScenarios(scenarios, 'typo')).toThrow('Unknown scenario area');
    expect(() => selectScenarios(scenarios, '')).toThrow('Unknown scenario area');
  });
});
