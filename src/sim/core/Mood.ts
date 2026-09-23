/**
 * What a face says, without any new simulation state — and, since M9.6 phase
 * 4a, the persistent mood that state was always going to need.
 *
 * M9.5 phase 1 gave people faces, and a face has to read as *something* every
 * frame — which means an expression is either backed by a real field or it is a
 * panel quietly inventing a number the sim never held, the exact mistake
 * `workProgressOf` in `Progress.ts` exists to warn against. `expressionOf` is
 * still a pure read of state that already exists, and adds none of its own —
 * needs, health, who last hurt you, what keeps interrupting you, who you are
 * standing near, and now `Person.mood` below — so a face stays a *view* of the
 * simulation, never a second copy of it.
 *
 * The persistent, heritable `mood` this header used to call "the obvious next
 * step" is `Person.mood`. `TRAITS` and the new field are iterated by founding,
 * inheritance, ageing and the character-creation summary, exactly as the
 * comment predicted, which is why the migration landed as its own commit
 * (M9.6 phase 4a, bundled with M11 phase 5a's `malice` trait so the RNG shift
 * both cause is paid once). This phase ships the four channels, their decay,
 * and the inspector row. `expressionOf` reads `security` since M11 phase
 * 14f; the other three channels still have no reader (M9.6 4b-4d).
 */
import type { Person, Trait } from '../entities/Person.ts';
import { LETHAL_NEEDS, LATELY_ENOUGH } from '../entities/Person.ts';
import type { SpatialHash } from './SpatialHash.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import { telemetry } from './Telemetry.ts';
import { fearOf } from '../social/Fear.ts';

/**
 * Four channels a person's spirits ride on, each aged and read separately —
 * `RelationshipGraph`'s precedent for why a mood is components rather than one
 * number: the UI can then answer *why*, not just *that*.
 *
 * - **comfort** — how last night was spent: a roof and warmth, or the open
 *   ground and the cold.
 * - **belonging** — kin and household near you, conversation with family, the
 *   hearth shared.
 * - **security** — recent harm, being threatened, strangers in camp, sleeping
 *   unguarded. The channel M11 phase 5's plots and slander will darken.
 * - **purpose** — work that comes off, against work that keeps being
 *   interrupted. `person.noticed` already keeps exactly that record; see
 *   `expressionOf`'s `frustrated` read of it below.
 */
export type MoodChannel = 'comfort' | 'belonging' | 'security' | 'purpose';

export const MOOD_CHANNELS: readonly MoodChannel[] = ['comfort', 'belonging', 'security', 'purpose'];

/** How many recent nudges `Mood.add` keeps, for the inspector's "why" line. */
const RECENT_REASONS = 4;

/** One nudge to a channel, kept so the inspector can eventually say why. */
export interface MoodEntry {
  channel: MoodChannel;
  amount: number;
  reason: string;
  tick: number;
}

/**
 * A person's spirits. Every channel is a signed number with no natural bound
 * other than the clamp `add` applies — like `Relationship.opinion`, the scale
 * is meaningful only in comparison to itself and to `moodBaseline`, not as a
 * percentage of anything.
 *
 * `add` is the one entry point, on the same standing instruction `lastRefusal`
 * exists to serve: keep the reason beside the number, so a bar in the
 * inspector can become a sentence instead of staying a bar. Nothing calls it
 * yet — this phase ships the channels and their decay toward temperament, and
 * the first writer arrives with phase 4b/4c or M11 phase 5's plots.
 */
export class Mood {
  comfort = 0;
  belonging = 0;
  security = 0;
  purpose = 0;
  recent: MoodEntry[] = [];

  add(channel: MoodChannel, amount: number, reason: string, tick: number): void {
    this[channel] = Math.max(-100, Math.min(100, this[channel] + amount));
    this.recent.push({ channel, amount, reason, tick });
    if (this.recent.length > RECENT_REASONS) this.recent.shift();
  }
}

/**
 * How much of the gap to `moodBaseline` closes in one day. Chosen beside
 * `RelationshipGraph.decay`'s familiarity term (6% a day): a mood should move
 * faster than a relationship, since a single bad night is not a grudge.
 */
const MOOD_DECAY_PER_DAY = 0.08;

/**
 * The point each channel settles at absent anything pushing on it, set by one
 * temperament axis apiece — legible on its own rather than a blend nobody
 * could explain from the inspector:
 *
 * - **comfort** ← `tradition`: someone who keeps to the old ways is content
 *   with a simple hearth.
 * - **belonging** ← `loyalty`: someone loyal rests higher on feeling part of
 *   something.
 * - **security** ← `aggression`, inverted: a quick temper runs hotter and
 *   settles lower, always a little on guard.
 * - **purpose** ← `industriousness`: someone who wants to be working rests
 *   higher when they are.
 *
 * Held to a modest ±15 band around neutral so temperament colours the resting
 * point without dominating it — there is more room above and below for
 * whatever phase 4b/4c or M11 phase 5 later pushes a channel to.
 */
export function moodBaseline(traits: Record<Trait, number>, channel: MoodChannel): number {
  switch (channel) {
    case 'comfort': return (traits.tradition - 0.5) * 30;
    case 'belonging': return (traits.loyalty - 0.5) * 30;
    case 'security': return (0.5 - traits.aggression) * 30;
    case 'purpose': return (traits.industriousness - 0.5) * 30;
  }
}

/**
 * Ages one person's mood by a day, called from `Simulation`'s daily block
 * beside relationship and memory decay. Draws no RNG and reads nothing but
 * `person.traits` and `person.mood`, so it cannot itself move anything else in
 * the world — the same purity `techPower` and `Choice.ts`'s draw placement are
 * held to.
 *
 * Counts into `telemetry` rather than a scenario check: this phase is
 * deliberately inert, so what is worth watching before anything reads a
 * channel is that the machinery converges at all, not a pass/fail line.
 */
export function decayMood(person: Person): void {
  for (const channel of MOOD_CHANNELS) {
    const baseline = moodBaseline(person.traits, channel);
    person.mood[channel] += (baseline - person.mood[channel]) * MOOD_DECAY_PER_DAY;
    telemetry.count('mood_' + channel + '_sum', person.mood[channel]);
  }
  telemetry.count('mood_samples');
}

/** Just enough of the world to answer the question. */
export interface MoodView {
  time: { tick: number };
  peopleHash: SpatialHash<Person>;
  relationships: RelationshipGraph;
}

export type Expression =
  | 'strained' | 'pained' | 'afraid' | 'angry' | 'frustrated'
  | 'warm' | 'stern' | 'content' | 'neutral';

/** Every value `expressionOf` can return, for baking one atlas cell each. */
export const EXPRESSIONS: readonly Expression[] =
  ['strained', 'pained', 'afraid', 'angry', 'frustrated', 'warm', 'stern', 'content', 'neutral'];

/**
 * How long a hurt still shows on the face. Matches `Brain.ts`'s
 * `recentlyHarmed` window, so somebody who is still acting afraid of their
 * attacker also still looks it.
 */
const RECENTLY_HARMED_TICKS = 300;

/** Fear at which it shows on the face; the same as `DRIFT_ONSET` in `Fear.ts`. */
const AFRAID_FACE_AT = 0.4;

/** Needs above this read as visible strain, not just an inner number. */
const STRAIN_AT = 70;

/** Regard above this from the nearest neighbour reads as warmth. */
const WARM_AT = 40;

/** How far away somebody still counts as "standing near" for a resting read. */
const NEARBY_RANGE = 4;

export function expressionOf(person: Person, sim: MoodView): Expression {
  // Pain and strain first: whatever is about to kill you shows before
  // anything a passer-by or a grudge could add.
  if (person.health < 40) return 'pained';
  for (const need of LETHAL_NEEDS) {
    if (person.needs[need] >= STRAIN_AT) return 'strained';
  }

  if (sim.time.tick - person.lastHarmedTick < RECENTLY_HARMED_TICKS) {
    return person.traits.aggression > 0.6 ? 'angry' : 'afraid';
  }

  // M11 phase 14f: the first channel of `mood` the face reads, and the one
  // phase 14 gave writers to. Somebody frightened enough to be keeping near
  // home (`homeward`'s onset) looks it, so the player can see which of a band
  // is afraid — and a hot temper wears fear as a scowl, the same split the
  // fresh-harm read above makes.
  if (fearOf(person) >= AFRAID_FACE_AT) {
    return person.traits.aggression > 0.6 ? 'stern' : 'afraid';
  }

  // Frustration: work that keeps being interrupted, not work chosen freely.
  // `noticed` is exactly the record of that — see its header in `Person.ts`.
  let noticedRecently = 0;
  for (const count of person.noticed.values()) noticedRecently += count;
  if (noticedRecently >= LATELY_ENOUGH) return 'frustrated';

  // Warmth: how the nearest other person is regarded, not how the world at
  // large is going. `queryRadius` keeps this an O(k) neighbourhood lookup
  // rather than a scan of everyone alive — the same rule every proximity
  // question in this game follows.
  const nearest = nearestOther(person, sim.peopleHash);
  if (nearest && sim.relationships.opinion(person.id, nearest.id) >= WARM_AT) {
    return 'warm';
  }

  // The resting face: nothing pressing is happening, so what shows is
  // temperament. Two content people should not wear the same one.
  if (person.traits.aggression >= 0.65) return 'stern';
  if (person.traits.loyalty >= 0.6) return 'content';
  return 'neutral';
}

function nearestOther(person: Person, peopleHash: SpatialHash<Person>): Person | null {
  let best: Person | null = null;
  let bestDist = Infinity;
  for (const other of peopleHash.queryRadius(person.x, person.y, NEARBY_RANGE)) {
    if (other.id === person.id || !other.alive) continue;
    const dist = Math.hypot(other.x - person.x, other.y - person.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  return best;
}
