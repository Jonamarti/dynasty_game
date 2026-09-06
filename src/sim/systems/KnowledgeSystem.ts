/**
 * Discovery, research, teaching, watching, and forgetting.
 *
 * Knowledge spreads three ways, and they are deliberately very different in
 * cost and reliability:
 *
 *  - **Discovery** is rare, solitary and *situated*. It is no longer a uniform
 *    pick from whatever is reachable: an idea is sparked by what is in your
 *    head together with what is in your hands, underfoot, on your mind and in
 *    front of you. See `knowledge/Synthesis.ts`.
 *  - **Teaching** is fast, deliberate and needs both parties present and
 *    willing. It is what the `teach` skill has been waiting for since M0.
 *  - **Watching** is slow, passive and free. Stand near someone using a thing
 *    for long enough and you may work out the trick of it.
 *
 * There is no fourth way, and in particular there is no global unlock. If
 * everybody who knows how to fire clay dies in one winter, the world does not
 * know how to fire clay any more, and the granary stops being buildable until
 * somebody works it out again.
 *
 * ## Discovery is a lifecycle, not a roll
 *
 * Conceiving of a thing is the *start*. A person then researches it by thinking
 * and by talking to people whose skills bear on it, makes breakthroughs, builds
 * a prototype, finds out whether it works — a test can fail — and afterwards
 * refines the design to a per-technology ceiling. Conception lives here;
 * research and prototyping are actions in `ActionSystem`, because they take
 * time a person could have spent eating and the scorer has to weigh that.
 */
import type { Person } from '../entities/Person.ts';
import { LATELY_ENOUGH, NEEDS } from '../entities/Person.ts';
import type { RNG } from '../core/RNG.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { World, Biome } from '../core/World.ts';
import type { Season } from '../core/TimeManager.ts';
import { TECH, TECHS, prerequisitesMet, type Tech } from '../knowledge/Tech.ts';
import {
  MAX_IDEAS, sparkFires, type Idea, type Notice, type Spark,
} from '../knowledge/Synthesis.ts';
import { telemetry } from '../core/Telemetry.ts';

/** Base daily chance a curious adult in the right situation has an idea. */
const CONCEPTION_BASE = 0.045;

/** Daily chance of picking something up merely from being near a knower. */
const OBSERVATION_CHANCE = 0.02;

/** How far you have to be to learn by watching. */
const WATCHING_RANGE = 5;

/**
 * Above this a need is something you are actively feeling, not background.
 *
 * Set below the interruption thresholds in `ActionSystem`, and that is the
 * whole reason for the number. Those thresholds are where a need *parks* —
 * work continues right up to the line and stops there — so a population's
 * hunger settles at 40 and its thirst at 35, and anything above those is
 * reached only by someone in real trouble. At 40 the fire branch of the tree
 * was measurably unreachable: every route into `firemaking` wanted cold, cold
 * is answered by shelter at 25, and across a two-year run nobody in the world
 * ever made fire where the previous build had eight people doing it.
 */
const FELT_AT = 30;

/**
 * Salience below which a memory is too faint to put an idea in anybody's head.
 *
 * A threshold on salience rather than on age, because `Memory.decay` already
 * ages entries once a day and a second notion of "recent" would drift from the
 * first one.
 */
const WITNESS_SALIENCE = 0.15;

/**
 * Daily chance a prototype gets put to the test.
 *
 * The test is not an action. A first attempt made it one and it read as a
 * chore: the honest description is that somebody carries the thing around for a
 * few days using it, and one of those uses is the one that settles it. Skill
 * raises the chance of the trial going well, not of it happening.
 */
const TEST_CHANCE = 0.18;

/** Insight lost by a prototype that did not work. */
const FAILED_TEST_COST = 0.25;

/**
 * Days a fully worked-out idea may sit unbuilt before its owner gives up on it.
 *
 * Without this an idea whose materials never turn up occupies one of two slots
 * for the rest of a life, and the person never thinks of anything again. The
 * escape has to exist even once every prototype cost is satisfiable, because
 * the *world* decides whether four reeds are ever in the same hands as an idea
 * about cordage, and it sometimes decides no.
 */
const STALE_DAYS = 90;

export interface KnowledgeContext {
  rng: RNG;
  tick: number;
  peopleHash: SpatialHash<Person>;
  world: World;
  season: Season;
  ticksPerDay: number;
  /**
   * Announces something worth a floater and a chronicle line: an idea, a
   * breakthrough, a prototype that failed, a design proven or improved.
   *
   * Routed out rather than pushed straight at the renderer for the usual
   * reason — nothing under `src/sim/` may touch the DOM — and because the
   * decision about whose insights are worth showing belongs to whoever knows
   * which person the player is watching.
   */
  onInsight: (person: Person, text: string, kind: 'idea' | 'gain' | 'setback') => void;
}

export class KnowledgeSystem {
  /**
   * The daily pass: conception, observation, and the testing of prototypes.
   *
   * Children are no longer skipped wholesale. They are skipped for
   * *conception* — a nine-year-old does not invent hafting — but the decay of
   * what they have been doing still has to run, or a child's tallies would sit
   * frozen until their fourteenth birthday and then spark everything at once.
   */
  daily(people: Person[], ctx: KnowledgeContext): void {
    for (const person of people) {
      if (!person.alive) continue;
      person.decayRecent();
      if (person.isChild) continue;
      this.abandonStaleIdeas(person, ctx);
      this.tryConceive(person, ctx);
      this.testPrototypes(person, ctx);
      this.tryObserve(person, ctx);
    }
  }

  /**
   * Everything about a person that could set an idea off, gathered once.
   *
   * Public because the tech web asks the same question to answer "why not" on a
   * node the player is hovering, and the panel must be reading the same
   * situation the simulation decides on. Two definitions of "what is on your
   * mind" is one too many.
   */
  notice(person: Person, ctx: { world: World; season: Season }): Notice {
    const holding = new Set<string>();
    for (const [itemId, count] of person.inventory.entries()) {
      if (count > 0) holding.add(itemId);
    }

    const lately = new Set<string>();
    for (const [action, weight] of person.lately) {
      if (weight >= LATELY_ENOUGH) lately.add(action);
    }

    const feeling = new Set<string>();
    for (const need of NEEDS) {
      if (person.needs[need] >= FELT_AT) feeling.add(need);
    }

    // What they saw comes from two places, because "saw" covers two things: a
    // deed somebody else did in front of them, and the reason their own work
    // kept stopping. The first is already recorded by the memory system and is
    // read rather than copied; a second store of the same events would drift.
    const saw = new Set<string>();
    for (const [what, weight] of person.noticed) {
      if (weight >= LATELY_ENOUGH) saw.add(what);
    }
    for (const entry of person.memory.all()) {
      if (!entry.firsthand) continue;
      if (entry.salience < WITNESS_SALIENCE) continue;
      saw.add(entry.type);
    }

    const biome: Biome = ctx.world.biomeAt(Math.round(person.x), Math.round(person.y));
    return {
      knows: person.knownTech,
      holding,
      lately,
      feeling,
      place: biome,
      saw,
      season: ctx.season,
    };
  }

  /**
   * Every route into a technology this person could conceive of right now.
   *
   * `requires` gates understanding and `sparks` gates the idea occurring, and
   * both have to hold. A technology already known, or already being worked on,
   * is not a candidate — nobody has the same idea twice.
   */
  conceivable(person: Person, notice: Notice): { tech: Tech; spark: Spark; index: number }[] {
    const routes: { tech: Tech; spark: Spark; index: number }[] = [];
    for (const tech of TECHS) {
      if (person.knownTech.has(tech)) continue;
      if (person.ideaFor(tech)) continue;
      if (!prerequisitesMet(tech, person.knownTech)) continue;
      const sparks = TECH[tech].sparks;
      for (let index = 0; index < sparks.length; index++) {
        const spark = sparks[index]!;
        if (sparkFires(spark, notice)) routes.push({ tech, spark, index });
      }
    }
    return routes;
  }

  /**
   * Giving up on an idea that has been thought all the way through and never
   * built, because whatever it needed never turned up.
   *
   * This is a refusal like any other and it says so: the chronicle records it
   * and the player watching gets told. An idea that silently evaporated would
   * look exactly like one that was never had.
   */
  private abandonStaleIdeas(person: Person, ctx: KnowledgeContext): void {
    for (const idea of [...person.ideas]) {
      if (idea.stage !== 'researching' || idea.insight < 1) continue;
      if (ctx.tick - idea.conceivedTick < STALE_DAYS * ctx.ticksPerDay) continue;

      const def = TECH[idea.tech];
      person.ideas = person.ideas.filter(other => other !== idea);
      telemetry.count('idea_abandoned_' + idea.tech);
      person.chronicle.push({
        tick: ctx.tick,
        ageDays: person.age,
        text: 'gave up on ' + def.label.toLowerCase() + ' for want of the materials',
        kind: 'did',
      });
      ctx.onInsight(person, 'gave up on ' + def.label.toLowerCase(), 'setback');
    }
  }

  /**
   * Having an idea.
   *
   * Where a uniform pick from `reachableFrom` used to be. The need-pressure
   * multiplier that used to sit in this formula is gone, and deliberately: cold
   * *is* the reason clothing occurred to you, it is an ingredient of the spark
   * that fired, and multiplying by it as well would be counting it twice.
   */
  private tryConceive(person: Person, ctx: KnowledgeContext): void {
    if (person.ideas.length >= MAX_IDEAS) return;

    const routes = this.conceivable(person, this.notice(person, ctx));
    if (routes.length === 0) return;

    // Weighted pick across every route open at once, so a person standing in
    // two situations is likelier to think of something than a person standing
    // in one, and the heavier route is the one they usually arrive by.
    let total = 0;
    for (const route of routes) total += route.spark.weight;
    let roll = ctx.rng.next() * total;
    let chosen = routes[routes.length - 1]!;
    for (const route of routes) {
      roll -= route.spark.weight;
      if (roll <= 0) { chosen = route; break; }
    }

    const def = TECH[chosen.tech];
    // Curiosity is whether you look; intelligence is whether you see it when
    // you do; skill is whether you have handled the materials enough to notice
    // anything at all. All three, because any one alone produces a caricature.
    const curiosity = 0.3 + person.traits.curiosity * 1.7;
    const wit = 0.6 + person.traits.intelligence * 0.8;
    const competence = 0.2 + person.skills[def.skill] / 60;

    const chance =
      (CONCEPTION_BASE / def.difficulty) * chosen.spark.weight * curiosity * wit * competence;
    if (!ctx.rng.chance(chance)) return;

    const idea: Idea = {
      tech: chosen.tech,
      stage: 'conceived',
      insight: 0,
      story: chosen.spark.story,
      conceivedTick: ctx.tick,
      effort: 0,
      discussedWith: [],
      failedTests: 0,
    };
    person.ideas.push(idea);
    telemetry.count('conceived_' + chosen.tech);
    // Per route, not just per technology: `sparks-are-various` asks whether the
    // web has more than one way in, and only this counter can answer it.
    telemetry.count('spark_' + chosen.tech + '_' + chosen.index);
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'had an idea about ' + def.label.toLowerCase() + ': ' + chosen.spark.story,
      kind: 'milestone',
    });
    ctx.onInsight(person, 'an idea about ' + def.label.toLowerCase(), 'idea');
  }

  /**
   * Finding out whether a prototype works.
   *
   * A roll rather than an action, because the honest description of testing is
   * that somebody uses the thing for a few days and one of those uses settles
   * it. `techPower` already hands a prototype half its effect for exactly this
   * reason: the world has to actually use the thing before it can find out.
   *
   * Both outcomes have to happen. A test that always passes is a delay with a
   * dice roll drawn over it, which is what `prototypes-can-fail` guards.
   */
  private testPrototypes(person: Person, ctx: KnowledgeContext): void {
    for (const idea of [...person.ideas]) {
      if (idea.stage !== 'prototyped') continue;
      if (!ctx.rng.chance(TEST_CHANCE)) continue;

      const def = TECH[idea.tech];
      const chance = Math.min(0.9,
        0.2 + person.skillFactor(def.skill) * 0.35 + idea.insight * 0.35
        + (person.traits.intelligence - 0.5) * 0.2);

      if (!ctx.rng.chance(chance)) {
        idea.failedTests++;
        idea.insight = Math.max(0, idea.insight - FAILED_TEST_COST);
        idea.stage = 'researching';
        telemetry.count('prototype_failed');
        person.chronicle.push({
          tick: ctx.tick,
          ageDays: person.age,
          text: 'built a ' + def.label.toLowerCase() + ' that did not work',
          kind: 'did',
        });
        ctx.onInsight(person, def.label.toLowerCase() + ' did not work', 'setback');
        continue;
      }

      this.prove(person, idea, ctx);
    }
  }

  /** A prototype that worked. The technology enters the world. */
  private prove(person: Person, idea: Idea, ctx: KnowledgeContext): void {
    const def = TECH[idea.tech];
    person.knownTech.add(idea.tech);
    person.techLevel.set(idea.tech, 0);
    idea.stage = 'proven';
    // Insight is spent proving it. What refills it from here raises the level
    // of the design rather than proving it again.
    idea.insight = 0;
    telemetry.count('proven_' + idea.tech);
    telemetry.count('discovered_' + idea.tech);
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'worked out ' + def.label.toLowerCase() +
        (idea.failedTests > 0 ? ', after ' + idea.failedTests + ' that failed' : ''),
      kind: 'milestone',
    });
    ctx.onInsight(person, 'worked out ' + def.label.toLowerCase(), 'gain');
  }

  /**
   * Adds insight to an idea and handles everything that crossing a line means.
   *
   * Called by `ponder` and `discuss`, which are the only two ways insight ever
   * moves upward. One function rather than two because the stage machine is the
   * fiddly part and two copies of it would drift.
   *
   * Returns a line describing what changed, or null if the idea merely got
   * closer to something.
   */
  advance(person: Person, idea: Idea, amount: number, tick: number): string | null {
    // An idea that has already retired at its ceiling is nobody's any more.
    // Nothing in the game can reach one — `workableIdea` reads `person.ideas`
    // on both sides — but without this guard the ceiling is enforced by where
    // the callers happen to look rather than by the rule itself, and a caller
    // added later would quietly refine a technology forever.
    if (!person.ideas.includes(idea)) return null;
    const def = TECH[idea.tech];
    if (idea.stage === 'conceived') idea.stage = 'researching';
    idea.insight = Math.min(1, idea.insight + amount);

    // A proven design that has been thought about all the way round again is a
    // better design. This is the only thing that raises `techPower` above 1.
    if (idea.stage === 'proven' && idea.insight >= 1) {
      const level = (person.techLevel.get(idea.tech) ?? 0) + 1;
      person.techLevel.set(idea.tech, level);
      idea.insight = 0;
      telemetry.count('refined_' + idea.tech);
      person.chronicle.push({
        tick,
        ageDays: person.age,
        text: 'improved their ' + def.label.toLowerCase(),
        kind: 'did',
      });
      // At the ceiling there is nothing left to fix, and the idea retires —
      // which is also what frees the slot for the next one. Without this a
      // long-lived expert would fill both slots forever and never think of
      // anything again.
      if (level >= def.maxRefinement) {
        person.ideas = person.ideas.filter(other => other !== idea);
        telemetry.count('mastered_' + idea.tech);
      }
      return 'improved their ' + def.label.toLowerCase();
    }
    return null;
  }

  /**
   * Picking something up by being around someone who knows it.
   *
   * Slow and unreliable, but it is what stops a band from depending entirely on
   * whether the one person who knows a thing can be bothered to teach it.
   */
  private tryObserve(person: Person, ctx: KnowledgeContext): void {
    if (!ctx.rng.chance(OBSERVATION_CHANCE)) return;

    const neighbours = ctx.peopleHash.queryRadius(person.x, person.y, WATCHING_RANGE);
    for (const other of neighbours) {
      if (!other.alive || other.id === person.id) continue;
      for (const tech of other.knownTech) {
        if (person.knownTech.has(tech)) continue;
        if (!TECH[tech as Tech]) continue;
        // You can only pick up what you are equipped to understand.
        if (!TECH[tech as Tech].requires.every(r => person.knownTech.has(r))) continue;

        this.receive(person, tech as Tech);
        telemetry.count('observed_' + tech);
        return;
      }
    }
  }

  /**
   * Somebody comes to know a thing without having worked it out themselves.
   *
   * Level zero, always: what you were shown is the plain version of the design,
   * not the refined one its holder spent years improving. Any idea they had
   * about it is dropped, because there is nothing left to work out.
   */
  private receive(person: Person, tech: Tech): void {
    person.knownTech.add(tech);
    if (!person.techLevel.has(tech)) person.techLevel.set(tech, 0);
    person.ideas = person.ideas.filter(idea => idea.tech !== tech);
  }

  /**
   * One person deliberately teaching another. Called by the action system.
   *
   * Returns what was taught, or null if there was nothing to pass on. Success
   * depends on the teacher's skill and the pupil's regard for them — you do not
   * learn much from somebody you have no time for.
   */
  teach(teacher: Person, pupil: Person, regard: number, tick: number, rng: RNG): Tech | null {
    const teachable: Tech[] = [];
    for (const tech of teacher.knownTech) {
      if (pupil.knownTech.has(tech)) continue;
      const def = TECH[tech as Tech];
      if (!def) continue;
      if (!def.requires.every(r => pupil.knownTech.has(r))) continue;
      teachable.push(tech as Tech);
    }
    if (teachable.length === 0) return null;

    const tech = teachable[rng.int(0, teachable.length - 1)]!;
    // The pupil's wits count as much as the teacher's skill here: an
    // explanation only lands if somebody on the other end can follow it.
    const chance = Math.min(0.95,
      0.25 + teacher.skillFactor('teach') * 0.5 + Math.max(0, regard) * 0.3
      + (pupil.traits.intelligence - 0.5) * 0.3);
    if (!rng.chance(chance)) {
      telemetry.count('teaching_failed');
      return null;
    }

    this.receive(pupil, tech);
    teacher.practice('teach', 2.5);
    telemetry.count('taught_' + tech);
    const text = teacher.name + ' taught ' + pupil.name + ' ' + TECH[tech].label.toLowerCase();
    teacher.chronicle.push({ tick, ageDays: teacher.age, text, kind: 'did' });
    pupil.chronicle.push({ tick, ageDays: pupil.age, text, kind: 'milestone' });
    return tech;
  }
}

/** How many living people know each thing. The census an era is read from. */
export function countHolders(people: Person[]): Map<Tech, number> {
  const counts = new Map<Tech, number>();
  for (const tech of TECHS) counts.set(tech, 0);
  for (const person of people) {
    if (!person.alive) continue;
    for (const tech of person.knownTech) {
      const known = tech as Tech;
      if (counts.has(known)) counts.set(known, counts.get(known)! + 1);
    }
  }
  return counts;
}
