import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lastScores } from '../ai/Brain.ts';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const SMALL = {
  seed: 'water-source-consumers',
  world: { width: 48, height: 48, berryBushes: 20, flintOutcrops: 5, deadwood: 10, gameHerds: 2 },
  population: { bands: 1, peoplePerBand: 4 },
};

function sourcesBeside(sim: Simulation) {
  const world = sim.world;
  const person = sim.livingPeople()[0]!;
  const shore = world.shoreTiles.find(tile => {
    if (!world.sameRegion(person.x, person.y, tile.x, tile.y)) return false;
    let wet = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= 1 && world.isWater(tile.x + dx, tile.y + dy)) wet++;
    }
    return wet > 1;
  });
  expect(shore, 'the founder should have a shoreline in their land region').toBeDefined();
  const water: { x: number; y: number }[] = [];
  for (let y = Math.max(0, shore!.y - 1); y <= Math.min(world.height - 1, shore!.y + 1); y++) {
    for (let x = Math.max(0, shore!.x - 1); x <= Math.min(world.width - 1, shore!.x + 1); x++) {
      if (world.isWater(x, y)) water.push({ x, y });
    }
  }
  expect(water.length, 'the shore should have two water tiles within drinking reach').toBeGreaterThan(1);
  const waterKind = new Uint8Array(world.width * world.height);
  const waterSurface = new Float32Array(world.width * world.height).fill(world.waterLevel);
  Object.defineProperty(world, 'waterKind', {
    value: waterKind, enumerable: true, writable: true, configurable: true,
  });
  Object.defineProperty(world, 'waterSurface', {
    value: waterSurface, enumerable: true, writable: true, configurable: true,
  });
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    if (world.isWater(x, y)) waterKind[world.index(x, y)] = 2;
  }
  waterKind[world.index(water[0]!.x, water[0]!.y)] = 1;
  waterKind[world.index(water[1]!.x, water[1]!.y)] = 2;
  sim.shoreHash.rebuild(world.shoreTiles);
  sim.freshShoreHash.rebuild(world.freshShore);
  sim.saltShoreHash.rebuild(world.saltShore);
  person.x = shore!.x;
  person.y = shore!.y;
  return { person, shore: shore!, fresh: water[0]!, salt: water[1]! };
}

describe('fresh and salt water consumers', () => {
  beforeEach(() => {
    telemetry.reset();
    telemetry.enable();
  });

  afterEach(() => {
    telemetry.disable();
    telemetry.reset();
  });

  it('lets an explicit fresh-water order drink beside salt water', () => {
    const sim = new Simulation(SMALL);
    const { person, fresh } = sourcesBeside(sim);
    const bank = sim.freshShoreHash.findNearest(fresh.x, fresh.y, 24);
    expect(bank).toBeDefined();
    person.x = bank!.x;
    person.y = bank!.y;
    person.needs.thirst = 80;
    const beforeHealth = person.health;

    expect(sim.order(person, 'drink', fresh), sim.lastRefusal ?? 'no refusal recorded').toBe(true);
    person.x = person.targetX!;
    person.y = person.targetY!;
    sim.step();

    expect(person.needs.thirst).toBeLessThan(80);
    expect(person.health).toBe(beforeHealth);
    expect(telemetry.get('drink_fresh')).toBeGreaterThan(0);
    expect(telemetry.get('drink_sea')).toBe(0);
  });

  it('makes an explicit salt-water order harmful even when fresh water is nearby', () => {
    const sim = new Simulation(SMALL);
    const { person, salt } = sourcesBeside(sim);
    const bank = sim.saltShoreHash.findNearest(salt.x, salt.y, 24);
    expect(bank).toBeDefined();
    person.x = bank!.x;
    person.y = bank!.y;
    person.needs.thirst = 80;
    const beforeHealth = person.health;

    expect(sim.order(person, 'drink', salt)).toBe(true);
    person.x = person.targetX!;
    person.y = person.targetY!;
    const checkpoint = toCheckpointRecord(sim);
    const restored = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(checkpoint)));
    const traveler = restored.peopleById.get(person.id)!;
    expect(traveler.saltDrinkTarget).toBe(true);
    restored.step();

    expect(traveler.needs.thirst).toBeGreaterThan(80);
    expect(traveler.health).toBe(beforeHealth - 1);
    expect(restored.interruptions.some(stop => stop.personId === person.id && stop.reason === 'salt_water')).toBe(true);
    expect(telemetry.get('drink_sea')).toBe(1);
    expect(telemetry.get('drink_sea_ai')).toBe(0);
  });

  it('does not score a remembered salt shore as a drink target for an NPC', () => {
    const sim = new Simulation(SMALL);
    const { person, shore } = sourcesBeside(sim);
    // Remove the one fresh source, leaving only the known saline shore.
    const waterKind = sim.world.waterKind!;
    waterKind.fill(0);
    for (let y = 0; y < sim.world.height; y++) for (let x = 0; x < sim.world.width; x++) {
      if (sim.world.isWater(x, y)) waterKind[sim.world.index(x, y)] = 2;
    }
    sim.freshShoreHash.rebuild(sim.world.freshShore);
    sim.saltShoreHash.rebuild(sim.world.saltShore);
    person.placeMemory.remember('water', shore.x, shore.y, sim.time.day, 2);
    person.needs.thirst = 90;
    person.order = null;
    lastScores.delete(person.id);

    for (let i = 0; i < 20 && !lastScores.has(person.id); i++) sim.step();

    expect(lastScores.has(person.id)).toBe(true);
    expect(lastScores.get(person.id)?.some(row => row.id === 'drink')).toBe(false);
    expect(telemetry.get('drink_sea_ai')).toBe(0);
  });

  it('reports a disappeared salt source instead of silently drinking nearby fresh water', () => {
    const sim = new Simulation(SMALL);
    const { person, salt } = sourcesBeside(sim);
    person.needs.thirst = 80;
    expect(sim.order(person, 'drink', salt)).toBe(true);
    person.x = person.targetX!; person.y = person.targetY!;
    for (let i = 0; i < sim.world.waterKind!.length; i++) {
      if (sim.world.waterKind![i] === 2) sim.world.waterKind![i] = 1;
    }
    sim.step();
    expect(person.needs.thirst).toBeGreaterThanOrEqual(80);
    expect(telemetry.get('drink_fresh')).toBe(0);
    expect(person.order).toBeNull();
    expect(sim.interruptions.some(n => n.personId === person.id && n.reason === 'no_water')).toBe(true);
  });
});
