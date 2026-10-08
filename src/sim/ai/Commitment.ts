import type { RNG } from '../core/RNG.ts';
import { DRIVES, type DriveId, type DrivePressures } from './Drives.ts';
import { ITEMS } from '../entities/Item.ts';
import type { Person } from '../entities/Person.ts';

/** Food carried by a person; shared by scorer and interruption policy. */
export function carriesEdibleFood(person: Pick<Person, 'inventory'>): boolean {
  return person.inventory.entries().some(([itemId, count]) => count > 0 && (ITEMS[itemId]?.nutrition ?? 0) > 0);
}

/** Variety changes what food is appealing; it never owns a trip by itself. */
export type CommitmentDrive = Exclude<DriveId, 'variety'>;

export interface ActionCommitment {
  action: string;
  drive: CommitmentDrive | null;
  /** Strongest need pressure when a non-need route was selected. */
  baselinePressure: number;
  /** Action-specific destination; an entity id survives movement of that entity. */
  goal: string;
}

export interface CommitmentTarget {
  targetX: number | null;
  targetY: number | null;
  targetNodeId: number | null;
  targetTreeId: number | null;
  targetAnimalId: number | null;
  targetBuildingId: number | null;
  targetPersonId: number | null;
  targetPileId: number | null;
  targetInscriptionId: number | null;
  targetRecipe: string | null;
  targetItemId: string | null;
  targetTech: string | null;
  targetSubjectId: number | null;
  targetCorpseId: number | null;
  fleeFromId: number | null;
}

const HUNGER_COMMIT_ACTIONS: readonly string[] = [
  ...DRIVES.hunger.readers, 'pickup', 'feed', 'give', 'bring_food',
];

export const COMMITMENT_DRIVES: readonly CommitmentDrive[] = [
  'hunger', 'thirst', 'rest', 'warmth', 'company', 'home', 'safety',
];

/** Stable identity for the selected errand; coordinates matter only for point goals. */
export function commitmentGoal(action: string, target: CommitmentTarget): string {
  const entityIds = [target.targetNodeId, target.targetTreeId, target.targetAnimalId,
    target.targetBuildingId, target.targetPersonId, target.targetPileId, target.targetInscriptionId,
    target.targetSubjectId, target.targetCorpseId, target.fleeFromId];
  const hasEntity = entityIds.some(id => id !== null);
  return JSON.stringify([action, entityIds, target.targetRecipe, target.targetItemId, target.targetTech,
    hasEntity ? null : [target.targetX, target.targetY]]);
}

/** Strongest need at/above entry pressure; close ties use the existing seeded choice stream. */
export function chooseCommitmentDrive(
  pressures: DrivePressures,
  entryPressure: number,
  tieMargin: number,
  rng: RNG,
  eligible: readonly CommitmentDrive[] = COMMITMENT_DRIVES,
): CommitmentDrive | null {
  let maximum = -Infinity;
  for (const drive of eligible) maximum = Math.max(maximum, pressures[drive]);
  if (maximum < entryPressure) return null;

  const tied = eligible.filter(drive => pressures[drive] >= entryPressure && maximum - pressures[drive] <= tieMargin);
  return tied.length === 1 ? tied[0]! : tied[Math.floor(rng.next() * tied.length)]!;
}

/** Authored action families are a starting point; the caller validates the actual target. */
export function actionsForDrive(drive: CommitmentDrive): readonly string[] {
  return drive === 'hunger' ? HUNGER_COMMIT_ACTIONS : DRIVES[drive].readers;
}

/** O(7) check used while travelling; no map search or scorer call. */
export function shouldBreakCommitment(
  commitment: Pick<ActionCommitment, 'drive' | 'baselinePressure'>,
  pressures: DrivePressures,
  entryPressure: number,
  breakMargin: number,
): boolean {
  let maximum = -Infinity;
  for (const drive of COMMITMENT_DRIVES) maximum = Math.max(maximum, pressures[drive]);
  if (commitment.drive === null) {
    const crossedEntry = commitment.baselinePressure < entryPressure && maximum >= entryPressure;
    return crossedEntry || maximum - commitment.baselinePressure >= breakMargin;
  }

  let otherMaximum = -Infinity;
  for (const drive of COMMITMENT_DRIVES) {
    if (drive !== commitment.drive) otherMaximum = Math.max(otherMaximum, pressures[drive]);
  }
  return otherMaximum - pressures[commitment.drive] >= breakMargin;
}
