import { describe, expect, it } from 'vitest';
import { makeConfig } from '../core/Config.ts';
import { TECHS } from '../knowledge/Tech.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { RNG } from '../core/RNG.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { Person } from '../entities/Person.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { comarcaResourceProfile } from '../world/ResourceProfile.ts';
import { regionMaterials, PARTIAL_START, type KnowledgeRegion } from '../world/PeopleKnowledge.ts';
import { NEED_BINS, QUANTILE_STEPS, rateKey, type RateTable } from '../compact/CompactCalibration.ts';
import { IntakeModel } from '../compact/CompactIntake.ts';
import { CompactBandCalendar } from '../compact/CompactBandCalendar.ts';
import { CompactBandRuntime, type CompactBandRuntimeOptions } from '../compact/CompactBandRuntime.ts';
import { createCompactBandKnowledgeState } from '../compact/CompactBandKnowledge.ts';
import { deriveCompactStream, goalOf, type CompactPerson } from '../compact/CompactPerson.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const geography = randomWorldGeography('compact-band-runtime-test');
const profile = comarcaResourceProfile(geography, 100, 100);
const work = { workerDays: 0, rationsPerWorkerDay: 0, requires: [] as const };
const region: KnowledgeRegion = { materials: regionMaterials(), climate: { temperature: 0.5, wetness: 0.5 } };

function intakeModel(): IntakeModel {
  const table: RateTable = {};
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const)
    for (const group of ['nursling', 'child', 'adult'] as const)
      for (const need of ['hunger', 'thirst'] as const)
        for (let bin = 0; bin < NEED_BINS; bin++) table[rateKey(season, group, need, bin)] = {
          n: 100, mean: 1, q: Array(QUANTILE_STEPS).fill(1), zero: 0, nz: 100, qf: Array(QUANTILE_STEPS).fill(1),
        };
  return new IntakeModel(table);
}

function fixture(seed: string, initialStock = 0, quotaShare = 1, initialTick = 0, ticksPerDay = 2, scaledSupply = false): CompactBandRuntime {
  const config = makeConfig({ time: { ticksPerDay, daysPerSeason: 3, startDay: 0 },
    needs: { hungerRate: 1, thirstRate: 0, coldRate: 0 }, population: { conceptionChance: 0 } });
  const ids = new IdSpace();
  const person = new Person('Ari', 2, 3, 7, new RNG(seed), config.time.daysPerSeason * 4, ids);
  person.age = 20 * person.daysPerYear;
  person.lifespanDays = 80 * person.daysPerYear;
  person.health = 1;
  const compact: CompactPerson = { person, lastAdvancedTick: initialTick, epoch: 0,
    rng: deriveCompactStream(seed, person.id), goal: goalOf(person, 0), intake: null };
  const time = new TimeManager(config.time);
  time.tick = initialTick;
  const food = { day: time.day, stockRations: initialStock, storageCapacityRations: 5 };
  const calendar = new CompactBandCalendar(time.snapshot(), food);
  const peopleById = new Map([[person.id, person]]);
  const runtimeOptions: CompactBandRuntimeOptions = {
    bandId: 7, roster: [compact], calendar, needs: config.needs, time: config.time,
    bodyIntake: { model: intakeModel(), capacity: () => undefined, childhood: config.childhood },
    resolveFoodDay: ({ roster, durationFactor }) => ({
      supply: { population: roster.filter(p => p.person.alive).length, demandRations: scaledSupply ? durationFactor : 1,
        profile, techs: [], work: { gather: scaledSupply ? { ...work, workerDays: durationFactor, rationsPerWorkerDay: 1000 } : work, fish: work, game: work } },
      waterAvailability: 0,
    }),
    allocateIntake: ({ roster, foodBudget }) => ({ allocations: roster.filter(p => p.person.alive).map(p => ({
      personId: p.person.id, foodQuota: foodBudget * quotaShare, waterQuota: 0,
    })) }),
    life: { population: config.population, childhood: config.childhood, learning: config.learning,
      worldSeed: seed, ids, peopleById, householdsById: new Map(), relationships: new RelationshipGraph(),
      roofTonight: () => new Map() },
    knowledge: createCompactBandKnowledgeState(seed, 7, Math.floor(time.day / config.time.daysPerSeason) - 1),
    resolveKnowledge: () => ({ region, mu: 0, partial: PARTIAL_START }),
  };
  return new CompactBandRuntime(runtimeOptions);
}

describe('detached compact band runtime', () => {
  it('attaches mid-day, limits supply to the real interval, and restores continuation exactly', () => {
    const whole = fixture('runtime-partial-attach', 0, 1, 1, 4, true);
    const cut = fixture('runtime-partial-attach', 0, 1, 1, 4, true);
    whole.advanceTo(2);
    cut.advanceTo(2);
    const saved = wire(cut.toRecord());
    expect(saved.pendingDay?.period).toEqual({ day: 1, season: 'spring', fromTick: 1, toTick: 4 });
    const restored = CompactBandRuntime.fromRecord(saved, cut.services);
    const result = restored.advanceTo(4);
    whole.advanceTo(4);
    expect(result.food[0]?.plannedDemand).toBeCloseTo(0.75);
    expect(result.food[0]?.producedBySource.gather).toBeCloseTo(Math.min(profile.rations.spring.gather * 0.75, 750));
    expect(wire(restored.toRecord())).toEqual(wire(whole.toRecord()));
  });

  it('advances all ticks and survives a mid-day JSON restore without renewing intake or food', () => {
    const whole = fixture('runtime-cut'), cut = fixture('runtime-cut');
    const expected = whole.advanceTo(11);
    const first = cut.advanceTo(3);
    expect(first.food).toHaveLength(1);
    const snapshot = wire(cut.toRecord());
    const restored = CompactBandRuntime.fromRecord(snapshot, cut.services);
    const tail = restored.advanceTo(11);
    expect(wire([...first.food, ...tail.food])).toEqual(wire(expected.food));
    expect(wire(restored.toRecord())).toEqual(wire(whole.toRecord()));
    expect(snapshot.calendar.time.tick).toBe(3);
  });

  it('applies finite food and zero-water quotas to measured requests, then dies when reserves cannot feed it', () => {
    const runtime = fixture('runtime-starve');
    const compact = runtime.roster[0]!;
    compact.person.needs.hunger = 84;
    const result = runtime.advanceTo(520);
    expect(result.events.some(event => event.kind === 'death' && event.data.cause === 'starvation')).toBe(true);
    expect(compact.person.alive).toBe(false);
    expect(runtime.intakeReport.waterAvailability).toBe(0);
    expect(runtime.calendar.foodState.stockRations).toBe(0);
  });

  it('returns quota that bodies did not use to the food store at the boundary', () => {
    const runtime = fixture('runtime-refund', 1, 0);
    const result = runtime.advanceTo(2);
    expect(result.food[0]).toMatchObject({ plannedDemand: 1, demand: 0, consumed: 0, unmetDemand: 1, withdrawn: 0, stock: 1 });
    expect(runtime.calendar.foodState.stockRations).toBe(1);
  });
  it('restores a newly attached runtime at a positive calendar boundary before its first owned day', () => {
    const runtime = fixture('runtime-late-attach', 0, 1, 8);
    const snapshot = wire(runtime.toRecord());
    const restored = CompactBandRuntime.fromRecord(snapshot, runtime.services);
    expect(restored.intakeReport.day).toBeNull();
    const full = runtime.advanceTo(14);
    const resumed = restored.advanceTo(14);
    expect(wire(resumed)).toEqual(wire(full));
    expect(restored.calendar.foodState.day).toBe(7);
    expect(restored.knowledgeState.lastSeason).toBe(1);
    expect(wire(restored.toRecord())).toEqual(wire(runtime.toRecord()));
  });
  it('does not renew the same day quota or settle a second food day at a cut boundary', () => {
    const runtime = fixture('runtime-no-refill');
    runtime.advanceTo(2);
    const afterOneDay = wire(runtime.toRecord());
    runtime.advanceTo(2);
    expect(wire(runtime.toRecord())).toEqual(afterOneDay);
    expect(runtime.calendar.foodState.day).toBe(1);
    expect(runtime.intakeReport.day).toBe(0);
  });

  it('rejects a calendar anchor that contradicts the runtime transfer tick', () => {
    const active = fixture('runtime-partial-anchor', 0, 1, 1, 4, true);
    active.advanceTo(2);
    const corrupt = wire(active.toRecord()) as any;
    corrupt.calendar.dayStartTick = 0;
    expect(() => CompactBandRuntime.fromRecord(corrupt, active.services)).toThrow(/day anchor/);
  });

  it('rejects a food policy that tries to persist its own duration factor', () => {
    const base = fixture('runtime-partial-factor');
    const runtime = CompactBandRuntime.fromRecord(base.toRecord(), {
      ...base.services,
      resolveFoodDay: context => {
        const plan = base.services.resolveFoodDay(context);
        return { ...plan, supply: { ...plan.supply, durationFactor: 1 } } as any;
      },
    });
    expect(() => runtime.advanceTo(1)).toThrow(/cannot override the interval duration factor/);
  });

  it('rejects inconsistent partial runtime snapshots before resuming', () => {
    const active = fixture('runtime-codec-partial');
    active.advanceTo(1);
    const base = wire(active.toRecord()) as any;
    const corruptions: ((record: any) => void)[] = [
      record => { record.pendingDay = null; },
      record => { record.ids.next.person = 0; },
      record => { record.people[0].name = 'Contradictory copy'; },
      record => { record.pendingDay.period.toTick += 2; },
    ];
    for (const corrupt of corruptions) {
      const record = wire(base);
      corrupt(record);
      expect(() => CompactBandRuntime.fromRecord(record, active.services)).toThrow();
    }

    const positive = fixture('runtime-codec-knowledge-gap', 0, 1, 8);
    const missingKnowledgeHistory = wire(positive.toRecord()) as any;
    missingKnowledgeHistory.knowledge.lastSeason = -1;
    expect(() => CompactBandRuntime.fromRecord(missingKnowledgeHistory, positive.services)).toThrow(/knowledge ledger season/);

    const changedConfig = { ...active.services, needs: { ...active.services.needs, hungerRate: active.services.needs.hungerRate + 1 } };
    expect(() => CompactBandRuntime.fromRecord(base, changedConfig)).toThrow(/configuration differs/);
  });

  it('rejects food planners that invent population, techniques, or adult labor', () => {
    const base = fixture('runtime-policy-guards');
    const policies = [
      (supply: any) => ({ ...supply, population: supply.population + 1 }),
      (supply: any) => ({ ...supply, techs: [TECHS.find(tech => !base.roster[0]!.person.knownTech.has(tech))!] }),
      (supply: any) => ({ ...supply, work: { ...supply.work, gather: { ...supply.work.gather, workerDays: 1.1 } } }),
    ];
    const reasons = [/population/, /technique/, /adult labor/];
    for (let index = 0; index < policies.length; index++) {
      const runtime = CompactBandRuntime.fromRecord(base.toRecord(), {
        ...base.services,
        resolveFoodDay: context => {
          const plan = base.services.resolveFoodDay(context);
          return { ...plan, supply: policies[index]!(plan.supply) };
        },
      });
      expect(() => runtime.advanceTo(1)).toThrow(reasons[index]);
      expect(runtime.calendar.foodState.day).toBe(0);
      expect(runtime.intakeReport.day).toBeNull();
    }
  });});
