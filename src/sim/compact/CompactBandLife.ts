/**
 * Compact-band daily demography (M15 phase 1c), shared with the detailed life rules.
 * Caller advances every compact body first and persists this last-day ledger with its band.
 */
import type { ChildhoodConfig, LearningConfig, PopulationConfig, TimeConfig } from '../core/Config.ts';
import type { IdSpace } from '../core/IdSpace.ts';
import type { Person } from '../entities/Person.ts';
import { Person as PersonEntity } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import { linkFamily } from '../social/SocialSystem.ts';
import { LifeSystem } from '../systems/LifeSystem.ts';
import { t } from '../../i18n/i18n.ts';
import { NAME_CODAS, NAME_ONSETS } from '../../data/names.ts';
import { WorldKnowledge } from '../social/WorldKnowledge.ts';
import { COMPACT_PHASE, type CompactEvent } from './CompactScheduler.ts';
import { deriveCompactStream, goalOf, type CompactPerson } from './CompactPerson.ts';
import type { RNG } from '../core/RNG.ts';

export interface CompactBandLifeLedger {
  readonly version: 1;
  readonly lastAdvancedDay: number | null;
}
export interface CompactBandLifeContext {
  readonly ledger: CompactBandLifeLedger;
  readonly tick: number;
  readonly day: number;
  readonly time: TimeConfig;
  readonly population: PopulationConfig;
  readonly childhood: ChildhoodConfig;
  readonly learning: LearningConfig;
  readonly worldSeed: string | number;
  readonly ids: IdSpace;
  readonly peopleById: Map<number, Person>;
  readonly parentArchive?: (id: number) => Person | null;
  readonly householdsById: Map<number, Household>;
  readonly relationships: RelationshipGraph;
  readonly makeChild?: (mother: Person, rng: RNG) => Person;
  readonly roofTonight: ReadonlyMap<number, number>;
}
export interface CompactBandLifeResult {
  readonly ledger: CompactBandLifeLedger;
  readonly newborns: CompactPerson[];
  readonly events: CompactEvent[];
}

function validate(roster: readonly CompactPerson[], ctx: CompactBandLifeContext): void {
  if (!Number.isSafeInteger(ctx.tick) || ctx.tick < 0 || ctx.time.ticksPerDay < 1 ||
      ctx.tick % ctx.time.ticksPerDay !== 0) throw new RangeError('compact band life requires a daily boundary');
  if (!Number.isSafeInteger(ctx.day) || ctx.day < 0) throw new RangeError('invalid compact band life day');
  if (ctx.ledger.version !== 1 || !(ctx.ledger.lastAdvancedDay === null ||
      Number.isSafeInteger(ctx.ledger.lastAdvancedDay))) throw new TypeError('invalid compact band life ledger');
  if (ctx.ledger.lastAdvancedDay !== null && ctx.day !== ctx.ledger.lastAdvancedDay + 1) {
    throw new RangeError('compact life day must advance once: ' + ctx.ledger.lastAdvancedDay + ' -> ' + ctx.day);
  }
  const seen = new Set<number>();
  for (const compact of roster) {
    const id = compact.person.id;
    if (seen.has(id)) throw new TypeError('duplicate compact person ' + id);
    seen.add(id);
    if (compact.lastAdvancedTick !== ctx.tick) {
      throw new RangeError('compact person ' + id + ' is not advanced to the life tick');
    }
    if (ctx.peopleById.get(id) !== compact.person) throw new TypeError('compact person ' + id + ' is not canonical');
  }
}
function birthFactory(ctx: CompactBandLifeContext): (mother: Person, rng: RNG) => Person {
  return ctx.makeChild ?? ((mother, rng) => {
    const name = rng.pick(NAME_ONSETS) + rng.pick(NAME_CODAS);
    const child = new PersonEntity(name, mother.x, mother.y, mother.bandId, rng, ctx.time.daysPerSeason * 4, ctx.ids);
    child.skillGain = ctx.learning.skillGain;
    return child;
  });
}
function registerBirth(child: Person, mother: Person, father: Person | null, ctx: CompactBandLifeContext,
  newborns: CompactPerson[], events: CompactEvent[]): void {
  if (ctx.peopleById.has(child.id)) throw new TypeError('newborn id ' + child.id + ' already registered');
  ctx.peopleById.set(child.id, child);
  mother.childIds.push(child.id);
  if (father) father.childIds.push(child.id);
  if (mother.worldKnowledge || father?.worldKnowledge) {
    const heard = child.worldKnowledge ??= new WorldKnowledge();
    mother.worldKnowledge?.tellAllTo(heard);
    father?.worldKnowledge?.tellAllTo(heard);
  }
  const household = child.householdId === null ? null : ctx.householdsById.get(child.householdId);
  if (household) household.add(child.id);
  if (household) child.feudTargetId = household.feudSuspects.values().next().value ?? null;
  linkFamily(child, [mother, father], ctx.relationships);
  mother.chronicle.push({ tick: ctx.tick, ageDays: mother.age,
    text: t('{mother} bore {child}', { mother: mother.name, child: child.name }), kind: 'milestone' });
  child.chronicle.push({ tick: ctx.tick, ageDays: 0, text: t('was born'), kind: 'milestone' });
  newborns.push({ person: child, lastAdvancedTick: ctx.tick, rng: deriveCompactStream(ctx.worldSeed, child.id),
    goal: goalOf(child, ctx.tick), intake: null, epoch: 0 });
  events.push({ id: ctx.ids.allocate('socialEvent'), tick: ctx.tick, phase: COMPACT_PHASE.demography,
    subjectId: mother.id, kind: 'birth', data: { childId: child.id, fatherId: father?.id ?? null } });
}

/** Settle one day for the whole roster, after each body reached this tick. */
export function advanceCompactBandLife(roster: readonly CompactPerson[], ctx: CompactBandLifeContext): CompactBandLifeResult {
  validate(roster, ctx);
  const newborns: CompactPerson[] = [];
  const events: CompactEvent[] = [];
  const system = new LifeSystem();
  const makeChild = birthFactory(ctx);
  for (const compact of [...roster].sort((a, b) => a.person.id - b.person.id)) {
    const person = compact.person;
    if (!person.alive) continue;
    system.daily([person], {
      rng: compact.rng, population: ctx.population, tick: ctx.tick, day: ctx.day,
      peopleById: ctx.peopleById, parentArchive: ctx.parentArchive, householdsById: ctx.householdsById, roofTonight: ctx.roofTonight,
      makeChild, onBirth: (child, mother, father) => registerBirth(child, mother, father, ctx, newborns, events),
      onDeath: (dying, cause) => dying.die(cause),
    });
    if (!person.alive) events.push({ id: ctx.ids.allocate('socialEvent'), tick: ctx.tick,
      phase: COMPACT_PHASE.demography, subjectId: person.id, kind: 'death', data: { cause: person.causeOfDeath } });
  }
  return { ledger: { version: 1, lastAdvancedDay: ctx.day }, newborns, events };
}
