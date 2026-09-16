/**
 * Who can tell whom what to do, and whether they are obeyed.
 *
 * This is the pillar the household machinery was built for: *the head
 * concentrates most of the power*. Until now a household had a head and a line
 * of succession but the head could not actually make anyone do anything, which
 * made headship a label rather than a position.
 *
 * The important design decision is that an order is a **roll, not a switch**.
 * A head who is loved is obeyed; a head who is feared is obeyed while they are
 * strong; a head who is neither is refused to their face, in public, in front
 * of everyone who happens to be standing there. Refusal is a story beat and it
 * is where most of the drama in a family lives — so it is a first-class outcome
 * with its own event, not an error path.
 */
import type { Person } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import type { Band } from '../core/Simulation.ts';
import type { RelationshipGraph } from './Relationships.ts';
import { chiefHoneymoon } from './Leadership.ts';
import { techPower } from '../knowledge/Tech.ts';

export interface AuthorityContext {
  relationships: RelationshipGraph;
  householdsById: Map<number, Household>;
  /** Band chiefs, by band id. */
  chiefByBand: Map<number, number>;
  /** Bands carry the one timestamp from which a chief's welcome is derived. */
  bands: readonly Band[];
  /** Absolute day, on the same clock as `Band.chiefSince`. */
  day: number;
}

export interface Standing {
  /** True if the leader heads the subordinate's household. */
  isHead: boolean;
  /** True if the leader is chief of the subordinate's band. */
  isChief: boolean;
  /** True if they are kin at all. */
  isKin: boolean;
  /**
   * True if what carried this was `chiefdom`'s middle rank and nothing else —
   * the leader heads a house in the subordinate's band, but is neither their
   * own head nor the chief.
   *
   * Reported rather than inferred by the caller, because two places need the
   * same answer and neither should recompute it: `Simulation.command` records
   * `preside` on it, which is the only way `chiefdom` is ever practised, and
   * the telemetry that measures whether rank is worth anything counts on it.
   */
  byRank: boolean;
  /** 0-1 chance the order is obeyed. */
  chance: number;
  /** Plain-language account of where the chance came from, for the UI. */
  because: string;
}

/**
 * How costly an order is to the person receiving it.
 *
 * Being told to walk somewhere is nothing; being told to attack a neighbour is
 * a great deal, and people refuse it far more readily. This is what stops
 * authority from being a mind-control button.
 */
const ORDER_COST: Record<string, number> = {
  goto: 0.05,
  rest: 0.05,
  eat: 0.05,
  drink: 0.05,
  shelter: 0.1,
  forage: 0.15,
  gather: 0.15,
  pick: 0.15,
  haul: 0.15,
  store: 0.15,
  take: 0.15,
  // Fetching a heap off the ground: the same imposition as a trip to the
  // store, which is what it is.
  pickup: 0.15,
  build: 0.2,
  chop: 0.28,
  craft: 0.2,
  // Not a task but a standing arrangement: cheaper than telling someone to
  // attack, dearer than telling them to go and eat, because it is asking them
  // to spend their days differently rather than just this next hour.
  job: 0.25,
  talk: 0.15,
  teach: 0.2,
  // Being told whom to go and learn from. Cheaper than being told to teach:
  // an afternoon of somebody else's time is being spent on you rather than by
  // you.
  ask: 0.15,
  // Research is cheap to ask for and hard to compel: sitting somebody down to
  // think is barely an imposition, and being told whom to argue with is one.
  ponder: 0.25,
  // Level with `rest` and `goto`, the cheapest things anybody can be told.
  // Telling somebody to sit with their own thoughts for half an hour asks no
  // more of them than telling them to go and lie down, and unlike `ponder` it
  // does not hand them a problem to solve.
  reflect: 0.05,
  discuss: 0.2,
  prototype: 0.3,
  sleep: 0.1,
  flee: 0.1,
  // Long, and it can get you killed.
  hunt: 0.35,
  give: 0.4,
  court: 0.6,
  steal: 0.75,
  // Below `attack`: nobody comes home hurt, but being sent to menace a
  // neighbour is a heavier ask than being sent to rob one quietly.
  threaten: 0.8,
  attack: 0.9,
};

/**
 * What heading a house is worth outside it, once `chiefdom` is known.
 *
 * Between `isKin`'s 0.1 and a chief's 0.45, and well under the 0.55 a head
 * carries under their own roof. A middle rank has to be visibly middling: set
 * level with headship and the pyramid would be flat again with two apexes, and
 * set at 0.05 it would be a line in a table that changed nothing anybody could
 * see, which is the other way this project keeps shipping inert content.
 */
const RANK_AUTHORITY = 0.22;

export function orderCost(action: string): number {
  return ORDER_COST[action] ?? 0.3;
}

/**
 * Works out whether `subordinate` would do as `leader` says, and why.
 *
 * Read the terms in order of weight: standing (are you actually their head?),
 * regard (do they like you?), temperament (are they biddable?), and fear (are
 * you dangerous to cross?). The order's cost divides all of it.
 */
export function standingOver(
  leader: Person,
  subordinate: Person,
  action: string,
  ctx: AuthorityContext
): Standing {
  const household = subordinate.householdId === null
    ? null
    : ctx.householdsById.get(subordinate.householdId) ?? null;

  const isHead = household !== null &&
    household.headId === leader.id &&
    household.memberIds.includes(subordinate.id);
  const isChief = ctx.chiefByBand.get(subordinate.bandId) === leader.id;
  const kinship = ctx.relationships.kinship(subordinate.id, leader.id);
  const isKin = kinship > 0;

  if (leader.id === subordinate.id) {
    return { isHead, isChief, isKin, byRank: false, chance: 1, because: 'yourself' };
  }

  // Standing is the floor the rest builds on. A stranger with no position has
  // essentially none, however much you happen to like them.
  // Tuned against the century run rather than guessed. The first numbers left a
  // chief refused on eighty-six orders in a hundred, which is not a chief. The
  // shape to aim for: a household head is obeyed by their own kin about three
  // times in four, a well-regarded chief gets roughly half of what they ask,
  // and nobody at all can order a killing.
  let authority = 0.08;
  const reasons: string[] = [];
  if (isHead) {
    authority += 0.55;
    reasons.push('head of their household');
  }
  if (isChief) {
    authority += 0.45;
    reasons.push('chief of their band');

    // A new chief gets a brief chance to lead before ordinary relationship
    // noise has caught up. This is band state, not a deed painted onto every
    // member: it fades quickly and leaves no edge-by-edge residue behind.
    const band = ctx.bands.find(candidate => candidate.id === subordinate.bandId);
    if (band) {
      const welcome = chiefHoneymoon(band, ctx.day);
      authority += welcome * 0.18;
      if (welcome > 0.25) reasons.push('newly welcomed as chief');
    }
  }
  if (isKin && !isHead) {
    authority += 0.1;
    reasons.push('kin');
  }

  // M9.5 phase 4d: the middle rung. Until `chiefdom` a band is flat — `isHead`
  // above reaches only inside one roof, so the head of a house had no more
  // standing over the family next door than a passing stranger did, and the
  // only two ranks in the game were "chief" and "everybody else". Rank fills
  // that in: a head of a house is heeded across the whole camp, at less than
  // the 0.55 they carry under their own roof and less than a chief's 0.45,
  // because it is a middle rank and should read as one.
  //
  // Held by the individual, like every other technology here. Scaled by
  // `techPower`, so a head who has only half worked the idea out carries half
  // the rank — which is also what lets the practice be tried at all.
  const byRank = !isHead && !isChief &&
    headsAHouseIn(leader, subordinate.bandId, ctx) &&
    techPower(leader, 'chiefdom') > 0;
  if (byRank) {
    authority += RANK_AUTHORITY * techPower(leader, 'chiefdom');
    reasons.push('head of a house in your band');
  }

  if (reasons.length === 0) reasons.push('no standing over them');

  const regard = ctx.relationships.opinion(subordinate.id, leader.id) / 100;
  authority += regard * 0.4;
  if (regard > 0.25) reasons.push('thinks well of you');
  else if (regard < -0.15) reasons.push('resents you');

  // Biddability. A loyal person does as they are told; a headstrong one argues.
  authority += (subordinate.traits.loyalty - 0.5) * 0.4;
  authority += (subordinate.traits.tradition - 0.5) * 0.2;

  // Fear. Being visibly the stronger party buys compliance you have not earned,
  // and it evaporates the moment you are no longer the stronger party — which
  // is what makes an ageing head's grip on their household genuinely precarious.
  const menace = leader.skillFactor('fight') - subordinate.skillFactor('fight');
  if (menace > 0.15) {
    authority += Math.min(0.25, menace * 0.4);
    reasons.push('you are the stronger');
  }

  const cost = orderCost(action);
  const chance = Math.max(0, Math.min(0.98, authority - cost * 0.6));

  return {
    isHead,
    isChief,
    isKin,
    byRank,
    chance,
    because: reasons.join(', '),
  };
}

/**
 * Whether `person` is the head of a household that belongs to `bandId`.
 *
 * `Household.bandId` rather than the head's own `bandId`, because the two can
 * differ: `bandId` is not reassigned on marriage, so somebody who married
 * across a band line still carries their birth band — the same gap
 * `kin-outrank-strangers` records in `simcheck`. The house is where the rank
 * lives, so the house is what is asked.
 *
 * Exported for `Rank.ts`, which draws the middle row of the tribe graph's
 * pyramid and has to ask precisely the question this one does — a rank on
 * screen that no order would respect is content that only looks like it does
 * something. Its context is narrowed to the one map it reads, so the rank
 * model need not assemble a whole `AuthorityContext` to ask.
 */
export function headsAHouseIn(
  person: Person,
  bandId: number,
  ctx: { householdsById: ReadonlyMap<number, Household> }
): boolean {
  if (person.householdId === null) return false;
  const household = ctx.householdsById.get(person.householdId);
  return household !== undefined &&
    household.headId === person.id &&
    household.bandId === bandId;
}

/**
 * Whether a demand backed by nothing but menace gets what it asks for.
 *
 * Before anyone has the idea of assigning work, one person can still make
 * another hand over food — by threat. This is deliberately *not*
 * `standingOver`: it ignores headship and chieftainship entirely, which is
 * what lets it work on strangers and other bands, where legitimate authority
 * has no purchase at all. It reads only the fight-skill gap that already
 * powers `standingOver`'s own fear term, the victim's temperament, and
 * whether the leader is somebody who has hurt them recently — an old grudge
 * buys nothing, but a fresh one does.
 */
export function menaceOver(leader: Person, subordinate: Person, tick: number): Standing {
  if (leader.id === subordinate.id) {
    return { isHead: false, isChief: false, isKin: false, byRank: false, chance: 1, because: 'yourself' };
  }

  const reasons: string[] = [];
  let chance = 0.12;

  const menace = leader.skillFactor('fight') - subordinate.skillFactor('fight');
  if (menace > 0) {
    chance += Math.min(0.45, menace * 0.6);
    reasons.push('you are the stronger');
  }

  // A biddable person gives way; an aggressive one is more likely to call the
  // bluff and refuse, whatever the odds.
  chance -= (subordinate.traits.aggression - 0.5) * 0.3;

  // Fresh fear outweighs everything else. The window matches the one
  // `Brain`'s own flee scoring uses for "recently harmed" — long enough to
  // matter, short enough that an old fight is not a standing threat.
  if (subordinate.lastHarmedBy === leader.id && tick - subordinate.lastHarmedTick < 300) {
    chance += 0.35;
    reasons.push('still afraid of you');
  }

  chance = Math.max(0.02, Math.min(0.92, chance));
  if (reasons.length === 0) reasons.push('no fear of you');

  return {
    isHead: false, isChief: false, isKin: false, byRank: false,
    chance, because: reasons.join(', '),
  };
}
