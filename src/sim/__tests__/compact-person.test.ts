import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { toPersonRecord } from '../persistence/EntityRecords.ts';
import { CompactAuthority } from '../compact/CompactAuthority.ts';
import { deriveCompactStream, fromCompactRecord, toCompactRecord } from '../compact/CompactPerson.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function evolved(): { sim: Simulation; tick: number } {
  const sim = new Simulation({ seed: 'compact-person', world: { width: 48, height: 48, treeDensity: 0.1 },
    population: { bands: 2, peoplePerBand: 5 } });
  sim.possessFirst();
  for (let i = 0; i < 700; i++) sim.step();
  return { sim, tick: sim.time.tick };
}

function candidate(sim: Simulation) {
  const person = sim.people.find(p => p.alive && !p.isPlayer && p.householdId !== null && p.action !== 'idle' &&
    p.targetPersonId === null && p.caughtId === null && p.fleeFromId === null && p.carriedBy === null && p.armsTaken === 0);
  if (!person) throw new Error('fixture has no eligible working person');
  return person;
}

describe('compact person and single authority', () => {
  it('keeps identity, household, kin, inventory, body, memories and pending work through repeated level changes', () => {
    const { sim, tick } = evolved();
    const person = candidate(sim);
    person.inventory.add('sticks', 3);
    person.body.left_leg.damage = 0.2;
    person.workBankKey = 'building:7'; person.workBankTicks = 31;
    const before = toPersonRecord(person, tick);
    const first = new CompactAuthority('compact-person');
    let authority = first;
    const control = deriveCompactStream('compact-person', person.id);
    let drawn = 0;

    let current = authority.demote(person, tick);
    expect(current.ok).toBe(true);
    for (let cycle = 0; cycle < 4; cycle++) {
      const compact = (current as any).value;
      if (cycle === 0) expect(compact.person).toBe(person); // first move: the same instance, nothing copied
      expect(compact.rng.nextUint32()).toBe(control.nextUint32()); drawn++;
      // Through JSON into a fresh authority, as a reload would do.
      const record = wire(toCompactRecord(compact));
      const reloaded = new CompactAuthority('compact-person');
      const adopted = reloaded.adopt(record);
      expect(adopted.ok).toBe(true);
      const copy = (adopted as any).value;
      expect(toPersonRecord(copy.person, tick)).toEqual(before);
      expect(copy.person.id).toBe(person.id);
      expect(copy.person.householdId).toBe(person.householdId);
      expect(copy.person.inventory.count('sticks')).toBe(person.inventory.count('sticks'));
      expect(copy.person.workBankKey).toBe('building:7');
      const back = reloaded.promote(copy, tick);
      expect(back.ok).toBe(true);
      const again = reloaded.demote((back as any).value, tick);
      expect(again.ok).toBe(true);
      authority = reloaded;
      current = again;
      // The stream continues across the promote/demote: it is not re-derived.
      const resumed = (again as any).value;
      expect(resumed.rng.nextUint32()).toBe(control.nextUint32()); drawn++;
      const roundTrip = authority.promote(resumed, tick);
      expect(roundTrip.ok).toBe(true);
      current = authority.demote((roundTrip as any).value, tick);
    }
    expect(drawn).toBe(8);
    expect(toPersonRecord((current as any).value.person, tick)).toEqual(before);
  });

  it('never gives a person two owners (negative controls: duplicate demote, double promote, stale record)', () => {
    const { sim, tick } = evolved();
    const person = candidate(sim);
    const authority = new CompactAuthority('compact-person');
    const compact = (authority.demote(person, tick) as any).value;
    expect(authority.ownerOf(person.id)).toBe('compact');
    expect(authority.demote(person, tick)).toEqual({ ok: false, reason: 'already_compact' });
    const record = wire(toCompactRecord(compact));
    expect(authority.adopt(record)).toEqual({ ok: false, reason: 'already_compact' }); // a second live copy
    expect(authority.promote(compact, tick + 5)).toEqual({ ok: false, reason: 'behind_transition_tick' });
    expect(authority.promote(compact, tick).ok).toBe(true);
    expect(authority.promote(compact, tick)).toEqual({ ok: false, reason: 'already_detailed' });
    expect(authority.adopt(record)).toEqual({ ok: false, reason: 'stale_record' });  // an old record cannot revive a person
    expect(authority.ownerOf(person.id)).toBe('detailed');
    const decoded = fromCompactRecord(record);
    const other = new CompactAuthority('compact-person');
    other.demote(person, tick);
    expect(other.promote(decoded, tick)).toEqual({ ok: false, reason: 'not_live' }); // a decoded duplicate is not the owner
  });

  it('names the reason when a person cannot become compact', () => {
    const { sim, tick } = evolved();
    const authority = new CompactAuthority('compact-person');
    expect(authority.demote(sim.player!, tick)).toEqual({ ok: false, reason: 'player' });
    const person = candidate(sim);
    person.carriedBy = 99;
    expect(authority.demote(person, tick)).toEqual({ ok: false, reason: 'carried' });
    person.carriedBy = null; person.boundBy = 4;
    expect(authority.demote(person, tick)).toEqual({ ok: false, reason: 'held_or_bound' });
    person.boundBy = null; person.armsTaken = 1;
    expect(authority.demote(person, tick)).toEqual({ ok: false, reason: 'carrying_baby' });
    person.armsTaken = 0; person.targetPersonId = 3;
    expect(authority.demote(person, tick)).toEqual({ ok: false, reason: 'interacting' });
    person.targetPersonId = null; person.alive = false;
    expect(authority.demote(person, tick)).toEqual({ ok: false, reason: 'dead' });
    expect(authority.compactCount).toBe(0);
  });

  it('a lossy record is detectable and a damaged one is refused', () => {
    const { sim, tick } = evolved();
    const person = candidate(sim);
    person.inventory.add('sticks', 2);
    const authority = new CompactAuthority('compact-person');
    const record = wire(toCompactRecord((authority.demote(person, tick) as any).value));
    const lost = fromCompactRecord(record);
    lost.person.inventory.remove('sticks', 2);   // state lost in transit
    expect(toPersonRecord(lost.person, tick)).not.toEqual(toPersonRecord(person, tick));
    expect(() => fromCompactRecord({ ...record, lastAdvancedTick: tick + 1 })).toThrow(/stamped/);
    expect(() => fromCompactRecord({ ...record, personId: person.id + 1 })).toThrow(/personId/);
    expect(() => fromCompactRecord({ ...record, goal: { kind: 'fly', since: 0, target: null } })).toThrow(/goal/);
    expect(() => fromCompactRecord({ ...record, version: 2 })).toThrow();
    expect(RNG.fromSnapshot(record.rng).nextUint32()).toBe(deriveCompactStream('compact-person', person.id).nextUint32());
  });
});
