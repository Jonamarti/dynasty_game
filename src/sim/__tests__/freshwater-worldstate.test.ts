import { describe, expect, it } from 'vitest';
import { frontierGeography } from '../../../tools/frontierFixture.ts';
import { WorldState } from '../world/WorldState.ts';
import { fromWorldStateRecord, toWorldStateRecord } from '../persistence/WorldStateRecords.ts';

describe('populated geographic worlds with explicit local water', () => {
  it('constructs a continental band and resumes its root through independent JSON state', () => {
    const state = new WorldState({ seed: 'freshwater-root',
      world: { width: 64, height: 48, gameHerds: 0, predators: 0 },
      population: { bands: 1, peoplePerBand: 6 } },
    { geography: frontierGeography(), start: { x: 40, y: 20 }, comarcasWide: 60, comarcasHigh: 20 });
    expect(state.current.people.length).toBeGreaterThan(0);
    expect(state.current.world.freshShore.length).toBeGreaterThan(0);
    expect(state.current.world.saltShore.length).toBeGreaterThan(0);
    const record = toWorldStateRecord(state);
    const restored = fromWorldStateRecord(JSON.parse(JSON.stringify(record)));
    expect(restored.current.world.waterKind).not.toBe(state.current.world.waterKind);
    expect(restored.current.world.waterSurface).not.toBe(state.current.world.waterSurface);
    for (let tick = 0; tick < 180; tick++) { state.current.step(); restored.current.step(); }
    expect(toWorldStateRecord(restored)).toEqual(toWorldStateRecord(state));
  }, 15000);
});
