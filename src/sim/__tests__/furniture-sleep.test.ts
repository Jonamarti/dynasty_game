import { describe, expect, it, vi } from 'vitest';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Inventory } from '../entities/Item.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { RNG } from '../core/RNG.ts';
import { RECIPES, ingredientsFor, missingIngredients } from '../entities/Recipe.ts';
import { assignedSleepSurface, benchConversationBelonging, houseInteriorTiles, seatedOnBench, sleepQualityAt } from '../world/HouseInterior.ts';
import { telemetry } from '../core/Telemetry.ts';
import { FAT_LAMP_FUEL_TICKS, FAT_LAMP_REFILL_FAT } from '../core/FatLamp.ts';
import { fatLampLight, lightAt } from '../core/Light.ts';
import { hearthLight } from '../core/Light.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import type { TimeManager } from '../core/TimeManager.ts';

function fixture() {
  const sim = new Simulation({ seed: 'furniture-sleep-contract',
    world: { width: 64, height: 64, predators: 0, gameHerds: 0 },
    population: { bands: 1, peoplePerBand: 4 } });
  const person = sim.livingPeople().find(candidate => !candidate.isChild)!;
  let house: Building | null = null;
  for (let y = 4; y < sim.world.height - 8 && !house; y++) {
    for (let x = 4; x < sim.world.width - 8; x++) {
      if (!sim.canPlace(BUILDINGS.mud_hut!, x, y)) continue;
      house = sim.place('mud_hut', x, y, person.bandId);
      if (house) break;
    }
  }
  if (!house) throw new Error('could not site a house');
  house.complete = true;
  house.durability = house.def.workTicks;
  const household = sim.householdsById.get(person.householdId!);
  if (!household) throw new Error('fixture person has no household');
  household.homeBuildingId = house.id;
  sim.peopleHash.remove(person);
  person.x = house.centerX;
  person.y = house.centerY;
  person.targetX = person.x;
  person.targetY = person.y;
  sim.peopleHash.insert(person);
  person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
  for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
  return { sim, person, house };
}

function scoreOneBrainTick(sim: Simulation, person: ReturnType<typeof fixture>['person']) {
  const brain = (sim as unknown as { brain: Brain }).brain;
  const score = brain.score.bind(brain);
  let result: ReturnType<Brain['score']> | null = null;
  let context: BrainContext | null = null;
  const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx) => {
    const scored = score(actor, ctx);
    if (actor === person) { result = scored; context = ctx; }
    return scored;
  });
  try { sim.step(); } finally { spy.mockRestore(); }
  if (!result || !context) throw new Error('the controlled actor did not receive a brain score this tick');
  return { ...(result as ReturnType<Brain['score']>), context: context as BrainContext };
}

describe('bedding and beds', () => {
  it('samples a sleeping household member once for comfort and security, not an awake one', () => {
    const { sim, person, house } = fixture();
    person.action = 'sleep';
    person.targetBuildingId = house.id;
    person.mood.recent = [];
    const sample = (sim as unknown as { shareTheHearth(): void }).shareTheHearth.bind(sim);

    sample();

    expect(person.mood.recent.map(entry => entry.channel)).toContain('comfort');
    expect(person.mood.recent.map(entry => entry.channel)).toContain('security');
    expect(person.mood.recent.some(entry => entry.reason === 'slept comfortably')).toBe(true);
    person.mood.recent = [];
    const comfort = person.mood.comfort;
    const security = person.mood.security;
    person.action = 'idle';
    sample();
    expect(person.mood.comfort).toBe(comfort);
    expect(person.mood.security).toBe(security);
    expect(person.mood.recent).toHaveLength(0);
  });

  it('gives exposed sleepers the planned hearth quality while bare ground remains lower', () => {
    expect(sleepQualityAt(null, 0, 0)).toBe(0.7);
    expect(sleepQualityAt(null, 0, 0, [], true)).toBe(0.8);
  });

  it('assigns household members to distinct surfaces in stable person/building order', () => {
    const { sim, person, house } = fixture();
    if (person.householdId === null) throw new Error('fixture person has no household');
    const members = sim.livingPeople().slice(0, 2);
    for (const member of members) member.householdId = person.householdId;
    const firstBed = new Building(BUILDINGS.bed!, 10, 10, person.bandId, sim.ids);
    const secondBed = new Building(BUILDINGS.bed!, 11, 10, person.bandId, sim.ids);
    for (const bed of [firstBed, secondBed]) { bed.hostId = house.id; bed.complete = true; }

    expect(assignedSleepSurface(members[0]!, [...members].reverse(), house, [secondBed, firstBed]))
      .toBe(firstBed);
    expect(assignedSleepSurface(members[1]!, members, house, [firstBed, secondBed]))
      .toBe(secondBed);
    expect(assignedSleepSurface(members[0]!, members, house, [secondBed])).toBe(secondBed);
  });

  it('crafts, places, persists, and rests on a bench at the improved seated rate', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('carpentry');
    person.inventory.add('wood', 2);
    expect(RECIPES.bench).toMatchObject({ tech: 'carpentry', ingredients: { wood: 2 }, output: { bench: 1 } });
    person.inventory.add('bench', 1);
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bench' })).toBe(true);
    for (let tick = 0; tick < 5 && person.inventory.count('bench') > 0; tick++) sim.step();

    const bench = sim.buildings.find(building => building.def.id === 'bench');
    expect(bench).toMatchObject({ hostId: house.id, complete: true });
    expect(availableActions(person, { kind: 'building', x: bench!.x, y: bench!.y, building: bench! },
      { world: sim.world, nearWater: false }).find(option => option.id === 'rest'))
      .toMatchObject({ label: 'Sit and rest', enabled: true });
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const loadedBench = loaded.buildingsById.get(bench!.id)!;
    expect(loadedBench.hostId).toBe(loaded.buildingsById.get(house.id)!.id);

    const sleeper = loaded.peopleById.get(person.id)!;
    sleeper.needs.hunger = sleeper.needs.thirst = 0;
    sleeper.needs.fatigue = 50;
    loaded.peopleHash.remove(sleeper);
    sleeper.x = loadedBench.centerX; sleeper.y = loadedBench.centerY;
    sleeper.targetX = sleeper.x; sleeper.targetY = sleeper.y;
    loaded.peopleHash.insert(sleeper);
    expect(loaded.order(sleeper, 'rest', { buildingId: loadedBench.id })).toBe(true);
    const before = sleeper.needs.fatigue;
    loaded.step();
    expect(before - sleeper.needs.fatigue).toBeGreaterThanOrEqual(0.35 * 1.6);
  });

  it('places a household shelf, stores and retrieves goods through the ordinary store contract, and saves its inventory', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('carpentry');
    person.inventory.add('shelf', 1);
    person.inventory.add('berries', 3);
    expect(RECIPES.shelf).toMatchObject({ tech: 'carpentry', ingredients: { wood: 2 }, output: { shelf: 1 } });
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'shelf' })).toBe(true);
    for (let tick = 0; tick < 5 && person.inventory.count('shelf') > 0; tick++) sim.step();

    const shelf = sim.buildings.find(building => building.def.id === 'shelf')!;
    expect(shelf).toMatchObject({ hostId: house.id, complete: true });
    expect(shelf.def.storage).toBe(20);
    expect(sim.storeItem(person, shelf, 'berries', 3)).toBe(3);
    expect(shelf.store.count('berries')).toBe(3);
    expect(sim.takeItem(person, shelf, 'berries', 2)).toBe(2);
    expect(person.inventory.count('berries')).toBe(2);

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const loadedShelf = loaded.buildingsById.get(shelf.id)!;
    expect(loadedShelf.hostId).toBe(loaded.buildingsById.get(house.id)!.id);
    expect(loadedShelf.store.count('berries')).toBe(1);
    expect(availableActions(person, { kind: 'building', x: shelf.x, y: shelf.y, building: shelf },
      { world: sim.world, nearWater: false }).filter(option => option.id === 'store' || option.id === 'take'))
      .toMatchObject([{ id: 'store', enabled: true }, { id: 'take', enabled: true }]);
  });

  it('recognizes a seated family member as bench company and rewards their conversation', () => {
    const { sim, person, house } = fixture();
    const family = sim.livingPeople().find(candidate => candidate.id !== person.id && !candidate.isChild)!;
    family.householdId = person.householdId;
    const bench = new Building(BUILDINGS.bench!, house.centerX, house.centerY, person.bandId, sim.ids);
    bench.hostId = house.id; bench.complete = true;
    sim.buildings.push(bench); sim.buildingsById.set(bench.id, bench); sim.buildingHash.insert(bench);
    family.action = 'rest'; family.targetBuildingId = bench.id;
    sim.peopleHash.remove(family);
    family.x = bench.centerX; family.y = bench.centerY;
    family.targetX = family.x; family.targetY = family.y;
    sim.peopleHash.insert(family);
    expect(seatedOnBench(family, sim.buildingsById)).toBe(bench);
    expect(seatedOnBench(person, sim.buildingsById)).toBeNull();
    expect(benchConversationBelonging(person, family, sim.buildingsById)).toBe(2);
    const householdId = family.householdId;
    family.action = 'idle';
    expect(seatedOnBench(family, sim.buildingsById)).toBeNull();
    expect(benchConversationBelonging(person, family, sim.buildingsById)).toBe(0);
    family.action = 'rest';
    family.householdId = null;
    expect(benchConversationBelonging(person, family, sim.buildingsById)).toBe(0);
    family.householdId = householdId;
  });

  it('crafts, lights, saves, burns and refills a household fat lamp without making heat', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('fat_lamp');
    person.isPlayer = true;
    person.inventory.add('fat_lamp', 1);
    person.inventory.add('fat', FAT_LAMP_REFILL_FAT);
    expect(RECIPES.fat_lamp).toMatchObject({ tech: 'fat_lamp', ingredients: { flint: 1, fat: 2 }, output: { fat_lamp: 1 } });
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fat_lamp' })).toBe(true);
    sim.step();
    const lamp = sim.buildings.find(building => building.def.id === 'fat_lamp')!;
    expect(sim.buildingAt(lamp.x, lamp.y)).toBe(lamp); // The furniture target must outrank its house footprint.
    expect(lamp).toMatchObject({ hostId: house.id, complete: true, fuelRemaining: FAT_LAMP_FUEL_TICKS, playerPlaced: true });
    expect(fatLampLight(lamp)).toMatchObject({ radius: 3, strength: 0.9 });
    expect(lightAt(lamp.centerX, lamp.centerY, 0, sim.buildingHash)).toBeCloseTo(0.9);
    const beyondWall = { x: house.x - 0.5, y: house.centerY };
    expect(Math.hypot(beyondWall.x - lamp.centerX, beyondWall.y - lamp.centerY)).toBeLessThan(3);
    expect(lightAt(beyondWall.x, beyondWall.y, 0, sim.buildingHash)).toBe(0);

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const loadedLamp = loaded.buildingsById.get(lamp.id)!;
    expect(loadedLamp.fuelRemaining).toBe(FAT_LAMP_FUEL_TICKS);
    loadedLamp.fuelRemaining = 2;
    loaded.time.tick = 0;
    loaded.step();
    expect(loadedLamp.fuelRemaining).toBe(1);
    loaded.step();
    expect(loadedLamp.fuelRemaining).toBe(0);
    expect(fatLampLight(loadedLamp)).toBeNull();

    const owner = loaded.peopleById.get(person.id)!;
    owner.needs.hunger = owner.needs.thirst = owner.needs.cold = 0;
    owner.inventory.add('fat', FAT_LAMP_REFILL_FAT);
    loaded.peopleHash.remove(owner);
    owner.x = loadedLamp.centerX; owner.y = loadedLamp.centerY;
    owner.targetX = owner.x; owner.targetY = owner.y;
    loaded.peopleHash.insert(owner);
    telemetry.reset(); telemetry.enable();
    try {
      expect(loaded.order(owner, 'refuel_lamp', { buildingId: loadedLamp.id })).toBe(true);
      expect(owner.action).toBe('refuel_lamp');
      loaded.step();
      expect(telemetry.get('fat_lamp_refuelled'), JSON.stringify({ action: owner.action, order: owner.order,
        refusal: loaded.lastRefusal, lamp: loadedLamp.fuelRemaining })).toBe(1);
    } finally { telemetry.disable(); }
    expect(loadedLamp.fuelRemaining).toBe(FAT_LAMP_FUEL_TICKS);
    expect(owner.inventory.count('fat')).toBe(2);
    expect(loadedLamp.def.shelter).toBe(0); // It is a light source, never a heat source.
  });

  it('explains why a lamp cannot be refuelled without fuel or at another household’s home', () => {
    const { sim, person, house } = fixture();
    const lamp = new Building(BUILDINGS.fat_lamp!, house.x + 1, house.y + 1, person.bandId, sim.ids);
    lamp.hostId = house.id; lamp.complete = true; lamp.fuelRemaining = 0;
    sim.buildings.push(lamp); sim.buildingsById.set(lamp.id, lamp); sim.buildingHash.insert(lamp);
    const option = () => availableActions(person, { kind: 'building', x: lamp.x, y: lamp.y, building: lamp }, {
      world: sim.world, nearWater: false,
      homeBuildingId: person.householdId === null ? null : sim.householdsById.get(person.householdId)?.homeBuildingId ?? null,
      buildings: sim.buildings,
    }).find(candidate => candidate.id === 'refuel_lamp');
    expect(option()).toMatchObject({ enabled: false, reason: 'You need 2 fat to refill the lamp' });
    expect(sim.order(person, 'refuel_lamp', { buildingId: lamp.id })).toBe(false);
    expect(sim.lastRefusal).toBe('You need 2 fat to refill the lamp');
    person.inventory.add('fat', FAT_LAMP_REFILL_FAT);
    expect(option()).toMatchObject({ enabled: true });
    const otherHouse = new Building(BUILDINGS.mud_hut!, house.x + 12, house.y, person.bandId, sim.ids);
    otherHouse.complete = true;
    sim.buildings.push(otherHouse); sim.buildingsById.set(otherHouse.id, otherHouse); sim.buildingHash.insert(otherHouse);
    sim.householdsById.get(person.householdId!)!.homeBuildingId = otherHouse.id;
    expect(sim.order(person, 'refuel_lamp', { buildingId: lamp.id })).toBe(false);
    expect(sim.lastRefusal).toBe('That lamp is not in your household’s home');
    expect(option()).toMatchObject({ enabled: false, reason: 'That lamp is not in your household’s home' });
  });

  it('autonomously refills only its own NPC lamp, carrying two household fats from a home shelf when needed', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('fat_lamp');
    person.isPlayer = true;
    sim.autonomy = 'manual';
    const lamp = new Building(BUILDINGS.fat_lamp!, house.centerX, house.centerY, person.bandId, sim.ids);
    lamp.hostId = house.id; lamp.complete = true; lamp.fuelRemaining = 0;
    sim.buildings.push(lamp); sim.buildingsById.set(lamp.id, lamp); sim.buildingHash.insert(lamp);

    // Carried fat is consumed through the same explicit refill action.
    person.inventory.add('fat', FAT_LAMP_REFILL_FAT);
    const carried = scoreOneBrainTick(sim, person);
    expect(carried.scores.some(row => row.id === 'refuel_lamp')).toBe(true);
    expect(carried.found.lampToRefuel).toBe(lamp);
    person.isPlayer = false;
    const brain = (sim as unknown as { brain: Brain }).brain;
    expect(brain.think(person, carried.context, new Set(['refuel_lamp']))).toBe('refuel_lamp');
    expect(person.targetBuildingId).toBe(lamp.id);
    sim.step();
    expect(lamp.fuelRemaining).toBe(FAT_LAMP_FUEL_TICKS);
    expect(person.inventory.count('fat')).toBe(0);
    person.isPlayer = true;
    person.clearTarget(); person.action = 'idle'; person.commitment = null;

    // Burn the charge out, then prove the scorer will take the exact household
    // stack rather than a generic food larder or any unrelated store.
    lamp.fuelRemaining = 0;
    person.inventory.remove('fat', FAT_LAMP_REFILL_FAT);
    const shelf = new Building(BUILDINGS.shelf!, house.centerX + 1, house.centerY, person.bandId, sim.ids);
    shelf.hostId = house.id; shelf.complete = true; shelf.store.add('fat', 2);
    sim.buildings.push(shelf); sim.buildingsById.set(shelf.id, shelf); sim.buildingHash.insert(shelf);
    const stored = scoreOneBrainTick(sim, person);
    expect(stored.found.lampToRefuel).toBe(lamp);
    expect(stored.found.lampFatStore).toBe(shelf);
    expect(stored.found.takeItemId).toBe('fat');
    expect(stored.found.takeItemCount).toBe(FAT_LAMP_REFILL_FAT);
    expect(stored.scores.some(row => row.id === 'take')).toBe(true);
    expect(shelf.store.count('fat')).toBe(FAT_LAMP_REFILL_FAT);
    person.isPlayer = false;
    expect(brain.think(person, stored.context, new Set(['take']))).toBe('take');
    expect(person.targetBuildingId).toBe(shelf.id);
    expect(person.targetItemId).toBe('fat');
    expect(person.targetItemCount).toBe(FAT_LAMP_REFILL_FAT);
    expect(shelf.store.count('fat')).toBe(FAT_LAMP_REFILL_FAT);
  });

  it('brings a partial physical-fat stack to its own lamp shelf without storing the rest of its pack', () => {
    const { sim, person, house } = fixture();
    person.isPlayer = true;
    sim.autonomy = 'manual';
    const lamp = new Building(BUILDINGS.fat_lamp!, house.centerX, house.centerY, person.bandId, sim.ids);
    lamp.hostId = house.id; lamp.complete = true; lamp.fuelRemaining = 0;
    sim.buildings.push(lamp); sim.buildingsById.set(lamp.id, lamp); sim.buildingHash.insert(lamp);
    const shelf = new Building(BUILDINGS.shelf!, house.centerX + 1, house.centerY, person.bandId, sim.ids);
    shelf.hostId = house.id; shelf.complete = true;
    sim.buildings.push(shelf); sim.buildingsById.set(shelf.id, shelf); sim.buildingHash.insert(shelf);

    // Deer and boar hunting adds actual fat to this inventory; this route
    // carries that one-unit yield into the existing household storage system.
    person.inventory.add('fat', 1);
    person.inventory.add('berries', 2);
    const scored = scoreOneBrainTick(sim, person);
    expect(scored.found.lampToRefuel).toBe(lamp);
    expect(scored.found.storeTarget).toBe(shelf);
    expect(scored.found.storeItemId).toBe('fat');
    expect(scored.found.storeItemCount).toBe(1);

    const brain = (sim as unknown as { brain: Brain }).brain;
    expect(brain.think(person, scored.context, new Set(['store']))).toBe('store');
    expect(person.targetBuildingId).toBe(shelf.id);
    expect(person.targetItemId).toBe('fat');
    expect(person.targetItemCount).toBe(1);
    expect(sim.order(person, 'store', { buildingId: shelf.id, itemId: 'fat', count: 1 })).toBe(true);
    for (let tick = 0; tick < 12 && shelf.store.count('fat') === 0; tick++) sim.step();
    expect(shelf.store.count('fat')).toBe(1);
    expect(person.inventory.count('fat')).toBe(0);
    expect(person.inventory.count('berries')).toBe(2);
    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    expect(loaded.buildingsById.get(shelf.id)?.store.count('fat')).toBe(1);
  });

  it('recovers real fat from a nearby ground pile for its own empty lamp', () => {
    const { sim, person, house } = fixture();
    person.isPlayer = true;
    sim.autonomy = 'manual';
    const lamp = new Building(BUILDINGS.fat_lamp!, house.centerX, house.centerY, person.bandId, sim.ids);
    lamp.hostId = house.id; lamp.complete = true; lamp.fuelRemaining = 0;
    sim.buildings.push(lamp); sim.buildingsById.set(lamp.id, lamp); sim.buildingHash.insert(lamp);
    sim.dropAt(person.x + 1, person.y, 'fat', 1);
    sim.dropAt(person.x + 5, person.y, 'berries', 1);
    const fatPile = sim.piles.find(pile => pile.contents.count('fat') > 0)!;
    const unrelatedPile = sim.piles.find(pile => pile.contents.count('berries') > 0)!;
    const scored = scoreOneBrainTick(sim, person);
    expect(scored.found.pickupPile).toBe(fatPile);
    expect(scored.found.pickupItem).toBe('fat');
    expect(scored.scores.some(row => row.id === 'pickup')).toBe(true);
    expect(scored.found.pickupPile).not.toBe(unrelatedPile);

    const brain = (sim as unknown as { brain: Brain }).brain;
    person.isPlayer = false;
    expect(brain.think(person, scored.context, new Set(['pickup']))).toBe('pickup');
    expect(person.targetPileId).toBe(fatPile.id);
    expect(person.targetItemId).toBe('fat');
  });

  it('does not route partial fat to a player lamp, charged lamp or full home shelf', () => {
    const { sim, person, house } = fixture();
    person.isPlayer = true;
    sim.autonomy = 'manual';
    person.needs.hunger = 90;
    person.inventory.add('fat', 1);
    const lamp = new Building(BUILDINGS.fat_lamp!, house.centerX, house.centerY, person.bandId, sim.ids);
    lamp.hostId = house.id; lamp.complete = true; lamp.fuelRemaining = 0;
    const shelf = new Building(BUILDINGS.shelf!, house.centerX + 1, house.centerY, person.bandId, sim.ids);
    shelf.hostId = house.id; shelf.complete = true;
    sim.buildings.push(lamp, shelf);
    for (const building of [lamp, shelf]) {
      sim.buildingsById.set(building.id, building);
      sim.buildingHash.insert(building);
    }

    lamp.playerPlaced = true;
    expect(scoreOneBrainTick(sim, person).found.storeItemId).not.toBe('fat');
    lamp.playerPlaced = false;
    // The helper advances one world tick before sampling; keep one charge
    // beyond that decrement so this remains a non-empty-lamp control.
    lamp.fuelRemaining = 2;
    expect(scoreOneBrainTick(sim, person).found.storeItemId).not.toBe('fat');
    lamp.fuelRemaining = 0;
    shelf.hostId = house.id + 1000;
    expect(scoreOneBrainTick(sim, person).found.storeItemId).not.toBe('fat');
    shelf.hostId = house.id;
    shelf.store.add('flint', shelf.def.storage);
    expect(scoreOneBrainTick(sim, person).found.storeItemId).not.toBe('fat');
  });

  it('does not autonomously refill player-placed, foreign-home, ruined-host or non-empty lamps', () => {
    const { sim, person, house } = fixture();
    person.isPlayer = true;
    sim.autonomy = 'manual';
    const lamp = new Building(BUILDINGS.fat_lamp!, house.centerX, house.centerY, person.bandId, sim.ids);
    lamp.hostId = house.id; lamp.complete = true; lamp.fuelRemaining = 0;
    sim.buildings.push(lamp); sim.buildingsById.set(lamp.id, lamp); sim.buildingHash.insert(lamp);
    const scored = () => scoreOneBrainTick(sim, person);

    const withoutFat = scored();
    expect(withoutFat.found.lampToRefuel).toBe(lamp);
    expect(withoutFat.scores.some(row => row.id === 'refuel_lamp')).toBe(false);
    person.inventory.add('fat', FAT_LAMP_REFILL_FAT);

    lamp.playerPlaced = true;
    expect(scored().found.lampToRefuel).toBeNull();
    lamp.playerPlaced = false;
    lamp.fuelRemaining = 2;
    expect(scored().found.lampToRefuel).toBeNull();
    lamp.fuelRemaining = 0;
    house.complete = false;
    expect(scored().found.lampToRefuel).toBeNull();
    house.complete = true;
    const soundDurability = house.durability;
    house.durability = 0;
    expect(scored().found.lampToRefuel).toBeNull();
    house.durability = soundDurability;
    let otherHome: Building | null = null;
    for (let y = 4; y < sim.world.height - 8 && !otherHome; y++) {
      for (let x = 4; x < sim.world.width - 8; x++) {
        if (!sim.canPlace(BUILDINGS.mud_hut!, x, y)) continue;
        otherHome = sim.place('mud_hut', x, y, person.bandId);
        if (otherHome) break;
      }
    }
    if (!otherHome) throw new Error('could not site a second home');
    otherHome.complete = true;
    otherHome.durability = otherHome.def.workTicks;
    sim.householdsById.get(person.householdId!)!.homeBuildingId = otherHome.id;
    expect(scored().found.lampToRefuel).toBeNull();
  });

  it('scores the bedding-to-bed ladder only for an unfinished household need', () => {
    const { sim, person, house } = fixture();
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    person.action = 'idle'; person.order = null; person.needs.fatigue = 0;
    person.knownTech.add('cordage'); person.inventory.add('hide', 2);
    let checked = false;
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx: BrainContext) => {
      if (actor !== person || checked) return score(actor, ctx);
      checked = true;
      expect(score(actor, ctx).found.recipe).toBe('bedding');
      person.inventory.remove('hide', 2); person.inventory.add('bedding', 1);
      person.knownTech.add('carpentry'); person.inventory.add('wood', 3);
      expect(score(actor, ctx).found.recipe).toBe('bed');
      person.inventory.remove('bedding', 1); person.inventory.add('bed', 1);
      expect(score(actor, ctx).found.furnitureHome).toBe(house);
      expect(score(actor, ctx).found.furnitureItem).toBe('bed');
      const bed = new Building(BUILDINGS.bed!, house.centerX, house.centerY, person.bandId, sim.ids);
      bed.hostId = house.id; bed.complete = true; ctx.buildingHash.insert(bed);
      expect(score(actor, ctx).found.furnitureItem).toBeNull();
      expect(score(actor, ctx).found.recipe).not.toBe('bedding');
      expect(score(actor, ctx).found.recipe).not.toBe('bed');
      person.inventory.add('wood', 2);
      expect(score(actor, ctx).found.recipe).toBe('bench');
      person.inventory.add('bench', 1);
      expect(score(actor, ctx).found.furnitureItem).toBe('bench');
      const bench = new Building(BUILDINGS.bench!, house.centerX + 1, house.centerY, person.bandId, sim.ids);
      bench.hostId = house.id; bench.complete = true; ctx.buildingHash.insert(bench);
      expect(score(actor, ctx).found.furnitureItem).toBeNull();
      person.householdId = null; ctx.buildingHash.remove(bed);
      expect(score(actor, ctx).found.furnitureItem).toBeNull();
      return score(actor, ctx);
    });
    try { for (let tick = 0; tick < 30 && !checked; tick++) sim.step();
      expect(checked).toBe(true);
    } finally { spy.mockRestore(); }
  });

  it('autonomously carries its bed from the doorway into the room before placing it', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('carpentry'); person.inventory.add('bed', 1);
    person.action = 'idle'; person.order = null; person.needs.fatigue = 0;
    person.x = house.x + house.def.width / 2; person.y = house.y + house.def.height + 0.5;
    person.targetX = person.x; person.targetY = person.y;
    sim.peopleHash.rebuild(sim.livingPeople());
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx) => {
      const result = score(actor, ctx);
      if (actor === person) for (const action of result.scores) {
        if (action.id === 'place_furniture') action.score = 100;
      }
      return result;
    });
    try {
      for (let tick = 0; tick < 120 && person.inventory.count('bed') > 0; tick++) {
        person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
        sim.step();
      }
      expect(person.inventory.count('bed')).toBe(0);
      expect(sim.buildings.some(piece => piece.hostId === house.id && piece.def.id === 'bed')).toBe(true);
      expect(person.order).toBeNull();
    } finally { spy.mockRestore(); }
  });

  it('autonomously makes and places one bench after its household has a sleep surface', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('carpentry'); person.inventory.add('wood', 2);
    const bed = new Building(BUILDINGS.bed!, house.centerX, house.centerY, person.bandId, sim.ids);
    bed.hostId = house.id; bed.complete = true;
    sim.buildings.push(bed); sim.buildingsById.set(bed.id, bed); sim.buildingHash.insert(bed);
    person.action = 'idle'; person.order = null; person.needs.fatigue = 0;
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx) => {
      const result = score(actor, ctx);
      if (actor === person) for (const action of result.scores) {
        if (action.id === 'craft' || action.id === 'place_furniture') action.score = 100;
      }
      return result;
    });
    try {
      for (let tick = 0; tick < 500 && !sim.buildings.some(piece => piece.hostId === house.id && piece.def.id === 'bench'); tick++) {
        person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
        sim.step();
      }
      expect(person.inventory.count('bench')).toBe(0);
      expect(sim.buildings.some(piece => piece.hostId === house.id && piece.def.id === 'bench'),
        JSON.stringify({ action: person.action, order: person.order, inventory: person.inventory.entries(), target: person.targetBuildingId }))
        .toBe(true);
    } finally { spy.mockRestore(); }
  });

  it('autonomously crafts and places a shelf for an established household', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('carpentry'); person.inventory.add('wood', 2);
    const bed = new Building(BUILDINGS.bed!, house.centerX, house.centerY, person.bandId, sim.ids);
    bed.hostId = house.id; bed.complete = true;
    sim.buildings.push(bed); sim.buildingsById.set(bed.id, bed); sim.buildingHash.insert(bed);
    const bench = new Building(BUILDINGS.bench!, house.centerX + 1, house.centerY, person.bandId, sim.ids);
    bench.hostId = house.id; bench.complete = true;
    sim.buildings.push(bench); sim.buildingsById.set(bench.id, bench); sim.buildingHash.insert(bench);
    person.action = 'idle'; person.order = null; person.needs.fatigue = 0;
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx) => {
      const result = score(actor, ctx);
      if (actor === person) for (const action of result.scores) {
        if (action.id === 'craft' || action.id === 'place_furniture') action.score = 100;
      }
      return result;
    });
    try {
      for (let tick = 0; tick < 500 && !sim.buildings.some(piece => piece.hostId === house.id && piece.def.id === 'shelf'); tick++) {
        person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
        sim.step();
      }
      expect(person.inventory.count('shelf')).toBe(0);
      expect(sim.buildings.some(piece => piece.hostId === house.id && piece.def.id === 'shelf')).toBe(true);
    } finally { spy.mockRestore(); }
  });

  it('autonomously crafts and lights one fat lamp after the household essentials', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('fat_lamp');
    person.inventory.add('flint', 1);
    person.inventory.add('fat', 2);
    for (const [itemId, offset] of [['bed', 0], ['bench', 1], ['shelf', 2]] as const) {
      const piece = new Building(BUILDINGS[itemId]!, house.x + offset, house.y + 1, person.bandId, sim.ids);
      piece.hostId = house.id;
      piece.complete = true;
      sim.buildings.push(piece);
      sim.buildingsById.set(piece.id, piece);
      sim.buildingHash.insert(piece);
    }
    person.action = 'idle'; person.order = null; person.needs.fatigue = 0;
    const brain = (sim as unknown as { brain: Brain }).brain;
    const score = brain.score.bind(brain);
    const spy = vi.spyOn(brain, 'score').mockImplementation((actor, ctx) => {
      const result = score(actor, ctx);
      if (actor === person) for (const action of result.scores) {
        if (action.id === 'craft' || action.id === 'place_furniture') action.score = 100;
      }
      return result;
    });
    try {
      for (let tick = 0; tick < 500 && !sim.buildings.some(piece =>
        piece.hostId === house.id && piece.def.id === 'fat_lamp'); tick++) {
        person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
        sim.step();
      }
      const lamp = sim.buildings.find(piece => piece.hostId === house.id && piece.def.id === 'fat_lamp');
      expect(lamp).toBeDefined();
      expect(lamp!.fuelRemaining).toBe(FAT_LAMP_FUEL_TICKS);
      expect(person.inventory.count('flint')).toBe(0);
      expect(person.inventory.count('fat')).toBe(0);
    } finally { spy.mockRestore(); }
  });

  it('resolves bedding from thatch or hide and explains the alternative', () => {
    const inventory = new Inventory();
    expect(ingredientsFor(RECIPES.bedding!, inventory)).toBeNull();
    expect(missingIngredients(inventory, RECIPES.bedding!)).toBe('You need either 4 thatch or 2 hide');
    inventory.add('hide', 2);
    expect(ingredientsFor(RECIPES.bedding!, inventory)).toEqual({ hide: 2 });
    expect(missingIngredients(inventory, RECIPES.bedding!)).toBe('');
  });

  it('places a carried bed in the home, keeps its host over JSON, and uses it to sleep', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('carpentry');
    person.inventory.add('bed', 1);
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bed' })).toBe(true);
    for (let tick = 0; tick < 5 && person.inventory.count('bed') > 0; tick++) sim.step();

    const bed = sim.buildings.find(building => building.def.id === 'bed');
    expect(bed).toBeDefined();
    expect(bed).toMatchObject({ hostId: house.id, complete: true });
    expect(person.inventory.count('bed')).toBe(0);
    expect(sim.world.isWalkable(bed!.x, bed!.y)).toBe(true);
    expect(sleepQualityAt(house, bed!.centerX, bed!.centerY, [bed!])).toBe(1.1);

    const saved = JSON.parse(JSON.stringify(toCheckpointRecord(sim)));
    const loaded = Simulation.fromCheckpointRecord(saved);
    const loadedBed = loaded.buildingsById.get(bed!.id)!;
    const loadedHouse = loaded.buildingsById.get(house.id)!;
    const loadedPerson = loaded.peopleById.get(person.id)!;
    expect(loadedBed.hostId).toBe(loadedHouse.id);
    expect(sleepQualityAt(loadedHouse, loadedBed.centerX, loadedBed.centerY, [loadedBed])).toBe(1.1);

    loaded.peopleHash.remove(loadedPerson);
    loadedPerson.x = loadedBed.centerX;
    loadedPerson.y = loadedBed.centerY;
    loadedPerson.targetX = loadedPerson.x;
    loadedPerson.targetY = loadedPerson.y;
    loaded.peopleHash.insert(loadedPerson);
    loadedPerson.needs.fatigue = 80;
    expect(loaded.order(loadedPerson, 'sleep', { buildingId: loadedHouse.id })).toBe(true);
    telemetry.enable();
    telemetry.reset();
    loaded.step();
    expect(loadedPerson.needs.fatigue).toBeLessThan(80);
    expect(telemetry.snapshot().sleeping_furniture).toBe(1);
    telemetry.disable();
  });

  it('refuses a different household’s home before changing the actor state', () => {
    const { sim, person, house } = fixture();
    person.householdId = null;
    person.inventory.add('bedding', 1);
    person.action = 'idle';
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bedding' })).toBe(false);
    expect(sim.lastRefusal).toBe('That is not your household’s home');
    expect(person.action).toBe('idle');
  });

  it('uses a different room tile for each piece and refuses a full room', () => {
    const { sim, person, house } = fixture();
    for (let placed = 0; placed < 4; placed++) {
      person.inventory.add('bedding', 1);
      expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bedding' })).toBe(true);
      sim.step();
    }
    const pieces = sim.buildings.filter(piece => piece.hostId === house.id);
    expect(new Set(pieces.map(piece => `${piece.x},${piece.y}`)).size).toBe(4);
    person.inventory.add('bedding', 1);
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'bedding' })).toBe(false);
    expect(sim.lastRefusal).toBe('There is no room inside the house');
  });
});

describe('household fireplaces', () => {
  it('routes cold-home gathering, craft and placement to the fireplace recipe', () => {
    const { sim, person, house } = fixture();
    person.isPlayer = false;
    person.knownTech.add('fireplace');
    person.techLevel.set('fireplace', 0);
    person.needs.cold = 80;
    person.needs.company = 0;
    person.clearTarget();
    person.action = 'idle';
    person.order = null;
    const colleague = sim.livingPeople().find(other => other.id !== person.id && !other.isChild);
    if (!colleague) throw new Error('fixture has no second adult');
    // Keep the NPC's ordinary proponent contract intact while making this
    // fixture's adult available for the independent household furnishing.
    for (const proposal of sim.buildings.filter(piece => !piece.complete &&
      (piece.sponsorId === person.id || piece.backers.includes(person.id)))) {
      for (let i = proposal.backers.length - 1; i >= 0; i--) {
        if (proposal.backers[i] === person.id) proposal.backers.splice(i, 1);
      }
      if (proposal.sponsorId === person.id) proposal.sponsorId = colleague.id;
      if (!proposal.backers.includes(colleague.id)) proposal.backers.push(colleague.id);
    }
    for (const [index, itemId] of ['bed', 'bench', 'shelf'].entries()) {
      const tile = houseInteriorTiles(house)[index]!;
      const piece = new Building(BUILDINGS[itemId]!, Math.floor(tile.x), Math.floor(tile.y), person.bandId, sim.ids);
      piece.hostId = house.id;
      piece.complete = true;
      piece.durability = piece.def.workTicks;
      sim.buildings.push(piece);
      sim.buildingsById.set(piece.id, piece);
      sim.buildingHash.insert(piece);
    }
    const clay = new ResourceNode('clay', house.x + house.def.width + 1, house.y + 1, new RNG('fireplace-clay'), sim.ids);
    const flint = new ResourceNode('flint', house.x + house.def.width + 2, house.y + 1, new RNG('fireplace-flint'), sim.ids);
    clay.amount = 24;
    flint.amount = 30;
    sim.nodes.push(clay, flint);
    sim.nodeHash.insert(clay);
    sim.nodeHash.insert(flint);
    sim.peopleHash.remove(person);
    person.x = clay.x + 0.5;
    person.y = clay.y + 0.5;
    person.targetX = person.x;
    person.targetY = person.y;
    sim.peopleHash.insert(person);

    person.needs.cold = 80;
    person.needs.company = 0;
    const scored = scoreOneBrainTick(sim, person);
    expect(scored.found.furnitureRecipe).toBe('fireplace');
    expect(scored.found.fireplaceGatherHome?.id).toBe(house.id);
    expect(scored.found.fireplaceGatherItem).toBe('mud');
    expect(scored.found.fireplaceGatherCount).toBe(4);

    // Force only this already-scored verb so this contract proves the actual
    // target-routing path independently of unrelated shelter/social choices.
    person.action = 'idle';
    person.clearTarget();
    const brain = (sim as unknown as { brain: Brain }).brain;
    expect(brain.think(person, scored.context, new Set(['gather_for_site']))).toBe('gather_for_site');
    expect(person).toMatchObject({ action: 'gather', targetBuildingId: house.id,
      targetItemId: 'mud', targetItemCount: 4, targetNodeId: clay.id });
    expect(clay.amount).toBe(24);
    expect(flint.amount).toBe(30);

    person.action = 'idle';
    person.clearTarget();
    person.inventory.add('mud', 4);
    person.inventory.add('flint', 2);
    expect(brain.think(person, scored.context, new Set(['craft']))).toBe('craft');
    expect(person).toMatchObject({ action: 'craft', targetRecipe: 'fireplace' });
    person.action = 'idle';
    person.clearTarget();
    person.inventory.remove('mud', 4);
    person.inventory.remove('flint', 2);
    person.inventory.add('fireplace', 1);
    expect(brain.think(person, scored.context, new Set(['place_furniture']))).toBe('place_furniture');
    expect(person).toMatchObject({ action: 'place_furniture', targetBuildingId: house.id,
      targetItemId: 'fireplace' });
  });

  it('does not gather fireplace materials without the design, cold need, or a finished own home', () => {
    const { sim, person, house } = fixture();
    person.isPlayer = true;
    sim.autonomy = 'manual';
    const clay = new ResourceNode('clay', house.x + house.def.width + 1, house.y + 1, new RNG('fireplace-negative'), sim.ids);
    sim.nodes.push(clay);
    sim.nodeHash.insert(clay);
    const scored = () => scoreOneBrainTick(sim, person);
    const seeksFireplace = () => scored().found.fireplaceGatherHome !== null;

    person.needs.cold = 80;
    expect(scored().found.furnitureRecipe).toBeNull();
    person.needs.cold = 20;
    expect(seeksFireplace()).toBe(false);
    person.knownTech.add('fireplace');
    person.techLevel.set('fireplace', 0);
    person.needs.cold = 0;
    expect(seeksFireplace()).toBe(false);
    person.needs.cold = 20;
    house.complete = false;
    expect(seeksFireplace()).toBe(false);
    house.complete = true;
    house.durability = 0;
    expect(seeksFireplace()).toBe(false);
    house.durability = house.def.workTicks;
    clay.amount = 0;
    expect(seeksFireplace()).toBe(false);
  });

  it('requires the fireplace design, and cannot be placed at another home or from outside', () => {
    const { sim, person, house } = fixture();
    expect(RECIPES.fireplace).toMatchObject({
      tech: 'fireplace', ingredients: { mud: 4, flint: 2 }, output: { fireplace: 1 },
    });
    person.inventory.add('fireplace', 1);
    person.knownTech.add('firemaking');
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fireplace' })).toBe(false);
    expect(sim.lastRefusal).toBe('Nobody here knows how to make that');

    const householdId = person.householdId;
    person.knownTech.add('fireplace');
    person.techLevel.set('fireplace', 0);
    expect(missingIngredients(person.inventory, RECIPES.fireplace!)).toBe('You need 4 daub and 2 flint');

    person.householdId = null;
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fireplace' })).toBe(false);
    expect(sim.lastRefusal).toBe('That is not your household’s home');
    person.householdId = householdId;

    house.complete = false;
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fireplace' })).toBe(false);
    expect(sim.lastRefusal).toBe('That is not your household’s home');
    house.complete = true;
    house.durability = house.def.workTicks;
    house.durability = 0;
    expect(house.ruined).toBe(true);
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fireplace' })).toBe(false);
    expect(sim.lastRefusal).toBe('That is not your household’s home');
    house.durability = house.def.workTicks;

    sim.peopleHash.remove(person);
    person.x = house.x - 1; person.y = house.centerY;
    person.targetX = person.x; person.targetY = person.y;
    sim.peopleHash.insert(person);
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fireplace' })).toBe(false);
    expect(sim.lastRefusal).toBe('You must be inside the house to place furniture');
  });

  it('places a fuel-less fireplace, warms and lights locally, serves hearth recipes, and persists its host', () => {
    const { sim, person, house } = fixture();
    person.knownTech.add('fireplace');
    person.knownTech.add('stone_boiling');
    person.inventory.add('fireplace', 1);
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fireplace' })).toBe(true);
    sim.step();
    const fireplace = sim.buildings.find(building => building.def.id === 'fireplace')!;
    expect(fireplace).toMatchObject({ hostId: house.id, complete: true, fuelRemaining: 0 });
    expect(hearthLight(fireplace)).toMatchObject({ radius: 4, strength: 1 });
    expect(lightAt(fireplace.centerX, fireplace.centerY, 0, sim.buildingHash)).toBe(1);
    expect(lightAt(fireplace.centerX + 6, fireplace.centerY, 0, sim.buildingHash)).toBe(0);
    const roomTile = houseInteriorTiles(house).find(tile =>
      Math.hypot(tile.x - fireplace.centerX, tile.y - fireplace.centerY) <= 3)!;
    expect(sim.hearthNear(roomTile.x, roomTile.y, 3)).toBe(true);
    expect(sim.hearthNear(fireplace.centerX + 5, fireplace.centerY, 3)).toBe(false);
    const outsideWall = { x: house.x - 0.5, y: house.centerY };
    expect(Math.hypot(outsideWall.x - fireplace.centerX, outsideWall.y - fireplace.centerY)).toBeLessThan(4);
    expect(lightAt(outsideWall.x, outsideWall.y, 0, sim.buildingHash)).toBe(0);
    expect(sim.hearthNear(outsideWall.x, outsideWall.y, 4)).toBe(false);

    // The fireplace deliberately has no carried-fuel lifecycle: its build
    // materials establish a fixed hearth like the existing camp hearth.
    const needs = new NeedsSystem(sim.config.needs, sim.world);
    const coldTime = { temperature: -1, tick: 10 } as unknown as TimeManager;
    person.needs.hunger = person.needs.thirst = 0;
    person.needs.cold = 50;
    sim.buildingHash.remove(fireplace);
    // Exclude the roof's shelter effect so this comparison isolates the fire
    // reader rather than measuring two copies of the same house protection.
    needs.update([person], coldTime, sim.buildings.filter(building => building !== fireplace && building !== house), sim.buildingHash);
    const withoutFire = person.needs.cold;
    sim.buildingHash.insert(fireplace);
    person.needs.cold = 50;
    needs.update([person], coldTime, sim.buildings.filter(building => building !== house), sim.buildingHash);
    expect(person.needs.cold).toBeLessThan(withoutFire);

    // `station: 'hearth'` remains the recipe contract; an indoor fireplace
    // fulfils it, so the same broth menu/order works at home.
    person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
    person.inventory.add('bone', 2);
    expect(availableActions(person, { kind: 'building', x: fireplace.x, y: fireplace.y, building: fireplace },
      { world: sim.world, nearWater: false }).some(option => option.id === 'craft' && option.recipeId === 'broth')).toBe(true);
    expect(sim.order(person, 'craft', { recipeId: 'broth', buildingId: fireplace.id })).toBe(true);
    for (let tick = 0; tick < 500 && person.inventory.count('broth') === 0; tick++) {
      person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
      sim.step();
    }
    expect(person.inventory.count('broth')).toBe(1);

    // Smoking keeps its own drying-rack station. The fireplace is the nearby
    // fire reader it asks for, so indoor preservation works without changing
    // the recipe's station contract.
    const rackTile = houseInteriorTiles(house).map(tile => ({ x: Math.floor(tile.x), y: Math.floor(tile.y) }))
      .find(tile => sim.world.isWalkable(tile.x, tile.y) &&
        Math.hypot(tile.x + 0.5 - fireplace.centerX, tile.y + 0.5 - fireplace.centerY) <= 3 &&
        !sim.buildings.some(piece => piece.hostId === house.id && piece.x === tile.x && piece.y === tile.y));
    expect(rackTile).toBeDefined();
    const rack = new Building(BUILDINGS.drying_rack!, rackTile!.x, rackTile!.y, person.bandId, sim.ids);
    rack.hostId = house.id;
    rack.complete = true;
    rack.durability = rack.def.workTicks;
    sim.buildings.push(rack);
    sim.buildingsById.set(rack.id, rack);
    sim.buildingHash.insert(rack);
    person.knownTech.add('smoking');
    person.inventory.add('meat', 2);
    person.inventory.add('sticks', 1);
    expect(sim.order(person, 'craft', { recipeId: 'smoked_meat', buildingId: rack.id })).toBe(true);
    for (let tick = 0; tick < 600 && person.inventory.count('smoked_meat') === 0; tick++) {
      person.needs.hunger = person.needs.thirst = person.needs.cold = 0;
      sim.step();
    }
    expect(person.inventory.count('smoked_meat')).toBe(2);

    const loaded = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restored = loaded.buildingsById.get(fireplace.id)!;
    expect(restored.hostId).toBe(loaded.buildingsById.get(house.id)!.id);
    expect(restored.fuelRemaining).toBe(0);
    expect(hearthLight(restored)).not.toBeNull();
    expect(loaded.hearthNear(restored.centerX, restored.centerY, 1)).toBe(true);
  });
});
