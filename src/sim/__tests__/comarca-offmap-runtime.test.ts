import { WorldState } from '../world/WorldState.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { toPersonRecord, fromPersonRecord } from '../persistence/EntityRecords.ts';
import { frontierGeography } from '../../../tools/frontierFixture.ts';
import { ComarcaOffmapRuntime } from '../world/ComarcaOffmapRuntime.ts';
import { describe, expect, it } from 'vitest';
import { IdSpace } from '../core/IdSpace.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { ResourceNode } from '../entities/ResourceNode.ts';
import { deriveCompactStream, goalOf } from '../compact/CompactPerson.ts';
import { advanceComarcaOffmapHarvest, allocateComarcaOffmapNutrition } from '../world/ComarcaOffmapRuntime.ts';

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

describe('a real parked comarca authority', () => {
  function fixture() {
    const root = new WorldState({ seed: 'parked-world', world: { width: 32,height:32 }, population: { bands: 1,peoplePerBand:4,conceptionChance:0 },
      time: { ticksPerDay:40,daysPerSeason:20,startDay:0 }, needs: { coldRate:0 } },
      { geography: frontierGeography(), start: { x:40.5,y:20.5 }, peoples:false });
    const entry = root.tileLedger.capture(root);
    return {root,runtime:ComarcaOffmapRuntime.start(toCheckpointRecord(root.current),entry)};
  }
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
