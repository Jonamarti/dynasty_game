import { describe, expect, it } from 'vitest';
import { lightAt, hearthLight, sourceLightAt } from '../core/Light.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';

describe('measured local light', () => {
  it('uses daylight away from sources and linear falloff around a real hearth', () => {
    const hearth = new Building(BUILDINGS.hearth!, 10, 10, 0);
    hearth.complete = true;
    const hash = new SpatialHash<Building>(); hash.insert(hearth);
    expect(lightAt(10, 10, 0, hash)).toBe(1);
    expect(lightAt(12, 10, 0, hash)).toBe(0.5);
    expect(lightAt(14, 10, 0.2, hash)).toBe(0.2);
    expect(lightAt(100, 100, 0.7, hash)).toBe(0.7);
    expect(lightAt(12, 10, 0.8, hash)).toBe(0.8);
  });
  it('never treats an incomplete fire, ruin or shelter as a light', () => {
    const hearth = new Building(BUILDINGS.hearth!, 10, 10, 0);
    expect(hearthLight(hearth)).toBeNull();
    hearth.complete = true; hearth.durability = 0;
    expect(hearthLight(hearth)).toBeNull();
    const house = new Building(BUILDINGS.mud_hut!, 10, 10, 0);
    house.complete = true;
    expect(hearthLight(house)).toBeNull();
  });
  it('takes the strongest source rather than adding brightness', () => {
    const hash = new SpatialHash<Building>();
    for (let id = 0; id < 3; id++) {
      const hearth = new Building(BUILDINGS.hearth!, 10, 10, 0);
      hearth.complete = true; hash.insert(hearth);
    }
    expect(lightAt(12, 10, 0, hash)).toBe(0.5);
    expect(sourceLightAt({ x: 0, y: 0, radius: 0, strength: 1 }, 0, 0)).toBe(0);
  });
});
