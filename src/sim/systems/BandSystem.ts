/**
 * The band as something that acts, rather than a colour on a sprite.
 *
 * Three jobs, run once per in-game day:
 *
 *  1. **Choosing a chief.** Whoever the band collectively thinks most of, with
 *    age and headship counting for something. Nobody votes; an incumbent holds
 *    a term so ordinary relationship noise cannot change the office every day,
 *    then the position returns to whoever holds it in everyone's regard.
 *  2. **Deciding to build.** Until now only the player could place a site, so a
 *    band with fifteen people and one hut simply froze every winter and nobody
 *    ever did anything about it. A chief who can see their people are cold marks
 *    out another hut.
 *  3. **Exile.** A person whose deeds have turned their whole band against them
 *    is cast out. This is the mechanism that makes norms bite: theft in a strict
 *    band gets you driven into the wilderness, and theft in a tolerant one does
 *    not, without either outcome being written as a rule.
 */
import type { Person } from '../entities/Person.ts';
import { averageRenown, type Household } from '../entities/Household.ts';
import type { Band } from '../core/Simulation.ts';
import {
  BUILDINGS, isTrap, isStation, isField, isHeap, isHerd, isWell, isStructure,
  type Building, type BuildingDef,
} from '../entities/Building.ts';
import { SOW_SEED } from '../entities/Field.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { techPower, type Tech } from '../knowledge/Tech.ts';
import { JOB_IDS, type JobId } from '../entities/Job.ts';
import type { RelationshipGraph } from './../social/Relationships.ts';
import type { RNG } from '../core/RNG.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import { telemetry } from '../core/Telemetry.ts';
import { chiefHoneymoon, chiefTermDays } from '../social/Leadership.ts';
import { conspiracyAgainst, warParty } from '../social/Factions.ts';
import type { BandRelations } from '../social/BandRelations.ts';
import { t } from '../../i18n/i18n.ts';
import type { Sightings } from '../social/Fear.ts';

/**
 * How large a faction against somebody has to be before the band acts on it.
 *
 * M11 phase 5e replaced the *average* opinion this used to gate on with
 * `conspiracyAgainst`'s faction — the same finding `REBELLION_THRESHOLD`'s
 * comment records for the chief applies here too: a band's average opinion of
 * a member rarely goes anywhere near hostile, because kinship and household
 * bias hold it up, while a handful of people who genuinely detest someone and
 * trust each other is common and is what actually gets somebody cast out.
 */
const EXILE_QUORUM = 4;

/** How far a wandering outcast may be from a band's home and still be taken in. */
const ADOPTION_RADIUS = 30;

/** An outcast is refused if any member's opinion of them sits below this. */
const ADOPTION_THRESHOLD = -10;

/**
 * How far from a band's camp a foreign face counts as an intrusion, M11
 * phase 7b's territory engine.
 *
 * Wider than `ADOPTION_RADIUS`: welcoming a wandering outcast is a
 * doorstep-sized question, but a band should notice strangers camped
 * anywhere within sight of home, not only underfoot.
 */
export const TERRITORY_RADIUS = 40;

/**
 * How much one foreign person, seen once, at maximum pantry pressure, costs
 * a band's standing with whichever band that person belongs to.
 *
 * Deliberately smaller than `CROSS_BAND_MARRIAGE` and comparable to a single
 * `CROSS_BAND_DEED_SCALE`-scaled theft: an intrusion is read daily and
 * `BandRelations` decays slowly, so a strangers'-camp-next-door situation
 * that persists compounds into real hostility, while a single passer-by
 * barely registers — which is the property `AGENTS.md` asks any new spawn or
 * scoring pass to earn on its own measurement, not on a first guess.
 */
const TERRITORY_SCALE = 0.3;

/**
 * How badly two peoples must stand before a chief will organise a party
 * against the other, M11 phase 11c.
 *
 * `BandRelations` runs -100 to 100 and decays at 0.998 a day, so a figure
 * this far down is not one bad afternoon: it is a season of intrusions on a
 * pinched camp, or a run of cross-band thefts and beatings, that nothing has
 * since undone. That is the point. A raid is the most consequential thing one
 * band does to another in this simulation, and it should read as the end of a
 * long quarrel rather than as a mood.
 */
const RAID_HOSTILITY = -30;

/**
 * How many people it takes for a raid to be a raid — the chief included.
 *
 * The same brake `EXILE_QUORUM` is, applied to the same failure. `Brain.ts`
 * records what a band looks like without one: a mechanism that fires on a
 * single angry person turns the band into a mincer. Counted on who *could*
 * plausibly be called, not on who actually comes, which is the precedent
 * `considerExile` sets — whether each of them obeys is a separate roll and a
 * separate story.
 */
const RAID_QUORUM = 3;

/** The most a chief will take, so that calling a raid does not empty the camp. */
const RAID_PARTY_MAX = 4;

/**
 * Days between one band's raids.
 *
 * Counted from the day a raid was *considered* rather than the day one
 * happened, so a warlike chief with nobody to call on broods for a week like
 * everybody else instead of trying and failing every single morning.
 */
const RAID_INTERVAL = 8;

/**
 * How far a party will travel, in tiles.
 *
 * Wider than `TERRITORY_RADIUS`, since a raid by definition goes further than
 * the ground a band counts as its own, and set by the walk rather than by
 * taste: **about a day's march**. At the base walking speed of 0.32 tiles a
 * tick, the 240 ticks in a day carry somebody roughly 77 tiles, so this is
 * the furthest a party can be sent and still be said to have gone and come
 * back rather than emigrated.
 *
 * The number was checked against the worlds it has to work in before it was
 * chosen, not after. In `lean` a band's camp sits between 61 and 91 tiles
 * from the nearest thing its worst enemy owns, and in `century` between 30
 * and 40 — so a range set by the thirst budget instead, which came out
 * around 60, admitted a target in `century` and **not one in `lean`**: three
 * hundred deliberations, a hundred and twenty of them with a real enemy
 * chosen, and every single one dropped here. A gate nobody ever passes is
 * indistinguishable from a feature that was never written.
 *
 * Thirst is not what bounds this, which is why the first attempt was wrong.
 * A raider is under an order, and `Simulation.noteStop` sets aside any order
 * broken off for a need: somebody who runs dry two thirds of the way there
 * stops, drinks, and picks the raid back up inside `RESUME_WINDOW`. The walk
 * is the constraint, not the flask.
 */
const RAID_RANGE = 75;

/**
 * The storage a design must hold before a raid counts it as somebody's
 * granary rather than somebody's roof.
 *
 * The same figure `planBuildings` uses to tell a real store from the
 * stockpile, which is bare ground and costs nothing to place.
 */
const RAID_GRANARY = 100;

/**
 * How far past `RAID_HOSTILITY` a grudge has to run before a party goes to
 * burn rather than to rob.
 *
 * You rob the neighbours you merely dislike, and you burn the ones you hate.
 * This is the only thing that decides between the two verbs, and it is
 * deliberately the *raiders' own feeling* rather than anything about the
 * victim: a chief knows how their people feel about the band over the hill
 * without anybody having to tell them, where they emphatically do not know
 * what is in that band's storage pit.
 *
 * Two earlier rules were measured and thrown away, both for the same fault —
 * they were coins that always landed the same way. Gating plunder on the
 * raiders being hungry produced forty-seven deliberations and not one
 * plundering raid, because no scenario in the matrix ever has a band hungry
 * at midnight; gating it on the victim owning a granary produced eleven
 * raids and not one wrecking, because every band owns a granary. A branch
 * that cannot be reached is not a design, it is an unshipped intention.
 */
const RAID_FURY = -70;

/**
 * The most aggrieved member's opinion of the chief, below which they are
 * willing to act on it.
 *
 * Deliberately read off the *worst* opinion rather than the band's average,
 * and that is a finding rather than a starting choice: `chooseChief` elects
 * whoever the band regards most and re-elects daily, so a chief's average
 * regard measured across a two-year run never once went negative — a chief
 * who lost the band's favour was simply replaced by `chooseChief` before
 * resentment could accumulate against them collectively. One person hating a
 * generally well-liked chief is common by comparison; the same measurement
 * ranged from -22.8 to comfortably positive across that run. `EXILE_QUORUM`
 * still gates the check, but on whether the measurement means anything —
 * enough of the band has to know the chief at all — not on whether everyone
 * shares the grievance.
 */
const REBELLION_THRESHOLD = -8;

/** At least this many people must hold an opinion of the chief for it to count. */
const REBELLION_QUORUM = 3;

/**
 * How much one point of renown above a household's own band average is
 * worth in `standingScore`, M11 phase 6e — the "big man" route to the
 * chiefdom, on top of the "well-liked" one `regard` already measures.
 *
 * Deliberately modest against `regard`, which sums an opinion as wide as
 * -100..100 from every other adult in the band: 0.5 means a household 40
 * renown above average — roughly one deed nobody will forget, `Authority
 * .ts`'s own `RENOWN_SPAN` — buys as much as being liked twenty points more
 * by a single bandmate, enough to tip a close election, not enough to buy
 * one outright against a widely resented candidate.
 */
const RENOWN_CHIEF_WEIGHT = 0.5;

/**
 * How full a band's stores must be before another is worth digging.
 *
 * The old rule counted *pits*, not what was in them, so a band with three empty
 * storage pits planned a fourth. An empty pit is proof you do not need another.
 */
const STORE_PRESSURE = 0.6;

/**
 * Days a site can go with no work done and nothing delivered before the band
 * gives up on it.
 *
 * Without this, `underway >= MAX_SITES` deadlocks the planner behind a hut
 * nobody will ever haul timber to: the band is permanently "already building"
 * and never marks out the windbreak it actually needs.
 */
const STALE_SITE_DAYS = 6;

/** Completed structures a band will hold, per this many members, plus two. */
const MEMBERS_PER_STRUCTURE = 4;

/**
 * How many traps one band will set. M8.1, mechanism 3.
 *
 * Small, and not because traps are expensive. Each one is a walk somebody has to
 * take to empty it, `Brain` scores that walk against foraging on distance, and a
 * ring of eight snares round a camp is a band that spends its day collecting
 * instead of a band that eats better.
 */
const TRAPS_PER_BAND = 3;

/**
 * Plots one band will break. See the field branch in `planBuildings` for why
 * this is a small fixed number rather than one scaled by how many mouths there
 * are: sowing and reaping are two walks a season, and the work is what runs
 * out, not the ground.
 */
const FIELDS_PER_BAND = 2;

/**
 * Pens one band will raise. One, deliberately, unlike traps and fields: a pen
 * is a single herd that grows on its own, and a second pen is a second herd to
 * split a fixed grazing pressure between rather than a second helping of food
 * — the plan's table gives herding one building, not a line of them.
 */
const PENS_PER_BAND = 1;

/**
 * Wells one band will sink. One: it answers "is the shore close?" and a
 * second does not answer it any harder — `Brain.findWater` already picks
 * whichever of the well and the natural shore is nearer, so once a band has
 * one, a second only matters if the band's camp drifts far enough from the
 * first that it stops being the nearer choice, which this project leaves for
 * a band to notice on its own rather than planning for in advance.
 */
const WELLS_PER_BAND = 1;

/** Days between a band considering new construction. */
const PLANNING_INTERVAL = 3;

/** Sites a band will have underway at once. */
const MAX_SITES = 2;

/**
 * How many people one leader puts on a site in a day, and how many the band
 * manages between them.
 *
 * The chief's two is what `directWork` always did and is left alone, so that
 * the phase-4d measurement moves one thing. A head gets one, and the band
 * ceiling of four means a camp of four houses does not put its entire adult
 * population under order every morning: being led should read as direction,
 * which is this function's own standing note, and four of a dozen adults is
 * direction where twelve of twelve is possession.
 */
const CHIEF_DIRECTS = 2;
const HEAD_DIRECTS = 1;
const BAND_DIRECTS_PER_DAY = 4;

export interface BandContext {
  relationships: RelationshipGraph;
  rng: RNG;
  day: number;
  tick: number;
  buildings: Building[];
  /** Places a site; returns null if it will not fit. */
  place: (defId: string, x: number, y: number, bandId: number) => Building | null;
  /** Called when someone is cast out, so the world can resettle them. */
  onExile: (person: Person, band: Band, factionSize: number) => void;
  /** Called when a band takes in a wandering outcast. */
  onAdopt: (person: Person, band: Band) => void;
  /** For `considerAdoption`'s and `considerTerritory`'s proximity queries — never scan the population for it. */
  peopleHash: SpatialHash<Person>;
  /** For `considerTerritory`'s and `considerRaid`'s reading of how two bands currently stand. */
  bandRelations: BandRelations;
  /**
   * Whether two points are on the same landmass.
   *
   * `considerRaid`'s only reason to ask anything of the world: an order aimed
   * at a building never checks walkability — `Simulation.order`'s building
   * branch returns the moment it has a target — so a party sent across water
   * would walk to the shore and abandon with `cannot_reach`, once each, every
   * time. The scorer asks `World.sameRegion` before every long walk it plans
   * for the same reason.
   */
  sameRegion: (ax: number, ay: number, bx: number, by: number) => boolean;
  /** Removes an abandoned site from the world. */
  abandonSite: (building: Building) => void;
  /** Issues an order subject to a compliance roll. Returns whether it stuck. */
  command: (leader: Person, subordinate: Person, action: string,
    target: { buildingId?: number }) => boolean;
  /** Assigns a job, subject to the same roll `command` uses. */
  assignJob: (leader: Person, subordinate: Person, job: JobId | null) => boolean;
  /** Moves someone out of their band of their own accord, not by exile. */
  leaveBand: (person: Person) => void;
  /** A story beat worth a floater, gated on line of sight like any other. */
  onInsight: (person: Person, text: string, kind: 'idea' | 'gain' | 'setback') => void;
  /** Households by id, so `directWork` can tell who heads a house. */
  householdsById: Map<number, Household>;
  /**
   * Outsiders somebody from each band actually saw on its ground, M11 phase
   * 14a. The territory engine reads this rather than the people hash — a
   * band resents the strangers it saw, not the ones who were there.
   */
  sightings: Sightings;
}

export class BandSystem {
  /** Chief per band, by band id. Read by the authority system. */
  readonly chiefByBand = new Map<number, number>();

  /**
   * Last day each site visibly moved, and the reading that said so.
   *
   * Kept here rather than on `Building` because it is the band's judgement
   * about its own work, not a property of the structure — and the simulation
   * has no other reason to remember it.
   */
  private readonly siteProgress = new Map<number, { mark: number; day: number }>();

  /**
   * The last day each band's chief seriously weighed a raid, by band id.
   *
   * Here rather than on `Band` for the reason `siteProgress` is: it is the
   * band's own deliberation about itself, not a fact about the world, and
   * nothing outside this file has any business reading it.
   */
  private readonly raidConsidered = new Map<number, number>();

  /** Band names by id, refreshed at the top of `daily`, for chronicle lines. */
  private readonly bandNames = new Map<number, string>();

  daily(bands: Band[], people: Person[], ctx: BandContext): void {
    const byBand = new Map<number, Person[]>();
    for (const person of people) {
      if (!person.alive) continue;
      const list = byBand.get(person.bandId);
      if (list) list.push(person);
      else byBand.set(person.bandId, [person]);
    }

    this.bandNames.clear();
    for (const band of bands) this.bandNames.set(band.id, band.name);

    const outcastBand = bands.find(b => b.outcast);
    const outcasts = outcastBand ? byBand.get(outcastBand.id) ?? [] : [];

    for (const band of bands) {
      const members = byBand.get(band.id) ?? [];
      if (members.length === 0) {
        this.chiefByBand.delete(band.id);
        band.chiefId = null;
        band.chiefSince = null;
        continue;
      }

      this.chooseChief(band, members, ctx);
      this.assignJobs(band, members, ctx);
      this.considerExile(band, members, ctx);
      this.considerRebellion(band, members, ctx);
      if (!band.outcast && outcasts.length > 0) this.considerAdoption(band, members, outcasts, ctx);
      if (!band.outcast) this.considerTerritory(band, ctx, outcastBand?.id);
      if (!band.outcast) this.considerRaid(band, members, ctx, outcastBand?.id);
      if (ctx.day % PLANNING_INTERVAL === 0) this.planBuildings(band, members, ctx);
      this.directWork(band, members, ctx);
    }
  }

  // -------------------------------------------------------------------------
  // Chiefs
  // -------------------------------------------------------------------------

  /**
   * At an open election, the chief is whoever the band holds in highest regard.
   *
   * Summed rather than averaged, so being widely known matters as much as being
   * well liked — a saint nobody has met does not lead anyone. Children are not
   * eligible; age and headship carry weight, because standing accrues.
   */
  private chooseChief(band: Band, members: Person[], ctx: BandContext): void {
    const incumbentId = this.chiefByBand.get(band.id);
    const incumbent = incumbentId === undefined
      ? undefined
      : members.find(member => member.id === incumbentId);

    // Regard moves every day, but leadership should not move with every small
    // fluctuation in it. Death and departure bypass the term because there is
    // nobody left to hold office; a successful challenge does so below.
    //
    // The term is the incumbent's own, not the band's: M9.5 phase 4d makes a
    // chief who understands `chiefdom` hold the office half as long again, and
    // a band that replaces them with somebody who does not goes back to the
    // short term. See `chiefTermDays`.
    if (incumbent && band.chiefSince !== null &&
        ctx.day - band.chiefSince < chiefTermDays(incumbent)) return;

    let best: Person | null = null;
    let bestScore = -Infinity;

    for (const candidate of members) {
      if (candidate.isChild) continue;
      const score = this.standingScore(candidate, band, members, ctx);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best) return;
    const previous = incumbentId;
    if (previous === best.id) {
      // Winning a new term starts its clock again. Without this, an incumbent
      // who won once at term end would be reconsidered every day thereafter —
      // the same noisy daily election this pass exists to remove.
      band.chiefSince = ctx.day;
      return;
    }

    this.chiefByBand.set(band.id, best.id);
    band.chiefId = best.id;
    band.chiefSince = ctx.day;
    telemetry.count('chief_chosen');
    best.chronicle.push({
      tick: ctx.tick,
      ageDays: best.age,
      text: t('became chief of the {band}', { band: band.name }),
      kind: 'milestone',
    });
    ctx.onInsight(best, t('was welcomed as chief of the {band}', { band: band.name }), 'gain');
  }

  /**
   * How much the band, collectively, regards `candidate`.
   *
   * Shared by `chooseChief`, which asks it of everyone, and
   * `considerRebellion`'s challenge outcome, which asks it of exactly two
   * people — a candidate for chief and the incumbent are the same
   * measurement, and writing the sum out twice is how the two drift apart.
   */
  private standingScore(
    candidate: Person, band: Band, members: Person[], ctx: BandContext
  ): number {
    let regard = 0;
    for (const other of members) {
      if (other.id === candidate.id) continue;
      regard += ctx.relationships.opinion(other.id, candidate.id);
    }
    // Forty points is enough to absorb a few days of noisy encounters, not
    // enough to save an incumbent whom the band plainly prefers to replace.
    const welcome = candidate.id === band.chiefId
      ? chiefHoneymoon(band, ctx.day) * 40
      : 0;

    // M11 phase 6e: the "big man" route to leadership, on top of the
    // "well-liked" one `regard` already measures. Only the household's edge
    // *above* its own band's average counts, the same shape `Authority.ts`'s
    // `inequalityTerm` uses for standing over an order, and for the same
    // reason — an egalitarian band, where every household is regarded about
    // the same, gets nothing from this term for anybody.
    const household = candidate.householdId === null
      ? null
      : ctx.householdsById.get(candidate.householdId) ?? null;
    const renownEdge = household
      ? Math.max(0, household.renown - averageRenown(band.id, ctx.householdsById)) * RENOWN_CHIEF_WEIGHT
      : 0;

    return regard + candidate.years * 1.5 + candidate.skills.persuade * 0.8 + welcome + renownEdge;
  }

  // -------------------------------------------------------------------------
  // Work
  // -------------------------------------------------------------------------

  /**
   * The chief settles unemployed adults into a job.
   *
   * One a day, and only ever the job the band currently has fewest of — a
   * deterministic rule rather than a rolled one, so no draw is spent choosing
   * who does what and the fork order in `Simulation`'s constructor is
   * untouched. A job is a lean on the utility scorer, not a guarantee of
   * competence, so there is no reason to match a candidate's existing skill:
   * that would only concentrate work further, which `Brain`'s own bias
   * already does once someone has the job.
   *
   * **M9.5 phase 4c:** a chief who has never had the idea of setting one
   * person to one task hands nothing out. `Simulation.assignJob` refuses this
   * for itself and says why, so the test here is not what enforces the rule —
   * it is what stops a band from asking the same impossible question once a
   * day for years, overwriting `lastRefusal` with an NPC chief's disappointment
   * while the player is reading their own.
   */
  private assignJobs(band: Band, members: Person[], ctx: BandContext): void {
    const chiefId = this.chiefByBand.get(band.id);
    if (chiefId === undefined) return;
    const chief = members.find(m => m.id === chiefId);
    if (!chief) return;
    if (techPower(chief, 'division_of_labour') <= 0) return;

    const unassigned = members.filter(m => !m.isChild && m.job === null && m.id !== chief.id);
    if (unassigned.length === 0) return;

    // Built from `JOB_IDS` rather than written out. The hand-written version
    // had to be edited in step with that list, and M8.2's farmer is exactly the
    // edit it would have been forgotten on: a fifth job counted as `undefined`
    // would have compared `undefined < fewest` as false for ever and the new
    // job would never once have been handed out.
    const counts = Object.fromEntries(JOB_IDS.map(id => [id, 0])) as Record<JobId, number>;
    for (const member of members) if (member.job) counts[member.job]++;

    // A job nobody in this band can act on is a third of a band standing idle,
    // and the farmer is the first job in the table that can be in that
    // position: `sow` and `reap` both need a finished plot, and a band with no
    // ground broken has nothing for a farmer to do. Filtered here rather than
    // in `Brain`, because the scorer's answer to "there is no field" is
    // correctly *nothing*, and a person whose job's verbs all score zero is
    // simply a person who has been damped on every other kind of work.
    const offered = JOB_IDS.filter(id =>
      id !== 'farmer' ||
      ctx.buildings.some(b => b.crop !== null && b.complete && b.ownerBandId === band.id));

    let wanted: JobId = offered[0] ?? JOB_IDS[0]!;
    let fewest = Infinity;
    for (const id of offered) {
      if (counts[id] < fewest) {
        fewest = counts[id];
        wanted = id;
      }
    }

    ctx.assignJob(chief, unassigned[0]!, wanted);
  }

  // -------------------------------------------------------------------------
  // Rebellion
  // -------------------------------------------------------------------------

  /**
   * Whether anyone in the band resents the chief enough to act on it.
   *
   * Reuses `considerExile`'s shape — a quorum of people with an opinion at
   * all, measured against a threshold — but not its statistic. Exile asks for
   * the *average* opinion of a suspect, and that question has an answer here
   * too, but the answer is always comfortably positive: see
   * `REBELLION_THRESHOLD`'s comment for why a chief's average regard is the
   * wrong thing to gate on. This asks instead whether the single most
   * aggrieved member hates the chief enough, and even then crossing the
   * threshold does not itself cause anything — `defiance` below is what makes
   * this rare rather than a formality.
   */
  private considerRebellion(band: Band, members: Person[], ctx: BandContext): void {
    if (members.length < REBELLION_QUORUM + 1) return;
    const chiefId = this.chiefByBand.get(band.id);
    if (chiefId === undefined) return;
    const chief = members.find(m => m.id === chiefId);
    if (!chief) return;

    let voices = 0;
    let worst: Person | null = null;
    let worstOpinion = Infinity;
    for (const member of members) {
      if (member.id === chiefId || member.isChild) continue;
      const opinion = ctx.relationships.peek(member.id, chiefId)
        ? ctx.relationships.opinion(member.id, chiefId)
        : null;
      if (opinion === null) continue;
      voices++;
      if (opinion < worstOpinion) {
        worstOpinion = opinion;
        worst = member;
      }
    }
    if (voices < REBELLION_QUORUM || !worst) return;
    if (worstOpinion > REBELLION_THRESHOLD) return;

    const grievance = Math.max(0, -worstOpinion) / 100;
    const defiance = grievance * (1 - worst.traits.loyalty);
    if (ctx.rng.next() > defiance) return;

    // Three rising outcomes. Public refusal is the common, cheap one; leaving
    // is rarer and costs the band a member; challenging for the chiefdom
    // outright is the rarest and the only one that can actually change who
    // leads.
    const roll = ctx.rng.next();
    if (roll < 0.5) this.refuseChief(worst, chief, ctx);
    else if (roll < 0.85) this.leaveOverChief(worst, band, chief, ctx);
    else this.challengeChief(worst, chief, band, members, ctx);
  }

  /** Public defiance: no mechanical change beyond how it sours the record. */
  private refuseChief(rebel: Person, chief: Person, ctx: BandContext): void {
    telemetry.count('rebellion_refused');
    rebel.chronicle.push({
      tick: ctx.tick,
      ageDays: rebel.age,
      text: t('openly refused to answer to {name} any longer', { name: chief.name }),
      kind: 'did',
    });
    // Louder than an ordinary refused order: this is a stand taken in front of
    // the whole band, not one request declined in private.
    ctx.relationships.addDeed(rebel.id, chief.id, -6, ctx.tick);
    ctx.onInsight(rebel, t('defied {name} openly', { name: chief.name }), 'setback');
  }

  /** Rather than go on answering to a chief they cannot stand, they leave. */
  private leaveOverChief(rebel: Person, band: Band, chief: Person, ctx: BandContext): void {
    telemetry.count('rebellion_left');
    rebel.chronicle.push({
      tick: ctx.tick,
      ageDays: rebel.age,
      text: t('left the {band} rather than answer to {name}', { band: band.name, name: chief.name }),
      kind: 'did',
    });
    ctx.leaveBand(rebel);
    ctx.onInsight(rebel, t('left rather than answer to {name}', { name: chief.name }), 'setback');
  }

  /**
   * A public bid for the chiefdom, decided by the same regard `chooseChief`
   * would use if it ran again today.
   *
   * Not a fight: a challenge that only ever came down to `fight` skill would
   * make persuasion and years of standing worthless the moment somebody
   * younger and stronger showed up, and the chief who has held a band's
   * loyalty for a decade would lose it to whoever can hit hardest.
   */
  private challengeChief(
    rebel: Person, chief: Person, band: Band, members: Person[], ctx: BandContext
  ): void {
    const challengerScore = this.standingScore(rebel, band, members, ctx);
    const chiefScore = this.standingScore(chief, band, members, ctx);

    if (challengerScore > chiefScore) {
      this.chiefByBand.set(band.id, rebel.id);
      band.chiefId = rebel.id;
      band.chiefSince = ctx.day;
      telemetry.count('chief_chosen');
      telemetry.count('rebellion_challenge_won');
      rebel.chronicle.push({
        tick: ctx.tick, ageDays: rebel.age,
        text: t('challenged {name} for the chiefdom and won', { name: chief.name }),
        kind: 'milestone',
      });
      chief.chronicle.push({
        tick: ctx.tick, ageDays: chief.age,
        text: t('was deposed by {name}', { name: rebel.name }),
        kind: 'suffered',
      });
      ctx.onInsight(rebel, t("became chief in {name}'s place", { name: chief.name }), 'gain');
    } else {
      telemetry.count('rebellion_challenge_lost');
      rebel.chronicle.push({
        tick: ctx.tick, ageDays: rebel.age,
        text: t('challenged {name} for the chiefdom and lost', { name: chief.name }),
        kind: 'did',
      });
      // Losing a public bid for leadership costs standing beyond an ordinary
      // refusal: everyone just watched it happen.
      ctx.relationships.addDeed(rebel.id, chief.id, -8, ctx.tick);
      ctx.onInsight(rebel, t('lost a bid to replace {name}', { name: chief.name }), 'setback');
    }
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  /**
   * How full a band's granaries are, 0-1, from a list already filtered to
   * one band's completed stores.
   *
   * Shared between `planBuildings`, which asks whether another is worth
   * digging, and `considerTerritory`'s reading of how much an intrusion
   * should sting — the same formula rather than two, so the two questions
   * cannot quietly answer differently the day either one is retuned.
   */
  private pantryPressureOf(stores: Building[]): number {
    const capacity = stores.reduce((sum, b) => sum + b.def.storage, 0);
    if (capacity === 0) return 0;
    const used = stores.reduce((sum, b) => sum + b.store.total, 0);
    return used / capacity;
  }

  /**
   * Marks out what the band is short of.
   *
   * Shelter first — cold is what actually kills people here — then somewhere to
   * put a surplus. Deliberately conservative: one site at a time, and only when
   * nothing is already half-built, so a band does not scatter a dozen abandoned
   * foundations across the valley.
   */
  private planBuildings(band: Band, members: Person[], ctx: BandContext): void {
    const theirs = ctx.buildings.filter(b => b.ownerBandId === band.id);
    this.dropStaleSites(theirs, ctx);

    const live = ctx.buildings.filter(b => b.ownerBandId === band.id);
    const underway = live.filter(b => !b.complete).length;
    if (underway >= MAX_SITES) return;

    // A hard ceiling, so that no combination of the conditions below can
    // produce a field of huts. Whatever else is true, a band of twelve does not
    // need eleven structures.
    //
    // Traps do not count against it, and must not. The ceiling is about roofs
    // and pits — things a band needs a certain number of and no more — whereas a
    // snare line is a food supply, and counting five of them would quietly stop
    // a band ever raising another hut. It is also how `bands-dont-overbuild`
    // would have started failing for a band that was doing exactly the right
    // thing.
    const built = live.filter(b =>
      b.complete && !isTrap(b.def) && !isStation(b.def) && !isField(b.def) &&
      !isHeap(b.def) && !isHerd(b.def) && !isWell(b.def)).length;
    if (built >= Math.ceil(members.length / MEMBERS_PER_STRUCTURE) + 2) return;

    // Roof measured as floor area, not as a count of roofs. A 3x3 hut and a 2x2
    // windbreak are not the same amount of shelter, and counting them as one
    // each is how a band with two windbreaks decided it had housed ten people.
    // `!b.ruined`, M11 phase 11b: a sabotaged hut's footprint is still there,
    // but `NeedsSystem.shelterAt` gives it no credit, and this count must not
    // disagree — a band standing in a burned-out camp that still reads
    // "enough roof" on the strength of ash would never plan a repair or a
    // replacement, which is the one thing a raid is supposed to cost it.
    const roofArea = live
      .filter(b => b.def.shelter > 0.3 && !b.ruined)
      .reduce((sum, b) => sum + b.def.width * b.def.height, 0);

    const stores = live.filter(b => b.complete && b.def.storage >= 100);
    const plannedStores = live.filter(b => !b.complete && b.def.storage >= 100).length;

    // What this band could actually raise.
    //
    // Asked of the band's own members rather than of the world's `knownTech`,
    // because knowledge is held by people: a granary is something *this* band
    // can build when *this* band has somebody who can fire clay, and it stops
    // being one when that person dies. The whole tech pillar would be a lie if
    // a band could build on the strength of a potter three valleys away.
    //
    // Before this, the three ids below were written out by hand, and the effect
    // was that **no band ever planned a granary or a longhouse in the game's
    // history**. Both sat in the build menu, correctly gated behind a real
    // technology, reachable by the player and by nobody else — which made
    // `pottery` a technology whose only declared effect never happened.
    // The cast is safe because `tech.test.ts` fails the build if any
    // `requiresTech` names something that is not a member of `TECHS` — which is
    // the check that was written after the longhouse spent its whole existence
    // gated behind a technology that did not exist.
    const buildable = Object.values(BUILDINGS).filter(def =>
      def.requiresTech === null ||
      members.some(m => techPower(m, def.requiresTech as Tech) > 0));

    let wanted: string | null = null;
    if (roofArea < members.length) {
      // A mud hut is warmer and holds goods, but it wants felled timber and the
      // better part of a season. A band that is *badly* short of roof — which
      // is what a population growing faster than it builds looks like — throws
      // up the cheapest roof there is instead: a quarter of the work, sticks
      // and thatch only, and the difference between a hard winter and twenty
      // funerals.
      const shelters = buildable.filter(def => def.shelter > 0.3);
      if (roofArea * 2 < members.length) {
        wanted = this.cheapest(shelters)?.id ?? null;
      } else {
        // The best roof they know how to raise — but nothing grander than a mud
        // hut until they have finished one, because a band whose first ever
        // structure is an eighteen-hundred-tick longhouse spends its first
        // winter under an unfinished frame.
        const proven = live.some(b => b.complete && b.def.shelter > 0.3);
        const affordable = shelters.filter(def =>
          proven || def.workTicks <= BUILDINGS.mud_hut!.workTicks);
        wanted = this.bestBy(affordable, def => def.shelter)?.id ?? null;
      }
    } else if (plannedStores === 0) {
      // `storage >= 100` skips the stockpile, which is bare ground and costs
      // nothing to place; a band that "built" one would never plan a real store.
      const granaries = buildable.filter(def => def.storage >= 100 && def.workTicks > 0);
      if (stores.length === 0) {
        // The first store is the cheap one, always. Being told to keep a season
        // of food in a pit you have not dug yet is worse than the pit.
        wanted = this.cheapest(granaries)?.id ?? null;
      } else if (this.pantryPressureOf(stores) > STORE_PRESSURE) {
        // Already storing, and running out of room: now the big one is worth
        // the season it costs.
        //
        // Ranked by what a store actually delivers rather than by what goes
        // into it, which since M8.1 are different numbers. A drying rack and a
        // storage pit hold the same hundred and twenty and the rack gives back
        // three times as much of it, and on a tie between equal capacities the
        // pit won simply by being declared first — so a band that knew how to
        // preserve dug five more pits across a run and never built a rack.
        wanted = this.bestBy(granaries, def => def.storage * (def.preserves ?? 1))?.id ?? null;
      }
    }

    // --- Traps, the third thing a band can want -----------------------------
    //
    // `planBuildings` wanted exactly two things — a roof and a pit — and both
    // `architecture.md` and `bugs.md` name the consequence: a design that is
    // neither is one no band will ever plan, however well it is gated. That is
    // how the granary and the longhouse spent their existence player-only, and a
    // trap would have been the third case.
    //
    // Third rather than first because shelter and a store are survival and a
    // trap is surplus, and a band that snares hares instead of raising a roof
    // dies in the same winter it ate well in. `TRAPS_PER_BAND` is a small
    // number: traps are cheap, and the ceiling above no longer restrains them.
    //
    // And a trap is planned only when there is nothing else to build at all —
    // not merely when nothing else is *wanted*. A band has two site slots, and
    // the first version of this branch spent them on snares while the storage
    // pit that had already been decided on was still a hole in the ground:
    // storing collapsed from 4,549 ticks to 394 across a run, and three more
    // people starved than in the same world without traps. Surplus waits behind
    // survival, and "survival" includes the pit that is half dug.
    // --- Stations, the fourth thing a band can want -------------------------
    //
    // Ahead of traps and behind shelter and a store, for the same reason the
    // trap branch gives: survival first, and a quern is not survival. Ahead of
    // traps because a station multiplies food a band already has where a trap
    // adds more of it, and the multiplier is worth having before the third
    // snare line — and because one quern serves a band for ever, so it competes
    // for a site slot exactly once.
    //
    // The band must actually have somebody who could make something at it. A
    // quern raised by a band that knows `grinding` but has never held a hazelnut
    // is still a quern, but a station nobody has a recipe for would be the
    // inert-content rule failing in the one table it is hardest to see from.
    if (!wanted && underway === 0 && stores.length > 0) {
      const stations = live.filter(b => isStation(b.def));
      const missing = buildable.filter(def => isStation(def) &&
        !stations.some(existing => existing.def.id === def.id) &&
        Object.values(RECIPES).some(recipe => recipe.station === def.id &&
          members.some(m => techPower(m, recipe.tech) > 0)));
      // Cheapest first: a band's first workshop should be the one it can finish.
      wanted = this.cheapest(missing)?.id ?? null;
    }

    // --- A heap, which is the sixth and only exists for the fifth -----------
    //
    // Ahead of a second field and behind the first, because a band with one
    // plot and a heap keeps that plot for ever while a band with two plots and
    // no heap wears out both. Planned only where there is ground to spread it
    // on: a compost heap in a band that does not farm is the clearest possible
    // case of declared content doing nothing, and it would sit in the build
    // queue ahead of something that mattered.
    if (!wanted && underway === 0 && stores.length > 0) {
      const plots = live.filter(b => isField(b.def));
      const heaps = live.filter(b => isHeap(b.def));
      if (plots.length > 0 && heaps.length === 0) {
        wanted = buildable.find(def => isHeap(def))?.id ?? null;
      }
    }

    // --- Fields, the fifth thing a band can want ----------------------------
    //
    // Ahead of traps and behind everything else, on the same argument the trap
    // branch makes and one more of its own. A plot pays nothing for most of a
    // season and then pays a great deal, so it is the most speculative thing in
    // this list — a band that breaks ground instead of digging a pit eats
    // nothing in the meantime — and it belongs behind survival for that reason
    // alone. Ahead of traps because a harvest is several times a snare line and
    // because grain is the only food in the game that does not spoil, which is
    // what a winter is actually about.
    //
    // Two plots at most. A field is worked twice a season and left alone in
    // between, so a third is a third walk for a band that is already carrying
    // the first two through a winter — and `FIELDS_PER_BAND` is deliberately
    // the same shape as `TRAPS_PER_BAND` rather than scaled by membership,
    // because it is the *work* that is the scarce thing and not the ground.
    if (!wanted && underway === 0 && stores.length > 0) {
      const fields = live.filter(b => isField(b.def));
      if (fields.length < FIELDS_PER_BAND) {
        // Somebody has to be holding seed, or this is a band breaking ground it
        // has nothing to put in. Asked of the band rather than of the world for
        // the reason `buildable` gives: a granary is what *this* band can build.
        const hasSeed = members.some(m => m.inventory.count('grain') >= SOW_SEED);
        if (hasSeed) {
          wanted = buildable.find(def => isField(def) &&
            !fields.some(existing => existing.def.id === def.id && !existing.complete))?.id ?? null;
        }
      }
    }

    if (!wanted && underway === 0 && stores.length > 0) {
      const traps = live.filter(b => isTrap(b.def));
      if (traps.length < TRAPS_PER_BAND) {
        const settable = buildable.filter(def => isTrap(def) &&
          !traps.some(existing => existing.def.id === def.id && !existing.complete));
        // The best catch they know how to set, which is a stable ranking with no
        // draw in it — the planner runs inside the daily pass and a tie broken
        // by an `RNG` here would shift every draw in the world.
        wanted = this.bestBy(settable, def => def.yields?.perDay ?? 0)?.id ?? null;
      }
    }

    // --- A pen, the seventh thing a band can want ---------------------------
    //
    // Behind traps, on the same argument the trap branch already makes: a pen
    // is surplus, not survival. One at most (`PENS_PER_BAND`), because unlike
    // a trap a pen is a single herd that grows on its own — a second pen
    // splits one grazing pressure into two rather than adding a second supply.
    if (!wanted && underway === 0 && stores.length > 0) {
      const pens = live.filter(b => isHerd(b.def));
      if (pens.length < PENS_PER_BAND) {
        wanted = buildable.find(def => isHerd(def) &&
          !pens.some(existing => existing.def.id === def.id && !existing.complete))?.id ?? null;
      }
    }

    // --- A well, the eighth and last thing a band can want ------------------
    //
    // Last, because it is the least urgent of all of them: `spawnPeople`
    // already sites every band with water in reach, so a well most often
    // shortens a walk a band could already make rather than opening one it
    // could not. Still worth having — `Brain.findWater` picks whichever of a
    // well and the shore is nearer, so a camp that has grown away from the
    // water it was founded on gets a real answer instead of a longer one.
    if (!wanted && underway === 0 && stores.length > 0) {
      const wells = live.filter(b => isWell(b.def));
      if (wells.length < WELLS_PER_BAND) {
        wanted = buildable.find(def => isWell(def) &&
          !wells.some(existing => existing.def.id === def.id && !existing.complete))?.id ?? null;
      }
    }
    if (!wanted) return;

    // A design that has to touch the shore needs a wider search and more tries:
    // `spawnPeople` sites every band with water in reach, but "in reach" is not
    // "eight tiles from the fire", and thirty draws inside a square that mostly
    // is not coastline is how a fish trap would have looked unbuildable to every
    // band in the world while being perfectly placeable by the player.
    //
    // The search widens in rings rather than scattering across the whole square,
    // and for a trap that is the difference between a mechanism and a decoration.
    // Nothing walks to a trap on its own: `Brain` scores collecting from one
    // against foraging, and proximity dominates that scorer, so a fish trap
    // sixteen tiles down the coast fills up and is never emptied again. Measured
    // across ten seeds, scattered siting left traps standing full for fifty
    // trap-days a run with people going hungry beside them, which is the
    // "starving next to a full pit" failure this project has already shipped
    // once.
    // A design that has to stand somewhere particular needs a wider search: the
    // shore for a fish trap, and open ground with something left in it for a
    // plot. Both widen in rings rather than scattering, and for a field that is
    // the difference between a mechanism and a decoration for the same reason
    // the paragraph above gives about traps — nothing walks to a field on its
    // own, `Brain` scores reaping against foraging, and proximity dominates
    // that scorer. A plot eight tiles from the fire gets reaped; a plot twenty
    // tiles away ripens, stands its week and is lost.
    const placement = BUILDINGS[wanted]?.placement;
    const tries = placement ? 80 : 30;
    for (let attempt = 0; attempt < tries; attempt++) {
      const reach = placement ? 5 + Math.floor(attempt / 16) * 4 : 8;
      const x = Math.round(band.homeX + ctx.rng.range(-reach, reach));
      const y = Math.round(band.homeY + ctx.rng.range(-reach, reach));
      const placed = ctx.place(wanted, x, y, band.id);
      if (placed) {
        telemetry.count('band_planned_' + wanted);
        return;
      }
    }
    // Worth counting rather than passing over in silence: a band that wants a
    // trap it can never site is the only way this branch fails, and the counter
    // is the difference between finding that out and guessing at it.
    telemetry.count('band_could_not_site_' + wanted);
  }

  /** The least work of a set of designs. Ties go to the first, which is stable. */
  private cheapest(designs: BuildingDef[]): BuildingDef | null {
    return this.bestBy(designs, def => -def.workTicks);
  }

  /**
   * The highest-ranked design, or null for an empty set.
   *
   * Deliberately free of any random draw: the planner runs inside the daily
   * pass and a tie broken by an RNG here would shift every subsequent draw in
   * the world, which is the seed contract `architecture.md` is built on.
   */
  private bestBy(
    designs: BuildingDef[],
    rank: (def: BuildingDef) => number
  ): BuildingDef | null {
    let best: BuildingDef | null = null;
    let bestRank = -Infinity;
    for (const def of designs) {
      const value = rank(def);
      if (value > bestRank) {
        bestRank = value;
        best = def;
      }
    }
    return best;
  }

  /**
   * Forgets sites nobody is working on.
   *
   * A site counts as moving if work has gone in or materials have arrived. One
   * that has done neither for `STALE_SITE_DAYS` is a foundation in a field, and
   * holding a build slot open for it stops the band from planning anything
   * else.
   */
  private dropStaleSites(theirs: Building[], ctx: BandContext): void {
    for (const site of theirs) {
      if (site.complete) {
        this.siteProgress.delete(site.id);
        continue;
      }
      const mark = site.progress + site.delivered.total;
      const seen = this.siteProgress.get(site.id);
      if (!seen || seen.mark !== mark) {
        this.siteProgress.set(site.id, { mark, day: ctx.day });
        continue;
      }
      if (ctx.day - seen.day < STALE_SITE_DAYS) continue;

      this.siteProgress.delete(site.id);
      telemetry.count('site_abandoned');
      ctx.abandonSite(site);
    }
  }

  /**
   * The chief puts people on the unfinished work — and, once the band has a
   * shape, so do the heads of its houses.
   *
   * This is where authority stops being a number in a panel. A chief who is
   * liked gets a hut built; one who is merely tolerated is refused to their
   * face and has to do it themselves. Only a couple of people a day each, and
   * only ones with nothing pressing, so being led feels like direction rather
   * than possession.
   *
   * **M9.5 phase 4d: the middle rank has to have somewhere to happen.** The
   * rank term in `standingOver` would otherwise be reachable only by the
   * player: the chief was the one and only order-giver anywhere in the
   * simulation, and a chief is covered by `isChief`, never by rank. A term in
   * an authority table that no NPC can ever exercise is declared-but-inert
   * content wearing a different hat. So a head of a house who understands
   * `chiefdom` directs work too — fewer people than the chief, and always
   * after the chief has had their pick, because the shape is a pyramid and not
   * a committee.
   */
  private directWork(band: Band, members: Person[], ctx: BandContext): void {
    const chiefId = this.chiefByBand.get(band.id);
    if (chiefId === undefined) return;
    const chief = members.find(m => m.id === chiefId);
    if (!chief) return;

    const sites = ctx.buildings.filter(b => b.ownerBandId === band.id && !b.complete);
    if (sites.length === 0) return;

    let directed = this.directTo(chief, sites[0]!, members, ctx, CHIEF_DIRECTS);

    // Heads take the *other* site where there is one, and only fall back to
    // the chief's when there is not. Measured, not guessed: sending everybody
    // to one site put `walkers-do-not-grind` on `labour` at 10.0 stuck ticks
    // per thousand against a threshold of 5 — six people converging on one
    // half-built hut jostle each other at the door, which reads on screen as
    // being stuck and is precisely what that check was written to catch.
    // `MAX_SITES` is 2, so a band with work to spare has somewhere else to
    // send them, and a head running their own project is truer to the rank
    // than a head fetching for the chief's.
    let next = sites.length > 1 ? 1 : 0;
    for (const member of members) {
      if (directed >= BAND_DIRECTS_PER_DAY) break;
      if (member.id === chief.id || member.isChild) continue;
      if (techPower(member, 'chiefdom') <= 0) continue;
      const household = member.householdId === null
        ? undefined
        : ctx.householdsById.get(member.householdId);
      if (!household || household.headId !== member.id || household.bandId !== band.id) continue;
      directed += this.directTo(member, sites[next]!, members, ctx, HEAD_DIRECTS);
      next = (next + 1) % sites.length;
    }
  }

  /**
   * One person putting up to `limit` idle bandmates on a site. Returns how
   * many orders stuck.
   *
   * Extracted from `directWork` when phase 4d gave it a second caller, rather
   * than copied: the four conditions below are the ones that keep an order
   * from being a death sentence, and two copies of them would have drifted the
   * first time one was adjusted.
   */
  private directTo(
    leader: Person, site: Building, members: Person[], ctx: BandContext, limit: number
  ): number {
    let directed = 0;
    for (const member of members) {
      if (directed >= limit) break;
      if (!this.fitForOrders(leader, member)) continue;

      const action = site.materialsReady ? 'build' : 'haul';
      if (ctx.command(leader, member, action, { buildingId: site.id })) directed++;
    }
    return directed;
  }

  /**
   * Whether somebody is in a state to be given an order at all, before any
   * question of whether they would obey it.
   *
   * These are the conditions that keep an order from being a death sentence,
   * and they were `directTo`'s until `considerRaid` needed exactly the same
   * four. Extracted rather than copied for the reason `AGENTS.md` gives:
   * needing to be within earshot, not already under orders, not a child and
   * not already in trouble are one idea, and two copies of it would drift the
   * first time one was adjusted — which, for a raid, would mean a chief
   * sending a thirsty man sixty tiles into a rival camp because somebody
   * retuned the building numbers and not these.
   */
  private fitForOrders(leader: Person, member: Person): boolean {
    if (member.id === leader.id || member.isChild) return false;
    if (member.order !== null) return false;
    if (!this.fitToTravel(member)) return false;
    return leader.distanceTo(member) <= 24;
  }

  /**
   * Nobody is sent anywhere while they are hungry, thirsty or cold; an order
   * that would kill the person obeying it is not authority, it is a bug.
   *
   * Split out of `fitForOrders` because a chief sending themselves is the one
   * caller that has to skip every *other* condition in it — they are their own
   * leader, they are standing where they are standing — and must not skip this
   * one. A chief who walks sixty tiles into a rival camp on an empty stomach
   * is the same bug with a hat on.
   */
  private fitToTravel(person: Person): boolean {
    return person.needs.hunger <= 45 && person.needs.thirst <= 40 && person.needs.cold <= 45;
  }

  // -------------------------------------------------------------------------
  // Exile
  // -------------------------------------------------------------------------

  /**
   * Casts out anyone a faction of the band has turned against.
   *
   * **M11 phase 5e** replaced an average-opinion threshold with
   * `conspiracyAgainst`, because the average never got there: kinship and
   * household bias hold a band's collective regard for any one member
   * comfortably above hostile even when a few people loathe them, exactly the
   * finding `REBELLION_THRESHOLD`'s comment records for the chief. What makes
   * this interesting is unchanged — it still runs off the same opinions a
   * theft or a slander moves, so the same deed exiles a man from a band whose
   * norms condemn it and costs him nothing among neighbours whose norms do
   * not.
   */
  private considerExile(band: Band, members: Person[], ctx: BandContext): void {
    if (members.length < EXILE_QUORUM + 1) return;
    const chiefId = this.chiefByBand.get(band.id);

    for (const suspect of members) {
      if (suspect.id === chiefId) continue;
      if (suspect.isChild) continue;

      const faction = conspiracyAgainst(suspect.id, members, ctx.relationships);
      if (!faction || faction.memberIds.length < EXILE_QUORUM) continue;

      telemetry.count('exiled');
      suspect.chronicle.push({
        tick: ctx.tick,
        ageDays: suspect.age,
        text: t('was cast out of the {band}', { band: band.name }),
        kind: 'suffered',
      });
      ctx.onExile(suspect, band, faction.memberIds.length);
      return; // One at a time; a purge is a different mechanic.
    }
  }

  // -------------------------------------------------------------------------
  // Adoption
  // -------------------------------------------------------------------------

  /**
   * A band may take in an outcast found wandering near its camp.
   *
   * The mirror of `considerExile`, and the door back that its comment
   * promises: a person cast out for a deed nobody here witnessed, or judged by
   * norms this band does not share, arrives with a clean slate, because
   * reputation here is derived straight from `Memory` and `RelationshipGraph`
   * rather than from a global criminal record. What actually refuses somebody
   * is a member who genuinely knows and dislikes them — the same grudge
   * `conspiracyAgainst` would use to exile them again the moment they joined.
   */
  private considerAdoption(
    band: Band, members: Person[], outcasts: Person[], ctx: BandContext
  ): void {
    const nearby = ctx.peopleHash.queryRadius(band.homeX, band.homeY, ADOPTION_RADIUS)
      .filter(person => outcasts.includes(person) && !person.isChild);
    if (nearby.length === 0) return;

    for (const candidate of nearby) {
      const refused = members.some(member => {
        const rel = ctx.relationships.peek(member.id, candidate.id);
        return rel !== null && ctx.relationships.opinion(member.id, candidate.id) < ADOPTION_THRESHOLD;
      });
      if (refused) continue;

      telemetry.count('adopted');
      candidate.chronicle.push({
        tick: ctx.tick,
        ageDays: candidate.age,
        text: t('was taken in by the {band}', { band: band.name }),
        kind: 'milestone',
      });
      ctx.onAdopt(candidate, band);
      ctx.onInsight(candidate, t('was welcomed into the {band}', { band: band.name }), 'gain');
      return; // One at a time, the same discipline `considerExile` keeps.
    }
  }

  // -------------------------------------------------------------------------
  // Raids
  // -------------------------------------------------------------------------

  /**
   * A chief gathers a party and sends it into a rival band's ground.
   *
   * M11 phase 11c, and the piece the whole of phase 11 was built toward. Note
   * how little of it is new: phase 11a made `fight` something people actually
   * differ at, so a war party is not four farmers; phase 11b made `sabotage` a
   * verb with progress banked on the building; phase 7 made two peoples able
   * to stand badly with each other; phase 4 made property something attention
   * protects rather than permission. This only decides *who goes where*, and
   * every consequence of their arrival is already written.
   *
   * Two things it deliberately does not do. It does not make the raid
   * succeed — a party that walks into a camp with people awake in it is
   * turned back at the wall by `ActionSystem.useProperty`, having committed a
   * witnessed offence for its trouble, which is the property rule working and
   * not a bug to route around. And it does not tell the victims anything: a
   * band learns it has been raided by somebody seeing it happen, exactly as
   * everything else in this simulation is learned, so a raid nobody witnesses
   * is a hut that fell down in the night.
   */
  private considerRaid(
    band: Band, members: Person[], ctx: BandContext, outcastBandId: number | undefined
  ): void {
    const last = this.raidConsidered.get(band.id);
    if (last !== undefined && ctx.day - last < RAID_INTERVAL) return;

    const chiefId = this.chiefByBand.get(band.id);
    if (chiefId === undefined) return;
    const chief = members.find(member => member.id === chiefId);
    if (!chief || chief.order !== null || !this.fitToTravel(chief)) return;

    // Who does this band hate most, of the bands it could actually reach?
    // Worst standing wins outright rather than nearest or richest: a raid is
    // the discharge of a particular grudge, and picking by opportunity would
    // make it a foraging trip with extra steps.
    let victimId: number | null = null;
    let worst = RAID_HOSTILITY;
    for (const other of ctx.bandRelations.touching(band.id)) {
      if (other === band.id || other === outcastBandId) continue;
      const standing = ctx.bandRelations.standing(band.id, other);
      if (standing < worst) {
        worst = standing;
        victimId = other;
      }
    }
    if (victimId === null) return;

    const target = this.raidTarget(band, victimId, worst > RAID_FURY, ctx);
    if (!target) {
      telemetry.count('raid_nothing_in_reach');
      return;
    }

    // From here on the chief has genuinely weighed it, so the brooding clock
    // starts whether or not anybody ends up going. See `RAID_INTERVAL`.
    this.raidConsidered.set(band.id, ctx.day);

    const party = warParty(chief, members, ctx.relationships, RAID_PARTY_MAX);
    if (party.length + 1 < RAID_QUORUM) {
      telemetry.count('raid_never_raised');
      return;
    }

    // Rob or burn — see `RAID_FURY`. Plunder needs somewhere to plunder, so a
    // victim whose only buildings are huts is wrecked whatever anybody feels
    // about them. What is *in* the granary is not consulted and must not be:
    // it is a granary from the outside, and `doTake` finds out on arrival,
    // abandoning with `store_empty` if the answer is nothing.
    const plunder = worst > RAID_FURY && target.def.storage >= RAID_GRANARY;
    const verb = plunder ? 'take' : 'sabotage';
    telemetry.count('raid_called');
    telemetry.count(plunder ? 'raid_for_plunder' : 'raid_for_damage');

    let joined = 0;
    for (const member of party) {
      if (!this.fitForOrders(chief, member)) continue;
      if (ctx.command(chief, member, verb, { buildingId: target.id })) joined++;
    }
    telemetry.count('raid_joined', joined);
    if (joined === 0) telemetry.count('raid_refused_outright');

    // The chief goes with them, and goes even when nobody answered. Being
    // left to walk into a rival camp alone is the price of calling something
    // your band would not follow you into, and it is the one that makes a
    // chief's standing worth having — `command` has already cost them three
    // regard from every person who said no.
    ctx.command(chief, chief, verb, { buildingId: target.id });

    const victim = this.bandName(victimId);
    const behind = joined === 1
      ? t('one man behind him')
      : t('{n} men behind him', { n: joined });
    chief.chronicle.push({
      tick: ctx.tick,
      ageDays: chief.age,
      text: plunder
        ? t('led a raid on the stores of the {band}, {behind}', { band: victim, behind })
        : t('led a raid against the {band}, {behind}', { band: victim, behind }),
      kind: 'did',
    });
    ctx.onInsight(chief, plunder
      ? t('leads a raid on the stores of the {band}', { band: victim })
      : t('leads a raid against the {band}', { band: victim }), 'setback');
  }

  /**
   * What the party is aimed at, or null if the victim has nothing worth the
   * walk on this side of the water.
   *
   * Picked by what a chief could stand on a hill and see: a granary if the
   * victim has one and `rob` says this raid is after goods, and otherwise the
   * dearest thing they own, measured in the `workTicks` that went into it,
   * because what a raid costs its victim is the season they have to spend
   * putting it back up.
   *
   * Nothing here reads a store's contents, and that is the point rather than
   * an economy. A band knows what it has been told and what it has seen, and
   * nobody from this band has been inside that pit — so the party sets out
   * for the barn because it is a barn, and finds out on arrival whether
   * there was anything in it.
   */
  private raidTarget(
    band: Band, victimId: number, rob: boolean, ctx: BandContext
  ): Building | null {
    let plunder: Building | null = null;
    let plunderWorth = 0;
    let damage: Building | null = null;
    let damageWorth = 0;

    for (const building of ctx.buildings) {
      if (building.ownerBandId !== victimId) continue;
      if (!building.complete || building.ruined) continue;
      // The same category `sabotage` itself accepts, so that a party is never
      // sent at something the verb will refuse on arrival: a standing
      // structure, and not a field, which `doSabotage` excludes because
      // nothing downstream of `Field` reads `ruined` yet.
      if (!isStructure(building.def) || building.crop !== null) continue;
      const dx = building.centerX - band.homeX;
      const dy = building.centerY - band.homeY;
      if (Math.sqrt(dx * dx + dy * dy) > RAID_RANGE) continue;
      if (!ctx.sameRegion(band.homeX, band.homeY, building.centerX, building.centerY)) continue;

      // Biggest granary, by what it could hold rather than by what it does:
      // capacity is a fact about the building, which anybody can see, and
      // contents are a fact about the band that owns it, which nobody here
      // has been told.
      if (rob && building.def.storage >= RAID_GRANARY && building.def.storage > plunderWorth) {
        plunderWorth = building.def.storage;
        plunder = building;
      }
      if (building.def.workTicks > damageWorth) {
        damageWorth = building.def.workTicks;
        damage = building;
      }
    }
    return plunder ?? damage;
  }

  /** A band's name, for a chronicle line. 'strangers' for a band that has gone. */
  private bandName(bandId: number): string {
    return this.bandNames.get(bandId) ?? 'strangers';
  }

  // -------------------------------------------------------------------------
  // Territory
  // -------------------------------------------------------------------------

  /**
   * Foreign faces on a band's ground cost its opinion of their band — scaled
   * by how hungry this band is. M11 phase 7b's fourth engine: "a well-fed
   * band shrugs off an intrusion; a hungry one does not."
   *
   * **M11 phase 14c fixed two defects in it.**
   *
   * - **It was a sensor.** It counted every foreigner within
   *   `TERRITORY_RADIUS` of camp through the people hash, whether or not
   *   anybody from the band was there to see them — against the owner's rule
   *   that nothing is known that was not seen or told. It now reads
   *   `ctx.sightings`, which only a member's own eyes write (`sightIntruders`).
   * - **Its sign was backwards.** The comment above has always said a
   *   *hungry* band resents intruders, and the code multiplied by
   *   `pantryPressureOf`, which is how *full* the stores are: a band with
   *   empty granaries resented nothing, which is exactly the scarcity `lean`
   *   exists to create. The comment was the intent — it is the one the M11
   *   plan quotes — so the code now reads how empty the stores are. The other
   *   rule was measured too; see the changelog.
   *
   * A band with no granary at all still shrugs: there is no pantry to read, and
   * guessing hunger from somewhere else would be a second answer to a
   * question `pantryPressureOf` already owns.
   */
  private considerTerritory(
    band: Band, ctx: BandContext, outcastBandId: number | undefined
  ): void {
    const stores = ctx.buildings.filter(
      b => b.ownerBandId === band.id && b.complete && b.def.storage >= 100);
    if (stores.length === 0) return;
    const pressure = 1 - this.pantryPressureOf(stores);
    if (pressure <= 0) return;

    const byBand = new Map<number, number>();
    for (const seen of ctx.sightings.get(band.id)?.values() ?? []) {
      if (seen.bandId === band.id || seen.bandId === outcastBandId) continue;
      byBand.set(seen.bandId, (byBand.get(seen.bandId) ?? 0) + 1);
    }

    for (const [otherBandId, count] of byBand) {
      ctx.bandRelations.add(band.id, otherBandId, -count * pressure * TERRITORY_SCALE);
    }
  }
}
