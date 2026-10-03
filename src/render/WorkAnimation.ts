/** Visual work phases only: looking at a worker must never advance their job. */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { ARRIVAL_RADIUS } from '../sim/systems/MovementSystem.ts';
import { DIG_POSES, GATHER_POSES, type ArtPose } from './ArtManifest.ts';

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

/** A digging gesture is shown only for real work at a reachable, valid tile. */
export function diggingPose(
  person: Person, sim: Pick<Simulation, 'world'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.action !== 'dig' || person.actionTimer <= 0 || person.workedTicks <= 0
    || person.targetX === null || person.targetY === null) return null;
  // World coordinates name the tile's south-west corner; valid walking targets
  // arrive within the centred aim square. The action stays `dig` while walking.
  const dx = person.x - (person.targetX + 0.5), dy = person.y - (person.targetY + 0.5);
  if (Math.hypot(dx, dy) >= ARRIVAL_RADIUS) return null;
  const biome = sim.world.biomeAt(Math.floor(person.targetX), Math.floor(person.targetY));
  if (biome === 'water' || biome === 'rock') return null;
  // Four strokes advance with work ticks and the bounded simulation fraction;
  // pausing the simulation therefore freezes the tool at the same point.
  const phase = Math.floor((person.workedTicks - 1 + Math.max(0, Math.min(1, alpha))) / 2) % DIG_POSES.length;
  return DIG_POSES[phase]!;
}
