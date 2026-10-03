/** Animal phases follow simulation events and drawn distance, never wall time. */
import type { Animal } from '../sim/entities/Animal.ts';
import type { Placed } from './Interpolator.ts';

export type AnimalPose = 'idle' | `w${0 | 1 | 2 | 3}` | `r${0 | 1 | 2 | 3}` | `e${0 | 1 | 2 | 3}` | `a${0 | 1 | 2 | 3}`;
export interface AnimalTrack { x: number; y: number; distance: number; east: boolean; movedAt: number; }

export function trackAnimal(track: AnimalTrack, at: Placed, time: number): boolean {
  const dx = at.x - track.x, dy = at.y - track.y;
  const distance = Math.hypot(dx, dy);
  if (distance > 0.0004) {
    if (Math.abs(dx) > 0.0004) track.east = dx > 0;
    track.distance += distance; track.movedAt = time;
  }
  track.x = at.x; track.y = at.y;
  return time - track.movedAt < 1;
}

export function animalPose(animal: Pick<Animal, 'alive' | 'lastMealAt' | 'lastAttackAt' | 'lastRunAt'>,
  tick: number, alpha: number, moving: boolean, distance: number): AnimalPose {
  if (!animal.alive) return 'idle';
  const time = tick + Math.max(0, Math.min(1, alpha));
  const attack = time - animal.lastAttackAt;
  // A strike can happen at the end of a chase. Its lunge takes priority over
  // the residual movement, and a successful kill's meal does not erase it.
  if (attack >= 0 && attack < 5) return `a${Math.min(3, Math.floor(attack / 1.25)) as 0 | 1 | 2 | 3}`;
  const phase = Math.floor(distance / 0.22) % 4 as 0 | 1 | 2 | 3;
  const run = time - animal.lastRunAt;
  if (moving && run >= 0 && run < 5) return `r${phase}`;
  // The killer receives its meal in the same tick as its strike. Showing the
  // meal afterwards avoids losing it entirely beneath the five-tick lunge.
  const mealStart = animal.lastMealAt + (animal.lastAttackAt === animal.lastMealAt ? 5 : 0);
  const meal = time - mealStart;
  if (meal >= 0 && meal < 5) return `e${Math.min(3, Math.floor(meal / 1.25)) as 0 | 1 | 2 | 3}`;
  return moving ? `w${phase}` : 'idle';
}
