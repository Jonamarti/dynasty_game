import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { World } from '../core/World.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function evolved(seed: string): Simulation {
  const sim = new Simulation({ seed, world: { width: 48, height: 48, treeDensity: 0.1 },
    population: { bands: 2, peoplePerBand: 4 } });
  sim.possessFirst();
  for (let tick = 0; tick < 180; tick++) sim.step();
  return sim;
}

function loadWithoutTouchingSource(source: Simulation): Simulation {
  const beforeIds = source.idSnapshot();
  const beforeRecord = toCheckpointRecord(source);
  const loaded = Simulation.fromCheckpointRecord(wire(beforeRecord));
  expect(source.idSnapshot()).toEqual(beforeIds);
  expect(toCheckpointRecord(source)).toEqual(beforeRecord);
  expect(loaded).not.toBe(source);
  expect(loaded.world).not.toBe(source.world);
  expect(loaded.people[0]).not.toBe(source.people[0]);
  return loaded;
}

function firstDifference(left: unknown, right: unknown, path = '$'): string | null {
  if (Object.is(left, right)) return null;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    const display = (value: unknown) => typeof value === 'number' && Object.is(value, -0) ? '-0' : String(value);
    return `${path}: ${display(left)} !== ${display(right)}`;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length || leftKeys.some(key => !Object.hasOwn(right, key))) {
    return `${path}: keys differ`;
  }
  for (const key of leftKeys) {
    const difference = firstDifference((left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

function expectSameContinuation(source: Simulation, loaded: Simulation, steps: number, checkpoints: number[] = []): void {
  const compareAt = new Set([1, steps, ...checkpoints]);
  for (let i = 0; i < steps; i++) {
    source.step();
    loaded.step();
    if (compareAt.has(i + 1)) {
      // JSON is the persistence boundary; it canonicalizes negative zero just
      // as a real save file does.
      const loadedRecord = wire(toCheckpointRecord(loaded));
      const sourceRecord = wire(toCheckpointRecord(source));
      expect(firstDifference(loadedRecord, sourceRecord),
        `checkpoint differs after continuation tick ${source.time.tick}`)
        .toBeNull();
    }
  }
}

describe('live checkpoint continuation', () => {
  it('continues a real player order across the next daily update with the same IDs, streams, and callback state', () => {
    const source = evolved('live-checkpoint-action');
    const player = source.player!;
    const tree = source.trees.find(candidate => candidate.standing &&
      source.world.sameRegion(player.x, player.y, candidate.x, candidate.y))!;
    expect(tree).toBeDefined();
    player.x = tree.x;
    player.y = tree.y;
    expect(source.order(player, 'chop', { treeId: tree.id })).toBe(true);
    for (let tick = 0; tick < 6; tick++) source.step();
    expect(player.action).toBe('chop');
    expect(tree.chopProgress).toBeGreaterThan(0);

    const mother = source.livingPeople().find(person => person.sex === 'female' && person.spouseId !== null)!;
    expect(mother).toBeDefined();
    const fatherId = mother.spouseId!;
    mother.pregnant = true;
    mother.gestationLeft = 1;
    mother.pregnantBy = fatherId;
    const childrenBefore = [...mother.childIds];

    // Save near a real daily boundary so the continuation exercises both the
    // live route/action state and the once-a-day systems after hydration.
    const ticksPerDay = source.time.snapshot().config.ticksPerDay;
    const untilNextDay = ticksPerDay - (source.time.tick % ticksPerDay);
    const loaded = loadWithoutTouchingSource(source);
    expectSameContinuation(source, loaded, untilNextDay + 8, [untilNextDay]);
    expect(mother.childIds.length).toBe(childrenBefore.length + 1);
  });

  it('rebinds belief callbacks per loaded owner and keeps separate loads independent', () => {
    const source = evolved('live-checkpoint-callback');
    source.player!.curiosityDays = 41;
    const record = wire(toCheckpointRecord(source));
    const first = Simulation.fromCheckpointRecord(record);
    const second = Simulation.fromCheckpointRecord(record);
    const firstPlayer = first.peopleById.get(source.player!.id)!;
    const secondPlayer = second.peopleById.get(source.player!.id)!;
    firstPlayer.curiosityDays = 17;
    secondPlayer.curiosityDays = 29;
    firstPlayer.beliefs.learn('checkpoint:callback', 4, 1, 'own', first.time.tick);
    expect(firstPlayer.curiosityDays).toBe(0);
    expect(secondPlayer.curiosityDays).toBe(29);
    expect(source.player!.curiosityDays).toBe(41);

    const householdId = firstPlayer.householdId!;
    const loadedHousehold = first.householdsById.get(householdId)!;
    const sourceHousehold = source.householdsById.get(householdId)!;
    const renownBefore = loadedHousehold.renown;
    first.social.emit('gift', firstPlayer, null, 0.5, first.time.tick,
      first.peopleHash, first.config.sightRadius);
    expect(loadedHousehold.renown).toBeGreaterThan(renownBefore);
    expect(sourceHousehold.renown).toBe(renownBefore);

    first.world.grass[0]++;
    expect(second.world.grass[0]).toBe(source.world.grass[0]);
    expect(firstPlayer.beliefs.get('checkpoint:callback')).toBeDefined();
    expect(secondPlayer.beliefs.get('checkpoint:callback')).toBeUndefined();

    const corrupt = wire(record) as { version: number };
    corrupt.version = 2;
    expect(() => Simulation.fromCheckpointRecord(corrupt)).toThrow();
  });

  it('hydrates without generation, RNG draws/forks, or ID allocation', () => {
    const source = evolved('live-checkpoint-no-construction');
    const record = wire(toCheckpointRecord(source));
    const nextUint32 = vi.spyOn(RNG.prototype, 'nextUint32');
    const fork = vi.spyOn(RNG.prototype, 'fork');
    const allocate = vi.spyOn(IdSpace.prototype, 'allocate');
    const generate = vi.spyOn(World.prototype as any, 'generate');
    try {
      Simulation.fromCheckpointRecord(record);
      expect(nextUint32).not.toHaveBeenCalled();
      expect(fork).not.toHaveBeenCalled();
      expect(allocate).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    } finally {
      nextUint32.mockRestore();
      fork.mockRestore();
      allocate.mockRestore();
      generate.mockRestore();
    }
  });

  it('restores the stale daily sabotage cache with canonical buildings and preserves its first continuation', () => {
    const source = new Simulation({ seed: 'live-checkpoint-sabotage-cache',
      time: { ticksPerDay: 24, startDay: 7 },
      world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
      population: { bands: 2, peoplePerBand: 4 } });
    const building = new Building(BUILDINGS.windbreak!, 12, 12, source.bands[0]!.id, source.ids);
    source.buildings.push(building);
    source.buildingsById.set(building.id, building);

    for (let tick = 0; tick < 24; tick++) source.step();
    for (const [itemId, count] of Object.entries(building.def.materials)) building.delivered.add(itemId, count);
    building.addWork(building.def.workTicks);
    expect(building.complete).toBe(true);
    for (let tick = 0; tick < 24; tick++) source.step();
    building.damage(1_000);
    expect(building.ruined).toBe(true);

    const cached = (sim: Simulation) => (sim as unknown as { sabotageCache: Map<number, Building[]> }).sabotageCache;
    const expectedIds = [...cached(source)].map(([bandId, buildings]) => [bandId, buildings.map(value => value.id)]);
    expect(expectedIds).toContainEqual([building.ownerBandId, [building.id]]);
    const saved = wire(toCheckpointRecord(source));
    const loaded = Simulation.fromCheckpointRecord(wire(saved));
    expect(wire(toCheckpointRecord(loaded))).toEqual(saved);
    const loadedBuilding = loaded.buildingsById.get(building.id)!;
    expect(loadedBuilding).not.toBe(building);
    expect(loadedBuilding.ruined).toBe(true);
    expect([...cached(loaded)].map(([bandId, buildings]) => [bandId, buildings.map(value => value.id)]))
      .toEqual(expectedIds);
    expect(cached(loaded).get(building.ownerBandId)?.[0]).toBe(loadedBuilding);

    source.step();
    loaded.step();
    expect(wire(toCheckpointRecord(loaded))).toEqual(wire(toCheckpointRecord(source)));
  });

  it('retains a pending player death and continues through taking up succession', () => {
    const source = evolved('live-checkpoint-succession');
    const deceased = source.player!;
    deceased.alive = false;
    source.step(); // settle the estate and create the pending succession offer
    expect(source.succession?.died.id).toBe(deceased.id);
    const loaded = loadWithoutTouchingSource(source);
    expect(loaded.succession?.died.id).toBe(deceased.id);
    expectSameContinuation(source, loaded, 3);

    const sourceHeir = source.takeUpSuccession();
    const loadedHeir = loaded.takeUpSuccession();
    expect(loadedHeir?.id).toBe(sourceHeir?.id);
    expectSameContinuation(source, loaded, 24);
  });
});
