import { describe, expect, it, vi } from 'vitest';
import { Brain, type BrainContext } from '../ai/Brain.ts';
import { availableActions } from '../ai/ActionCatalog.ts';
import { Simulation } from '../core/Simulation.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Inventory } from '../entities/Item.ts';
import { RECIPES, ingredientsFor, missingIngredients } from '../entities/Recipe.ts';
import { assignedSleepSurface, benchConversationBelonging, seatedOnBench, sleepQualityAt } from '../world/HouseInterior.ts';
import { telemetry } from '../core/Telemetry.ts';
import { FAT_LAMP_FUEL_TICKS, FAT_LAMP_REFILL_FAT } from '../core/FatLamp.ts';
import { fatLampLight, lightAt } from '../core/Light.ts';

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

describe('bedding and beds', () => {
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
    person.knownTech.add('firemaking');
    person.inventory.add('fat_lamp', 1);
    person.inventory.add('fat', FAT_LAMP_REFILL_FAT);
    expect(RECIPES.fat_lamp).toMatchObject({ tech: 'firemaking', ingredients: { flint: 1, fat: 2 }, output: { fat_lamp: 1 } });
    expect(sim.order(person, 'place_furniture', { buildingId: house.id, itemId: 'fat_lamp' })).toBe(true);
    sim.step();
    const lamp = sim.buildings.find(building => building.def.id === 'fat_lamp')!;
    expect(sim.buildingAt(lamp.x, lamp.y)).toBe(lamp); // The furniture target must outrank its house footprint.
    expect(lamp).toMatchObject({ hostId: house.id, complete: true, fuelRemaining: FAT_LAMP_FUEL_TICKS });
    expect(fatLampLight(lamp)).toMatchObject({ radius: 3, strength: 0.9 });
    expect(lightAt(lamp.centerX, lamp.centerY, 0, sim.buildingHash)).toBeCloseTo(0.9);

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
