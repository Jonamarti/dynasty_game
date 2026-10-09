import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeWorldRaster } from '../world/WorldBinary.ts';
import { earthWorldGeography } from '../world/WorldGeography.ts';
import { Simulation } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { Pathfinder, PathStatus } from '../core/Pathfinder.ts';
import { MovementSystem } from '../systems/MovementSystem.ts';
import { RNG } from '../core/RNG.ts';
import { isOnValidGround } from '../../../tools/simcheck.ts';
import { canUseLogboat, canUseRaft } from '../core/Raft.ts';
import { BIOME_ID } from '../core/World.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { toExecutionRecord } from '../persistence/ExecutionRecords.ts';
const geography = earthWorldGeography({ entry: { id: 'earth-present', title: 'Earth', file: 'earth-present.bin', seaLevelMeters: 0, recommended: false },
  raster: decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-present.bin'))) }, 10);
function fixture(lon = 12.1, lat = 49) {
  const sim = new Simulation({ seed: 'raft-danube', population: { bands: 1, peoplePerBand: 4 }, world: { width: 64, height: 64, gameHerds: 0, predators: 0 } },
    new IdSpace(), { geography, x: (lon + 180) / 360 * 960, y: (90 - lat) / 180 * 480, comarcasWide: 4, comarcasHigh: 4 });
  const person = sim.people.find(p => p.alive && !p.isChild)!;
  sim.player = person; person.isPlayer = true; sim.autonomy = 'manual';
  const bank = sim.world.freshShore.find(p => !sim.world.isWater(p.x, p.y))!;
  const other = sim.shoreHash.findNearest(bank.x, bank.y, 64, p => !sim.world.isWater(p.x, p.y) &&
    !sim.world.sameRegion(bank.x, bank.y, p.x, p.y) && sim.world.sameBoatRegion(bank.x, bank.y, p.x, p.y))!;
  expect(other).toBeDefined();
  person.x = bank.x + 0.5; person.y = bank.y + 0.5;
  person.needs.hunger = person.needs.thirst = person.needs.fatigue = person.needs.cold = 0;
  return { sim, person, bank, other };
}
describe('freshwater reed raft', () => {
  it('shows why a deep river needs a raft and finds a route only in boat mode', () => {
    const { sim, person, bank, other } = fixture();
    const path = new Pathfinder(sim.world);
    expect(path.find(bank.x, bank.y, other.x, other.y)).toBe(PathStatus.NoRoute);
    expect(path.find(bank.x, bank.y, other.x, other.y, undefined, -1, 'swim')).toBe(PathStatus.NoRoute);
    expect(path.find(bank.x, bank.y, other.x, other.y, undefined, -1, 'boat')).toBe(PathStatus.Found);
    const option = availableActions(person, { kind: 'ground', ...other }, { world: sim.world, nearWater: true }).find(a => a.id === 'boat');
    expect(option).toMatchObject({ enabled: false, reason: 'A reed raft and cordage knowledge are needed' });
    expect(sim.order(person, 'boat', other)).toBe(false);
    expect(sim.lastRefusal).toContain('reed raft');
    person.inventory.add('raft', 1);
    expect(canUseRaft(person)).toBe(false);
    person.knownTech.add('cordage');
    expect(canUseRaft(person)).toBe(true);
  });
  it('crafts from reeds, sticks and rope, then crosses and disembarks on the opposite bank', () => {
    const { sim, person, other } = fixture();
    person.knownTech.add('cordage'); person.skills.build = 100;
    for (const [item, count] of Object.entries(RECIPES.raft!.ingredients)) person.inventory.add(item, count);
    expect(sim.order(person, 'craft', { recipeId: 'raft' })).toBe(true);
    for (let i = 0; i < 250 && person.action === 'craft'; i++) sim.step();
    expect(person.inventory.count('raft'), JSON.stringify({ action: person.action, timer: person.actionTimer, interruptions: sim.interruptions, inventory: [...person.inventory.entries()] })).toBe(1);
    expect(person.inventory.count('thatch')).toBe(0);
    expect(person.inventory.count('rope')).toBe(0);
    expect(sim.order(person, 'boat', other)).toBe(true);
    let deep = false;
    for (let i = 0; i < 400 && person.action === 'boat'; i++) {
      sim.step();
      deep ||= sim.world.depthAt(person.x, person.y) >= sim.world.swimDepth;
    }
    expect(deep).toBe(true);
    expect(person.alive).toBe(true);
    expect(person.action).toBe('idle');
    expect(sim.world.isWater(person.x, person.y)).toBe(false);
    expect(Math.hypot(person.x - other.x - 0.5, person.y - other.y - 0.5)).toBeLessThan(1);
  });
  it('continues a mid-river checkpoint identically and visibly stops if the raft is lost', () => {
    const { sim, person, other } = fixture();
    person.inventory.add('raft', 1); person.knownTech.add('cordage');
    expect(sim.order(person, 'boat', other)).toBe(true);
    for (let i = 0; i < 200 && !sim.world.isBoatTile(person.x, person.y); i++) sim.step();
    expect(sim.world.isBoatTile(person.x, person.y)).toBe(true);
    const restored = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    sim.step(); restored.step();
    expect(toExecutionRecord(restored)).toEqual(toExecutionRecord(sim));
    person.inventory.remove('raft', 1);
    sim.step();
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason === 'no_raft')).toBe(true);
  });
  it('retreats to dry land after thirst interrupts a committed crossing', () => {
    const { sim, person, other } = fixture();
    person.inventory.add('raft', 1); person.knownTech.add('cordage');
    expect(sim.order(person, 'boat', other)).toBe(true);
    for (let i = 0; i < 200 && !sim.world.isBoatTile(person.x, person.y); i++) sim.step();
    person.needs.thirst = 95;
    sim.step();
    expect(person.order).toBeNull();
    expect(person.action).toBe('boat');
    for (let i = 0; i < 200 && person.action === 'boat'; i++) sim.step();
    expect(sim.world.isWater(person.x, person.y)).toBe(false);
    expect(person.action).toBe('idle');
  });
  it('double-locks the logboat and routes only across sheltered salt-water lanes', () => {
    const { sim, person } = fixture();
    const world = sim.world;
    // Make a narrow, salt-water lane across the fixture map. It is deep enough
    // to be unsafe for a swimmer but shallow enough for a logboat; the map's
    // open sea remains outside the sheltered-lane cutoff.
    const from = { x: 29, y: 32 }, to = { x: 32, y: 32 };
    for (let y = 0; y < world.height; y++) {
      for (let x = 30; x <= 31; x++) {
        const i = world.index(x, y);
        world.biome[i] = BIOME_ID.water;
        world.waterKind![i] = 2;
        world.waterSurface![i] = world.waterLevel;
        world.elevation[i] = world.waterLevel - world.swimDepth * 2;
        world.setWalkable(x, y, false);
      }
    }
    // Keep clean, dry endpoints on either bank even if the seed placed water
    // under one of them before the synthetic lane was cut.
    for (const x of [from.x, to.x]) {
      const i = world.index(x, from.y);
      world.biome[i] = 1; // grass
      world.waterKind![i] = 0;
      world.waterSurface![i] = 0;
      world.elevation[i] = world.waterLevel + 0.02;
      world.setWalkable(x, from.y, true);
    }
    expect(world.isLogboatTile(30, 32)).toBe(true);
    expect(world.sameRegion(from.x, from.y, to.x, to.y)).toBe(false);
    expect(world.sameBoatRegion(from.x, from.y, to.x, to.y)).toBe(false);
    expect(world.sameLogboatRegion(from.x, from.y, to.x, to.y)).toBe(true);
    person.x = from.x + 0.5; person.y = from.y + 0.5;
    const path = new Pathfinder(sim.world);
    expect(path.find(from.x, from.y, to.x, to.y, undefined, -1, 'logboat')).toBe(PathStatus.Found);
    expect(path.find(from.x, from.y, to.x, to.y, undefined, -1, 'boat')).toBe(PathStatus.NoRoute);
    const deep = world.index(33, 32);
    world.biome[deep] = BIOME_ID.water; world.waterKind![deep] = 2; world.waterSurface![deep] = world.waterLevel;
    world.elevation[deep] = world.waterLevel - world.swimDepth * 5; world.setWalkable(33, 32, false);
    expect(world.isLogboatTile(33, 32)).toBe(false);
    expect(availableActions(person, { kind: 'ground', ...to }, { world: sim.world, nearWater: true })
      .find(a => a.id === 'boat')).toMatchObject({ enabled: false, reason: 'A logboat and logboat knowledge are needed' });
    expect(canUseLogboat(person)).toBe(false);
    person.inventory.add('logboat', 1);
    expect(canUseLogboat(person)).toBe(false);
    const itemOnly = availableActions(person, { kind: 'ground', ...to }, { world, nearWater: true })
      .find(a => a.id === 'boat');
    expect(itemOnly).toMatchObject({ enabled: false, reason: 'You need logboat knowledge to use it' });
    expect(sim.order(person, 'boat', to)).toBe(false);
    expect(sim.lastRefusal).toContain('logboat knowledge');
    person.knownTech.add('logboat');
    expect(canUseLogboat(person)).toBe(true);
    expect(RECIPES.logboat).toMatchObject({ ingredients: { wood: 4, rope: 2 }, output: { logboat: 1 }, tech: 'logboat' });
    for (const [item, count] of [...person.inventory.entries()]) person.inventory.remove(item, count);
    person.inventory.add('logboat', 1);
    expect(sim.order(person, 'boat', to)).toBe(true);
    for (let i = 0; i < 1200 && person.action === 'boat'; i++) sim.step();
    expect(person.alive).toBe(true);
    expect(person.action).toBe('idle');
    expect(sim.world.isWater(person.x, person.y)).toBe(false);
    expect(Math.hypot(person.x - to.x - 0.5, person.y - to.y - 0.5)).toBeLessThan(1);
  });

  it('uses the raft for direct controls, stays dry, and loses deep-water safety when the craft is gone', () => {
    const { sim, person } = fixture();
    let deep = -1;
    for (let i = 0; i < sim.world.elevation.length; i++) {
      const x = i % 64, y = Math.floor(i / 64);
      if (x < 63 && sim.world.depthAt(x, y) >= sim.world.swimDepth && sim.world.depthAt(x + 1, y) >= sim.world.swimDepth) { deep = i; break; }
    }
    expect(deep).toBeGreaterThanOrEqual(0);
    person.x = deep % 64 + 0.5; person.y = Math.floor(deep / 64) + 0.5;
    person.inventory.add('raft', 1); person.knownTech.add('cordage'); person.wet = 0;
    const movement = new MovementSystem(sim.world, new RNG('raft-nudge'), new Pathfinder(sim.world));
    const x = person.x;
    expect(movement.nudge(person, 1, 0)).toBeNull();
    expect(person.x).toBeGreaterThan(x);
    expect(person.aboardRaft).toBe(true);
    expect(person.wet).toBe(0);
    expect(isOnValidGround(sim, person)).toBe(true);
    person.needs.fatigue = 100;
    sim.step();
    expect(person.alive).toBe(true);
    person.inventory.remove('raft', 1);
    expect(isOnValidGround(sim, person)).toBe(false);
    expect(movement.nudge(person, 1, 0)).toBe('too_deep');
    sim.step();
    expect(person.alive).toBe(false);
    expect(person.causeOfDeath).toBe('drowned');
  });

});
