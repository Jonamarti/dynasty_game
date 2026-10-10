/** Visual work phases only: looking at a worker must never advance their job. */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { ARRIVAL_RADIUS } from '../sim/systems/MovementSystem.ts';
import { CHOP_POSES, DIG_POSES, EXTRACT_POSES, FISH_POSES, GATHER_POSES, MAKE_POSES, type ArtPose } from './ArtManifest.ts';
import { RECIPES } from '../sim/entities/Recipe.ts';

/** Shared clock contract: two work ticks per frame, with a bounded accumulator. */
function workFrame(poses: readonly ArtPose[], workedTicks: number, alpha: number): ArtPose {
  const phase = Math.floor((workedTicks - 1 + Math.max(0, Math.min(1, alpha))) / 2) % poses.length;
  return poses[phase]!;
}

/** A forage order also covers clay and flint. Those need their own gestures. */
const HAND_GATHERED = new Set(['berries', 'sticks', 'reeds', 'wild_grain']);
const EXTRACTED = new Set(['flint', 'clay', 'copper_ore', 'tin_ore', 'iron_ore']);

export function gatheringPose(
  person: Person, sim: Pick<Simulation, 'nodesById' | 'treesById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  // Tool setup borrows the commitment timer but deliberately has no work
  // denominator. Old workedTicks from an earlier pull cannot turn it into work.
  if (moving || !person.alive || person.actionTimer <= 0 || person.actionTotal <= 0 || person.workedTicks <= 0) return null;
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
  return workFrame(GATHER_POSES, person.workedTicks, alpha);
}

/** Fishing has a low reaching pull, shown only at an active shallow-water shoal. */
export function fishingPose(
  person: Person, sim: Pick<Simulation, 'nodesById' | 'world'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || (person.action !== 'forage' && person.action !== 'gather') ||
      person.actionTimer <= 0 || person.actionTotal <= 0 || person.workedTicks <= 0 || person.targetNodeId === null) return null;
  const node = sim.nodesById.get(person.targetNodeId);
  if (!node || node.kind !== 'fish' || node.depleted || person.distanceTo(node) >= ARRIVAL_RADIUS ||
      !sim.world.isShallow(node.x, node.y)) return null;
  return workFrame(FISH_POSES, person.workedTicks, alpha);
}

/** Shared fracture-and-collect gesture for active flint, clay and ore pulls. */
export function extractionPose(
  person: Person, sim: Pick<Simulation, 'nodesById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || (person.action !== 'forage' && person.action !== 'gather') ||
      person.actionTimer <= 0 || person.actionTotal <= 0 || person.workedTicks <= 0 || person.targetNodeId === null) return null;
  const node = sim.nodesById.get(person.targetNodeId);
  if (!node || !EXTRACTED.has(node.kind) || node.depleted || person.distanceTo(node) >= ARRIVAL_RADIUS) return null;
  // `doHarvest` increments workedTicks only after its reach and knowledge gates;
  // presentation does not read the worker's private mining knowledge itself.
  return workFrame(EXTRACT_POSES, person.workedTicks, alpha);
}

/** A digging gesture is shown only for real work at a reachable, valid tile. */
export function diggingPose(
  person: Person, sim: Pick<Simulation, 'world'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || (person.action !== 'dig' && person.action !== 'dig_mud') || person.actionTimer <= 0 || person.workedTicks <= 0
    || person.targetX === null || person.targetY === null) return null;
  // World coordinates name the tile's south-west corner; valid walking targets
  // arrive within the centred aim square. The action stays `dig` while walking.
  const dx = person.x - (person.targetX + 0.5), dy = person.y - (person.targetY + 0.5);
  if (Math.hypot(dx, dy) >= ARRIVAL_RADIUS) return null;
  const biome = sim.world.biomeAt(Math.floor(person.targetX), Math.floor(person.targetY));
  if (biome === 'water' || biome === 'rock') return null;
  // Four strokes advance with work ticks and the bounded simulation fraction;
  // pausing the simulation therefore freezes the tool at the same point.
  return workFrame(DIG_POSES, person.workedTicks, alpha);
}

/** Felling banks progress on the trunk and has no repeated harvest countdown. */
export function choppingPose(
  person: Person, sim: Pick<Simulation, 'treesById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.action !== 'chop' || person.workedTicks <= 0 ||
      person.actionTimer > 0 || person.targetTreeId === null) return null;
  const tree = sim.treesById.get(person.targetTreeId);
  if (!tree?.standing || tree.chopProgress <= 0 || person.distanceTo(tree) >= ARRIVAL_RADIUS) return null;
  return workFrame(CHOP_POSES, person.workedTicks, alpha);
}

/** Generic hand manipulation while a valid recipe is actually being worked. */
export function craftingPose(
  person: Person, sim: Pick<Simulation, 'buildingsById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.action !== 'craft' || person.actionTimer <= 0 ||
      person.workedTicks <= 0 || person.targetRecipe === null) return null;
  const recipe = RECIPES[person.targetRecipe];
  // The executor owns knowledge/material checks. Presentation reads the
  // observed job, never a stranger's private knowledge or inventory to guess it.
  if (!recipe) return null;
  if (recipe.station !== undefined) {
    const station = person.targetBuildingId === null ? null : sim.buildingsById.get(person.targetBuildingId);
    if (!station?.complete || station.def.id !== recipe.station || !station.contains(person.x, person.y)) return null;
  }
  return workFrame(MAKE_POSES, person.workedTicks, alpha);
}
