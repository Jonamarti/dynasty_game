/**
 * Detached, one-band M15 phase 1c runtime. It owns a named roster outside Simulation and settles
 * food/intake at dated day boundaries, then body, life, and seasonal knowledge in that order.
 * Production, water access, work, contacts, and land are explicit caller policies; this layer adds
 * no harvest rates, quota-sharing rule, water source, or band-to-map authority transfer.
 */
import { compactBandNeedsHooks } from './CompactBandNeeds.ts';
import { RATION_NUTRITION } from '../world/ResourceProfile.ts';
import { TimeManager } from '../core/TimeManager.ts';
import type { NeedsConfig, PopulationConfig, ChildhoodConfig, LearningConfig, TimeConfig } from '../core/Config.ts';
import type { World } from '../core/World.ts';
import type { Building } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import type { IdSpace } from '../core/IdSpace.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import { fromPersonRecord, fromHouseholdRecord, toPersonRecord, toHouseholdRecord,
  type PersonRecord, type HouseholdRecord } from '../persistence/EntityRecords.ts';
import { CompactBody, type CompactBodyEnv } from './CompactAdvance.ts';
import { CompactBandCalendar, type CompactBandDay, type CompactBandDaySupply,
  type CompactBandDatedFoodReport, type CompactBandCalendarRecord } from './CompactBandCalendar.ts';
import { CompactBandIntake, type CompactBandIntakeAllocation, type CompactBandIntakeReport,
  type CompactBandIntakeRecord, type CompactWaterAvailability } from './CompactBandIntake.ts';
import { advanceCompactBandFoodDay, type CompactBandFoodDayReport } from './CompactBandFood.ts';
import { toCompactRecord, fromCompactRecord, type CompactPerson, type CompactPersonRecord } from './CompactPerson.ts';
import { advanceCompactBandLife, type CompactBandLifeLedger } from './CompactBandLife.ts';
import { advanceCompactBandKnowledge, type CompactBandKnowledgeInput, type CompactBandKnowledgeState, type CompactBandKnowledgeEvent } from './CompactBandKnowledge.ts';
import { PEOPLE_SEASONS, type PeopleSeason } from '../world/PeopleSim.ts';
import type { KnowledgeRegion, PartialLearning } from '../world/PeopleKnowledge.ts';
import type { CompactEvent } from './CompactScheduler.ts';
import { IdSpace as IdSpaceFactory } from '../core/IdSpace.ts';
import { RelationshipGraph as RelationshipGraphFactory } from '../social/Relationships.ts';
import { CompactBandFarming, type CompactBandFarmRecord, type CompactFarmDayReport } from './CompactBandFarming.ts';
import { CompactBandProcessing } from './CompactBandProcessing.ts';
import type { CompactBandProcessingRecord, CompactBandProcessingReport } from './CompactBandProcessing.ts';
import { fromCompactBandKnowledgeRecord, toCompactBandKnowledgeRecord,
  type CompactBandKnowledgeRecord } from './CompactBandKnowledge.ts';

export type CompactBandRuntimeFoodSupply = Omit<CompactBandDaySupply, 'supplementalRations' | 'durationFactor'>;
export interface CompactBandRuntimeFoodPlan {
  readonly supply: CompactBandRuntimeFoodSupply;
  readonly waterAvailability: CompactWaterAvailability;
}
export interface CompactBandRuntimeFoodReport extends CompactBandDatedFoodReport { readonly plannedDemand: number; readonly unmetDemand: number }
export interface CompactBandRuntimeQuotaPlan {
  readonly allocations: readonly CompactBandIntakeAllocation[];
}
export interface CompactBandRuntimeFarmWork { readonly workTicks: number; readonly cultivable: boolean }
export interface CompactBandRuntimeProcessingWork {
  readonly workTicks: number;
  readonly buildings: readonly Building[];
}
export interface CompactBandRuntimeDayContext {
  readonly period: CompactBandDay;
  /** The interval this policy is planning, derived from period.fromTick/toTick. */
  readonly durationTicks: number;
  readonly durationFactor: number;
  readonly roster: readonly CompactPerson[];
  readonly farmReport: CompactFarmDayReport | null;
  readonly processingReport: CompactBandProcessingReport | null;
  readonly edibleGrainAdded: number;
}
export interface CompactBandRuntimeQuotaContext extends CompactBandRuntimeDayContext {
  readonly food: CompactBandFoodDayReport;
  readonly foodBudget: number;
  readonly waterAvailability: CompactWaterAvailability;
}
export interface CompactBandRuntimeKnowledgeContext {
  readonly region: KnowledgeRegion;
  readonly contacts?: CompactBandKnowledgeInput['contacts'];
  readonly mu: number;
  readonly partial: PartialLearning;
  readonly kappa?: number;
}
export interface CompactBandRuntimeLifeServices {
  readonly population: PopulationConfig;
  readonly childhood: ChildhoodConfig;
  readonly learning: LearningConfig;
  readonly worldSeed: string | number;
  readonly ids: IdSpace;
  readonly peopleById: Map<number, Person>;
  readonly householdsById: Map<number, Household>;
  readonly relationships: RelationshipGraph;
  readonly roofTonight: (roster: readonly CompactPerson[], tick: number) => ReadonlyMap<number, number>;
  readonly makeChild?: (mother: Person, rng: import('../core/RNG.ts').RNG) => Person;
}
export interface CompactBandRuntimeServices {
  readonly bandId: number;
  readonly needs: NeedsConfig;
  readonly time: TimeConfig;
  readonly world?: World;
  readonly buildings?: readonly Building[];
  readonly bodyIntake: NonNullable<CompactBodyEnv['intake']>;
  readonly bodyHooks?: CompactBodyEnv['hooks'];
  /** Must be deterministic and side-effect-free; closures should not retain roster/map objects across restore. */
  readonly resolveFoodDay: (context: CompactBandRuntimeDayContext) => CompactBandRuntimeFoodPlan;
  /** Explicit policy. No equal-share/default allocation is added by the runtime. */
  /** Must name each living member once and remain deterministic/pure; no quota split is inferred here. */
  readonly allocateIntake: (context: CompactBandRuntimeQuotaContext) => CompactBandRuntimeQuotaPlan;
  readonly farmWork?: (period: CompactBandDay, roster: readonly CompactPerson[], durationFactor: number) => CompactBandRuntimeFarmWork;
  readonly processingWork?: (period: CompactBandDay, roster: readonly CompactPerson[], durationFactor: number) => CompactBandRuntimeProcessingWork;
  readonly life: CompactBandRuntimeLifeServices;
  readonly resolveKnowledge: (season: number, members: readonly Person[]) => CompactBandRuntimeKnowledgeContext;
}
export interface CompactBandRuntimeOptions extends CompactBandRuntimeServices {
  readonly roster: readonly CompactPerson[];
  readonly calendar: CompactBandCalendar;
  /** Tick when this detached runtime began owning the band; transfer may start mid-day. */
  readonly startTick?: number;
  readonly lifeLedger?: CompactBandLifeLedger;
  readonly knowledge: CompactBandKnowledgeState;
  readonly farm?: CompactBandFarming;
  readonly processing?: CompactBandProcessing;
}
export interface CompactBandRuntimeSharedState {
  readonly ids: IdSpace;
  readonly peopleById: Map<number, Person>;
  readonly householdsById: Map<number, Household>;
  readonly relationships: RelationshipGraph;
}

export interface CompactBandRuntimeRecord {
  readonly recordType: 'CompactBandRuntimeRecord';
  readonly version: 1;
  readonly bandId: number;
  readonly startTick: number;
  readonly model: { readonly needs: NeedsConfig; readonly population: PopulationConfig; readonly childhood: ChildhoodConfig; readonly learning: LearningConfig; readonly worldSeed: string | number };
  readonly calendar: CompactBandCalendarRecord;
  readonly roster: readonly CompactPersonRecord[];
  readonly people: readonly PersonRecord[];
  readonly households: readonly HouseholdRecord[];
  readonly ids: ReturnType<IdSpace['snapshot']>;
  readonly relationships: ReturnType<RelationshipGraph['snapshot']>;
  readonly intake: CompactBandIntakeRecord;
  readonly lifeLedger: CompactBandLifeLedger;
  readonly knowledge: CompactBandKnowledgeRecord;
  readonly farm: CompactBandFarmRecord | null;
  readonly processing: CompactBandProcessingRecord | null;
  readonly pendingDay: null | {
    readonly period: CompactBandDay;
    readonly supply: CompactBandRuntimeFoodPlan['supply'];
    readonly waterAvailability: CompactWaterAvailability;
    readonly expectedFood: CompactBandFoodDayReport;
  };
}

const RUNTIME_KEYS = ['recordType','version','bandId','startTick','model','calendar','roster','people','households','ids','relationships','intake','lifeLedger','knowledge','farm','processing','pendingDay'].sort();
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface PendingDay {
  readonly period: CompactBandDay;
  readonly supply: CompactBandRuntimeFoodPlan['supply'];
  readonly waterAvailability: CompactWaterAvailability;
  readonly expectedFood: CompactBandFoodDayReport;
  readonly farmReport: CompactFarmDayReport | null;
  readonly processingReport: CompactBandProcessingReport | null;
  readonly edibleGrainAdded: number;
}

/** Owns one compact band. Dependencies that read the comarca/contacts are re-supplied after restore. */
export class CompactBandRuntime {
  readonly bandId: number;
  readonly startTick: number;
  readonly roster: CompactPerson[];
  readonly calendar: CompactBandCalendar;
  readonly life: CompactBandRuntimeLifeServices;
  readonly services: CompactBandRuntimeServices;
  private intake: CompactBandIntake;
  private farm: CompactBandFarming | null;
  private processing: CompactBandProcessing | null;
  private lifeLedger: CompactBandLifeLedger;
  private knowledge: CompactBandKnowledgeState;
  private pendingDay: PendingDay | null = null;
  private readonly bodies = new Map<number, CompactBody>();
  private advancing = false;

  constructor(options: CompactBandRuntimeOptions, restoring = false) {
    this.bandId = options.bandId;
    this.startTick = options.startTick ?? options.calendar.tick;
    this.roster = [...options.roster].sort((a,b) => a.person.id - b.person.id);
    this.calendar = options.calendar;
    this.life = options.life;
    this.services = options;
    this.intake = new CompactBandIntake({ ticksPerDay: options.time.ticksPerDay });
    this.farm = options.farm ?? null;
    this.processing = options.processing ?? null;
    this.lifeLedger = options.lifeLedger ?? { version: 1, lastAdvancedDay: null };
    this.knowledge = options.knowledge;
    this.validateSetup();
    if (!restoring && this.startTick !== this.calendar.tick) throw new RangeError('new compact runtime must start at its current calendar tick');
  }

  private validateSetup(): void {
    if (!Number.isSafeInteger(this.bandId) || this.bandId < 0) throw new RangeError('invalid compact runtime band id');
    if (!Number.isSafeInteger(this.startTick) || this.startTick < 0 || this.startTick > this.calendar.tick) throw new RangeError('invalid compact runtime start tick');
    const savedTime = this.calendar.toRecord().time.config;
    if (savedTime.ticksPerDay !== this.services.time.ticksPerDay || savedTime.daysPerSeason !== this.services.time.daysPerSeason || savedTime.startDay !== this.services.time.startDay || savedTime.tickRate !== this.services.time.tickRate || savedTime.maxTicksPerFrame !== this.services.time.maxTicksPerFrame) throw new RangeError('runtime and calendar clocks differ');
    if (this.intake.ticksPerDay !== this.services.time.ticksPerDay) throw new RangeError('runtime and intake clocks differ');
    const dayBoundary = Math.floor(this.calendar.tick / this.services.time.ticksPerDay) * this.services.time.ticksPerDay;
    if (this.calendar.currentDayStartTick !== Math.max(dayBoundary, this.startTick)) throw new RangeError('runtime day anchor does not match its start tick');
    if (JSON.stringify(this.services.bodyIntake.childhood) !== JSON.stringify(this.life.childhood)) throw new RangeError('body and life childhood configs differ');
    const seen = new Set<number>();
    for (const compact of this.roster) {
      const id = compact.person.id;
      if (seen.has(id)) throw new RangeError(`duplicate compact roster person ${id}`);
      seen.add(id);
      if (compact.person.bandId !== this.bandId) throw new RangeError(`person ${id} belongs to another band`);
      if (compact.lastAdvancedTick !== this.calendar.tick) throw new RangeError(`person ${id} is not at the runtime tick`);
      if (this.life.peopleById.get(id) !== compact.person) throw new RangeError(`person ${id} is not canonical in the life map`);
    }
    if (this.knowledge.bandId !== this.bandId) throw new RangeError('knowledge state belongs to another band');
    const expectedKnowledgeSeason = Math.floor(this.calendar.foodState.day / this.services.time.daysPerSeason) - 1;
    if (this.knowledge.lastSeason !== expectedKnowledgeSeason) throw new RangeError('knowledge ledger season does not match runtime attachment date');
    if (this.farm && this.farm.bandId !== this.bandId) throw new RangeError('farm belongs to another band');
    for (const [id, person] of this.life.peopleById) if (id !== person.id) throw new RangeError('canonical person key mismatch');
    for (const [id, household] of this.life.householdsById) if (id !== household.id) throw new RangeError('canonical household key mismatch');
    const ids = this.life.ids.snapshot();
    const maxPerson = Math.max(0, ...this.life.peopleById.keys());
    const maxHousehold = Math.max(0, ...this.life.householdsById.keys());
    if (ids.next.person <= maxPerson || ids.next.household <= maxHousehold) throw new RangeError('runtime ID space could reissue a canonical identity');
  }

  get intakeReport(): CompactBandIntakeReport { return this.intake.report; }
  get lifeState(): CompactBandLifeLedger { return { ...this.lifeLedger }; }
  get knowledgeState(): CompactBandKnowledgeState { return fromCompactBandKnowledgeRecord(toCompactBandKnowledgeRecord(this.knowledge)); }
  get farmState(): CompactBandFarming | null { return this.farm; }
  get processingState(): CompactBandProcessing | null { return this.processing; }

  /** Advance every named body one tick at a time, then settle shared daily and seasonal systems. */
  advanceTo(toTick: number): { readonly events: readonly CompactEvent[]; readonly knowledgeEvents: readonly CompactBandKnowledgeEvent[]; readonly food: readonly CompactBandRuntimeFoodReport[] } {
    if (this.advancing) throw new Error('reentrant compact band runtime advance');
    if (!Number.isSafeInteger(toTick) || toTick < this.calendar.tick) throw new RangeError('compact runtime cannot rewind');
    this.advancing = true;
    const events: CompactEvent[] = [];
    const knowledgeEvents: CompactBandKnowledgeEvent[] = [];
    const foodReports: CompactBandRuntimeFoodReport[] = [];
    try {
      const tpd = this.services.time.ticksPerDay;
      for (let tick = this.calendar.tick + 1; tick <= toTick; tick++) {
        const elapsedDay = Math.floor((tick - 1) / tpd);
        if (this.intake.report.day !== elapsedDay) this.prepareDay(tick, elapsedDay);
        for (const compact of [...this.roster].sort((a,b) => a.person.id - b.person.id)) {
          if (!compact.person.alive) { compact.lastAdvancedTick = tick; continue; }
          if (compact.lastAdvancedTick >= tick) continue;
          if (compact.lastAdvancedTick !== tick - 1) throw new RangeError(`person ${compact.person.id} is not synchronized before tick ${tick}`);
          let body = this.bodies.get(compact.person.id);
          if (!body) {
            body = new CompactBody({ needs: this.services.needs, time: this.services.time,
              world: this.services.world, buildings: this.services.buildings, hooks: this.services.bodyHooks ?? compactBandNeedsHooks(this.life.peopleById, this.life.childhood, this.services.time, this.services.needs),
              intake: this.services.bodyIntake, ration: (who, at, hunger, thirst) => this.intake.ration(who, at, hunger, thirst),
              nextEventId: () => this.life.ids.allocate('socialEvent') });
            this.bodies.set(compact.person.id, body);
          }
          events.push(...body.advance(compact, tick));
        }
        const settled = this.calendar.advanceTo(tick, () => {
          if (!this.pendingDay) throw new Error(`missing saved food plan at boundary tick ${tick}`);
          const actualDemand = this.intake.report.foodUsed / RATION_NUTRITION;
          return { ...this.pendingDay.supply, demandRations: actualDemand };
        });
        if (settled.length) {
          const actual = { ...settled[0]!, tick: undefined };
          if (!this.pendingDay || actual.produced !== this.pendingDay.expectedFood.produced || JSON.stringify(actual.producedBySource) !== JSON.stringify(this.pendingDay.expectedFood.producedBySource)) throw new RangeError('food production changed before its boundary');
          const period = this.pendingDay.period;
          const plannedDemand = this.pendingDay.expectedFood.demand;
          const unmetDemand = Math.max(0, plannedDemand - settled[0]!.consumed);
          this.pendingDay = null;
          const boundary = settled[0]!.tick;
          const clock = TimeManager.fromSnapshot({ ...this.calendar.toRecord().time, tick: boundary });
          const lifeResult = advanceCompactBandLife(this.roster, {
            ledger: this.lifeLedger, tick: boundary, day: clock.day, time: this.services.time,
            population: this.life.population, childhood: this.life.childhood, learning: this.life.learning,
            worldSeed: this.life.worldSeed, ids: this.life.ids, peopleById: this.life.peopleById,
            householdsById: this.life.householdsById, relationships: this.life.relationships,
            roofTonight: this.life.roofTonight(this.roster, boundary), makeChild: this.life.makeChild,
          });
          this.lifeLedger = lifeResult.ledger;
          this.roster.push(...lifeResult.newborns);
          events.push(...lifeResult.events);
          const seasonIndex = Math.floor((period.day - 1) / this.services.time.daysPerSeason);
          if (period.day % this.services.time.daysPerSeason === 0) {
            const knowledgeContext = this.services.resolveKnowledge(seasonIndex, this.roster.map(member => member.person));
            if (this.knowledge.lastSeason + 1 !== seasonIndex) throw new RangeError('compact knowledge season skipped or repeated');
            const result = advanceCompactBandKnowledge(this.knowledge, {
              ...knowledgeContext, season: seasonIndex,
              seasonOfYear: PEOPLE_SEASONS[seasonIndex % PEOPLE_SEASONS.length] as PeopleSeason,
              members: this.roster.map(member => member.person),
            });
            this.knowledge = result.state;
            knowledgeEvents.push(...result.events);
          }
          foodReports.push({ ...settled[0]!, plannedDemand, unmetDemand });
          if (this.pendingDay) throw new Error('internal pending food plan was not cleared');
        }
      }
      return { events, knowledgeEvents, food: foodReports };
    } finally { this.advancing = false; }
  }

  private prepareDay(firstTick: number, elapsedDay: number): void {
    if (this.pendingDay) throw new Error('cannot renew an active compact food plan');
    const tpd = this.services.time.ticksPerDay;
    const calendarRecord = this.calendar.toRecord();
    const boundary = (Math.floor((firstTick - 1) / tpd) + 1) * tpd;
    const before = TimeManager.fromSnapshot({ ...calendarRecord.time, tick: boundary - 1 });
    const afterDay = TimeManager.fromSnapshot({ ...calendarRecord.time, tick: boundary });
    const period: CompactBandDay = { day: this.calendar.foodState.day + 1, season: before.season,
      fromTick: Math.max(boundary - tpd, this.startTick), toTick: boundary };
    const durationTicks = period.toTick - period.fromTick;
    const durationFactor = durationTicks / tpd;
    if (durationTicks <= 0 || durationTicks > tpd) throw new RangeError('invalid compact day interval');
    if (period.day !== afterDay.day) throw new RangeError('food ledger day does not align with the game clock');
    const living = this.roster.filter(member => member.person.alive);
    const adultCount = living.filter(member => !member.person.isChild).length;
    const workPeople = this.roster.map(member => fromPersonRecord(toPersonRecord(member.person, member.lastAdvancedTick)));
    if (this.farm && this.farm.toRecord().lastDay !== this.calendar.foodState.day) throw new RangeError('farm date does not match food ledger');
    if (this.processing && this.processing.toRecord().lastDay !== this.calendar.foodState.day) throw new RangeError('processing date does not match food ledger');

    let farm = this.farm;
    let farmWorkTicks = 0;
    let farmReport: CompactFarmDayReport | null = null;
    let edibleGrainAdded = 0;
    if (farm) {
      if (!this.services.farmWork) throw new TypeError('farm needs an explicit daily work policy');
      const plan = this.services.farmWork(period, this.roster, durationFactor);
      farmWorkTicks = plan.workTicks;
      const candidate = CompactBandFarming.fromRecord(farm.toRecord());
      if (!Number.isSafeInteger(plan.workTicks) || plan.workTicks < 0 || plan.workTicks > adultCount * durationTicks || typeof plan.cultivable !== 'boolean') throw new RangeError('invalid daily farming work allocation');
      farmReport = candidate.advanceDay(period.day, afterDay.growth,
        workPeople, plan.workTicks, plan.cultivable, durationFactor);
      farm = candidate;
      if (this.processing) edibleGrainAdded = farm.takeEdibleGrain();
    }

    let processing = this.processing;
    let processingWorkTicks = 0;
    let processingReport: CompactBandProcessingReport | null = null;
    if (processing) {
      if (!this.services.processingWork) throw new TypeError('processing needs an explicit daily work policy');
      const plan = this.services.processingWork(period, this.roster, durationFactor);
      processingWorkTicks = plan.workTicks;
      if (!Number.isSafeInteger(plan.workTicks) || plan.workTicks < 0 || plan.workTicks > adultCount * durationTicks || !Array.isArray(plan.buildings)) throw new RangeError('invalid daily processing work allocation');
      const candidate = CompactBandProcessing.fromRecord(processing.toRecord());
      processingReport = candidate.advanceDay(period.day, plan.workTicks,
        workPeople, plan.buildings, edibleGrainAdded);
      processing = candidate;
    }

    const context: CompactBandRuntimeDayContext = { period, durationTicks, durationFactor, roster: this.roster,
      farmReport, processingReport, edibleGrainAdded };
    const foodPlan = this.services.resolveFoodDay(context);
    if (!foodPlan || !foodPlan.supply) throw new TypeError('food day planner must supply measured food inputs');
    if (Object.hasOwn(foodPlan.supply, 'durationFactor')) throw new TypeError('food planner cannot override the interval duration factor');
    const livingCount = living.length;
    if (foodPlan.supply.population !== livingCount) throw new RangeError('food planner population differs from the living roster');
    const livingTechs = new Set<string>();
    for (const member of living) for (const tech of member.person.knownTech) livingTechs.add(tech);
    if (foodPlan.supply.techs.some(tech => !livingTechs.has(tech))) throw new RangeError('food planner supplied a technique not held by a living band member');
    const foodWorkerDays = Object.values(foodPlan.supply.work).reduce((sum, rate) => sum + rate.workerDays, 0);
    const laborTicks = farmWorkTicks + processingWorkTicks + foodWorkerDays * tpd;
    if (!Number.isFinite(foodWorkerDays) || !Number.isFinite(laborTicks) || foodWorkerDays > adultCount * durationFactor || laborTicks > adultCount * durationTicks) {
      throw new RangeError('daily food, farm, and processing work exceeds living adult labor');
    }
    const supplementalRations = (processingReport?.nutritionProduced ?? 0) / RATION_NUTRITION;
    const input = { ...foodPlan.supply, day: period.day, season: period.season, durationFactor, supplementalRations };
    const preview = advanceCompactBandFoodDay(this.calendar.foodState, input);
    const foodBudget = preview.report.consumed * RATION_NUTRITION;
    if (!Number.isFinite(foodBudget)) throw new RangeError('daily food relief budget overflow');
    const quotas = this.services.allocateIntake({ ...context, food: preview.report, foodBudget,
      waterAvailability: foodPlan.waterAvailability });
    if (!quotas || !Array.isArray(quotas.allocations)) throw new TypeError('intake allocator must return explicit allocations');
    const livingIds = this.roster.filter(member => member.person.alive).map(member => member.person.id).sort((a,b) => a-b);
    const allocationIds = quotas.allocations.map(row => row.personId).sort((a,b) => a-b);
    if (livingIds.length !== allocationIds.length || livingIds.some((id,index) => id !== allocationIds[index])) throw new RangeError('intake allocator must name every living member exactly once');
    const nextIntake = CompactBandIntake.fromRecord(this.intake.toRecord());
    nextIntake.beginDay({ day: elapsedDay, foodBudget, waterAvailability: foodPlan.waterAvailability,
      allocations: quotas.allocations });
    for (let index = 0; index < this.roster.length; index++) {
      const person = this.roster[index]!.person;
      const candidate = workPeople[index]!;
      for (const skill of Object.keys(person.skills) as (keyof Person['skills'])[]) {
        if (candidate.skills[skill] !== person.skills[skill]) person.skills[skill] = candidate.skills[skill];
      }
    }
    this.farm = farm;
    this.processing = processing;
    this.intake = nextIntake;
    this.pendingDay = { period, supply: cloneJson({ ...foodPlan.supply, supplementalRations }),
      waterAvailability: foodPlan.waterAvailability, expectedFood: preview.report,
      farmReport, processingReport, edibleGrainAdded };
  }

  /** Full detached record; external land/contact/building resolvers are deliberately re-supplied on restore. */
  toRecord(): CompactBandRuntimeRecord {
    const tick = this.calendar.tick;
    const pending = this.pendingDay ? {
      period: { ...this.pendingDay.period }, supply: cloneJson(this.pendingDay.supply),
      waterAvailability: this.pendingDay.waterAvailability, expectedFood: cloneJson(this.pendingDay.expectedFood),
    } : null;
    const record: CompactBandRuntimeRecord = {
      recordType: 'CompactBandRuntimeRecord', version: 1, bandId: this.bandId, startTick: this.startTick,
      model: { needs: { ...this.services.needs }, population: { ...this.life.population },
        childhood: { ...this.life.childhood }, learning: { ...this.life.learning }, worldSeed: this.life.worldSeed },
      calendar: this.calendar.toRecord(), roster: this.roster.map(toCompactRecord),
      people: [...this.life.peopleById.values()].sort((a,b) => a.id - b.id).map(person => toPersonRecord(person, tick)),
      households: [...this.life.householdsById.values()].sort((a,b) => a.id - b.id).map(house => toHouseholdRecord(house, tick)),
      ids: this.life.ids.snapshot(), relationships: this.life.relationships.snapshot(),
      intake: this.intake.toRecord(), lifeLedger: { ...this.lifeLedger },
      knowledge: toCompactBandKnowledgeRecord(this.knowledge),
      farm: this.farm?.toRecord() ?? null, processing: this.processing?.toRecord() ?? null,
      pendingDay: pending,
    };
    return cloneJson(record);
  }

  /** Rebuild owned person/household graphs from codecs; policies and external world data are supplied again. */
  static fromRecord(value: unknown, services: CompactBandRuntimeServices, shared?: CompactBandRuntimeSharedState): CompactBandRuntime {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid compact runtime record');
    const raw = value as Partial<CompactBandRuntimeRecord>;
    const keys = Object.keys(raw).sort();
    if (keys.length !== RUNTIME_KEYS.length || keys.some((key,index) => key !== RUNTIME_KEYS[index]) ||
      raw.recordType !== 'CompactBandRuntimeRecord' || raw.version !== 1 || raw.bandId !== services.bandId) {
      throw new TypeError('invalid compact runtime record shape/version/band');
    }
    const expectedModel = { needs: services.needs, population: services.life.population, childhood: services.life.childhood, learning: services.life.learning, worldSeed: services.life.worldSeed };
    if (JSON.stringify(raw.model) !== JSON.stringify(expectedModel)) throw new RangeError('runtime model configuration differs from saved snapshot');
    if (!Array.isArray(raw.roster) || !Array.isArray(raw.people) || !Array.isArray(raw.households)) throw new TypeError('runtime entity arrays are required');
    const peopleById = new Map<number, Person>();
    const personRecordsById = new Map<number, PersonRecord>();
    for (const rec of raw.people) {
      const person = fromPersonRecord(rec);
      if (peopleById.has(person.id)) throw new RangeError(`duplicate runtime person ${person.id}`);
      peopleById.set(person.id, person);
      personRecordsById.set(person.id, rec);
    }
    const roster = raw.roster.map(rec => {
      const compact = fromCompactRecord(rec);
      const canonical = shared?.peopleById.get(compact.person.id) ?? peopleById.get(compact.person.id);
      if (!canonical) throw new RangeError(`compact person ${compact.person.id} missing from canonical person records`);
      if (JSON.stringify(personRecordsById.get(compact.person.id)) !== JSON.stringify((rec as CompactPersonRecord).person)) throw new RangeError(`compact/canonical person ${compact.person.id} records disagree`);
      // CompactPerson and life share the same instance, never two copies of a named person.
      return { ...compact, person: canonical };
    });
    const decodedHouseholdsById = new Map<number, Household>();
    for (const rec of raw.households) {
      const household = fromHouseholdRecord(rec);
      if (decodedHouseholdsById.has(household.id)) throw new RangeError(`duplicate runtime household ${household.id}`);
      decodedHouseholdsById.set(household.id, household);
    }
    const canonicalPeople = shared?.peopleById ?? peopleById;
    const householdsById = shared?.householdsById ?? decodedHouseholdsById;
    const ids = shared?.ids ?? IdSpaceFactory.fromSnapshot(raw.ids);
    const relationships = shared?.relationships ?? RelationshipGraphFactory.fromSnapshot(raw.relationships as ReturnType<RelationshipGraph['snapshot']>);
    const life = { ...services.life, ids, peopleById: canonicalPeople, householdsById, relationships };
    const calendar = CompactBandCalendar.fromRecord(raw.calendar);
    const intake = CompactBandIntake.fromRecord(raw.intake, services.time.ticksPerDay);
    const runtime = new CompactBandRuntime({ ...services, roster, calendar, life,
      startTick: raw.startTick,lifeLedger: raw.lifeLedger, knowledge: fromCompactBandKnowledgeRecord(raw.knowledge),
      farm: raw.farm ? CompactBandFarming.fromRecord(raw.farm) : undefined,
      processing: raw.processing ? CompactBandProcessing.fromRecord(raw.processing) : undefined }, true);
    runtime.intake = intake;
    const tick = calendar.tick;
    const expectedElapsedDay = tick === raw.startTick ? null : Math.floor((tick - 1) / services.time.ticksPerDay);
    if (intake.report.day !== expectedElapsedDay) throw new RangeError('saved intake date does not match runtime clock');
    const lifeRaw = raw.lifeLedger as unknown as Record<string, unknown> | undefined;
    if (!lifeRaw || Object.keys(lifeRaw).length !== 2 || !Object.hasOwn(lifeRaw, 'version') || !Object.hasOwn(lifeRaw, 'lastAdvancedDay') || lifeRaw.version !== 1) throw new TypeError('invalid saved life ledger');
    const lifeLastDay = lifeRaw.lastAdvancedDay;
    if (!(lifeLastDay === null || (typeof lifeLastDay === 'number' && Number.isSafeInteger(lifeLastDay) && lifeLastDay >= 0))) throw new TypeError('invalid saved life date');
    const firstBoundaryAfterStart = (Math.floor((raw.startTick as number) / services.time.ticksPerDay) + 1) * services.time.ticksPerDay;
    if (tick >= firstBoundaryAfterStart) {
      const clock = TimeManager.fromSnapshot(calendar.toRecord().time);
      if (lifeLastDay !== clock.day) throw new RangeError('life ledger date does not match runtime clock');
    } else if (lifeLastDay !== null) throw new RangeError('life ledger advanced before its first daily boundary');
    if (raw.pendingDay !== null) {
      const pending = raw.pendingDay;
      if (!pending || typeof pending !== 'object' || Object.keys(pending).length !== 4 || !['period','supply','waterAvailability','expectedFood'].every(key => Object.hasOwn(pending,key)) || !pending.period || !pending.supply ||
        Object.keys(pending.period).length !== 4 || !['day','season','fromTick','toTick'].every(key => Object.hasOwn(pending.period,key)) || !Number.isSafeInteger(pending.period.day) || pending.period.toTick <= calendar.tick || pending.period.fromTick > calendar.tick) {
        throw new TypeError('invalid pending food plan');
      }
      const tpd = services.time.ticksPerDay;
      const expectedDay = Math.floor((calendar.tick - 1) / tpd);
      const expectedToTick = (Math.floor(calendar.tick / tpd) + 1) * tpd;
      const before = TimeManager.fromSnapshot({ ...calendar.toRecord().time, tick: expectedToTick - 1 });
      const expectedFromTick = Math.max(expectedToTick - tpd, raw.startTick as number);
      if (intake.report.day !== expectedDay || pending.period.day !== calendar.foodState.day + 1 || pending.period.fromTick !== expectedFromTick || pending.period.toTick !== expectedToTick || pending.period.season !== before.season || pending.waterAvailability !== intake.report.waterAvailability) throw new RangeError('pending day, intake quota, or season does not match runtime clock');
      const aliveIds = roster.filter(member => member.person.alive).map(member => member.person.id);
      const rosterIds = new Set(roster.map(member => member.person.id));
      const quotaIds = new Set(intake.toRecord().allocations.map(row => row.personId));
      if ([...quotaIds].some(id => !rosterIds.has(id)) || aliveIds.some(id => !quotaIds.has(id))) throw new RangeError('saved intake allocations do not match the runtime roster');
      const supplyKeys = Object.keys(pending.supply);
      if (supplyKeys.some(key => !['population','demandRations','profile','techs','work','supplementalRations'].includes(key))) throw new TypeError('unknown pending food input field');
      const durationFactor = (pending.period.toTick - pending.period.fromTick) / tpd;
      const recomputed = advanceCompactBandFoodDay(calendar.foodState, {
        ...pending.supply, day: pending.period.day, season: pending.period.season, durationFactor,
      });
      if (JSON.stringify(recomputed.report) !== JSON.stringify(pending.expectedFood)) throw new RangeError('pending food preview does not match saved food ledger');
      runtime.pendingDay = { ...pending, farmReport: null, processingReport: null, edibleGrainAdded: 0 };
    } else if (calendar.tick !== raw.startTick && calendar.tick % services.time.ticksPerDay !== 0) {
      throw new RangeError('mid-day runtime record is missing its saved food plan');
    }
    return runtime;
  }
}
