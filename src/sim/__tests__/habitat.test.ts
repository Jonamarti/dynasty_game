import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { findGlobeStart } from '../world/WorldTerrain.ts';
import {
  berryHabitat, grainHabitat, herdHabitat, predatorHabitat, classifyTerrain, classifyGeographicTerrain, beachBandWidth,
  BUSH_FERTILITY_FLOOR, GRAIN_FERTILITY_FLOOR,
} from '../world/Habitat.ts';
import { profileHasResource, GATED_KINDS, geographicResourceAvailable } from '../world/GeographicResources.ts';

describe('habitat rules shared by the generator and the resource profile', () => {
  it('keeps the fertility floors where the generator had them', () => {
    expect(berryHabitat('grass', BUSH_FERTILITY_FLOOR + 0.001)).toBe(true);
    expect(berryHabitat('forest', BUSH_FERTILITY_FLOOR)).toBe(false);
    expect(berryHabitat('hills', 0.9)).toBe(false);
    expect(grainHabitat('grass', GRAIN_FERTILITY_FLOOR + 0.001)).toBe(true);
    expect(grainHabitat('forest', 0.9)).toBe(false); // a stand under the canopy would be one nobody finds
    expect(grainHabitat('grass', GRAIN_FERTILITY_FLOOR)).toBe(false);
  });

  it('classifies the classic cutoffs and the Earth metre bands exactly as World painted them', () => {
    expect(classifyTerrain(0.31, 0.9, 0.32)).toBe('water');
    expect(classifyTerrain(0.33, 0.9, 0.32)).toBe('beach');
    expect(classifyTerrain(0.5, 0.53, 0.32)).toBe('forest');
    expect(classifyTerrain(0.5, 0.52, 0.32)).toBe('grass'); // the forest line is strictly above 0.52
    expect(classifyTerrain(0.7, 0.5, 0.32)).toBe('hills');
    expect(classifyTerrain(0.8, 0.5, 0.32)).toBe('rock');
    const m = 400, sea = 0.32;
    const at = (metres: number) => classifyGeographicTerrain(sea + metres / m, 0.7, 'earth', sea, m);
    expect([at(-1), at(5), at(11), at(499), at(500), at(1499), at(1500)]).toEqual(['water', 'beach', 'forest', 'forest', 'hills', 'hills', 'rock']);
    expect(beachBandWidth('earth', m)).toBeCloseTo(10 / m, 12);
    expect(classifyGeographicTerrain(0.33, 0.7, 'random', sea, m)).toBe('beach');
  });

  it('is what Simulation placed things by: every bush and stand of a generated window stands on habitat, and the herd and hunter rules say what they did', () => {
    const geography = randomWorldGeography('habitat-audit');
    const start = findGlobeStart(geography, 4)!; // dry temperate country: the ground the game opens on
    const sim = new Simulation({ seed: 'habitat-audit', population: { bands: 0 } }, new IdSpace(),
      { geography, x: start.x, y: start.y, comarcasWide: 4, comarcasHigh: 4 });
    const bushes = sim.nodes.filter(n => n.kind === 'berries');
    expect(bushes.length).toBeGreaterThan(0);
    for (const n of bushes) expect(berryHabitat(sim.world.biomeAt(n.x, n.y), sim.world.fertilityAt(n.x, n.y))).toBe(true);
    for (const n of sim.nodes.filter(n => n.kind === 'wild_grain')) {
      expect(grainHabitat(sim.world.biomeAt(n.x, n.y), sim.world.fertilityAt(n.x, n.y))).toBe(true);
    }
    expect(herdHabitat('forest') && herdHabitat('grass') && !herdHabitat('hills')).toBe(true);
    expect(predatorHabitat('hills') && predatorHabitat('forest') && !predatorHabitat('grass')).toBe(true);
  });

  it('asks the same question of a profile as the generator asks of a point, for every gated resource', () => {
    const geography = randomWorldGeography('habitat-gates');
    expect(GATED_KINDS.length).toBeGreaterThan(0);
    for (let y = 20; y < 460; y += 40) for (let x = 5; x < 960; x += 45) {
      const profile = geography.profileAt(x + 0.5, y + 0.5);
      for (const kind of GATED_KINDS) {
        expect(profileHasResource(geography, profile, kind)).toBe(geographicResourceAvailable(geography, x + 0.5, y + 0.5, kind));
      }
    }
  });
});
