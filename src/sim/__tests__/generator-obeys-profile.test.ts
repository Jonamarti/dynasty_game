import { describe, expect, it } from 'vitest';
import { randomWorldGeography, type WorldGeography } from '../world/WorldGeography.ts';
import { comarcaResourceProfile, profileKeyOf, PROFILE_SPAN, type ComarcaResourceProfile } from '../world/ResourceProfile.ts';
import { generateWindow, measureWindow, earthSources } from '../../../tools/resourceMeasure.ts';
import { profileOfStart } from '../core/Simulation.ts';
import { Simulation } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';

/**
 * M15 step 1b (2026-10-08): the detailed generator reads the comarca's resource profile instead of fixed quotas, on a map
 * that is exactly one comarca of a world map. Nothing here touches the classic island, which keeps its quotas and its
 * streams (the determinism and pinned-world tests cover that).
 *
 * Declared before measuring: what a map holds is what its profile promised, to within one node plus 5% (rejection sampling
 * can miss a few); a poorer comarca holds fewer than a richer one of the same world; two builds of one comarca are identical.
 */
type Mapped = Exclude<WorldGeography, { kind: 'legacyIsland' }>;

const near = (placed: number, promised: number): boolean => Math.abs(placed - Math.round(promised)) <= 1 + 0.05 * promised;

/** The first comarca in a scan of the map whose key satisfies `want` (a lattice, so the scan is cheap). */
function find(geography: Mapped, want: (p: ComarcaResourceProfile) => boolean): { cx: number; cy: number; profile: ComarcaResourceProfile } {
  for (let cy = 30; cy < 450; cy += 3) for (let cx = 0; cx < 960; cx += 4) {
    const profile = comarcaResourceProfile(geography, cx, cy);
    if (want(profile)) return { cx, cy, profile };
  }
  throw new Error(`no such comarca on this map: ${want}`);
}

describe('the detailed generator obeys the resource profile (step 1b)', () => {
  const geography = earthSources()[0]!.geography;

  it('puts on a one-comarca map what the profile promised for it', () => {
    const picks = [
      find(geography, p => p.key.relief === 'low' && p.key.moisture >= 4 && p.key.water !== 'dry'),
      find(geography, p => (p.key.relief === 'coast' || p.key.relief === 'bay') && p.nodes.shoals > 5),
      find(geography, p => p.key.relief === 'low' && p.key.moisture === 0 && p.key.water === 'dry'),
      find(geography, p => p.key.relief === 'low' && p.key.moisture === 2 && p.wildGrain),
    ];
    for (const { cx, cy, profile } of picks) {
      const sim = generateWindow(geography, cx + PROFILE_SPAN / 2, cy + PROFILE_SPAN / 2, `obeys:${cx},${cy}`);
      const placed = measureWindow(sim).placed;
      const label = `${cx},${cy} ${JSON.stringify(profile.key)}`;
      expect(near(placed.bushes, profile.nodes.bushes), `${label} bushes ${placed.bushes} vs ${profile.nodes.bushes}`).toBe(true);
      expect(near(placed.herds, profile.nodes.herds), `${label} herds ${placed.herds} vs ${profile.nodes.herds}`).toBe(true);
      expect(near(placed.shoals, profile.nodes.shoals), `${label} shoals ${placed.shoals} vs ${profile.nodes.shoals}`).toBe(true);
      expect(near(placed.wildGrainStands, profile.nodes.wildGrainStands),
        `${label} grain ${placed.wildGrainStands} vs ${profile.nodes.wildGrainStands}`).toBe(true);
    }
  });

  it('gives a riverside more of everything it grows than a desert, and a coast more fish than the woods', () => {
    const wet = find(geography, p => p.key.relief === 'low' && p.key.moisture >= 4 && p.key.water !== 'dry');
    const dry = find(geography, p => p.key.relief === 'low' && p.key.moisture === 0 && p.key.water === 'dry');
    const coast = find(geography, p => (p.key.relief === 'coast' || p.key.relief === 'bay') && p.nodes.shoals > 5);
    const woods = find(geography, p => p.key.relief === 'low' && p.key.moisture >= 4 && p.key.water === 'dry');
    const count = (c: { cx: number; cy: number }) => measureWindow(generateWindow(geography, c.cx + 0.5, c.cy + 0.5, `richer:${c.cx},${c.cy}`)).placed;
    const w = count(wet), d = count(dry), c = count(coast), f = count(woods);
    expect(w.bushes).toBeGreaterThan(d.bushes * 2);
    expect(c.shoals).toBeGreaterThan(f.shoals);
    // The desert is poor, not empty: the profile says so and the map agrees.
    expect(d.bushes).toBeLessThan(w.bushes);
  });

  it('is deterministic: two builds of one comarca hold the same nodes and the same herds', () => {
    const { cx, cy } = find(geography, p => p.key.relief === 'low' && p.key.moisture >= 4 && p.key.water !== 'dry');
    const build = () => {
      const sim = new Simulation({ seed: 'twice', population: { bands: 1, peoplePerBand: 4 } }, new IdSpace(),
        { geography, x: cx + 0.5, y: cy + 0.5, comarcasWide: 1, comarcasHigh: 1 });
      return JSON.stringify([sim.nodes.map(n => [n.kind, n.x, n.y]), sim.animals.map(a => [a.species, a.x, a.y]), sim.people.map(p => [p.x, p.y])]);
    };
    expect(build()).toBe(build());
  });

  it('reads a profile only for a map that is exactly one comarca of the world map', () => {
    const at = (x: number, y: number, wide?: number, high?: number) =>
      profileOfStart({ geography, x, y, comarcasWide: wide, comarcasHigh: high });
    expect(at(100.5, 100.5, 1, 1)).not.toBeNull();
    expect(at(100.5, 100.5)).not.toBeNull(); // one by one is the default extent
    expect(at(100, 100, 1, 1)).toBeNull(); // straddles four comarcas: no single comarca to read
    expect(at(100, 100, 4, 4)).toBeNull(); // an inspection window keeps the fixed quotas
    expect(profileOfStart({ geography: { kind: 'legacyIsland' } as never, x: 0.5, y: 0.5 })).toBeNull();
  });

  it('a generated world follows its profile too', () => {
    const random = randomWorldGeography('obeys-random');
    const { cx, cy, profile } = find(random, p => p.key.relief === 'low' && p.nodes.bushes > 20);
    const placed = measureWindow(generateWindow(random, cx + 0.5, cy + 0.5, 'obeys-random')).placed;
    expect(near(placed.bushes, profile.nodes.bushes)).toBe(true);
    expect(profileKeyOf(random, cx, cy)).toEqual(profile.key);
  });
});
