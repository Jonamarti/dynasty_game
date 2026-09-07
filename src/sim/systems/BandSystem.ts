/**
 * The band as something that acts, rather than a colour on a sprite.
 *
 * Three jobs, run once per in-game day:
 *
 *  1. **Choosing a chief.** Whoever the band collectively thinks most of, with
 *    age and headship counting for something. Nobody votes; the position simply
 *    belongs to whoever holds it in everyone's regard, and it changes hands when
 *    that changes.
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
import type { Band } from '../core/Simulation.ts';
import type { Building, BuildingDef } from '../entities/Building.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { techPower, type Tech } from '../knowledge/Tech.ts';
import type { RelationshipGraph } from './../social/Relationships.ts';
import type { RNG } from '../core/RNG.ts';
import { telemetry } from '../core/Telemetry.ts';

/** Average opinion below which a band casts someone out. */
const EXILE_THRESHOLD = -28;

/** At least this many people must hold that opinion for it to count. */
const EXILE_QUORUM = 4;

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

/** Days between a band considering new construction. */
const PLANNING_INTERVAL = 3;

/** Sites a band will have underway at once. */
const MAX_SITES = 2;

export interface BandContext {
  relationships: RelationshipGraph;
  rng: RNG;
  day: number;
  tick: number;
  buildings: Building[];
  /** Places a site; returns null if it will not fit. */
  place: (defId: string, x: number, y: number, bandId: number) => Building | null;
  /** Called when someone is cast out, so the world can resettle them. */
  onExile: (person: Person, band: Band, averageOpinion: number) => void;
  /** Removes an abandoned site from the world. */
  abandonSite: (building: Building) => void;
  /** Issues an order subject to a compliance roll. Returns whether it stuck. */
  command: (leader: Person, subordinate: Person, action: string,
    target: { buildingId?: number }) => boolean;
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

  daily(bands: Band[], people: Person[], ctx: BandContext): void {
    const byBand = new Map<number, Person[]>();
    for (const person of people) {
      if (!person.alive) continue;
      const list = byBand.get(person.bandId);
      if (list) list.push(person);
      else byBand.set(person.bandId, [person]);
    }

    for (const band of bands) {
      const members = byBand.get(band.id) ?? [];
      if (members.length === 0) {
        this.chiefByBand.delete(band.id);
        continue;
      }

      this.chooseChief(band, members, ctx);
      this.considerExile(band, members, ctx);
      if (ctx.day % PLANNING_INTERVAL === 0) this.planBuildings(band, members, ctx);
      this.directWork(band, members, ctx);
    }
  }

  // -------------------------------------------------------------------------
  // Chiefs
  // -------------------------------------------------------------------------

  /**
   * The chief is whoever the band holds in the highest regard.
   *
   * Summed rather than averaged, so being widely known matters as much as being
   * well liked — a saint nobody has met does not lead anyone. Children are not
   * eligible; age and headship carry weight, because standing accrues.
   */
  private chooseChief(band: Band, members: Person[], ctx: BandContext): void {
    let best: Person | null = null;
    let bestScore = -Infinity;

    for (const candidate of members) {
      if (candidate.isChild) continue;
      let regard = 0;
      for (const other of members) {
        if (other.id === candidate.id) continue;
        regard += ctx.relationships.opinion(other.id, candidate.id);
      }
      const score = regard + candidate.years * 1.5 + candidate.skills.persuade * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best) return;
    const previous = this.chiefByBand.get(band.id);
    if (previous === best.id) return;

    this.chiefByBand.set(band.id, best.id);
    band.chiefId = best.id;
    telemetry.count('chief_chosen');
    best.chronicle.push({
      tick: ctx.tick,
      ageDays: best.age,
      text: 'became chief of the ' + band.name,
      kind: 'milestone',
    });
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

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
    const built = live.filter(b => b.complete).length;
    if (built >= Math.ceil(members.length / MEMBERS_PER_STRUCTURE) + 2) return;

    // Roof measured as floor area, not as a count of roofs. A 3x3 hut and a 2x2
    // windbreak are not the same amount of shelter, and counting them as one
    // each is how a band with two windbreaks decided it had housed ten people.
    const roofArea = live
      .filter(b => b.def.shelter > 0.3)
      .reduce((sum, b) => sum + b.def.width * b.def.height, 0);

    const stores = live.filter(b => b.complete && b.def.storage >= 100);
    const capacity = stores.reduce((sum, b) => sum + b.def.storage, 0);
    const used = stores.reduce((sum, b) => sum + b.store.total, 0);
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
      } else if (capacity > 0 && used / capacity > STORE_PRESSURE) {
        // Already storing, and running out of room: now the big one is worth
        // the season it costs.
        wanted = this.bestBy(granaries, def => def.storage)?.id ?? null;
      }
    }
    if (!wanted) return;

    for (let attempt = 0; attempt < 30; attempt++) {
      const x = Math.round(band.homeX + ctx.rng.range(-8, 8));
      const y = Math.round(band.homeY + ctx.rng.range(-8, 8));
      const placed = ctx.place(wanted, x, y, band.id);
      if (placed) {
        telemetry.count('band_planned_' + wanted);
        return;
      }
    }
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
   * The chief puts people on the unfinished work.
   *
   * This is where authority stops being a number in a panel. A chief who is
   * liked gets a hut built; one who is merely tolerated is refused to their
   * face and has to do it themselves. Only a couple of people a day, and only
   * ones with nothing pressing, so being led feels like direction rather than
   * possession.
   */
  private directWork(band: Band, members: Person[], ctx: BandContext): void {
    const chiefId = this.chiefByBand.get(band.id);
    if (chiefId === undefined) return;
    const chief = members.find(m => m.id === chiefId);
    if (!chief) return;

    const site = ctx.buildings.find(b => b.ownerBandId === band.id && !b.complete);
    if (!site) return;

    let directed = 0;
    for (const member of members) {
      if (directed >= 2) break;
      if (member.id === chief.id || member.isChild) continue;
      if (member.order !== null) continue;
      // Nobody is sent to work while they are hungry, thirsty or cold; an order
      // that would kill the person obeying it is not authority, it is a bug.
      if (member.needs.hunger > 45 || member.needs.thirst > 40 || member.needs.cold > 45) continue;
      if (chief.distanceTo(member) > 24) continue;

      const action = site.materialsReady ? 'build' : 'haul';
      if (ctx.command(chief, member, action, { buildingId: site.id })) directed++;
    }
  }

  // -------------------------------------------------------------------------
  // Exile
  // -------------------------------------------------------------------------

  /**
   * Casts out anyone the band as a whole has turned against.
   *
   * The threshold is on the *average* opinion across people who actually have
   * one, with a quorum, so a single furious enemy cannot banish a rival. What
   * makes this interesting is that it runs off the same norms that decide how
   * a theft is judged: the same deed exiles a man from a strict band and costs
   * him nothing among tolerant neighbours.
   */
  private considerExile(band: Band, members: Person[], ctx: BandContext): void {
    if (members.length < EXILE_QUORUM + 1) return;
    const chiefId = this.chiefByBand.get(band.id);

    for (const suspect of members) {
      if (suspect.id === chiefId) continue;
      if (suspect.isChild) continue;

      let total = 0;
      let voices = 0;
      for (const other of members) {
        if (other.id === suspect.id) continue;
        if (!ctx.relationships.peek(other.id, suspect.id)) continue;
        total += ctx.relationships.opinion(other.id, suspect.id);
        voices++;
      }
      if (voices < EXILE_QUORUM) continue;

      const average = total / voices;
      if (average > EXILE_THRESHOLD) continue;

      telemetry.count('exiled');
      suspect.chronicle.push({
        tick: ctx.tick,
        ageDays: suspect.age,
        text: 'was cast out of the ' + band.name,
        kind: 'suffered',
      });
      ctx.onExile(suspect, band, average);
      return; // One at a time; a purge is a different mechanic.
    }
  }
}
