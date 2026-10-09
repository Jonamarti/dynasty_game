import { describe, expect, it } from 'vitest';
import { makeConfig } from '../core/Config.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { RNG } from '../core/RNG.ts';
import { Soil } from '../core/Soil.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { Person } from '../entities/Person.ts';
import { Household } from '../entities/Household.ts';
import { Crop } from '../entities/Field.ts';
import { BUILDINGS, Building } from '../entities/Building.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { awlFactor } from '../knowledge/Tech.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { randomWorldGeography } from '../world/WorldGeography.ts';
import { comarcaResourceProfile } from '../world/ResourceProfile.ts';
import { regionMaterials, PARTIAL_START, type KnowledgeRegion } from '../world/PeopleKnowledge.ts';
import { NEED_BINS, QUANTILE_STEPS, rateKey, type RateTable } from '../compact/CompactCalibration.ts';
import { IntakeModel } from '../compact/CompactIntake.ts';
import { CompactBandCalendar } from '../compact/CompactBandCalendar.ts';
import { CompactBandFarming } from '../compact/CompactBandFarming.ts';
import { CompactBandProcessing } from '../compact/CompactBandProcessing.ts';
import { CompactBandRuntime, type CompactBandRuntimeOptions } from '../compact/CompactBandRuntime.ts';
import { createCompactBandKnowledgeState } from '../compact/CompactBandKnowledge.ts';
import { deriveCompactStream, goalOf, type CompactPerson } from '../compact/CompactPerson.ts';

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const region: KnowledgeRegion = { materials: regionMaterials(), climate: { temperature: 0.5, wetness: 0.5 } };
const work = { workerDays: 0, rationsPerWorkerDay: 0, requires: [] as const };

function makeIntakeModel(): IntakeModel {
  const table: RateTable = {};
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const)
    for (const group of ['nursling', 'child', 'adult'] as const)
      for (const need of ['hunger', 'thirst'] as const)
        for (let bin = 0; bin < NEED_BINS; bin++) table[rateKey(season, group, need, bin)] = {
          n: 100, mean: 1, q: Array(QUANTILE_STEPS).fill(1), zero: 0, nz: 100,
          qf: Array(QUANTILE_STEPS).fill(1),
        };
  return new IntakeModel(table);
}

type FixtureOptions = {
  seed: string; couple?: boolean; thirsty?: boolean; farm?: boolean; processing?: boolean;
  quern?: boolean; throwAllocator?: boolean; middayDeath?: boolean;
};

function fixture(options: FixtureOptions): CompactBandRuntime {
  const tpd = options.throwAllocator ? 500 : options.farm ? 240 : options.processing ? 500 : 2;
  const config = makeConfig({
    time: { ticksPerDay: tpd, daysPerSeason: 100, startDay: 0 },
    needs: { hungerRate: options.processing ? 0.01 : 0, thirstRate: options.thirsty ? 1 : 0, coldRate: 0 },
    population: { conceptionChance: 0 },
  });
  const ids = new IdSpace();
  const people = [new Person('Ari', 2, 3, 7, new RNG(options.seed + '-one'), config.time.daysPerSeason * 4, ids)];
  if (options.couple) people.push(new Person('Bea', 2, 3, 7, new RNG(options.seed + '-two'), config.time.daysPerSeason * 4, ids));
  for (const person of people) {
    person.age = 24 * person.daysPerYear;
    person.lifespanDays = 80 * person.daysPerYear;
    person.health = options.middayDeath ? 0.001 : options.processing ? 100 : 1;
  }
  let household: Household | null = null;
  if (options.couple) {
    const [mother, father] = people;
    mother!.sex = 'female'; father!.sex = 'male';
    mother!.spouseId = father!.id; father!.spouseId = mother!.id;
    mother!.pregnant = true; mother!.gestationLeft = 1; mother!.pregnantBy = father!.id;
    mother!.lastBirthDay = -100;
    household = new Household('Ari', mother!.id, 7, 0, ids);
    for (const person of people) { household.add(person.id); person.householdId = household.id; }
  }
  if (options.thirsty) people[0]!.needs.thirst = options.middayDeath ? 100 : 84;
  if (options.farm || options.processing) {
    for (const tech of ['cordage', 'hafting', 'stoneworking', 'grinding', 'plant_lore']) people[0]!.knownTech.add(tech);
  }
  if (options.farm) people[0]!.knownTech.add('farming');
  if (options.processing && !options.farm) people[0]!.needs.hunger = 84;

  const roster: CompactPerson[] = people.map(person => ({ person, lastAdvancedTick: 0, epoch: 0,
    rng: deriveCompactStream(options.seed, person.id), goal: goalOf(person, 0), intake: null }));
  const time = new TimeManager(config.time);
  const calendar = new CompactBandCalendar(time.snapshot(), {
    day: time.day, stockRations: options.processing && !options.farm ? 0 : 5000, storageCapacityRations: 5000,
  });
  const geography = randomWorldGeography(options.seed + '-geography');
  const profile = comarcaResourceProfile(geography, 100, 100);
  const peopleById = new Map(people.map(person => [person.id, person]));
  const householdsById = new Map(household ? [[household.id, household]] : []);
  const mill = options.processing ? new CompactBandProcessing(0, 3) : undefined;
  const quern = options.quern ? new Building(BUILDINGS.quern!, 2, 3, 7, ids) : undefined;
  if (quern) quern.complete = true;
  const farm = options.farm ? new CompactBandFarming(7, 0, 7, [{ id: 1, crop: new Crop(),
    soil: new Soil(1, new Float32Array([0.85]), () => 0.85), tiles: [0], sowWork: 0, reapWork: 0 }]) : undefined;

  const runtimeOptions: CompactBandRuntimeOptions = {
    bandId: 7, roster, calendar, needs: config.needs, time: config.time,
    bodyIntake: { model: makeIntakeModel(), capacity: () => undefined, childhood: config.childhood },
    resolveFoodDay: ({ roster: members }) => {
      const population = members.filter(member => member.person.alive).length;
      return { supply: { population, demandRations: population * (options.processing ? 10 : 1), profile, techs: [],
        work: { gather: work, fish: work, game: work } },
        waterAvailability: options.thirsty ? 0 : 500 };
    },
    allocateIntake: ({ roster: members, foodBudget, waterAvailability }) => {
      if (options.throwAllocator) throw new Error('fixture allocator refusal');
      const living = members.filter(member => member.person.alive);
      return { allocations: living.map(member => ({ personId: member.person.id,
        foodQuota: foodBudget / Math.max(1, living.length),
        waterQuota: options.thirsty ? 0 : waterAvailability === 'unbounded' ? 'unbounded' :
          waterAvailability / Math.max(1, living.length),
      })) };
    },
    farmWork: options.farm ? () => ({ workTicks: options.throwAllocator ? 1 : 110, cultivable: true }) : undefined,
    processingWork: options.processing ? (_period, members) => ({
      workTicks: options.farm && !options.throwAllocator ? 130 :
        Math.max(1, Math.ceil(RECIPES.groats!.workTicks * awlFactor(members[0]!.person, RECIPES.groats!.id) /
          members[0]!.person.skillFactor(RECIPES.groats!.skill))),
      buildings: quern ? [quern] : [],
    }) : undefined,
    life: { population: config.population, childhood: config.childhood, learning: config.learning,
      worldSeed: options.seed, ids, peopleById, householdsById, relationships: new RelationshipGraph(),
      roofTonight: members => new Map(members.filter(member => member.person.householdId !== null)
        .map(member => [member.person.id, member.person.householdId!])) },
    knowledge: createCompactBandKnowledgeState(options.seed, 7),
    resolveKnowledge: () => ({ region, mu: 0, partial: PARTIAL_START }),
    farm, processing: mill,
  };
  return new CompactBandRuntime(runtimeOptions);
}

describe('compact band runtime integration', () => {
  it('registers a newborn once, restores mid-day, and ages the child at the next life boundary', () => {
    const whole = fixture({ seed: 'runtime-birth', couple: true });
    const cut = fixture({ seed: 'runtime-birth', couple: true });
    const birth = whole.advanceTo(2);
    const childId = birth.events.find(event => event.kind === 'birth')?.data.childId as number;
    expect(childId).toBeTypeOf('number');
    expect(whole.roster.find(member => member.person.id === childId)?.person.age).toBe(0);

    cut.advanceTo(3);
    const restored = CompactBandRuntime.fromRecord(wire(cut.toRecord()), cut.services);
    expect(restored.roster.find(member => member.person.id === childId)?.person).toBe(restored.life.peopleById.get(childId));
    restored.advanceTo(4);
    whole.advanceTo(4);
    expect(restored.roster.find(member => member.person.id === childId)?.person.age).toBe(1);
    expect(wire(restored.toRecord())).toEqual(wire(whole.toRecord()));
  });

  it('records zero-source dehydration and retains the dead canonical archive through later advancement', () => {
    const runtime = fixture({ seed: 'runtime-no-water', thirsty: true });
    const person = runtime.roster[0]!.person;
    const result = runtime.advanceTo(520);
    expect(result.events.some(event => event.kind === 'death' && event.subjectId === person.id && event.data.cause === 'dehydration')).toBe(true);
    expect(person.alive).toBe(false);
    expect(runtime.intakeReport.waterAvailability).toBe(0);
    expect(runtime.life.peopleById.get(person.id)).toBe(person);

    const restored = CompactBandRuntime.fromRecord(wire(runtime.toRecord()), runtime.services);
    const archived = restored.life.peopleById.get(person.id)!;
    expect(archived.alive).toBe(false);
    expect(restored.roster.some(member => member.person.id === person.id)).toBe(true);
    restored.advanceTo(522);
    expect(restored.life.peopleById.get(person.id)).toBe(archived);
    expect(restored.roster.find(member => member.person.id === person.id)?.lastAdvancedTick).toBe(522);
  });

  it('retains the dead member and its start-of-day quota when restoring mid-day', () => {
    const runtime = fixture({ seed: 'runtime-midday-death', thirsty: true, middayDeath: true });
    const id = runtime.roster[0]!.person.id;
    const result = runtime.advanceTo(1);
    expect(result.events.some(event => event.kind === 'death' && event.subjectId === id && event.data.cause === 'dehydration')).toBe(true);
    expect(runtime.toRecord().intake.allocations.some(row => row.personId === id)).toBe(true);
    const restored = CompactBandRuntime.fromRecord(wire(runtime.toRecord()), runtime.services);
    expect(restored.life.peopleById.get(id)?.alive).toBe(false);
    expect(restored.intakeReport.personCount).toBe(1);
    restored.advanceTo(2);
    expect(restored.life.peopleById.has(id)).toBe(true);
  });

  it('farms and mills real grain into the dated food ledger, feeding the body and restoring mid-day', () => {
    const runtime = fixture({ seed: 'runtime-farm-mill', farm: true, processing: true, quern: true });
    const cut = fixture({ seed: 'runtime-farm-mill', farm: true, processing: true, quern: true });
    const targetTick = 80 * 240;
    const result = runtime.advanceTo(targetTick);
    cut.advanceTo(targetTick - 1);
    const restored = CompactBandRuntime.fromRecord(wire(cut.toRecord()), cut.services);
    restored.advanceTo(targetTick);
    expect(wire(restored.toRecord())).toEqual(wire(runtime.toRecord()));

    const plot = runtime.farmState!.plot(1)!;
    expect(result.food.length).toBe(80);
    expect(plot.crop.harvests).toBeGreaterThan(0);
    expect(plot.crop.lastYield).toBeGreaterThan(0);
    expect(plot.soil.nutrient[0]).toBeLessThan(0.85);
    expect(runtime.farmState!.seedGrain).toBeGreaterThanOrEqual(0);
    expect(result.food.some(row => row.producedSupplemental > 0 && row.consumed > 0)).toBe(true);
  });

  it('turns real grain into body intake only when a real quern and exact recipe work are available', () => {
    const milled = fixture({ seed: 'runtime-grain-mill', processing: true, quern: true });
    const blocked = fixture({ seed: 'runtime-grain-mill', processing: true, quern: false });
    milled.advanceTo(500);
    blocked.advanceTo(500);
    expect(milled.processingState!.grainStock).toBe(0);
    expect(milled.intakeReport.foodUsed).toBeGreaterThan(0);
    expect(blocked.processingState!.grainStock).toBe(3);
    expect(blocked.intakeReport.foodUsed).toBe(0);
  });

  it('leaves farm, mill, skill and calendar untouched when intake allocation refuses the day', () => {
    const runtime = fixture({ seed: 'runtime-atomic-farm', farm: true, processing: true, quern: true, throwAllocator: true });
    const before = wire(runtime.toRecord());
    expect(() => runtime.advanceTo(1)).toThrow(/fixture allocator refusal/);
    expect(wire(runtime.toRecord())).toEqual(before);
  });
});
