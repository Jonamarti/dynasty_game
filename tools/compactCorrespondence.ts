/**
 * Correspondence experiment, M15 phase 32b: an equivalent cohort in the detailed
 * model and in the compact model, from the same moment, compared.
 *
 * At tick T of a detailed world every living person is **copied** (a JSON round trip of
 * their `PersonRecord`, so nothing is shared). The originals go on being simulated in
 * detail for `days` more days; the copies are advanced by `CompactBody` with the intake
 * model, whose band capacity is read from the band's own recorded days in the window
 * *before* T (what a band-level model will have to hand it), never from the days it is
 * about to be compared on.
 *
 * Violence is outside the compact body, so a person the detailed run lets be killed by
 * somebody is counted as a survivor in the detailed arm (censored), not as a death the
 * compact arm could not have had. That is a choice made before measuring.
 */
import { Simulation } from '../src/sim/core/Simulation.ts';
import { makeConfig } from '../src/sim/core/Config.ts';
import { fromPersonRecord, toPersonRecord } from '../src/sim/persistence/EntityRecords.ts';
import { CompactBody } from '../src/sim/compact/CompactAdvance.ts';
import { deriveCompactStream, goalOf, type CompactPerson } from '../src/sim/compact/CompactPerson.ts';
import { RateWatch, type PersonDay } from '../src/sim/compact/CompactCalibration.ts';
import { IntakeModel, type BandCapacity } from '../src/sim/compact/CompactIntake.ts';
import { NAME_ONSETS, NAME_CODAS } from '../src/data/names.ts';
import { Person } from '../src/sim/entities/Person.ts';
import type { IdSpace } from '../src/sim/core/IdSpace.ts';
import { isLactating, isNursling } from '../src/sim/entities/LifeStage.ts';
import { nurslingHungerFactor } from '../src/sim/ai/Nursing.ts';
import { SCENARIOS } from './simcheck.ts';

export interface ArmStats {
  n: number;
  /** Survivors, counting a violent death in the detailed arm as alive (censored). */
  alive: number;
  /** Actually living at the end: the ones the mean needs are taken over. */
  living: number;
  /** Mean needs of the survivors, 0-100. */
  hunger: number;
  thirst: number;
  /** Deaths by cause (violence excluded in the detailed arm). */
  causes: Record<string, number>;
  /** Children born to members of the cohort during the run. */
  births: number;
  /** Cohort members who died of old age. */
  oldAge: number;
}

export interface CorrespondenceResult {
  scenario: string; seed: string;
  detailed: ArmStats; compact: ArmStats;
  /** The capacity read from the window before T, per band. */
  scales: Record<number, BandCapacity | undefined>;
  /** Same cohort, intake switched off: the closed body. */
  closed: ArmStats;
  /** Intake with the capacity read from the very days compared (an oracle: what a perfect band forecast would hand over). */
  oracle: ArmStats;
  oracleScales: Record<number, BandCapacity | undefined>;
}

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function stats(people: readonly Person[], violentAlive: (p: Person) => boolean): ArmStats {
  const out: ArmStats = { n: people.length, alive: 0, living: 0, hunger: 0, thirst: 0, causes: {}, births: 0, oldAge: 0 };
  for (const p of people) {
    if (p.alive || violentAlive(p)) {
      out.alive++;
      if (p.alive) { out.living++; out.hunger += p.needs.hunger; out.thirst += p.needs.thirst; }
    } else out.causes[p.causeOfDeath ?? 'unknown'] = (out.causes[p.causeOfDeath ?? 'unknown'] ?? 0) + 1;
    if (!p.alive && p.causeOfDeath === 'old age') out.oldAge++;
  }
  out.hunger /= out.living || 1; out.thirst /= out.living || 1;
  return out;
}

export interface CorrespondenceOptions {
  scenario: string; seed: string;
  /** Steps run (observed) before the cohort is cut. */
  warmupSteps: number;
  /** The last `windowSteps` of the warm-up are what the band capacity is read from. */
  windowSteps: number;
  /** Days both arms are advanced. */
  days: number;
  model: IntakeModel;
  /** Force a scale for every band instead of reading it (the negative controls). */
  scaleOverride?: BandCapacity;
  /** Also run ageing, conception, birth and death of old age in the compact arms. */
  life?: boolean;
}

export function runCorrespondence(o: CorrespondenceOptions): CorrespondenceResult {
  const scenario = SCENARIOS[o.scenario]!;
  const config = { ...makeConfig(scenario.config), seed: o.seed };
  const sim = scenario.create?.(config) ?? new Simulation(config);
  if (scenario.create) scenario.setup?.(sim);
  const watch = new RateWatch(sim);
  watch.observe();
  let mark = 0;
  for (let i = 1; i <= o.warmupSteps; i++) {
    if (i === o.warmupSteps - o.windowSteps + 1) mark = watch.days.length;
    sim.step(); watch.observe();
  }
  const T = sim.time.tick;
  const tpd = sim.config.time.ticksPerDay;
  const cohort = sim.people.filter(p => p.alive);

  // Capacity per band from the window before T; a band with too few hungry days borrows the whole world's,
  // and a world with too few uses the table's own behaviour (undefined).
  const window: readonly PersonDay[] = watch.days.slice(mark);
  const read = (days: readonly PersonDay[]): BandCapacity | undefined => {
    try { return o.model.capacityFrom(days); } catch { return undefined; }
  };
  const readBands = (days: readonly PersonDay[]) => {
    const worldWide = read(days);
    const bands: Record<number, BandCapacity | undefined> = {};
    for (const bandId of new Set(cohort.map(p => p.bandId))) bands[bandId] = read(days.filter(d => d.bandId === bandId)) ?? worldWide;
    return bands;
  };
  const scales = readBands(window);
  const scaleFor = (p: Person): BandCapacity | undefined => o.scaleOverride ?? scales[p.bandId];

  const records = cohort.map(p => wire(toPersonRecord(p, T)));
  // M15 phase 18: the compact model conceives only under a household's roof, so
  // it needs the homes as they stood at T — copied, because the detailed run
  // below keeps rewriting `homeBuildingId` every midnight.
  const homesAtT = new Map([...sim.householdsById].map(([id, h]) =>
    [id, Object.assign(Object.create(Object.getPrototypeOf(h)) as typeof h, h)]));
  const arm = (withIntake: boolean, scaleOf: (p: Person) => BandCapacity | undefined, withLife = false): { people: Person[]; born: Person[] } => {
    const born: Person[] = [];
    let nextChildId = 1_000_000;
    const copies = new Map<number, Person>();
    const compacts: CompactPerson[] = records.map(record => {
      const copy = fromPersonRecord(wire(record));
      copies.set(copy.id, copy);
      return { person: copy, lastAdvancedTick: T, rng: deriveCompactStream(config.seed ?? 'seed', copy.id),
        goal: goalOf(copy, T), intake: null, epoch: 0 };
    });
    const nurslingFactor = nurslingHungerFactor(sim.config.childhood.feedsPerDay, tpd, sim.config.needs.hungerRate);
    let id = 1;
    const body = new CompactBody({
      needs: sim.config.needs, time: sim.config.time, world: sim.world, buildings: sim.buildings,
      hooks: {
        hungerFactor: (person: Person) => isLactating(person, copies, sim.config.childhood)
          ? 1 + sim.config.childhood.lactationHunger : isNursling(person, sim.config.childhood) ? nurslingFactor : 1,
      },
      life: withLife ? {
        population: sim.config.population, peopleById: copies, householdsById: homesAtT,
        makeChild: (mother, childRng) => {
          const name = childRng.pick(NAME_ONSETS) + childRng.pick(NAME_CODAS);
          const child = new Person(name, mother.x, mother.y, mother.bandId, childRng, mother.daysPerYear,
            { allocate: () => nextChildId++ } as unknown as IdSpace);
          child.skillGain = sim.config.learning.skillGain;
          return child;
        },
        onBirth: (child, mother, father) => {
          copies.set(child.id, child); born.push(child);
          mother.childIds.push(child.id); father?.childIds.push(child.id);
        },
      } : undefined,
      intake: withIntake ? { model: o.model, capacity: scaleOf, childhood: sim.config.childhood } : undefined,
      nextEventId: () => id++,
    });
    for (const c of compacts) body.advance(c, T + o.days * tpd);
    return { people: compacts.map(c => c.person), born };
  };

  const markAfter = watch.days.length;
  for (let i = 0; i < o.days * tpd; i++) { sim.step(); watch.observe(); }
  // The oracle capacity: the band's own relief on the days that are being compared.
  const later: readonly PersonDay[] = watch.days.slice(markAfter);
  const oracleScales = readBands(later);
  const compactArm = arm(true, scaleFor, o.life);
  const closedArm = arm(false, scaleFor);
  const oracleArm = arm(true, p => o.scaleOverride ?? oracleScales[p.bandId], o.life);
  const compactPeople = compactArm.people, closedPeople = closedArm.people, oraclePeople = oracleArm.people;
  const cohortIds = new Set(cohort.map(p => p.id));
  const detailedBirths = [...sim.peopleById.values()].filter(p => !cohortIds.has(p.id) && p.motherId !== null && cohortIds.has(p.motherId)).length;
  const detailedPeople = cohort; // the same instances, now `days` older
  const violent = (p: Person) => (p.causeOfDeath ?? '').startsWith('killed by ');
  return {
    scenario: o.scenario, seed: o.seed, scales,
    detailed: { ...stats(detailedPeople, violent), births: detailedBirths },
    compact: { ...stats(compactPeople, () => false), births: compactArm.born.length },
    closed: stats(closedPeople, () => false),
    oracle: { ...stats(oraclePeople, () => false), births: oracleArm.born.length }, oracleScales,
  };
}

export function pool(rows: readonly ArmStats[]): ArmStats {
  const out: ArmStats = { n: 0, alive: 0, living: 0, hunger: 0, thirst: 0, causes: {}, births: 0, oldAge: 0 };
  for (const r of rows) {
    out.n += r.n; out.alive += r.alive; out.living += r.living; out.hunger += r.hunger * r.living; out.thirst += r.thirst * r.living; out.births += r.births; out.oldAge += r.oldAge;
    for (const [k, v] of Object.entries(r.causes)) out.causes[k] = (out.causes[k] ?? 0) + v;
  }
  if (out.living > 0) { out.hunger /= out.living; out.thirst /= out.living; }
  return out;
}
