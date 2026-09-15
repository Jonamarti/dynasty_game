/**
 * What a face says, without any new simulation state.
 *
 * M9.5 phase 1 gives people faces, and a face has to read as *something* every
 * frame — which means an expression is either backed by a real field or it is a
 * panel quietly inventing a number the sim never held, the exact mistake
 * `workProgressOf` in `Progress.ts` exists to warn against. There is no mood,
 * happiness or stress field anywhere in `src/sim/`, and this phase adds none:
 * `expressionOf` is a pure read of state that already exists — needs, health,
 * who last hurt you, what keeps interrupting you, and who you are standing near
 * — so a face is a *view* of the simulation, not a second copy of it.
 *
 * A persistent, heritable `mood` that accumulates and decays is the obvious
 * next step and is deliberately not this: `TRAITS` and a hypothetical new
 * `Person` field are iterated by founding, inheritance, ageing and the
 * character-creation point budget, and that migration does not belong hiding
 * inside an art pass. This is the seam it would feed.
 */
import type { Person } from '../entities/Person.ts';
import { LETHAL_NEEDS, LATELY_ENOUGH } from '../entities/Person.ts';
import type { SpatialHash } from './SpatialHash.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';

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
