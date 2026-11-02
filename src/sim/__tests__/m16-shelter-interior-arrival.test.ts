import { describe, expect, it } from 'vitest';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { isUnderRoof } from '../systems/LifeSystem.ts';
import { shelterNeedsEntry } from '../systems/ActionSystem.ts';

describe('M16: shelter only warms people inside a covered roof', () => {
  it('must move beyond the outside wall of a mud hut before counting shelter', () => {
    const hut = new Building(BUILDINGS.mud_hut!, 20, 20, 1);
    hut.complete = true;
    const wall = { x: 20.5, y: 21.5 };
    const room = { x: hut.centerX, y: hut.centerY };

    // reachBuilding accepts the footprint, including its wall tiles.
    expect(hut.contains(wall.x, wall.y)).toBe(true);
    expect(isUnderRoof(hut, wall.x, wall.y)).toBe(false);
    expect(shelterNeedsEntry(hut, wall.x, wall.y)).toBe(true);

    expect(isUnderRoof(hut, room.x, room.y)).toBe(true);
    expect(shelterNeedsEntry(hut, room.x, room.y)).toBe(false);
  });

  it('also requires an actual roofed lean-to footprint before claiming shelter', () => {
    const lean = new Building(BUILDINGS.lean_to!, 20, 20, 1);
    lean.complete = true;
    expect(shelterNeedsEntry(lean, 19.5, 20.5)).toBe(true);
    expect(shelterNeedsEntry(lean, lean.centerX, lean.centerY)).toBe(false);
  });

  it('preserves the legacy windbreak proximity rule', () => {
    const windbreak = new Building(BUILDINGS.windbreak!, 20, 20, 1);
    windbreak.complete = true;
    expect(shelterNeedsEntry(windbreak, 19.5, 20.5)).toBe(false);
  });
});
