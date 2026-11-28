import { WorldState } from '../world/WorldState.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { toPersonRecord, fromPersonRecord } from '../persistence/EntityRecords.ts';
import { Household } from '../entities/Household.ts';
import { frontierGeography } from '../../../tools/frontierFixture.ts';
import { ComarcaOffmapRuntime } from '../world/ComarcaOffmapRuntime.ts';
import { describe, expect, it } from 'vitest';
import { IdSpace } from '../core/IdSpace.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { deriveCompactStream, goalOf } from '../compact/CompactPerson.ts';
import { advanceComarcaOffmapHarvest, allocateComarcaOffmapNutrition, createComarcaOffmapFoodBudget } from '../world/ComarcaOffmapRuntime.ts';
import { Inventory, ITEMS } from '../entities/Item.ts';

function member(id: number, bandId: number, ids: IdSpace) {
  const person = new Person(`P${id}`, 0, 0, bandId, new RNG(`offmap-${id}`), 80, ids);
  person.age = 20 * person.daysPerYear;
  person.health = 100;
  return { person, lastAdvancedTick: 0, epoch: 0, rng: deriveCompactStream('offmap', person.id),
    goal: goalOf(person, 0), intake: null };
}

describe('deterministic off-map physical food policy', () => {
  it('debits real nodes using harvestTicks and detailed yield formulas', () => {
    const ids = new IdSpace();
    const person = member(1, 7, ids);
    const berries = new ResourceNode('berries', 1, 1, new RNG('berries'), ids);
    berries.amount = 14;
    const before = berries.amount;
    const result = advanceComarcaOffmapHarvest([berries], [person], 80);
    expect(berries.amount).toBeLessThan(before);
    expect(result.workTicks).toBeGreaterThan(0);
    expect(result.items.berries).toBe(before - berries.amount);
    expect(result.producedRations).toBeGreaterThan(0);
    expect(result.workTicks).toBeLessThanOrEqual(20);
  });

  it('shares a finite ration and water budget evenly in stable person order', () => {
    const ids = new IdSpace();
    const a = member(1, 7, ids), b = member(2, 7, ids);
    expect(allocateComarcaOffmapNutrition([b, a], 1.5, 0.5).allocations).toEqual([
      { personId: a.person.id, foodQuota: 0.75, waterQuota: 0.25 },
      { personId: b.person.id, foodQuota: 0.75, waterQuota: 0.25 },
    ]);
  });
});

describe('shared physical food across parked bands', () => {
  it('counts shared ground stock once by population, preserves private stock, and debits finite quotas', () => {
    const ids = new IdSpace();
    const a = member(1, 7, ids), b = member(2, 7, ids), c = member(3, 8, ids);
    const shared = new Inventory();
    const own = a.person.inventory;
    const unit = ITEMS['berries']?.nutrition ?? 0;
    expect(unit).toBeGreaterThan(0);
    own.add('berries', 2);
    shared.add('berries', 6);
    const stocks = new Map([[7, [own, b.person.inventory]], [8, [c.person.inventory]]]);
    const food = createComarcaOffmapFoodBudget([c, b, a], stocks, [shared]);
    expect(food.availablePerPerson(7)).toBeCloseTo(3 * unit);
    expect(food.availablePerPerson(8)).toBeCloseTo(2 * unit);
    expect(food.availablePerPerson(9)).toBe(0);
    // Harvest adds to the live private pool before ration quotas are frozen.
    own.add('berries', 2);
    expect(food.availablePerPerson(7)).toBeCloseTo(4 * unit);
    const take = food.snapshotRations();
    expect(take(a.person.id, unit)).toBeCloseTo(unit);
    expect(shared.count('berries')).toBe(6);
    expect(take(c.person.id, 100 * unit)).toBeCloseTo(2 * unit);
    expect(take(c.person.id, 100 * unit)).toBeCloseTo(0);
    expect(own.count('berries')).toBeCloseTo(3);
    expect(take(a.person.id, 100 * unit)).toBeCloseTo(3 * unit);
    expect(take(b.person.id, 100 * unit)).toBeCloseTo(4 * unit);
    expect(own.count('berries')).toBeCloseTo(0);
    expect(shared.count('berries')).toBeCloseTo(0);
  });

  it('leaves unclaimed shares on the ground until a new tick, not in another band quota', () => {
    const ids = new IdSpace();
    const a = member(1, 7, ids), b = member(2, 8, ids);
    const shared = new Inventory();
    const unit = ITEMS['berries']?.nutrition ?? 0;
    shared.add('berries', 2);
    const food = createComarcaOffmapFoodBudget([a, b], new Map(), [shared]);
    const take = food.snapshotRations();
    expect(take(a.person.id, 10 * unit)).toBeCloseTo(unit);
    expect(take(a.person.id, 10 * unit)).toBeCloseTo(0);
    expect(shared.count('berries')).toBeCloseTo(1);
    const next = createComarcaOffmapFoodBudget([b], new Map(), [shared]).snapshotRations();
    expect(next(b.person.id, 10 * unit)).toBeCloseTo(unit);
    expect(shared.count('berries')).toBeCloseTo(0);
  });
});

describe('a real parked comarca authority', () => {
  function fixture() {
    const root = new WorldState({ seed: 'parked-world', world: { width: 32,height:32 }, population: { bands: 1,peoplePerBand:4,conceptionChance:0 },
      time: { ticksPerDay:40,daysPerSeason:20,startDay:0 }, needs: { coldRate:0 } },
      { geography: frontierGeography(), start: { x:40.5,y:20.5 }, peoples:false });
    const entry = root.tileLedger.capture(root);
    return {root,runtime:ComarcaOffmapRuntime.start(toCheckpointRecord(root.current),entry)};
  }
  it('passes finite shared home admission to real parked demography and preserves save/resume', () => {
    function parked(withRoof: boolean) {
      const root = new WorldState({ seed: 'parked-conception', world: { width:32, height:32 },
        population: { bands:1, peoplePerBand:4, conceptionChance:1 },
        time: { ticksPerDay:40, daysPerSeason:20, startDay:0 },
        needs: { hungerRate:0, thirstRate:0, fatigueRate:0, coldRate:0 } },
        { geography: frontierGeography(), start: { x:40.5, y:20.5 }, peoples:false });
      const sim = root.current;
      const [mother, father] = sim.people;
      if (!mother || !father) throw new Error('fixture needs two founders');
      for (const p of sim.people) {
        p.age = 25 * p.daysPerYear; p.lifespanDays = 65 * p.daysPerYear; p.sex = 'male';
        p.spouseId = null; p.pregnant = false; p.pregnantBy = null; p.gestationLeft = 0;
        p.needs.hunger = p.needs.thirst = p.needs.cold = p.needs.fatigue = 0; p.health = 100;
      }
      mother.sex = 'female'; mother.lastBirthDay = -9999;
      mother.spouseId = father.id; father.spouseId = mother.id;
      const family = new Household('Parked family', mother.id, mother.bandId, 0, sim.ids);
      for (const p of [mother, father]) {
        if (p.householdId !== null) sim.householdsById.get(p.householdId)?.remove(p.id);
        p.householdId = family.id; family.add(p.id);
      }
      sim.households.push(family); sim.householdsById.set(family.id, family);
      const roof = sim.buildings.find(b => b.def.id === 'mud_hut' && b.ownerBandId === mother.bandId);
      if (!roof) throw new Error('fixture needs a local hut');
      roof.complete = withRoof; roof.durability = withRoof ? roof.def.workTicks : null;
      family.homeBuildingId = roof.id;
      const entry = root.tileLedger.capture(root);
      return { root, motherId: mother.id,
        runtime: ComarcaOffmapRuntime.start(toCheckpointRecord(sim), entry) };
    }
    const a = parked(true), b = parked(true), c = parked(false);
    const whole = a.runtime.advanceTo(40, a.root.geography);
    const partial = b.runtime.advanceTo(17, b.root.geography);
    const resumed = ComarcaOffmapRuntime.fromRecord(JSON.parse(JSON.stringify(partial)))
      .advanceTo(40, b.root.geography);
    const noRoof = c.runtime.advanceTo(40, c.root.geography);
    const pregnant = (record: typeof whole, id: number) =>
      fromPersonRecord(record.compact.find(p => p.personId === id)!.person).pregnant;
    expect(pregnant(whole, a.motherId)).toBe(true);
    expect(pregnant(noRoof, c.motherId)).toBe(false);
    expect(resumed.compact).toEqual(whole.compact);
    expect(resumed.checkpoint.roster).toEqual(whole.checkpoint.roster);
    expect(resumed.life).toEqual(whole.life);
  });

  it('advances named bodies, physical work and clocks without Simulation.step', () => {
    const {root,runtime} = fixture();
    const before = root.current.people[0]!.needs.hunger;
    const record = runtime.advanceTo(40,root.geography,root.ids);
    expect(record.checkpoint.lastAdvancedTick).toBe(40);
    expect(record.ecology.entry.lastAdvancedTick).toBe(40);
    expect(root.current.time.tick).toBe(0);
    expect(record.compact.every(p=>p.lastAdvancedTick===40)).toBe(true);
    expect(fromPersonRecord(record.checkpoint.roster.people[0]!).needs.hunger).not.toBe(before);
    expect(()=>ComarcaOffmapRuntime.fromRecord(record)).not.toThrow();
  });
  it('survives a JSON resume at a partial day without changing bodies, items or streams', () => {
    const whole = fixture(), split = fixture();
    const a = whole.runtime.advanceTo(61,whole.root.geography);
    const partial = split.runtime.advanceTo(17,split.root.geography);
    const restored = ComarcaOffmapRuntime.fromRecord(JSON.parse(JSON.stringify(partial)));
    const b = restored.advanceTo(61,split.root.geography);
    expect(b.compact).toEqual(a.compact);
    expect(b.checkpoint.roster).toEqual(a.checkpoint.roster);
    expect(b.checkpoint.objects).toEqual(a.checkpoint.objects);
    expect(b.work).toEqual(a.work);
  });
  it('debits food before body relief and does not replenish it on restore', () => {
    const {root,runtime} = fixture();
    const record = runtime.toRecord(), first = record.compact[0]!;
    const person = fromPersonRecord(first.person); person.inventory.add('berries',1); person.needs.hunger=70;
    const changed = toPersonRecord(person,0);
    const wire = JSON.parse(JSON.stringify(record));
    wire.compact[0].person=changed; wire.compact[0].intake={day:0,hunger:100,thirst:1};
    wire.checkpoint.roster.people[wire.checkpoint.roster.people.findIndex((p:any)=>fromPersonRecord(p).id===person.id)] = changed;
    const next = ComarcaOffmapRuntime.fromRecord(wire).advanceTo(1,root.geography);
    const advanced = fromPersonRecord(next.compact[0]!.person);
    expect(advanced.inventory.count('berries')).toBeLessThan(1);
    expect(advanced.needs.hunger).toBeLessThan(70);
    expect(ComarcaOffmapRuntime.fromRecord(JSON.parse(JSON.stringify(next))).toRecord()).toEqual(next);
  });
});
