/** Visual work phases only: looking at a worker must never advance their job. */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { ARRIVAL_RADIUS } from '../sim/systems/MovementSystem.ts';
import { GATHER_POSES, type ArtPose } from './ArtManifest.ts';

/** A forage order also covers clay and flint. Those need their own gestures. */
const HAND_GATHERED = new Set(['berries', 'sticks', 'reeds', 'wild_grain']);

export function gatheringPose(
  person: Person, sim: Pick<Simulation, 'nodesById' | 'treesById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.actionTimer <= 0 || person.workedTicks <= 0) return null;
  const target = (person.action === 'forage' || person.action === 'gather') && person.targetNodeId !== null
    ? sim.nodesById.get(person.targetNodeId)
    : person.action === 'pick' && person.targetTreeId !== null
      ? sim.treesById.get(person.targetTreeId) : null;
  if (!target || person.distanceTo(target) >= ARRIVAL_RADIUS) return null;
  if ('kind' in target) {
    if (target.depleted || !HAND_GATHERED.has(target.kind)) return null;
  } else if (!target.standing || target.fruit < 1) return null;
  // Two simulation ticks per pose. The accumulator's fraction freezes while
  // paused; wall time would keep picking even while the whole world stands still.
  const phase = Math.floor((person.workedTicks - 1 + Math.max(0, Math.min(1, alpha))) / 2) % 4;
  return GATHER_POSES[phase]!;
}
