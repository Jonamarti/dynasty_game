/** Visual work phases only: looking at a worker must never advance their job. */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { ARRIVAL_RADIUS } from '../sim/systems/MovementSystem.ts';
import { ATTEND_POSES, BUILD_POSES, CHOP_POSES, CUT_GRASS_POSES, DIG_POSES, DYE_POSES, EXTRACT_POSES, FARM_POSES, FIGHT_POSES, FISH_POSES, GATHER_POSES, HIDE_DRESS_POSES, INSCRIBE_POSES, MAKE_POSES, MEND_POSES, PLANT_POSES, PONDER_POSES, PROTOTYPE_POSES, SPREAD_POSES, TEND_POSES, type ArtPose } from './ArtManifest.ts';
import { RECIPES } from '../sim/entities/Recipe.ts';
import { isStationFor } from '../sim/entities/Building.ts';
import { CUT_FLOOR } from '../sim/core/Grass.ts';
import { FEAST_SEAT } from '../sim/social/Feast.ts';

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
    if (!station?.complete || !isStationFor(station.def, recipe.station) || !station.contains(person.x, person.y)) return null;
  }
  return workFrame(MAKE_POSES, person.workedTicks, alpha);
}

/** Sowing and reaping share a low, hand-worked crop gesture. */
export function farmingPose(
  person: Person, sim: Pick<Simulation, 'buildingsById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || (person.action !== 'sow' && person.action !== 'reap') || person.workedTicks <= 0 || person.targetBuildingId === null) return null;
  const field = sim.buildingsById.get(person.targetBuildingId);
  if (!field?.complete || !field.crop || !field.contains(person.x, person.y)) return null;
  // Show the hand motion only while the crop's actual state supports this order.
  if (person.action === 'sow' ? !field.crop.isFallow : !field.crop.isRipe) return null;
  return workFrame(FARM_POSES, person.workedTicks, alpha);
}

/** Hammering is shown only on a reachable construction or repair with progress. */
export function buildingPose(
  person: Person, sim: Pick<Simulation, 'buildingsById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.action !== 'build' || person.workedTicks <= 0 || person.targetBuildingId === null) return null;
  const site = sim.buildingsById.get(person.targetBuildingId);
  if (!site || (site.contains(person.x, person.y) !== true &&
      !(site.def.station && person.distanceTo({ x: site.centerX, y: site.centerY }) <= ARRIVAL_RADIUS))) return null;
  // Earthworks are handed to dig/pile, and an unfinished site with missing
  // materials is a haul target rather than a builder's work surface.
  if (site.earth && (site.def.earthwork || !site.earthDone)) return null;
  const repairing = site.complete;
  if (repairing) {
    if (site.durability === null || site.durability >= site.def.workTicks) return null;
  } else if (!site.materialsReady || site.progress <= 0) return null;
  return workFrame(BUILD_POSES, person.workedTicks, alpha);
}

/** Sewing is shown only after the garment repair has entered real work. */
export function mendingPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  // ActionSystem sets actionTotal only after validating the physical garment,
  // repair method and supplies. The renderer observes that committed work
  // marker without inspecting another person's private inventory or target.
  if (moving || !person.alive || person.action !== 'mend_garment' || person.actionTimer <= 0 ||
      person.actionTotal <= 0 || person.workedTicks <= 0) return null;
  return workFrame(MEND_POSES, person.workedTicks, alpha);
}

/** Greasing a hide is shown only after the validated, banked treatment work starts. */
export function hideDressingPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  // The action marker is set after ownership, recipe and fat checks. The
  // renderer needs no access to the worker's inventory or garment target.
  if (moving || !person.alive || person.action !== 'dress_hide' || person.actionTimer <= 0 ||
      person.actionTotal <= 0 || person.workedTicks <= 0) return null;
  return workFrame(HIDE_DRESS_POSES, person.workedTicks, alpha);
}

/** Low sweeping motion only while cutting reachable grass into thatch. */
export function cuttingGrassPose(
  person: Person, sim: Pick<Simulation, 'world'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.action !== 'cut_grass' || person.actionTimer <= 0 || person.workedTicks <= 0 ||
      person.targetX === null || person.targetY === null) return null;
  const tx = Math.floor(person.targetX), ty = Math.floor(person.targetY);
  const dx = person.x - (tx + 0.5), dy = person.y - (ty + 0.5);
  // Keep the gesture tied to the actual tile the action is cutting. A high
  // target threshold would show a swing after a herd has already cropped it.
  if (Math.hypot(dx, dy) >= ARRIVAL_RADIUS || sim.world.grassAt(tx, ty) < CUT_FLOOR + 0.05) return null;
  return workFrame(CUT_GRASS_POSES, person.workedTicks, alpha);
}

/** Planting is a low hand-to-soil motion on the real, reached target tile. */
export function plantingPose(
  person: Person, sim: Pick<Simulation, 'world'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.action !== 'plant' || person.actionTimer <= 0 || person.workedTicks <= 0 ||
      person.targetX === null || person.targetY === null) return null;
  const tx = Math.floor(person.targetX), ty = Math.floor(person.targetY);
  const dx = person.x - (tx + 0.5), dy = person.y - (ty + 0.5);
  if (Math.hypot(dx, dy) >= ARRIVAL_RADIUS) return null;
  const biome = sim.world.biomeAt(tx, ty);
  if ((biome !== 'grass' && biome !== 'forest') || sim.world.depthDug(tx, ty) !== 0) return null;
  return workFrame(PLANT_POSES, person.workedTicks, alpha);
}

/** Spreading is shown only once real compost work has started on its field. */
export function spreadingCompostPose(
  person: Person, sim: Pick<Simulation, 'buildingsById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.action !== 'spread' || person.actionTimer <= 0 ||
      person.workedTicks <= 0 || person.targetBuildingId === null) return null;
  const field = sim.buildingsById.get(person.targetBuildingId);
  if (!field?.complete || !field.crop || !field.contains(person.x, person.y)) return null;
  return workFrame(SPREAD_POSES, person.workedTicks, alpha);
}

/** Dyeing is shown only during the validated, multi-tick pigment work. */
export function dyeingPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  // ActionSystem sets actionTotal and workedTicks after validating the owned
  // garment, knowledge and pigment. Presentation observes only that work marker.
  if (moving || !person.alive || person.action !== 'dye_garment' || person.actionTimer <= 0 ||
      person.actionTotal <= 0 || person.workedTicks <= 0) return null;
  return workFrame(DYE_POSES, person.workedTicks, alpha);
}

/** A guest sits only after reaching the public target point for the feast. */
export function attendingFeastPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  if (moving || !person.alive || person.action !== 'attend' || person.actionTicks <= 0 ||
      person.targetX === null || person.targetY === null) return null;
  if (Math.hypot(person.x - person.targetX, person.y - person.targetY) > FEAST_SEAT) return null;
  // `actionTicks` is the simulation clock for this wait. No host state is read.
  return workFrame(ATTEND_POSES, person.actionTicks, alpha);
}

/** The healer's hands move only after the real tending action has begun. */
export function tendingPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  // `workedTicks` advances only after ActionSystem has validated the patient,
  // knowledge and reach. Do not inspect the patient's private health or body.
  if (moving || !person.alive || person.action !== 'tend' || person.workedTicks <= 0) return null;
  return workFrame(TEND_POSES, person.workedTicks, alpha);
}

/** Quiet hand-to-chin motion while a real ponder order adds work. */
export function ponderingPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  // An idea and its target technology are private knowledge. `ponder` plus
  // workedTicks is the public action marker; never inspect ideas or targetTech.
  if (moving || !person.alive || person.action !== 'ponder' || person.workedTicks <= 0) return null;
  return workFrame(PONDER_POSES, person.workedTicks, alpha);
}

/** Open-ended reflection uses the same quiet hand-to-chin gesture as pondering. */
export function reflectingPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  // Reflection has no target or partner by design. Its own action and work
  // ticks are sufficient; the renderer must not infer a thought or idea.
  if (moving || !person.alive || person.action !== 'reflect' || person.workedTicks <= 0) return null;
  return workFrame(PONDER_POSES, person.workedTicks, alpha);
}

/** Generic assembly motion during validated work on any prototype. */
export function prototypingPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  // A prototype's design and materials are private. The public action marker
  // and work ticks are enough; do not inspect ideas, inventory or work banks.
  if (moving || !person.alive || person.action !== 'prototype' || person.workedTicks <= 0) return null;
  return workFrame(PROTOTYPE_POSES, person.workedTicks, alpha);
}

/** A real fight order shows a guarded wind-up, strike and recovery cycle. */
export function fightingPose(person: Person, moving: boolean, alpha = 1): ArtPose | null {
  // `attack` and its own action clock are public observations. Do not read the
  // quarry's condition or infer whether a blow will land.
  if (moving || !person.alive || person.action !== 'attack' || person.actionTimer <= 0 || person.actionTicks <= 0) return null;
  return workFrame(FIGHT_POSES, person.actionTicks, alpha);
}

/** Carving is visible only while this person adds work to a reached record. */
export function inscribingPose(
  person: Person, sim: Pick<Simulation, 'inscriptionsById'>,
  moving: boolean, alpha = 1,
): ArtPose | null {
  if (moving || !person.alive || person.action !== 'inscribe' || person.workedTicks <= 0 ||
      person.targetInscriptionId === null) return null;
  const record = sim.inscriptionsById.get(person.targetInscriptionId);
  if (!record || !record.unfinished || record.pending === null || record.progress <= 0) return null;
  if (person.distanceTo(record) >= ARRIVAL_RADIUS) return null;
  return workFrame(INSCRIBE_POSES, person.workedTicks, alpha);
}
