import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';
import { toPersonRecord, fromPersonRecord } from '../persistence/EntityRecords.ts';
import { CompactAuthority } from '../compact/CompactAuthority.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { fromCompactRecord, toCompactRecord, type CompactPerson } from '../compact/CompactPerson.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function fixture() {
  const sim = new Simulation({ seed: 'compact-advance', world: { width: 48, height: 48, treeDensity: 0.1 },
    population: { bands: 2, peoplePerBand: 5 } });
  sim.possessFirst();
  for (let i = 0; i < 300; i++) sim.step();
  const person = sim.people.find(p => p.alive && !p.isPlayer && p.targetPersonId === null && p.caughtId === null &&
    p.fleeFromId === null && p.carriedBy === null && p.armsTaken === 0)!;
  const tick = sim.time.tick;
  const authority = new CompactAuthority('compact-advance');
  const compact = (authority.demote(person, tick) as any).value as CompactPerson;
  let nextId = 1;
  const body = new CompactBody({ needs: sim.config.needs, time: sim.config.time, world: sim.world, nextEventId: () => nextId++ });
  return { sim, tick, compact, body, authority, person };
}

describe('compact body advance', () => {
  it('equals the detailed needs clock driven tick by tick (shared code, same ticks)', () => {
    const { sim, tick, compact, body } = fixture();
    const hungerBefore = compact.person.needs.hunger;
    const reference = fromPersonRecord(wire(toPersonRecord(compact.person, tick)));
    const clock = new TimeManager(sim.config.time);
    const system = new NeedsSystem(sim.config.needs, sim.world);
    for (let t = tick + 1; t <= tick + 480; t++) { clock.tick = t; system.update([reference], clock, [], undefined, {}); }
    body.advance(compact, tick + 480);
    expect(compact.lastAdvancedTick).toBe(tick + 480);
    expect(toPersonRecord(compact.person, tick + 480)).toEqual(toPersonRecord(reference, tick + 480));
    expect(compact.person.needs.hunger).toBeGreaterThan(hungerBefore); // really advanced, not a no-op
  });

  it('a slice boundary and a JSON round trip change nothing: 0->300 equals 0->100->300', () => {
    const { tick, compact, body } = fixture();
    const twin = fromCompactRecord(wire(toCompactRecord(compact)));
    body.advance(compact, tick + 300);
    body.advance(twin, tick + 100);
    const mid = fromCompactRecord(wire(toCompactRecord(twin)));
    body.advance(mid, tick + 300);
    expect(toPersonRecord(mid.person, tick + 300)).toEqual(toPersonRecord(compact.person, tick + 300));
    expect(wire(toCompactRecord(mid))).toEqual(wire(toCompactRecord(compact)));
    expect(compact.person.needs.thirst).toBeGreaterThan(0);
  });

  it('dates a death by thirst and never resurrects or advances the dead', () => {
    const { sim, tick, compact, body } = fixture();
    compact.person.health = 100;
    compact.person.needs.thirst = 0;
    const events = body.advance(compact, tick + 6000);
    expect(compact.person.alive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'death', subjectId: compact.person.id });
    expect(events[0]!.tick).toBeGreaterThan(tick);
    expect(events[0]!.tick).toBeLessThan(tick + 6000);
    expect(['dehydration', 'starvation', 'exposure']).toContain((events[0]!.data as any).cause);
    const frozen = toPersonRecord(compact.person, tick + 6000);
    expect(body.advance(compact, tick + 7000)).toEqual([]);
    expect(toPersonRecord(compact.person, tick + 7000).graph).toEqual(frozen.graph);
    void sim;
  });

  it('negative controls: wrong rates, a skipped slice and a rewound date are all detectable', () => {
    const { sim, tick, compact, body } = fixture();
    const copyRecord = wire(toCompactRecord(compact));
    const doubled = new CompactBody({ needs: { ...sim.config.needs, hungerRate: sim.config.needs.hungerRate * 2 },
      time: sim.config.time, nextEventId: () => 1 });
    const wrongRate = fromCompactRecord(copyRecord);
    doubled.advance(wrongRate, tick + 200);
    body.advance(compact, tick + 200);
    expect(wrongRate.person.needs.hunger).not.toBe(compact.person.needs.hunger);   // a changed rate is seen
    // Losing the slice 100..200 (state lost by skipping a day) is also seen.
    const lossy = fromCompactRecord(copyRecord);
    body.advance(lossy, tick + 100);
    lossy.lastAdvancedTick = tick + 200;
    body.advance(lossy, tick + 300);
    const honest = fromCompactRecord(copyRecord);
    body.advance(honest, tick + 300);
    expect(toPersonRecord(lossy.person, tick + 300)).not.toEqual(toPersonRecord(honest.person, tick + 300));
    expect(() => body.advance(compact, tick + 100)).toThrow(/backwards/);
  });
});
