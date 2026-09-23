/**
 * Who killed them. M11 phase 16d (owner's note 1).
 *
 * The finding (16c) says somebody is dead. For a body with wounds on it, a
 * finder who cares — kin or household, a friend, one of the dead's own band,
 * or somebody simply *just* — sets out to learn who did it, and learns it the
 * only ways anybody in this world learns anything: by what they saw and by
 * what they are told.
 *
 * ## The evidence, channel by channel
 *
 * 1. **A witness.** Somebody saw the killing (`emit` already put it in their
 *    memory). Asked, they tell it — `SocialSystem.tellStory`, so it arrives
 *    as hearsay, less sure than sight, exactly as any other story does.
 * 2. **A motive.** Memories of somebody threatening, beating or robbing the
 *    dead — the investigator's own, or those of whoever they ask.
 * 3. **Bloodied.** A killer is marked for a day (`BLOODIED_TICKS`); anybody
 *    who sees them in that time remembers it (`seenBloodied`), and says so
 *    when asked.
 * 4. **The dead's goods on somebody else.** Planned, and **not built**: an
 *    item in this world does not know whose it was, so nobody can recognise
 *    a dead man's axe in another pack. Left for the pass that gives goods a
 *    provenance.
 *
 * The conclusion is a **suspicion with a confidence below one**, formed only
 * when the evidence clears `SUSPICION_AT`, and it enters the investigator's
 * memory as a killing heard of: it moves their opinion as hearsay does, it
 * spreads by gossip as any story does, and everything that already reads a
 * killing — a grudge and its revenge, a faction and its exile, the standing
 * between two peoples — reads this. **A wrong answer is possible, and meant**:
 * a motive may be a slander (phase 5c), and whoever happened to be bloodied
 * from a fight that day looks exactly like a killer.
 *
 * Nothing here draws a random number.
 */
import type { Person } from '../entities/Person.ts';
import type { RelationshipGraph } from './Relationships.ts';
import type { Norms, EventType } from './Events.ts';

/** How long a killer bears the marks of it, in ticks: a day. */
export const BLOODIED_TICKS = 240;

/** How long an investigation runs before it is given up, in days. */
export const INVESTIGATION_DAYS = 3;

/**
 * Standing at the place, asking, in ticks — long enough for the people
 * about to have been spoken to, and with an interruption check every tick.
 */
export const ASK_TICKS = 60;

/** How far an investigator's questions carry: the earshot a shout has. */
export const ASK_RADIUS = 16;

/** How strongly an open investigation draws the investigator back to it. */
export const INVESTIGATE = 1.2;

/**
 * What each channel is worth towards a suspicion. A witness's word at full
 * confidence settles it alone; being seen bloodied that day nearly does; a
 * grudge is a reason to look at somebody, and three of them a reason to
 * suspect them. Heard from somebody asked rather than known firsthand, a
 * channel counts `TOLD` of itself.
 */
export const WITNESSED = 1;
export const BLOODIED = 0.6;
export const MOTIVE = 0.25;
export const MOTIVE_CAP = 0.75;
export const TOLD = 0.8;

/** The evidence it takes to name somebody. */
export const SUSPICION_AT = 0.5;

/** No suspicion is ever as sure as having seen it. */
export const CONCLUSION_CAP = 0.85;

/** The deeds that are a reason to look at somebody. */
const MOTIVES: ReadonlySet<EventType> = new Set<EventType>(['threaten', 'assault', 'theft']);

/**
 * Somebody who would look into a killing that is none of their business:
 * loyal, without malice, and of a people that takes killing seriously. Not a
 * trait of its own — a migration of `TRAITS` would move every seed — but
 * read from the ones there are.
 */
export function isJust(person: Person, norms: Norms | undefined): boolean {
  return person.traits.loyalty >= 0.6 && person.traits.malice <= 0.4 && (norms?.murder ?? 1) >= 1;
}

/** Whether `finder` sets out to learn who killed `dead`. */
export function wouldInvestigate(
  finder: Person, dead: Person, relationships: RelationshipGraph, norms: Norms | undefined
): boolean {
  if (finder.isChild || !finder.alive) return false;
  if (relationships.kinship(finder.id, dead.id) > 0) return true;
  if (finder.householdId !== null && finder.householdId === dead.householdId) return true;
  if (finder.bandId === dead.bandId) return true;
  if (relationships.peek(finder.id, dead.id) && relationships.opinion(finder.id, dead.id) > 25) return true;
  return isJust(finder, norms);
}

/**
 * Adds what `source` knows about who killed `dead` to `scores`. `told` is
 * whether it reaches the investigator by being asked (`TOLD`) or is their
 * own. Never names the dead or `exclude` — the investigator does not
 * suspect themselves, even when they should.
 */
export function weighEvidence(
  source: Person, dead: Person, diedTick: number, told: boolean,
  exclude: number, scores: Map<number, number>
): void {
  const factor = told ? TOLD : 1;
  const motives = new Map<number, number>();
  for (const memory of source.memory.all()) {
    if (memory.targetId !== dead.id || memory.actorId === dead.id || memory.actorId === exclude) continue;
    // Nobody informs on themselves: a killer asked about it says nothing.
    if (memory.actorId === source.id) continue;
    if (memory.type === 'murder') {
      scores.set(memory.actorId, (scores.get(memory.actorId) ?? 0) + WITNESSED * memory.confidence * factor);
    } else if (MOTIVES.has(memory.type)) {
      motives.set(memory.actorId, (motives.get(memory.actorId) ?? 0) + MOTIVE * memory.confidence);
    }
  }
  for (const [id, motive] of motives) {
    scores.set(id, (scores.get(id) ?? 0) + Math.min(MOTIVE_CAP, motive) * factor);
  }
  for (const [id, tick] of source.seenBloodied) {
    if (id === dead.id || id === exclude) continue;
    if (tick < diedTick - 60 || tick > diedTick + BLOODIED_TICKS) continue;
    scores.set(id, (scores.get(id) ?? 0) + BLOODIED * factor);
  }
}

/** The best-supported suspect and how sure, or null if nobody clears the bar. */
export function concludeFrom(scores: Map<number, number>): { suspectId: number; confidence: number } | null {
  let best: number | null = null;
  let bestScore = 0;
  for (const [id, score] of [...scores].sort((a, b) => a[0] - b[0])) {
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (best === null || bestScore < SUSPICION_AT) return null;
  return { suspectId: best, confidence: Math.min(CONCLUSION_CAP, bestScore) };
}

/**
 * Everybody in sight of somebody bloodied remembers seeing them so. Run on
 * the sighting cadence; cheap, because almost nobody is bloodied at once.
 */
export function noticeBloodied(
  people: readonly Person[],
  peopleHash: { queryRadius(x: number, y: number, r: number): Person[] },
  sightRadius: number,
  tick: number
): void {
  for (const marked of people) {
    if (!marked.alive || marked.bloodiedUntil < tick) continue;
    for (const onlooker of peopleHash.queryRadius(marked.x, marked.y, sightRadius)) {
      if (!onlooker.alive || onlooker.id === marked.id || onlooker.isChild) continue;
      onlooker.seenBloodied.set(marked.id, tick);
      // Forget what no investigation could still use.
      for (const [id, seen] of onlooker.seenBloodied) {
        if (tick - seen > BLOODIED_TICKS * (INVESTIGATION_DAYS + 1)) onlooker.seenBloodied.delete(id);
      }
    }
  }
}

/** An open investigation, held by the investigator. */
export interface OpenInvestigation {
  deadId: number;
  /** Where the body was found: where the questions are asked. */
  x: number;
  y: number;
  diedTick: number;
  /** When it is given up, unsolved. */
  untilTick: number;
  /** Who has been asked already, so nobody is asked twice. */
  asked: Set<number>;
}
