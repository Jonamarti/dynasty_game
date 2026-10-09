import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { CompactBody } from '../compact/CompactAdvance.ts';
import { CompactBandIntake, type CompactBandIntakeAllocation } from '../compact/CompactBandIntake.ts';
import { CompactAuthority } from '../compact/CompactAuthority.ts';
import { fromCompactRecord, toCompactRecord, type CompactPerson } from '../compact/CompactPerson.ts';
import { IntakeModel } from '../compact/CompactIntake.ts';
import { NEED_BINS, QUANTILE_STEPS, rateKey, type RateTable } from '../compact/CompactCalibration.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const fake = (id: number) => ({ person: { id } } as CompactPerson);

function plan(day: number, allocations: readonly CompactBandIntakeAllocation[], foodBudget: number,
  waterAvailability: number | 'unbounded') {
  return { day, allocations, foodBudget, waterAvailability };
}
function flatIntake(): IntakeModel {
  const table: RateTable = {};
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const)
    for (const group of ['nursling', 'child', 'adult'] as const)
      for (const need of ['hunger', 'thirst'] as const)
        for (let bin = 0; bin < NEED_BINS; bin++)
          table[rateKey(season, group, need, bin)] = {
            n: 100, mean: 1, q: Array(QUANTILE_STEPS).fill(1), zero: 0, nz: 100, qf: Array(QUANTILE_STEPS).fill(1),
          };
  return new IntakeModel(table);
}

function bodyFixture() {
  const sim = new Simulation({ seed: 'compact-band-intake-body', world: { width: 48, height: 48, treeDensity: 0.1 },
    population: { bands: 2, peoplePerBand: 5 } });
  sim.possessFirst();
  for (let i = 0; i < 300; i++) sim.step();
  const person = sim.people.find(p => p.alive && !p.isPlayer && p.years >= 14 && p.targetPersonId === null &&
    p.caughtId === null && p.fleeFromId === null && p.carriedBy === null && p.armsTaken === 0)!;
  const tick = sim.time.tick;
  const compact = (new CompactAuthority('compact-band-intake-body').demote(person, tick) as any).value as CompactPerson;
  compact.person.needs.hunger = 0;
  compact.person.needs.thirst = 0;
  compact.person.health = 100;
  return { sim, compact, tick };
}

function advanceDayByDay(body: CompactBody, compact: CompactPerson, intake: CompactBandIntake,
  toTick: number, foodQuota: number) {
  const tpd = intake.ticksPerDay;
  let nextTick = compact.lastAdvancedTick + 1;
  while (nextTick <= toTick && compact.person.alive) {
    const day = Math.floor((nextTick - 1) / tpd);
    intake.beginDay(plan(day, [{ personId: compact.person.id, foodQuota, waterQuota: 'unbounded' }], foodQuota, 'unbounded'));
    const endOfDay = (day + 1) * tpd;
    const end = Math.min(toTick, endOfDay);
    body.advance(compact, end);
    nextTick = end + 1;
  }
}

describe('compact band intake quotas', () => {
  it('caps cumulative food by explicit per-person allocations and records used versus budget', () => {
    const intake = new CompactBandIntake({ ticksPerDay: 10 });
    intake.beginDay(plan(0, [
      { personId: 1, foodQuota: 5, waterQuota: 0 },
      { personId: 2, foodQuota: 3, waterQuota: 0 },
    ], 8, 0));
    expect(intake.ration(fake(1), 1, 4, 9)).toEqual({ hunger: 4, thirst: 0 });
    expect(intake.ration(fake(1), 10, 4, 9)).toEqual({ hunger: 1, thirst: 0 });
    expect(intake.ration(fake(2), 10, 9, 9)).toEqual({ hunger: 3, thirst: 0 });
    expect(intake.report).toMatchObject({ day: 0, foodBudget: 8, foodQuota: 8, foodUsed: 8, foodRemaining: 0, waterAvailability: 0, waterUsed: 0 });
    expect(() => intake.beginDay(plan(0, [], 0, 0))).toThrow(/advance once/);
  });

  it('limits finite water and allows unlimited thirst relief only for named source allocations', () => {
    const intake = new CompactBandIntake({ ticksPerDay: 10 });
    intake.beginDay(plan(0, [
      { personId: 1, foodQuota: 0, waterQuota: 2 },
      { personId: 2, foodQuota: 0, waterQuota: 'unbounded' },
    ], 0, 'unbounded'));
    expect(intake.ration(fake(1), 1, 7, 5)).toEqual({ hunger: 0, thirst: 2 });
    expect(intake.ration(fake(2), 1, 0, 5)).toEqual({ hunger: 0, thirst: 5 });
    expect(intake.report).toMatchObject({ waterAvailability: 'unbounded', waterQuota: 'unbounded', waterUsed: 7, waterRemaining: 'unbounded' });
    const absent = new CompactBandIntake({ ticksPerDay: 10 });
    absent.beginDay(plan(0, [{ personId: 1, foodQuota: 0, waterQuota: 0 }], 0, 0));
    expect(absent.ration(fake(1), 1, 0, 10).thirst).toBe(0);
  });

  it('requires the elapsed day from tick and rejects missing members, duplicate plans, and excessive quotas', () => {
    const intake = new CompactBandIntake({ ticksPerDay: 10 });
    expect(() => intake.beginDay(plan(0, [
      { personId: 1, foodQuota: 2, waterQuota: 0 },
      { personId: 1, foodQuota: 1, waterQuota: 0 },
    ], 3, 0))).toThrow(/duplicate/);
    expect(() => intake.beginDay(plan(0, [{ personId: 1, foodQuota: 2, waterQuota: 0 }], 1, 0))).toThrow(/food quotas/);
    expect(() => intake.beginDay(plan(0, [{ personId: 1, foodQuota: 0, waterQuota: 2 }], 0, 1))).toThrow(/water quotas/);
    intake.beginDay(plan(0, [{ personId: 1, foodQuota: 1, waterQuota: 0 }], 1, 0));
    expect(() => intake.beginDay(plan(2, [], 0, 0))).toThrow(/advance once/);
    expect(() => intake.ration(fake(1), 11, 1, 0)).toThrow(/elapsed day/);
    expect(() => intake.ration(fake(2), 1, 1, 0)).toThrow(/no intake allocation/);
  });

  it('preserves a partially consumed daily plan across a JSON checkpoint', () => {
    const original = new CompactBandIntake({ ticksPerDay: 10 });
    original.beginDay(plan(0, [
      { personId: 1, foodQuota: 7, waterQuota: 3 },
      { personId: 2, foodQuota: 2, waterQuota: 1 },
    ], 10, 5));
    original.ration(fake(1), 2, 2, 1);
    const resumed = CompactBandIntake.fromRecord(wire(original.toRecord()), 10);
    expect(resumed.ration(fake(1), 8, 8, 8)).toEqual({ hunger: 5, thirst: 2 });
    expect(original.ration(fake(1), 8, 8, 8)).toEqual({ hunger: 5, thirst: 2 });
    expect(wire(resumed.toRecord())).toEqual(wire(original.toRecord()));
    expect(() => CompactBandIntake.fromRecord(wire(original.toRecord()), 11)).toThrow(/configuration/);
    expect(() => CompactBandIntake.fromRecord({ ...original.toRecord(), extra: true })).toThrow(/fields/);
  });

  it('rejects malformed snapshots and never restores usage above a finite quota', () => {
    const intake = new CompactBandIntake({ ticksPerDay: 10 });
    intake.beginDay(plan(0, [{ personId: 1, foodQuota: 2, waterQuota: 2 }], 3, 2));
    const record = intake.toRecord();
    expect(() => CompactBandIntake.fromRecord({ ...record, ticksPerDay: 0 })).toThrow();
    expect(() => CompactBandIntake.fromRecord({ ...record, day: -1 })).toThrow();
    expect(() => CompactBandIntake.fromRecord({ ...record,
      allocations: [{ ...record.allocations[0], foodUsed: 3 }] })).toThrow(/exceeds quota/);
    expect(() => CompactBandIntake.fromRecord({ ...record,
      allocations: [{ ...record.allocations[0], personId: 1.5 }] })).toThrow(/person id/);
  });

  it('refuses a ration callback that creates relief when no measured intake requested any', () => {
    const { sim, compact, tick } = bodyFixture();
    const body = new CompactBody({ needs: sim.config.needs, time: sim.config.time, world: sim.world, nextEventId: () => 1,
      ration: () => ({ hunger: 1, thirst: 0 }) });
    expect(() => body.advance(compact, tick + 1)).toThrow(/outside its request/);
  });
  it('makes compact bodies starve when the finite band has no food, while an adequate quota preserves them', () => {
    const { sim, compact: first, tick } = bodyFixture();
    const fed = fromCompactRecord(wire(toCompactRecord(first)));
    const run = (compact: CompactPerson, quota: number) => {
      const intake = new CompactBandIntake({ ticksPerDay: sim.config.time.ticksPerDay });
      const body = new CompactBody({
        needs: sim.config.needs, time: sim.config.time, world: sim.world, nextEventId: () => 1,
        intake: { model: flatIntake(), capacity: () => ({ hungryZero: 0, thirstyZero: 0 }), childhood: sim.config.childhood },
        ration: (p, at, hunger, thirst) => intake.ration(p, at, hunger, thirst),
      });
      advanceDayByDay(body, compact, intake, tick + 30 * sim.config.time.ticksPerDay, quota);
      return compact.person;
    };
    const starving = run(first, 0);
    const fedPerson = run(fed, 1_000);
    expect(starving.alive).toBe(false);
    expect(starving.causeOfDeath).toBe('starvation');
    expect(fedPerson.alive).toBe(true);
    void tick;
  });
});
