import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { telemetry } from '../core/Telemetry.ts';
import { createWaterFishSimulation, createWaterLakeSimulation, waterLakeGeography } from '../../../tools/waterFishFixture.ts';

describe('geographic fish placement', () => {
  beforeEach(() => { telemetry.reset(); telemetry.enable(); });
  afterEach(() => { telemetry.disable(); telemetry.reset(); });

  it('reserves a shoal in each available water class when the old draw missed rivers', () => {
    const seed = 'continental-fish-reservation';
    const sim = createWaterFishSimulation(seed);
    const world = sim.world;
    const shallows = world.shoreTiles.filter(tile => world.isShallow(tile.x, tile.y));
    const fresh = shallows.filter(tile => world.isFreshWater(tile.x, tile.y));
    const salt = shallows.filter(tile => world.isSaltWater(tile.x, tile.y));
    expect(fresh.length, 'fixture must include a shallow freshwater course').toBeGreaterThan(0);
    expect(salt.length, 'fixture must include a shallow coastal shelf').toBeGreaterThan(0);

    // Reproduce the former combined-list fishRng loop, including the one
    // amount draw made by ResourceNode after each pick. This seed used to put
    // both configured fishing spots in salt water despite an available river.
    const oldRng = new RNG(`${seed}:geographic-resource:water-fish-test:40:20:60:20:fish`);
    const oldKinds: number[] = [];
    for (let i = 0; i < 2; i++) {
      const spot = oldRng.pick(shallows);
      oldKinds.push(world.isFreshWater(spot.x, spot.y) ? 1 : 2);
      oldRng.range(0.4, 1);
    }
    expect(oldKinds).toEqual([2, 2]);

    const fish = sim.nodes.filter(node => node.kind === 'fish');
    expect(fish).toHaveLength(2);
    expect(fish.some(node => world.isFreshWater(node.x, node.y))).toBe(true);
    expect(fish.some(node => world.isSaltWater(node.x, node.y))).toBe(true);
    for (const node of fish) {
      expect(world.isShallow(node.x, node.y)).toBe(true);
      expect(world.isWalkable(node.x, node.y)).toBe(true);
      expect(world.regionAt(node.x, node.y)).not.toBe(-1);
    }
  });

  it('spawns fish in a generated lake with a dry same-region bank and no river source', () => {
    const geography = waterLakeGeography();
    expect(geography.map.regions.filter(region => (region.features & 1) !== 0)).toHaveLength(0);
    expect(geography.map.regions.filter(region => (region.features & 2) !== 0)).toHaveLength(1);

    const sim = createWaterLakeSimulation('inland-lake-fish');
    const lakeShallows = sim.world.shoreTiles.filter(tile =>
      sim.world.isFreshWater(tile.x, tile.y) && sim.world.isShallow(tile.x, tile.y));
    expect(lakeShallows.length, 'the depression should generate freshwater shallows').toBeGreaterThan(0);
    expect(sim.world.saltShore).toHaveLength(0);

    const fish = sim.nodes.filter(node => node.kind === 'fish');
    expect(fish).toHaveLength(2);
    expect(fish.every(node => sim.world.isFreshWater(node.x, node.y) &&
      sim.world.isShallow(node.x, node.y) && sim.world.isWalkable(node.x, node.y))).toBe(true);
    for (const node of fish) {
      let bank: { x: number; y: number } | undefined;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = node.x + dx, y = node.y + dy;
        if (sim.world.inBounds(x, y) && sim.world.isWalkable(x, y) && !sim.world.isWater(x, y)) {
          bank = { x, y };
          break;
        }
      }
      expect(bank, 'lake fish should have an adjacent dry tile').toBeDefined();
      expect(sim.world.sameRegion(node.x, node.y, bank!.x, bank!.y)).toBe(true);
    }
  });

  it('lets an autonomous hungry fisher route to and harvest a fresh fish node', () => {
    const sim = createWaterFishSimulation('frontier-fresh-fish-ai', {
      world: { treeDensity: 0, berryBushes: 0, wildGrainPatches: 0, gameHerds: 0 },
    });
    const node = sim.nodes.find(candidate => candidate.kind === 'fish' &&
      sim.world.isFreshWater(candidate.x, candidate.y));
    expect(node, 'the geographic spawn reserves an actual freshwater fish').toBeDefined();
    const bank = sim.world.findWalkableNear(node!.x, node!.y, 4);
    expect(bank).toBeDefined();
    expect(sim.world.sameRegion(bank!.x, bank!.y, node!.x, node!.y)).toBe(true);
    const fisher = sim.livingPeople().find(person => !person.isChild)!;
    for (const person of sim.livingPeople()) {
      if (person === fisher) continue;
      sim.order(person, 'rest');
    }
    fisher.isPlayer = false;
    fisher.x = bank!.x + 0.5; fisher.y = bank!.y + 0.5;
    fisher.forgetPlans();
    fisher.needs.hunger = 90; fisher.needs.thirst = 0;
    fisher.needs.fatigue = 0; fisher.needs.cold = 0;
    for (const [item, count] of fisher.inventory.entries()) fisher.inventory.remove(item, count);
    sim.peopleHash.rebuild(sim.livingPeople());
    for (let tick = 0; tick < 1200 && (telemetry.get('harvest_fish') ?? 0) === 0; tick++) sim.step();
    expect(telemetry.get('harvest_fish')).toBeGreaterThan(0);
  }, 20000);
});
