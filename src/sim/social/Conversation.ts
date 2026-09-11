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
import type { Relationship } from './Relationships.ts';

export type ConversationMode = 'greet' | 'chat' | 'interests' | 'deep';

export interface ConversationModeDef {
  id: ConversationMode;
  /** Ticks the conversation occupies. Six in-game minutes each. */
  ticks: number;
  /** Ticks before either party will deliberately approach anybody again. */
  cooldown: number;
  /** Familiarity gained by both sides, within a band. */
  warmth: number;
  /** Share of the loneliness answered. Only the longest rung answers all of it. */
  relief: number;
  /** Stories passed each way. Gossip is what a long conversation is *for*. */
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
    id: 'greet', ticks: 6, cooldown: 60, warmth: 3, relief: 0.25, stories: 0, from: 0,
  },
  chat: {
    id: 'chat', ticks: 18, cooldown: 140, warmth: 6, relief: 0.6, stories: 1, from: 12,
  },
  interests: {
    id: 'interests', ticks: 45, cooldown: 220, warmth: 11, relief: 0.85, stories: 1, from: 24,
  },
  deep: {
    id: 'deep', ticks: 90, cooldown: 320, warmth: 18, relief: 1, stories: 2, from: 35,
  },
};

/** Cheapest first, so the ladder can be walked without re-sorting it. */
export const MODE_LADDER: ConversationMode[] = ['greet', 'chat', 'interests', 'deep'];

/**
 * Familiarity gained across a band boundary, as a share of the ordinary gain.
 *
 * The ratio the single conversation already used — 1.5 against 3.5 — kept as a
 * multiplier so that it means the same thing on every rung. It takes longer to
 * warm to somebody you did not grow up beside.
 */
const CROSS_BAND = 1.5 / 3.5;

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

/** Familiarity one conversation of this kind is worth, given where it happens. */
export function warmthOf(mode: ConversationMode, sameBand: boolean): number {
  const def = CONVERSATION_MODES[mode];
  return sameBand ? def.warmth : def.warmth * CROSS_BAND;
}
