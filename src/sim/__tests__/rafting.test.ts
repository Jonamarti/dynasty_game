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
import { canUseRaft } from '../core/Raft.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { toExecutionRecord } from '../persistence/ExecutionRecords.ts';
const geography = earthWorldGeography({ entry: { id: 'earth-present', title: 'Earth', file: 'earth-present.bin', seaLevelMeters: 0, recommended: false },
  raster: decodeWorldRaster(new Uint8Array(readFileSync('public/world/earth-present.bin'))) }, 10);
function fixture() {
  const sim = new Simulation({ seed: 'raft-danube', population: { bands: 1, peoplePerBand: 4 }, world: { width: 64, height: 64, gameHerds: 0, predators: 0 } },
    new IdSpace(), { geography, x: (12.1 + 180) / 360 * 960, y: (90 - 49) / 180 * 480, comarcasWide: 4, comarcasHigh: 4 });
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
