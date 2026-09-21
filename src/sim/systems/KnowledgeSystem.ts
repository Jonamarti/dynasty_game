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
import type { KnowledgeConfig, LearningConfig } from '../core/Config.ts';
import { TECH, TECH_EFFECTS, TECHS, prerequisitesMet, scaled, type Tech } from '../knowledge/Tech.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { RECIPES } from '../entities/Recipe.ts';
import {
  MAX_IDEAS, TRIES_TO_TEST, sparkFires, type Idea, type Notice, type Spark,
} from '../knowledge/Synthesis.ts';
import { telemetry } from '../core/Telemetry.ts';

// `CONCEPTION_BASE`, `TEST_CHANCE`, the number of trials a design needs and what
// a failed one is worth all live in `Config.knowledge` now rather than here.

/**
 * What one recent sitting-and-thinking is worth to the chance of an idea, and
 * the ceiling on stacking them.
 *
 * Small on purpose, and capped for the reason `Brain` gives for everything in
 * this corner of the game: conception is the one number this project's
 * changelog has the longest history of overtuning by accident. At the cap a
 * habitual thinker is 70% likelier to have an idea on a day one was available
 * to them anyway — which is a real advantage over somebody who never sits
 * down, and is nothing like a second conception rate.
 */
const REFLECTION_PER = 0.35;
const REFLECTION_CAP = 0.7;
// The owner asked for them to be adjustable, and a scenario has as much right to
// move the pace of discovery as it has to shorten a season.

// The two observation chances moved to `Config.learning` for the same reason
// the research numbers above moved to `Config.knowledge`: they are the cheapest
// of the four transmission channels — free, passive, and slow enough that a band
// still needs somebody to sit down and explain — and how fast knowledge spreads
// without being taught is exactly a difficulty setting. A child's is nearly
// three times an adult's because a child spends its whole day underfoot while
// the people around it work, where an adult watching is an adult not working.

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
 * Insight knocked off by a trial that went badly.
 *
 * Much smaller than the 0.25 this shipped with, and it no longer decides
 * anything on its own: progress towards proving a design is `Idea.proof`, which
 * only goes up. This is the sting, not the setback.
 */
const FAILED_TRIAL_INSIGHT = 0.08;

/**
 * How far trials that went *badly* can carry a design on their own.
 *
 * That at least one trial has to go *well* is guaranteed by the control flow
 * below — only the passing branch calls `prove` — so this is not what enforces
 * it, and a first version of this comment claiming otherwise was wrong: a test
 * written against that claim passed with the ceiling removed, because nothing
 * was resting on it.
 *
 * What it actually buys is an honest bar. Progress towards a proof is drawn in
 * the Self tab and the tech web, and without a ceiling a run of failures under a
 * generous `failedTrialCredit` fills it to the brim and parks it there, so the
 * player reads a full bar beside a design that is not proven and never will be
 * until a trial goes well. It stays below one so that a full bar means proven.
 */
const FAILED_TRIAL_CEILING = 0.9;

/**
 * What proving this hands the player, in words, or null if it is a quiet one.
 *
 * The owner's report was that finishing cordage appeared to do nothing: no new
 * button, no new line, and the tech web still advertising the prototype cost.
 * Two of those are interface bugs and this is the third — the moment a
 * technology arrives is the moment to say what it is *for*, and for the ones
 * that unlock neither a building nor a recipe there is still `TECH_EFFECTS`.
 */
function unlockedBy(tech: Tech): string | null {
  const parts: string[] = [];
  for (const def of Object.values(BUILDINGS)) {
    if (def.requiresTech === tech) parts.push('build a ' + def.label.toLowerCase());
  }
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.tech === tech) parts.push('make a ' + recipe.label.toLowerCase());
  }
  return parts.length > 0 ? parts.join(', and ') : null;
}

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

/**
 * Nightly chance, per roof with both an adult and a child under it, that a
 * lesson is even attempted at the hearth.
 *
 * M11 phase 9b. Deliberately a second gate in front of `teach`'s own success
 * roll rather than a replacement for it: some nights nobody under the roof
 * has it in them to explain anything, and `teach` still decides whether the
 * explanation, once offered, actually lands. Set high enough that a roof
 * shared for a season sees several lessons — this is meant to be the
 * cheapest channel in the game, not a rare one — and tuned against
 * `knowledge-is-passed-on`/`children-are-taught` rather than chosen by feel.
 */
const HEARTH_LESSON_CHANCE = 0.15;

export interface KnowledgeContext {
  rng: RNG;
  tick: number;
  peopleHash: SpatialHash<Person>;
  world: World;
  season: Season;
  ticksPerDay: number;
  knowledge: KnowledgeConfig;
  learning: LearningConfig;
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
   * Children are skipped for *conception* — a nine-year-old does not invent
   * hafting, and an idea needs years of work behind it that a child does not
   * have — but they watch, and they can be taught. Before phase 4 they were
   * skipped wholesale, so a parent could not pass anything at all to their own
   * child and every technology in the world had to be re-derived by each
   * generation from nothing. That is not how any of this works.
   *
   * The decay of what they have been doing runs for everybody either way, or a
   * child's tallies would sit frozen until their fourteenth birthday and then
   * spark everything at once.
   */
  daily(people: Person[], ctx: KnowledgeContext): void {
    for (const person of people) {
      if (!person.alive) continue;
      person.decayRecent();
      if (person.isChild) {
        this.tryObserve(person, ctx);
        continue;
      }
      this.settleIntoPractice(person, ctx);
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
   * A practice that has been used often enough to stop being an experiment.
   *
   * The counterpart of `ActionSystem.doPrototype`, and the reason that verb no
   * longer has to pretend plant lore is a thing you build out of four berries.
   * A device is tried by making one; a practice is tried by doing it, and
   * `Person.noteDid` has been counting. At `TRIES_TO_TEST` the idea moves onto
   * the same bench every prototype stands on and `testPrototypes` takes it
   * from there — one lifecycle, two roads in.
   *
   * Announced, like every other stage change. A stage that moved silently
   * would leave the panel saying something new with nothing to explain why.
   */
  private settleIntoPractice(person: Person, ctx: KnowledgeContext): void {
    for (const idea of person.ideas) {
      if (idea.stage !== 'researching') continue;
      const def = TECH[idea.tech];
      if (def.kind !== 'practice') continue;
      // Two roads, and the owner named both: plant lore "should improve by
      // harvesting **and** thinking about it". Half a dozen times out in the
      // field is the fast one; thinking it all the way through to a full
      // insight is the slow one, and it is what keeps a practice whose work
      // is rare from being unreachable rather than merely hard.
      //
      // The slow road is not a consolation prize, it is the difference between
      // this being a design and being a dead end. Measured without it,
      // herbalism was conceived twelve times in a century-long run and tried
      // none, because `tend` only happens when somebody is hurt and a healer
      // is standing over them — so every one of those twelve ideas sat in one
      // of two idea slots until it went stale.
      const tried = idea.tries >= TRIES_TO_TEST;
      if (!tried && idea.insight < 1) continue;

      idea.stage = 'prototyped';
      telemetry.count((tried ? 'practised_' : 'reasoned_out_') + idea.tech);
      person.chronicle.push({
        tick: ctx.tick,
        ageDays: person.age,
        text: tried
          ? 'had been going about ' + def.label.toLowerCase() +
            ' their own way long enough to believe in it'
          : 'had thought ' + def.label.toLowerCase() +
            ' through as far as thinking would take it',
        kind: 'did',
      });
      ctx.onInsight(person, tried
        ? 'has made a habit of ' + def.label.toLowerCase()
        : 'has ' + def.label.toLowerCase() + ' worked out, in theory', 'idea');
    }
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
        // Two different failures, and saying the wrong one is worse than
        // saying nothing: a device was never built because the materials never
        // turned up, and a practice was never tried because they never got
        // round to doing the thing it was about.
        text: def.kind === 'practice'
          ? 'gave up on ' + def.label.toLowerCase() + ', never having put it to use'
          : 'gave up on ' + def.label.toLowerCase() + ' for want of the materials',
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
    // Note 4's second half: having actually sat down and thought. `curiosity`
    // above is whether you are the sort of person who looks; this is whether
    // you did.
    //
    // Read off the decayed tally rather than `notice.lately`, which is a
    // boolean at `LATELY_ENOUGH = 1`. That threshold is right for the spark
    // table, where an ingredient has to be either present or absent, and wrong
    // here: reflection is measurably rarer than daily — around 374 occasions
    // across fifty lifetimes — so a threshold would hand the entire effect to
    // whoever happened to be over it that morning and nothing at all to
    // everybody else. A tally of 0.4 is a person who sat and thought the day
    // before yesterday, and that is worth something.
    //
    // **Deliberately not `conceptionBase`**, which is the lever this project's
    // own record says has never been the right one. This multiplies the chance
    // for the people who did the thing; raising the base would have raised it
    // for everybody, including for the people the note is contrasting them
    // with.
    const reflection = 1 + Math.min(
      REFLECTION_CAP, (person.lately.get('reflect') ?? 0) * REFLECTION_PER
    );

    const chance =
      (ctx.knowledge.conceptionBase / def.difficulty) *
      chosen.spark.weight * curiosity * wit * competence * reflection;
    if (!ctx.rng.chance(chance)) return;

    const idea: Idea = {
      tech: chosen.tech,
      stage: 'conceived',
      insight: 0,
      story: chosen.spark.story,
      conceivedTick: ctx.tick,
      effort: 0,
      discussedWith: [],
      trials: 0,
      proof: 0,
      failedTests: 0,
      tries: 0,
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
      if (!ctx.rng.chance(ctx.knowledge.trialChance)) continue;

      const def = TECH[idea.tech];
      const chance = Math.min(0.9,
        0.2 + person.skillFactor(def.skill) * 0.35 + idea.insight * 0.35
        + (person.traits.intelligence - 0.5) * 0.2);

      idea.trials++;
      const step = 1 / Math.max(1, ctx.knowledge.trialsToProve);

      if (!ctx.rng.chance(chance)) {
        // A failed trial no longer undoes the work. It used to cost a quarter of
        // the insight, set the stage back to `researching` **and leave the
        // prototype materials spent**, so a second go at cordage wanted another
        // three thatch and the panel said "Needs 3 thatch to build one" for the
        // third time. From inside the game that is indistinguishable from being
        // stuck, which is exactly how the owner reported it. Progress towards
        // proving a design only ever goes up; luck decides how long it takes.
        idea.failedTests++;
        idea.proof = Math.min(
          FAILED_TRIAL_CEILING, idea.proof + step * ctx.knowledge.failedTrialCredit);
        idea.insight = Math.max(0, idea.insight - FAILED_TRIAL_INSIGHT);
        telemetry.count('prototype_failed');
        person.chronicle.push({
          tick: ctx.tick,
          ageDays: person.age,
          text: 'tried out a ' + def.label.toLowerCase() + ' and it did not work',
          kind: 'did',
        });
        ctx.onInsight(person, def.label.toLowerCase() + ' did not work', 'setback');
        continue;
      }

      idea.proof = Math.min(1, idea.proof + step);
      telemetry.count('prototype_trial_passed');
      if (idea.proof >= 1) {
        this.prove(person, idea, ctx);
        continue;
      }
      // A trial that went well without settling it. Said out loud because the
      // whole complaint about the old model was that the days between the
      // prototype and the proof were silent.
      ctx.onInsight(person, def.label.toLowerCase() + ' is beginning to work', 'gain');
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
        (idea.failedTests > 0
          ? ', after ' + idea.failedTests + ' ' +
            (idea.failedTests === 1 ? 'try' : 'tries') + ' that failed'
          : ''),
      kind: 'milestone',
    });
    // Say what it is *for*, not only that it happened. A technology that unlocks
    // nothing you can point at — cordage is the case the owner hit — otherwise
    // arrives as a line of text and no visible change anywhere in the game.
    const unlocked = unlockedBy(idea.tech);
    ctx.onInsight(
      person,
      'worked out ' + def.label.toLowerCase() +
        (unlocked !== null
          ? ' — can now ' + unlocked
          : ' — ' + TECH_EFFECTS[idea.tech].summary.toLowerCase().replace(/.$/, '')),
      'gain');
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
    const chance = person.isChild
      ? ctx.learning.childObservationChance
      : ctx.learning.observationChance;
    if (!ctx.rng.chance(chance)) return;

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
        if (person.isChild) telemetry.count('child_watched');
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
   * Somebody takes a technology off a record.
   *
   * The same landing as being taught it — level zero, the plain design — but by
   * a different road, and one that does not need its author to be alive. This
   * is the only channel in the game that crosses a death.
   */
  receiveFromRecord(person: Person, tech: Tech): void {
    this.receive(person, tech);
    telemetry.count('recovered_' + tech);
  }

  /**
   * Somebody takes a `reminder` record's spark, not its answer.
   *
   * `ochre`'s whole point: a painting is legible to anybody who can recognise
   * what it shows, but what it shows is that a thing was done, not how. This
   * lands in exactly the state `tryConceive` would leave a lucky notice in —
   * `conceived`, insight zero — so the reader still has to think it through,
   * build a prototype and find out whether it works, the same as anybody who
   * arrived at the idea on their own. `person.ideaFor` and the length check
   * mirror `conceivable`'s own guards: no second idea about a thing already
   * being worked on, and no idea at all once both slots are full.
   */
  remindFromRecord(person: Person, tech: Tech, tick: number): boolean {
    if (person.ideaFor(tech) || person.ideas.length >= MAX_IDEAS) return false;
    person.ideas.push({
      tech,
      stage: 'conceived',
      insight: 0,
      story: 'a painting of it, left by somebody long gone',
      conceivedTick: tick,
      effort: 0,
      discussedWith: [],
      trials: 0,
      proof: 0,
      failedTests: 0,
      tries: 0,
    });
    telemetry.count('reminded_' + tech);
    return true;
  }

  /**
   * One person deliberately teaching another. Called by the action system.
   *
   * Returns what was taught, or null if there was nothing to pass on. Success
   * depends on the teacher's skill and the pupil's regard for them — you do not
   * learn much from somebody you have no time for.
   */
  teach(teacher: Person, pupil: Person, regard: number, tick: number, rng: RNG): Tech | null {
    // A child can be taught and cannot teach. What they hold is real and
    // personal, but it is held at level 0 and it does not travel any further
    // until they are grown — which is also why the world's `knownTech` is
    // counted from adults. Knowing a thing and being able to explain it are
    // separated by about ten years.
    if (teacher.isChild) return null;

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
    //
    // Two more factors, both M11 phase 9b: `tradition` was already what
    // decided whether an elder *chose* to teach (`Brain`'s `teach` and
    // `teach_child` scorers have weighted it since long before this
    // milestone) but never touched whether the lesson actually landed, which
    // is what this reads it for. `storytelling` is new outright — the oral
    // channel's whole reason for existing — and `scaled` gives it the usual
    // "no effect unlearned, up to 40% more at a proven design, further with
    // refinement" curve rather than a flat bonus that ignores how well the
    // teacher actually has the practice.
    const chance = Math.min(0.95,
      (0.25 + teacher.skillFactor('teach') * 0.5 + Math.max(0, regard) * 0.3
        + (pupil.traits.intelligence - 0.5) * 0.3
        + (teacher.traits.tradition - 0.5) * 0.15)
      * scaled(teacher, 'storytelling', 1.4));
    if (!rng.chance(chance)) {
      telemetry.count('teaching_failed');
      return null;
    }

    this.receive(pupil, tech);
    teacher.practice('teach', 2.5);
    telemetry.count('taught_' + tech);
    // Counted apart so `children-are-taught` can ask whether the channel that
    // phase 4 opened is actually carrying anything, and whether it is mostly
    // kin doing it.
    //
    // Named `child_taught_*` rather than `taught_child`: `knowledge-is-passed-on`
    // sums every counter beginning `taught_` to count lessons, so a second
    // counter under that prefix would have been added to the total and reported
    // twice as much teaching as happened.
    if (pupil.isChild) {
      telemetry.count('child_taught');
      const parent = pupil.motherId === teacher.id || pupil.fatherId === teacher.id;
      if (parent) telemetry.count('child_taught_by_parent');
    }
    const text = teacher.name + ' taught ' + pupil.name + ' ' + TECH[tech].label.toLowerCase();
    teacher.chronicle.push({ tick, ageDays: teacher.age, text, kind: 'did' });
    pupil.chronicle.push({ tick, ageDays: pupil.age, text, kind: 'milestone' });
    return tech;
  }

  /**
   * A lesson nobody asked for: the ordinary closeness of growing up under
   * one roof, doing for knowledge what `SocialSystem.hearth` already does
   * for a relationship.
   *
   * M11 phase 9b. Called once a night, per roof, from `Simulation.
   * shareTheHearth` on exactly the sample it already takes of who slept
   * where — the cheapest and highest-yield half of the oral channel this
   * phase adds, because it needs nobody to walk anywhere, ask, or be asked.
   * Deliberately the wisest adult present rather than a random one: a
   * household's knowledge really does concentrate in whoever has lived
   * longest and learned most, and a child under that roof is far likelier
   * to be taught by them than by whichever adult happened to be drawn.
   * `teach` — unchanged, shared, and the reason two lessons never drift
   * apart — decides both whether there is anything to pass on and whether
   * it lands; this only decides whether the attempt happens tonight and who
   * makes it.
   */
  hearthLesson(
    sleepers: readonly Person[],
    rng: RNG,
    tick: number,
    onInsight: (person: Person, text: string, kind: 'idea' | 'gain' | 'setback') => void
  ): void {
    const adults = sleepers.filter(p => !p.isChild);
    const children = sleepers.filter(p => p.isChild);
    if (adults.length === 0 || children.length === 0) return;
    if (!rng.chance(HEARTH_LESSON_CHANCE)) return;

    const canLearn = (teacher: Person, pupil: Person) =>
      [...teacher.knownTech].some(t =>
        TECH[t as Tech] !== undefined &&
        !pupil.knownTech.has(t) &&
        prerequisitesMet(t as Tech, pupil.knownTech));

    // The single wisest adult present with anything a child under the same
    // roof could take in — not every adult in turn. One attempt a night,
    // same as the note describes it: the roof's deepest holder of knowledge
    // tries, once, and either it lands or tonight was not the night.
    let teacher: Person | null = null;
    let pupil: Person | null = null;
    for (const candidate of [...adults].sort((a, b) => b.knownTech.size - a.knownTech.size)) {
      const match = children.find(child => canLearn(candidate, child));
      if (match) { teacher = candidate; pupil = match; break; }
    }
    if (!teacher || !pupil) return;

    // A household is already the warmest relationship in the game — see
    // `Household.renown` and `kin-outrank-strangers` — so a flat, generous
    // regard stands in for `ctx.relationships.opinion` rather than a
    // parameter neither caller of this method has any business threading
    // through from `Simulation`. This is a lesson from growing up beside
    // somebody, not an afternoon deliberately spent on one.
    const taught = this.teach(teacher, pupil, 0.6, tick, rng);
    if (taught === null) return;
    telemetry.count('hearth_taught');
    onInsight(pupil, 'was shown ' + TECH[taught].label.toLowerCase() +
      ' at the hearth by ' + teacher.name, 'gain');
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
