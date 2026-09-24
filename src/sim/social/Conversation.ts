/**
 * The kinds of conversation two people can have, and which one they are having.
 *
 * There used to be exactly one. `TALK_TICKS` was 45 against a 240-tick day, so
 * every exchange in the game — nodding at a stranger, catching up with a
 * brother, hearing what happened at the river — cost four and a half in-game
 * hours and a near-whole day of `SOCIAL_COOLDOWN` afterwards. The project
 * owner's note was that talking takes far too long, and the diagnosis in
 * `next-steps.md` §O1 is that the problem is not the price of a conversation
 * but that there is only one of them: a greeting priced like a long evening is
 * a greeting nobody can afford, and a long evening priced like a greeting is
 * not worth having.
 *
 * So four rungs, chosen from the relationship rather than picked by anybody:
 *
 *   greeting    — you barely know them. Seconds, no news, a little warmth.
 *   small talk  — an acquaintance. The ordinary exchange of a working camp.
 *   interests   — asking what somebody is like, and the rung that carries
 *                 familiarity across `Knowledge.ts`'s `CLOSE_AT`, which is
 *                 where their character becomes legible to the player at all.
 *   deep talk   — long, expensive, and the only rung that carries real news.
 *
 * **No new state.** The rung is derived from `familiarity` and `lastContact`,
 * both of which `Relationship` has carried since the beginning. That is
 * deliberate: a mode stored on the edge would be a second opinion about how
 * well two people know each other, and it would drift from the first.
 */
import type { Person } from '../entities/Person.ts';
import type { Relationship } from './Relationships.ts';
import { t } from '../../i18n/i18n.ts';

export type ConversationMode = 'greet' | 'chat' | 'interests' | 'deep';

export interface ConversationModeDef {
  id: ConversationMode;
  /** What the radial menu offers it as. */
  verb: string;
  /** What somebody doing it is doing, for the HUD and the floaters. */
  doing: string;
  /** Ticks the conversation occupies. Six in-game minutes each. */
  ticks: number;
  /** Ticks before either party will deliberately approach anybody again. */
  cooldown: number;
  /** Familiarity gained by both sides, within a band. */
  warmth: number;
  /** Share of the loneliness answered. Only the longest rung answers all of it. */
  relief: number;
  /**
   * Stories passed each way. A long conversation is worth two.
   *
   * A greeting carried none at first, on the reasoning that there is no time in
   * one to say anything. Two scenarios said otherwise: in a young band nearly
   * every conversation is a greeting — 19 of 20 in `tiny` — so news stopped
   * travelling altogether and `rumor-propagates` went to zero, twice, by two
   * different routes. That is not a band being tight-lipped, it is the gossip
   * channel closed by arithmetic, and `next-steps.md` §0 names transmission as
   * the thing the whole tree waits on. A greeting in a stone-age camp is
   * "morning — did you hear about Korak", and the difference between the rungs
   * is in what they cost and what they are worth, not in whether anybody says
   * anything at all.
   */
  stories: number;
  /**
   * Familiarity at which this rung becomes the natural one.
   *
   * `chat` opens at `Knowledge.ts`'s `KNOWN_AT` and `deep` at its `CLOSE_AT`,
   * because those are the two thresholds at which the game already says a
   * relationship has changed in kind — a third set of numbers saying the same
   * thing in different places is how two accounts of "do they know each other"
   * come apart.
   */
  from: number;
}

/**
 * The ladder, cheapest first.
 *
 * The prices are the point. A greeting is six ticks where everything used to
 * cost forty-five, so meeting people is now something a band can afford to do
 * all day — which matters most for exactly the strangers `firstImpression`
 * starts at −6 and who previously had no cheap way to stop being strangers.
 * Deep talk is *dearer* than the old single price, and that is the other half
 * of the trade: the evening that moves a relationship should cost an evening.
 *
 * **The bottom rung has to be climbable, and the first tuning of it was not.**
 * At 1.5 familiarity a greeting could not carry anybody to `chat` inside a
 * twelve-day run: everyone in the world nodded at each other for ever, and
 * because a greeting carries no news, `rumor-propagates` went to zero — the
 * whole gossip channel closed by a number chosen to express "a greeting is
 * worth little". What prices a rung is its **cooldown**, not its warmth, so
 * warmth is set to make each rung worth roughly the same per tick of the day
 * it occupies (warmth over ticks + cooldown: .045, .038, .042, .044) and the
 * ladder is climbed by talking rather than by waiting.
 */
export const CONVERSATION_MODES: Record<ConversationMode, ConversationModeDef> = {
  greet: {
    id: 'greet', verb: 'Greet', doing: 'passing the time of day',
    ticks: 6, cooldown: 60, warmth: 3, relief: 0.25, stories: 1, from: 0,
  },
  chat: {
    id: 'chat', verb: 'Make small talk', doing: 'making small talk',
    ticks: 18, cooldown: 140, warmth: 6, relief: 0.6, stories: 1, from: 12,
  },
  interests: {
    id: 'interests', verb: 'Ask what they are like', doing: 'asking what they are like',
    ticks: 45, cooldown: 220, warmth: 11, relief: 0.85, stories: 1, from: 24,
  },
  deep: {
    id: 'deep', verb: 'Talk at length', doing: 'deep in conversation',
    ticks: 90, cooldown: 320, warmth: 18, relief: 1, stories: 2, from: 35,
  },
};

/** Cheapest first, so the ladder can be walked without re-sorting it. */
export const MODE_LADDER: ConversationMode[] = ['greet', 'chat', 'interests', 'deep'];

/**
 * Familiarity gained across a band boundary at neutral standing, as a share
 * of the ordinary gain.
 *
 * The ratio the single conversation already used — 1.5 against 3.5 — kept as
 * a multiplier so that it means the same thing on every rung. It takes
 * longer to warm to somebody you did not grow up beside — at neutral
 * standing. `CROSS_BAND_STANDING_SCALE` is M11 phase 7c: two peoples on good
 * terms warm to each other closer to the in-band rate, and two peoples at
 * open hostility warm to each other closer to not at all.
 */
const CROSS_BAND = 1.5 / 3.5;

/**
 * How far one point of `BandRelations.standing` moves the cross-band
 * familiarity factor. At `standing === 100` (close allies) the factor
 * reaches 0.83, most of the way to talking to one's own band; at `-100`
 * (open hostility) it is clamped at `CROSS_BAND_FLOOR` rather than reaching
 * zero — strangers who despise each other's peoples can still, slowly, come
 * to know one person as a person.
 */
const CROSS_BAND_STANDING_SCALE = 0.004;

/**
 * How far two people's own ease or fear moves the cross-band factor, at full
 * `opennessOf` — M11 phase 14b, the first reader of fear. The owner's note:
 * with little fear people talk to strangers, with a lot they will not. At
 * ease on both sides (security +15, a placid pair's resting point) the factor
 * rises from 0.43 to 0.52; with both of them frightened (−30) it falls to
 * 0.28, and never below the floor.
 */
const CROSS_BAND_OPENNESS = 0.3;

/** However hostile the standing, warming to a stranger is never quite impossible. */
const CROSS_BAND_FLOOR = 0.05;

/**
 * How long two people have to go without anything passing between them before
 * the next conversation is a catching-up rather than a continuation.
 *
 * Five days. `lastContact` is stamped by any deed as well as by talking, so
 * this really is "nothing has happened between you in the better part of a
 * week", not merely "we have not chatted".
 */
const CATCH_UP_GAP = 1200;

/**
 * Which conversation these two are about to have.
 *
 * Familiarity picks the rung; a long silence moves it up one, because there is
 * more to say to somebody you have not seen in a week than to somebody you saw
 * at breakfast. The silence rule deliberately does not apply to the bottom
 * rung: a first meeting is a greeting however long the two have been alive,
 * and without that guard every stranger would meet every stranger with a long
 * heart-to-heart, since an edge that does not exist has `lastContact` 0.
 */
export function chooseMode(rel: Relationship | null, tick: number): ConversationMode {
  const familiarity = rel?.familiarity ?? 0;
  let rung = 0;
  for (let i = MODE_LADDER.length - 1; i > 0; i--) {
    if (familiarity >= CONVERSATION_MODES[MODE_LADDER[i]!]!.from) {
      rung = i;
      break;
    }
  }
  if (rung > 0 && rel && tick - rel.lastContact > CATCH_UP_GAP) {
    rung = Math.min(MODE_LADDER.length - 1, rung + 1);
  }
  return MODE_LADDER[rung]!;
}

/**
 * Familiarity actually gained, given where the two people are from.
 *
 * Takes the amount rather than the rung because it covers a lesson and an
 * argument over a design as well as a conversation: whatever the two were
 * doing, warming to somebody from another band takes longer.
 */
export function crossBand(warmth: number, sameBand: boolean, standing = 0, openness = 0): number {
  if (sameBand) return warmth;
  const factor = Math.max(
    CROSS_BAND_FLOOR,
    Math.min(1, CROSS_BAND + standing * CROSS_BAND_STANDING_SCALE + openness * CROSS_BAND_OPENNESS));
  return warmth * factor;
}

/**
 * Whether somebody may ask for this conversation with this person.
 *
 * The rung the relationship warrants, or any cheaper one. You can always nod at
 * a friend; you cannot sit a stranger down for the evening, because the rungs
 * above are not a menu of intensities to choose from but a description of what
 * two people already have to say to each other.
 *
 * Shared by the radial menu, which greys the rungs that are out of reach, and
 * by `doTalk`, which refuses one that went out of reach while the asker walked
 * over. Two copies of this rule would drift, and the drift would show up as a
 * menu offering a conversation the simulation then declines to have.
 */
export function modeAllowed(
  rel: Relationship | null, tick: number, mode: ConversationMode
): boolean {
  // Family may always be sat down for any conversation, however long it has
  // been — the rule `Knowledge.knowledgeOfPerson` already keeps for what the
  // player is shown. Without it, the owner found a relationship of 86 that
  // offered nothing but a greeting (notes of 2026-09-24): kinship carried the
  // opinion, and familiarity, which fades unless it is kept up, had faded.
  //
  // Here and not in `chooseMode`, on purpose. **Measured**: putting it there
  // made every NPC pick the longest rung with every relative, `talk` more than
  // doubled in `traps` (8,612 ticks to 19,750), and `tiny`'s band built
  // nothing at all in eight days. What a person *may* say to their brother is
  // one question; what they choose to, left alone, is another.
  if (rel !== null && rel.kinship !== 0) return true;
  return MODE_LADDER.indexOf(mode) <= MODE_LADDER.indexOf(chooseMode(rel, tick));
}

/** Why a rung is out of reach, in words a player can act on. */
export function whyNotYet(mode: ConversationMode): string {
  return mode === 'deep'
    ? t('They do not know them well enough to talk at length')
    : t('They do not know them well enough for that yet');
}

/**
 * How much of an hour spent on a shared problem answers this person's
 * loneliness.
 *
 * Note 6 was that discussing and teaching should build a relationship, and the
 * thing that made it worth a mechanism rather than a constant is *who* it is
 * worth it to. An afternoon arguing about how to bind a haft is company for
 * somebody who finds the problem interesting and an afternoon's work for
 * somebody who does not — and `intelligence` is the trait the note was reaching
 * for when it said "intellectual". It is already how quickly somebody works an
 * idea out, teaches it and picks it up again; this makes it also how much they
 * get out of doing any of that in company.
 *
 * Deliberately never the whole of it, however clever they are: a lesson is not
 * an evening by the fire, and if it were, nobody would ever choose `talk`.
 */
export function meetingOfMinds(person: Person, base: number): number {
  return Math.min(0.95, base * (0.4 + person.traits.intelligence * 1.2));
}
