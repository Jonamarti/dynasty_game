import { describe, expect, it } from 'vitest';
import { Inventory, type GarmentUnit, validateInventoryTransferState } from '../entities/Item.ts';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { changeGarment } from '../core/ToolEquipment.ts';
import { DEFAULT_CONFIG } from '../core/Config.ts';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { reconcileCarry } from '../core/Carry.ts';
import { settleEstate } from '../systems/LifeSystem.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';

describe('garment condition ownership foundation', () => {
  it('consumes a prototype sample atomically and clears its worn unit reference', () => {
    const sim = new Simulation({ seed: 'garment-prototype-consume', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const person = sim.livingPeople()[0]!;
    person.age = 30 * person.daysPerYear;
    person.inventory.add('fur_coat', 1);
    person.inventory.add('bone', 2);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.29, 93);
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    const idea = { tech: 'toggles' as const, stage: 'researching' as const, insight: 1, story: 'test',
      conceivedTick: 0, effort: 0, discussedWith: [], trials: 0, proof: 0, failedTests: 0, tries: 0 };
    person.ideas.push(idea);
    person.action = 'prototype';
    person.actionTimer = 1;

    sim.step();

    expect(person.inventory.count('fur_coat')).toBe(0);
    expect(person.inventory.count('bone')).toBe(0);
    expect(person.equipment.torso).toBeUndefined();
    expect(idea.stage).toBe('prototyped');
  });

  it('rolls back a worn prototype sample when a later material removal fails', () => {
    const sim = new Simulation({ seed: 'garment-prototype-rollback', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const person = sim.livingPeople()[0]!;
    person.age = 30 * person.daysPerYear;
    person.inventory.add('fur_coat', 1);
    person.inventory.add('bone', 2);
    const unit = person.inventory.garmentUnitsOf('fur_coat')[0]!;
    person.inventory.setGarmentUnitCondition(unit.unitId, 0.29, 93);
    expect(changeGarment(person, 'fur_coat', 'wear_garment')).toBeNull();
    const idea = { tech: 'toggles' as const, stage: 'researching' as const, insight: 1, story: 'test',
      conceivedTick: 0, effort: 0, discussedWith: [], trials: 0, proof: 0, failedTests: 0, tries: 0 };
    person.ideas.push(idea);
    const before = person.inventory.transferSnapshot();
    const remove = person.inventory.remove.bind(person.inventory);
    person.inventory.remove = (itemId, count) => {
      if (itemId === 'bone') throw new Error('injected material removal failure');
      return remove(itemId, count);
    };
    person.action = 'prototype';
    person.actionTimer = 1;

    sim.step();

    expect(person.inventory.transferSnapshot()).toEqual(before);
    expect(person.equipment.torso).toMatchObject({ item: 'fur_coat', unitId: unit.unitId });
    expect(idea.stage).toBe('researching');
  });

  it('preserves the chosen garment unit through the direct player handover', () => {
    const sim = new Simulation({ seed: 'garment-handover', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const [giver, receiver] = sim.livingPeople();
    giver!.inventory.add('wool_cloak', 2);
    const [worn, spare] = giver!.inventory.garmentUnitsOf('wool_cloak');
    giver!.inventory.setGarmentUnitCondition(worn!.unitId, 0.32, 88);
    giver!.inventory.setGarmentUnitCondition(spare!.unitId, 0.74, 11);
    expect(changeGarment(giver!, 'wool_cloak', 'wear_garment')).toBeNull();

    expect(sim.handOver(giver!, receiver!, 'wool_cloak', 1)).toBe(1);
    expect(giver!.inventory.garmentUnitsOf('wool_cloak')).toMatchObject([
      { unitId: spare!.unitId, wear: 0.74, repairProgress: 11 },
    ]);
    expect(receiver!.inventory.garmentUnitsOf('wool_cloak')).toMatchObject([
      { unitId: worn!.unitId, wear: 0.32, repairProgress: 88 },
    ]);
    expect(giver!.equipment.cloak).toBeUndefined();
  });

  it('preserves garment condition through an NPC non-food gift action', () => {
    const sim = new Simulation({ seed: 'garment-npc-gift', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const [giver, receiver] = sim.livingPeople();
    giver!.age = 30 * giver!.daysPerYear;
    receiver!.age = 30 * receiver!.daysPerYear;
    receiver!.x = giver!.x + 1;
    receiver!.y = giver!.y;
    giver!.inventory.add('wool_cloak', 1);
    const unit = giver!.inventory.garmentUnitsOf('wool_cloak')[0]!;
    giver!.inventory.setGarmentUnitCondition(unit.unitId, 0.41, 57);
    expect(sim.order(giver!, 'give', { personId: receiver!.id, itemId: 'wool_cloak' })).toBe(true);

    for (let tick = 0; tick < 40 && receiver!.inventory.count('wool_cloak') === 0; tick++) sim.step();
    expect(receiver!.inventory.garmentUnitsOf('wool_cloak')).toMatchObject([
      { unitId: unit.unitId, wear: 0.41, repairProgress: 57 },
    ]);
  });

  it('steals the same worn garment unit with its wear and repair progress', () => {
    const sim = new Simulation({ seed: 'garment-theft', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const [thief, victim] = sim.livingPeople();
    thief!.age = 30 * thief!.daysPerYear;
    victim!.age = 30 * victim!.daysPerYear;
    victim!.x = thief!.x + 1;
    victim!.y = thief!.y;
    for (const [itemId, count] of victim!.inventory.entries()) victim!.inventory.remove(itemId, count);
    victim!.equipment.cloak = undefined;
    victim!.inventory.add('wool_cloak', 1);
    const unit = victim!.inventory.garmentUnitsOf('wool_cloak')[0]!;
    victim!.inventory.setGarmentUnitCondition(unit.unitId, 0.37, 64);
    expect(changeGarment(victim!, 'wool_cloak', 'wear_garment')).toBeNull();
    expect(sim.order(thief!, 'steal', { personId: victim!.id })).toBe(true);
    thief!.actionTimer = 1;

    sim.step();

    expect(thief!.inventory.garmentUnitsOf('wool_cloak')).toMatchObject([
      { unitId: unit.unitId, wear: 0.37, repairProgress: 64 },
    ]);
    expect(victim!.inventory.count('wool_cloak')).toBe(0);
    expect(victim!.equipment.cloak).toBeUndefined();
  });

  it('preserves the exact worn garment when a threat is obeyed', () => {
    const sim = new Simulation({ seed: 'garment-threat', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const [leader, victim] = sim.livingPeople();
    leader!.age = victim!.age = 30 * leader!.daysPerYear;
    leader!.x = victim!.x; leader!.y = victim!.y;
    leader!.skills.fight = 100; victim!.skills.fight = 0; victim!.traits.aggression = 0;
    for (const [itemId, count] of leader!.inventory.entries()) leader!.inventory.remove(itemId, count);
    for (const [itemId, count] of victim!.inventory.entries()) victim!.inventory.remove(itemId, count);
    victim!.equipment.cloak = undefined;
    victim!.inventory.add('wool_cloak', 1);
    const unit = victim!.inventory.garmentUnitsOf('wool_cloak')[0]!;
    victim!.inventory.setGarmentUnitCondition(unit.unitId, 0.34, 77);
    expect(changeGarment(victim!, 'wool_cloak', 'wear_garment')).toBeNull();
    (sim as unknown as { actionRng: RNG }).actionRng.chance = () => true;
    expect(sim.order(leader!, 'threaten', { personId: victim!.id, itemId: 'wool_cloak', count: 1 })).toBe(true);
    leader!.actionTimer = 1;

    sim.step();

    expect(leader!.inventory.garmentUnitsOf('wool_cloak')).toEqual([
      { unitId: unit.unitId, itemId: 'wool_cloak', wear: 0.34, repairProgress: 77 },
    ]);
    expect(victim!.inventory.count('wool_cloak')).toBe(0);
    expect(victim!.equipment.cloak).toBeUndefined();
  });

  it('rolls back both owners when a threatened garment receiver rejects insertion', () => {
    class RejectGarmentInventory extends Inventory {
      override putGarmentUnit(unit: GarmentUnit): string { throw new Error(`rejected ${unit.itemId}`); }
    }
    const sim = new Simulation({ seed: 'garment-threat-rollback', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const [leader, victim] = sim.livingPeople();
    leader!.age = victim!.age = 30 * leader!.daysPerYear;
    leader!.x = victim!.x; leader!.y = victim!.y;
    leader!.skills.fight = 100; victim!.skills.fight = 0; victim!.traits.aggression = 0;
    for (const [itemId, count] of victim!.inventory.entries()) victim!.inventory.remove(itemId, count);
    victim!.inventory.add('wool_cloak', 1);
    const unit = victim!.inventory.garmentUnitsOf('wool_cloak')[0]!;
    victim!.inventory.setGarmentUnitCondition(unit.unitId, 0.34, 77);
    leader!.inventory = new RejectGarmentInventory();
    const sourceBefore = victim!.inventory.transferSnapshot();
    const destinationBefore = leader!.inventory.transferSnapshot();
    (sim as unknown as { actionRng: RNG }).actionRng.chance = () => true;
    expect(sim.order(leader!, 'threaten', { personId: victim!.id, itemId: 'wool_cloak', count: 1 })).toBe(true);
    leader!.actionTimer = 1;

    expect(() => sim.step()).toThrow(/rejected wool_cloak/);
    expect(victim!.inventory.transferSnapshot()).toEqual(sourceBefore);
    expect(leader!.inventory.transferSnapshot()).toEqual(destinationBefore);
  });

  it('rejects a threat against a garment whose physical ownership row is missing', () => {
    const sim = new Simulation({ seed: 'garment-threat-invalid-owner', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const [leader, victim] = sim.livingPeople();
    leader!.age = victim!.age = 30 * leader!.daysPerYear;
    leader!.x = victim!.x; leader!.y = victim!.y;
    leader!.skills.fight = 100; victim!.skills.fight = 0;
    for (const [itemId, count] of victim!.inventory.entries()) victim!.inventory.remove(itemId, count);
    victim!.equipment.cloak = undefined;
    victim!.inventory.add('wool_cloak', 1);
    const unit = victim!.inventory.garmentUnitsOf('wool_cloak')[0]!;
    expect(changeGarment(victim!, 'wool_cloak', 'wear_garment')).toBeNull();
    (victim!.inventory as unknown as { garmentUnits: GarmentUnit[] }).garmentUnits.length = 0;
    (sim as unknown as { actionRng: RNG }).actionRng.chance = () => true;
    expect(sim.order(leader!, 'threaten', { personId: victim!.id, itemId: 'wool_cloak', count: 1 })).toBe(true);
    leader!.actionTimer = 1;

    expect(() => sim.step()).toThrow(/garment units do not match garment counts/);
    expect(victim!.inventory.count('wool_cloak')).toBe(1);
    expect(leader!.inventory.count('wool_cloak')).toBe(0);
    expect(victim!.equipment.cloak?.unitId).toBe(unit.unitId);
  });

  it('rejects an orphaned garment row before a multi-item offer changes either owner', () => {
    const source = new Inventory();
    const thief = new Inventory();
    source.add('sticks', 1);
    source.add('fur_hat', 1);
    const original = source.garmentUnitsOf('fur_hat')[0]!;
    const rows = (source as unknown as { garmentUnits: GarmentUnit[] }).garmentUnits;
    rows.push({ ...original, unitId: 'orphaned-unit' });

    expect(() => source.transferItemsTo(thief, [['sticks', 1], ['fur_hat', 1]]))
      .toThrow(/garment units do not match garment counts/);
    expect(source.count('sticks')).toBe(1);
    expect(source.count('fur_hat')).toBe(1);
    expect(rows).toHaveLength(2);
    expect(thief.count('sticks')).toBe(0);
    expect(thief.count('fur_hat')).toBe(0);
    expect(thief.garmentUnitsOf('fur_hat')).toEqual([]);
  });

  it('preserves a garment through both physical legs of a tribute delivery', () => {
    const sim = new Simulation({ seed: 'garment-tribute', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const bearer = sim.livingPeople()[0]!;
    const home = new Building(BUILDINGS.granary!, 8, 8, bearer.bandId);
    const overlordStore = new Building(BUILDINGS.granary!, 28, 28, bearer.bandId + 1);
    home.complete = overlordStore.complete = true;
    for (const building of [home, overlordStore]) {
      sim.buildings.push(building);
      sim.buildingsById.set(building.id, building);
      sim.buildingHash.insert(building);
    }
    bearer.inventory.add('fur_hat', 1);
    const preexisting = bearer.inventory.garmentUnitsOf('fur_hat')[0]!;
    bearer.inventory.setGarmentUnitCondition(preexisting.unitId, 0.92, 3);
    expect(changeGarment(bearer, 'fur_hat', 'wear_garment')).toBeNull();
    home.store.add('fur_hat', 1);
    const unit = home.store.garmentUnitsOf('fur_hat')[0]!;
    home.store.setGarmentUnitCondition(unit.unitId, 0.26, 101);
    bearer.x = home.centerX;
    bearer.y = home.centerY;
    expect(sim.order(bearer, 'render', { buildingId: home.id, itemId: 'fur_hat', count: 1 })).toBe(true);
    bearer.renderInto = overlordStore.id;

    sim.step();
    expect(home.store.count('fur_hat')).toBe(0);
    const carriedTribute = bearer.inventory.garmentUnitsOf('fur_hat').find(
      garment => garment.unitId !== preexisting.unitId,
    )!;
    expect(carriedTribute).toMatchObject({ wear: 0.26, repairProgress: 101 });
    expect(bearer.inventory.garmentUnitsOf('fur_hat')).toMatchObject([
      { unitId: preexisting.unitId, wear: 0.92, repairProgress: 3 },
    ]);
    expect(bearer.renderGoods).toEqual({
      itemId: 'fur_hat', count: 1, garmentUnitIds: [carriedTribute.unitId],
    });

    bearer.x = overlordStore.centerX;
    bearer.y = overlordStore.centerY;
    sim.step();
    expect(bearer.inventory.count('fur_hat')).toBe(1);
    expect(bearer.inventory.garmentUnitsOf('fur_hat')).toMatchObject([
      { unitId: preexisting.unitId, wear: 0.92, repairProgress: 3 },
    ]);
    expect(overlordStore.store.garmentUnitsOf('fur_hat')).toMatchObject([
      { unitId: carriedTribute.unitId, wear: 0.26, repairProgress: 101 },
    ]);
  });

  it('rolls back a tribute garment withdrawal if the bearer rejects insertion', () => {
    class RejectGarmentInventory extends Inventory {
      override putGarmentUnit(unit: GarmentUnit): string {
        throw new Error(`rejected ${unit.itemId}`);
      }
    }
    const sim = new Simulation({ seed: 'garment-tribute-reject', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 }, carry: { legacyPack: true } });
    const bearer = sim.livingPeople()[0]!;
    const home = new Building(BUILDINGS.granary!, 8, 8, bearer.bandId);
    const overlordStore = new Building(BUILDINGS.granary!, 28, 28, bearer.bandId + 1);
    home.complete = overlordStore.complete = true;
    for (const building of [home, overlordStore]) {
      sim.buildings.push(building);
      sim.buildingsById.set(building.id, building);
      sim.buildingHash.insert(building);
    }
    home.store.add('fur_hat', 1);
    const unit = home.store.garmentUnitsOf('fur_hat')[0]!;
    home.store.setGarmentUnitCondition(unit.unitId, 0.26, 101);
    bearer.inventory = new RejectGarmentInventory();
    bearer.x = home.centerX;
    bearer.y = home.centerY;
    expect(sim.order(bearer, 'render', { buildingId: home.id, itemId: 'fur_hat', count: 1 })).toBe(true);
    bearer.renderInto = overlordStore.id;

    expect(() => sim.step()).toThrow('rejected fur_hat');
    expect(home.store.garmentUnitsOf('fur_hat')).toMatchObject([
      { unitId: unit.unitId, wear: 0.26, repairProgress: 101 },
    ]);
    expect(bearer.inventory.count('fur_hat')).toBe(0);
    expect(overlordStore.store.count('fur_hat')).toBe(0);
  });

  it('rolls back a multi-unit garment transfer when the receiver rejects a unit', () => {
    let inserted = 0;
    class RejectSecondGarment extends Inventory {
      override putGarmentUnit(unit: GarmentUnit): string {
        if (++inserted === 2) throw new Error('receiver rejected garment');
        return super.putGarmentUnit(unit);
      }
    }
    const source = new Inventory();
    const destination = new RejectSecondGarment();
    source.add('wool_cloak', 2);
    const [first, second] = source.garmentUnitsOf('wool_cloak');
    source.setGarmentUnitCondition(first!.unitId, 0.28, 19);
    source.setGarmentUnitCondition(second!.unitId, 0.63, 91);
    const sourceBefore = source.transferSnapshot();
    const destinationBefore = destination.transferSnapshot();

    expect(() => source.transferTo(destination, 'wool_cloak', 2)).toThrow('receiver rejected garment');
    expect(source.transferSnapshot()).toEqual(sourceBefore);
    expect(destination.transferSnapshot()).toEqual(destinationBefore);
  });

  it('rolls back the entire multi-item offer when a later garment insertion fails', () => {
    let inserted = 0;
    class RejectGarment extends Inventory {
      override putGarmentUnit(_unit: GarmentUnit): string {
        inserted++;
        throw new Error('receiver rejected garment');
      }
    }
    const source = new Inventory();
    const destination = new RejectGarment();
    source.add('sticks', 2);
    source.add('fur_hat', 1);
    const garment = source.garmentUnitsOf('fur_hat')[0]!;
    source.setGarmentUnitCondition(garment.unitId, 0.21, 103);
    const sourceBefore = source.transferSnapshot();
    const destinationBefore = destination.transferSnapshot();

    expect(() => source.transferItemsTo(destination, [['sticks', 1], ['fur_hat', 1]]))
      .toThrow('receiver rejected garment');
    expect(inserted).toBe(1);
    expect(source.transferSnapshot()).toEqual(sourceBefore);
    expect(destination.transferSnapshot()).toEqual(destinationBefore);
  });

  it('moves one physical garment with its condition and banked repair work', () => {
    const pack = new Inventory();
    pack.add('wool_cloak', 2);
    const [worn, pristine] = pack.garmentUnitsOf('wool_cloak');
    expect(worn?.wear).toBe(1);
    expect(pack.setGarmentUnitCondition(worn!.unitId, 0.42, 73)).toBe(true);

    const moved = pack.takeGarmentUnit('wool_cloak');
    expect(moved).toMatchObject({ unitId: worn!.unitId, wear: 0.42, repairProgress: 73 });
    expect(pack.count('wool_cloak')).toBe(1);
    expect(pack.garmentUnitsOf('wool_cloak')).toEqual([pristine]);

    const store = new Inventory();
    store.putGarmentUnit(moved!);
    expect(store.count('wool_cloak')).toBe(1);
    expect(store.garmentUnitsOf('wool_cloak')).toEqual([moved]);
  });

  it('includes unit state in validated transfer records and restores it exactly', () => {
    const source = new Inventory();
    source.add('hide_cape', 1);
    const unit = source.garmentUnitsOf()[0]!;
    source.setGarmentUnitCondition(unit.unitId, 0.1, 140);
    const record = JSON.parse(JSON.stringify(source.transferSnapshot()));

    const destination = new Inventory();
    destination.restoreTransferState(record);
    expect(destination.garmentUnitsOf()).toEqual(source.garmentUnitsOf());
    expect(() => destination.setGarmentUnitCondition(unit.unitId, 1.1, 0)).toThrow();
    expect(() => validateInventoryTransferState({ ...record,
      garmentUnits: [{ ...record.garmentUnits[0], repairProgress: 141 }],
    })).toThrow(/invalid identity, condition, or repair progress/);
    expect(() => validateInventoryTransferState({ ...record, garmentUnits: [] }))
      .toThrow(/garment units do not match garment counts/);
  });

  it('hydrates legacy count-only transfer records as pristine garments', () => {
    const legacy = validateInventoryTransferState({
      version: 3,
      stacks: [['hide_cape', 2], ['berries', 4]],
      spoilage: [],
    });
    expect(legacy.garmentUnits).toHaveLength(2);
    expect(legacy.garmentUnits.every(unit => unit.wear === 1 && unit.repairProgress === 0)).toBe(true);
  });

  it('preserves a garment across drop and pickup, and clears only its exact worn reference', () => {
    const sim = new Simulation({ seed: 'garment-pile-transfer', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    const person = sim.livingPeople()[0]!;
    person.inventory.add('wool_cloak', 1);
    changeGarment(person, 'wool_cloak', 'wear_garment');
    const worn = person.equipment.cloak!;
    person.inventory.setGarmentUnitCondition(worn.unitId!, 0.31, 96);

    const pile = sim.drop(person, 'wool_cloak', 1)!;
    expect(person.equipment.cloak).toBeUndefined();
    expect(pile.contents.garmentUnitsOf('wool_cloak')).toMatchObject([
      { unitId: worn.unitId, wear: 0.31, repairProgress: 96 },
    ]);
    expect(sim.takeFromPile(person, pile, 'wool_cloak', 1)).toBe(1);
    expect(person.inventory.garmentUnitsOf('wool_cloak')).toMatchObject([
      { unitId: worn.unitId, wear: 0.31, repairProgress: 96 },
    ]);
  });

  it('preserves the same garment through store, persisted inventory state, and withdrawal', () => {
    const sim = new Simulation({ seed: 'garment-store-transfer', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 2 } });
    const person = sim.livingPeople()[0]!;
    person.inventory.add('fur_hat', 1);
    const unit = person.inventory.garmentUnitsOf('fur_hat')[0]!;
    expect(person.inventory.setGarmentUnitCondition(unit.unitId, 0.36, 88)).toBe(true);

    let store: import('../entities/Building.ts').Building | null = null;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      store = sim.place('storage_pit', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (store) break;
    }
    expect(store).not.toBeNull();
    store!.complete = true;

    expect(sim.storeItem(person, store!, 'fur_hat', 1)).toBe(1);
    expect(person.inventory.count('fur_hat')).toBe(0);
    const persisted = validateInventoryTransferState(JSON.parse(JSON.stringify(store!.store.transferSnapshot())));
    expect(persisted.garmentUnits).toEqual([{ ...unit, wear: 0.36, repairProgress: 88 }]);
    const loaded = new Inventory();
    loaded.restoreTransferState(persisted);
    expect(loaded.garmentUnitsOf('fur_hat')).toEqual(persisted.garmentUnits);
    store!.store.takeTransferState(persisted);
    store!.store.restoreTransferState(persisted);
    expect(sim.takeItem(person, store!, 'fur_hat', 1)).toBe(1);
    expect(person.inventory.garmentUnitsOf('fur_hat')).toEqual(persisted.garmentUnits);
  });

  it('re-keys a local unit collision when merging inventories without changing condition', () => {
    const source = new Inventory();
    source.add('fur_hat', 1);
    const sourceUnit = source.garmentUnitsOf()[0]!;
    source.setGarmentUnitCondition(sourceUnit.unitId, 0.27, 44);
    const destination = new Inventory();
    destination.add('fur_hat', 1);

    expect(source.transferTo(destination, 'fur_hat', 1)).toBe(1);
    const merged = destination.garmentUnitsOf('fur_hat');
    expect(merged).toHaveLength(2);
    expect(merged.find(unit => unit.wear === 0.27)).toMatchObject({ wear: 0.27, repairProgress: 44 });
    expect(new Set(merged.map(unit => unit.unitId)).size).toBe(2);
  });

  it('rolls back an entire inventory merge when a garment insertion fails mid-transfer', () => {
    let insertions = 0;
    let failOnce = true;
    class FailingInventory extends Inventory {
      override putGarmentUnit(unit: GarmentUnit): string {
        if (failOnce && ++insertions === 2) {
          failOnce = false;
          throw new Error('simulated insertion failure');
        }
        return super.putGarmentUnit(unit);
      }
    }
    const source = new Inventory();
    source.add('fur_hat', 2);
    source.add('berries', 5);
    source.setGarmentUnitCondition(source.garmentUnitsOf('fur_hat')[0]!.unitId, 0.22, 31);
    const destination = new FailingInventory();
    destination.add('fur_hat', 1);
    destination.add('sticks', 3);
    const sourceBefore = source.transferSnapshot();
    const destinationBefore = destination.transferSnapshot();
    expect(() => source.transferAllTo(destination)).toThrow('simulated insertion failure');
    expect(source.transferSnapshot()).toEqual(sourceBefore);
    expect(destination.transferSnapshot()).toEqual(destinationBefore);

    expect(source.transferAllTo(destination)).toBe(7);
    expect(source.total).toBe(0);
    expect(destination.count('fur_hat')).toBe(3);
    expect(destination.count('berries')).toBe(5);
    expect(destination.garmentUnitsOf('fur_hat').find(unit => unit.wear === 0.22))
      .toMatchObject({ wear: 0.22, repairProgress: 31 });
  });

  it('rejects duplicate physical identity before changing either inventory', () => {
    const source = new Inventory();
    source.add('fur_hat', 2);
    const rows = (source as unknown as { garmentUnits: GarmentUnit[] }).garmentUnits;
    rows[1] = { ...rows[1]!, unitId: rows[0]!.unitId };
    const destination = new Inventory();
    destination.add('sticks', 4);
    const destinationBefore = destination.transferSnapshot();

    expect(() => source.transferAllTo(destination)).toThrow(/duplicate garment unit identity/);
    expect(source.count('fur_hat')).toBe(2);
    expect(source.garmentUnitsOf('fur_hat').map(unit => unit.unitId))
      .toEqual([rows[0]!.unitId, rows[0]!.unitId]);
    expect(destination.transferSnapshot()).toEqual(destinationBefore);
  });

  it('does not partially merge households when a home store garment count is inconsistent', () => {
    const sim = new Simulation({ seed: 'garment-household-merge', world: { width: 64, height: 64 },
      population: { bands: 2, peoplePerBand: 6 } });
    const first = sim.livingPeople().find(person => !person.isChild)!;
    const second = sim.livingPeople().find(person => !person.isChild && person.householdId !== first.householdId)!;
    const elder = first.age >= second.age ? first : second;
    const younger = elder === first ? second : first;
    const targetHouse = sim.householdsById.get(elder.householdId!)!;
    const sourceHouse = sim.householdsById.get(younger.householdId!)!;
    const placeStore = (person: Person) => {
      for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
        const placed = sim.place('storage_pit', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
        if (placed) return placed;
      }
      throw new Error('could not place household storage');
    };
    const targetStore = placeStore(elder);
    const sourceStore = placeStore(younger);
    targetHouse.homeBuildingId = targetStore.id;
    sourceHouse.homeBuildingId = sourceStore.id;
    targetHouse.wealth = 17;
    sourceHouse.wealth = 23;
    targetStore.store.add('fur_hat', 1);
    const targetUnit = targetStore.store.garmentUnitsOf('fur_hat')[0]!;
    targetStore.store.setGarmentUnitCondition(targetUnit.unitId, 0.83, 8);
    sourceStore.store.add('fur_hat', 1);
    const sourceUnit = sourceStore.store.garmentUnitsOf('fur_hat')[0]!;
    expect(sourceUnit.unitId).toBe(targetUnit.unitId);
    sourceStore.store.setGarmentUnitCondition(sourceUnit.unitId, 0.19, 52);
    const sourceRows = (sourceStore.store as unknown as { garmentUnits: GarmentUnit[] }).garmentUnits;
    sourceRows.push({ ...sourceUnit, unitId: 'invalid-extra-unit' });

    expect(() => sim.mergeHouseholds(elder, younger)).toThrow(/garment units do not match garment counts/);
    expect(targetHouse.memberIds).not.toContain(younger.id);
    expect(sourceHouse.memberIds).toContain(younger.id);
    expect(targetHouse.wealth).toBe(17);
    expect(sourceHouse.wealth).toBe(23);
    expect(targetStore.store.count('fur_hat')).toBe(1);
    expect(sourceStore.store.count('fur_hat')).toBe(1);

    sourceRows.pop();
    sim.mergeHouseholds(elder, younger);
    expect(targetStore.store.count('fur_hat')).toBe(2);
    expect(sourceStore.store.count('fur_hat')).toBe(0);
    const merged = targetStore.store.garmentUnitsOf('fur_hat');
    expect(new Set(merged.map(unit => unit.unitId)).size).toBe(2);
    expect(merged).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: targetUnit.unitId, wear: 0.83, repairProgress: 8 }),
      expect.objectContaining({ wear: 0.19, repairProgress: 52 }),
    ]));
  });

  it('rolls back household membership and both home stores when a garment merge insertion fails', () => {
    const sim = new Simulation({ seed: 'garment-household-merge-reject', world: { width: 64, height: 64 },
      population: { bands: 2, peoplePerBand: 6 } });
    const first = sim.livingPeople().find(person => !person.isChild)!;
    const second = sim.livingPeople().find(person => !person.isChild && person.householdId !== first.householdId)!;
    const elder = first.age >= second.age ? first : second;
    const younger = elder === first ? second : first;
    const targetHouse = sim.householdsById.get(elder.householdId!)!;
    const sourceHouse = sim.householdsById.get(younger.householdId!)!;
    const placeStore = (person: Person) => {
      for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
        const placed = sim.place('storage_pit', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
        if (placed) return placed;
      }
      throw new Error('could not place household storage');
    };
    const targetStore = placeStore(elder);
    const sourceStore = placeStore(younger);
    targetHouse.homeBuildingId = targetStore.id;
    sourceHouse.homeBuildingId = sourceStore.id;
    targetHouse.wealth = 17;
    sourceHouse.wealth = 23;
    targetStore.store.add('fur_hat', 1);
    sourceStore.store.add('fur_hat', 2);
    sourceStore.store.add('berries', 3);
    for (const [index, unit] of sourceStore.store.garmentUnitsOf('fur_hat').entries()) {
      sourceStore.store.setGarmentUnitCondition(unit.unitId, index === 0 ? 0.19 : 0.46, 52 + index);
    }
    const sourceBefore = sourceStore.store.transferSnapshot();
    const targetBefore = targetStore.store.transferSnapshot();
    const put = targetStore.store.putGarmentUnit.bind(targetStore.store);
    let attempts = 0;
    targetStore.store.putGarmentUnit = unit => {
      if (++attempts === 2) throw new Error('simulated home-store insertion failure');
      return put(unit);
    };

    expect(() => sim.mergeHouseholds(elder, younger)).toThrow('simulated home-store insertion failure');
    expect(sourceStore.store.transferSnapshot()).toEqual(sourceBefore);
    expect(targetStore.store.transferSnapshot()).toEqual(targetBefore);
    expect(targetHouse.memberIds).not.toContain(younger.id);
    expect(sourceHouse.memberIds).toContain(younger.id);
    expect(targetHouse.wealth).toBe(17);
    expect(sourceHouse.wealth).toBe(23);
  });

  it('drops only unpacked garment units when carry reconciliation sheds excess', () => {
    const person = new Person('Overloaded', 8, 8, 0, new RNG('garment-overflow'));
    person.age = 30 * 80;
    person.inventory.add('wool_cloak', 12);
    const worn = person.inventory.garmentUnitsOf('wool_cloak')[0]!;
    person.equipment.cloak = { item: 'wool_cloak', count: 1, unitId: worn.unitId };
    person.inventory.setGarmentUnitCondition(worn.unitId, 0.58, 21);
    const drops: { count: number; units?: readonly { unitId: string; wear: number; repairProgress: number }[] }[] = [];

    reconcileCarry(person, DEFAULT_CONFIG.carry, (_x, _y, _id, count, units) => drops.push({ count, units }));

    expect(person.equipment.cloak?.unitId).toBe(worn.unitId);
    expect(person.inventory.ownsGarmentUnit('wool_cloak', worn.unitId)).toBe(true);
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.every(drop => drop.count === drop.units?.length)).toBe(true);
    expect(drops.flatMap(drop => drop.units ?? []).some(unit => unit.unitId === worn.unitId)).toBe(false);
  });

  it('inherits exact worn and unworn garment rows without recreating them', () => {
    const deceased = new Person('Deceased', 8, 8, 0, new RNG('estate-garment'));
    const heir = new Person('Heir', 9, 8, 0, new RNG('estate-heir'));
    deceased.inventory.add('wool_cloak', 2);
    const [worn, spare] = deceased.inventory.garmentUnitsOf('wool_cloak');
    deceased.equipment.cloak = { item: 'wool_cloak', count: 1, unitId: worn!.unitId };
    deceased.inventory.setGarmentUnitCondition(worn!.unitId, 0.38, 67);
    deceased.inventory.setGarmentUnitCondition(spare!.unitId, 0.81, 12);
    const before = deceased.inventory.garmentUnitsOf('wool_cloak');

    expect(settleEstate(deceased, heir, null, () => { throw new Error('unexpected drop'); })).toBe(2);
    expect(deceased.inventory.count('wool_cloak')).toBe(0);
    expect(heir.inventory.count('wool_cloak')).toBe(2);
    expect(heir.inventory.garmentUnitsOf('wool_cloak')).toEqual(before);
    expect(heir.inventory.ownsGarmentUnit('wool_cloak', worn!.unitId)).toBe(true);
  });

  it('drops exact garment rows at the deceased feet when there is no heir or home', () => {
    const deceased = new Person('Deceased', 8, 8, 0, new RNG('estate-ground'));
    deceased.inventory.add('fur_hat', 2);
    const [first, second] = deceased.inventory.garmentUnitsOf('fur_hat');
    deceased.inventory.setGarmentUnitCondition(first!.unitId, 0.24, 91);
    deceased.inventory.setGarmentUnitCondition(second!.unitId, 0.73, 9);
    const drops: GarmentUnit[] = [];

    expect(settleEstate(deceased, null, null, (_x, _y, itemId, count, units) => {
      expect(itemId).toBe('fur_hat');
      expect(count).toBe(2);
      drops.push(...(units ?? []));
    })).toBe(2);
    expect(deceased.inventory.count('fur_hat')).toBe(0);
    expect(drops).toEqual([first, second].map((unit, index) => ({ ...unit!, wear: index ? 0.73 : 0.24, repairProgress: index ? 9 : 91 })));
  });

  it('rejects an inconsistent estate before heir or ground ownership changes', () => {
    const deceased = new Person('Deceased', 8, 8, 0, new RNG('estate-invalid'));
    const heir = new Person('Heir', 9, 8, 0, new RNG('estate-invalid-heir'));
    deceased.inventory.add('fur_hat', 1);
    const malformed = deceased.inventory as unknown as { garmentUnits: GarmentUnit[] };
    malformed.garmentUnits.push({ ...malformed.garmentUnits[0]!, unitId: 'extra-row' });
    const dropped: GarmentUnit[] = [];

    expect(() => settleEstate(deceased, heir, null, (_x, _y, _id, _count, units) => dropped.push(...(units ?? []))))
      .toThrow(/garment units do not match garment counts/);
    expect(deceased.inventory.count('fur_hat')).toBe(1);
    expect(heir.inventory.count('fur_hat')).toBe(0);
    expect(dropped).toEqual([]);
  });

  it('sends garment rows to the household home store when there is no heir', () => {
    const deceased = new Person('Deceased', 8, 8, 0, new RNG('estate-home'));
    const home = new Building(BUILDINGS.storage_pit!, 8, 8, 0);
    deceased.inventory.add('fur_hat', 1);
    const unit = deceased.inventory.garmentUnitsOf('fur_hat')[0]!;
    deceased.inventory.setGarmentUnitCondition(unit.unitId, 0.46, 33);

    expect(settleEstate(deceased, null, home, () => { throw new Error('unexpected drop'); })).toBe(1);
    expect(deceased.inventory.count('fur_hat')).toBe(0);
    expect(home.store.garmentUnitsOf('fur_hat')).toMatchObject([{ wear: 0.46, repairProgress: 33 }]);
  });
});
