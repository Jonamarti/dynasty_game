import type { Person } from '../entities/Person.ts';
import type { RelationshipGraph } from '../social/Relationships.ts';
import { knowledgeOfWorld } from '../social/Knowledge.ts';
import { neighbourComarca, type ComarcaEdge } from './ComarcaNeighbour.ts';

/** Reasons are ordered by the cost of staying, not by who can command. */
export type MigrationReason =
  | 'no_fresh_water'
  | 'sustained_hunger'
  | 'hostile_stronger_neighbour'
  | 'overpopulation'
  | 'exile';

export const MIGRATION_REASON_PRIORITY: readonly MigrationReason[] = [
  'no_fresh_water',
  'sustained_hunger',
  'hostile_stronger_neighbour',
  'overpopulation',
  'exile',
];

export interface LocalMigrationPressures {
  noFreshWater?: boolean;
  sustainedHunger?: boolean;
  hostileStrongerNeighbour?: boolean;
  overpopulation?: boolean;
  exile?: boolean;
}

/** Shared presence-to-reason mapping for AI and player proposals. */
export function chooseLocalMigrationReason(pressure: LocalMigrationPressures): MigrationReason | null {
  const present: MigrationReason[] = [];
  if (pressure.noFreshWater) present.push('no_fresh_water');
  if (pressure.sustainedHunger) present.push('sustained_hunger');
  if (pressure.hostileStrongerNeighbour) present.push('hostile_stronger_neighbour');
  if (pressure.overpopulation) present.push('overpopulation');
  if (pressure.exile) present.push('exile');
  return chooseMigrationReason(present);
}
/** The strongest present reason wins; input iteration order cannot change it. */
export function chooseMigrationReason(present: Iterable<MigrationReason>): MigrationReason | null {
  const reasons = new Set(present);
  return MIGRATION_REASON_PRIORITY.find(reason => reasons.has(reason)) ?? null;
}

export interface ComarcaFrame {
  mapWidth: number;
  mapHeight: number;
}

export interface MigrationDestination {
  direction: ComarcaEdge;
  cx: number;
  cy: number;
}

export interface ComarcaMigrationProposal {
  reason: MigrationReason;
  bandId: number;
  actorId: number;
  direction: ComarcaEdge;
  destination: { cx: number; cy: number };
  /** Actor plus the adults who consented and can safely make the crossing. */
  followerIds: readonly number[];
}

/** The geography callbacks are supplied by the one owning coordinator. */
export interface ComarcaMigrationContext {
  origin: { cx: number; cy: number };
  frame: ComarcaFrame | null;
  /** Sustainable one-person daily ration capacity, not a store count. */
  capacityRationsPerDay: number | null;
  /** Natural fresh water or an available well in the current comarca. */
  hasFreshWater: boolean;
  hostileStrongerNeighbour: (band: { id: number }) => boolean;
  /** Physical viability only; it cannot add an unknown destination. */
  canEnter?: (cx: number, cy: number, direction: ComarcaEdge) => boolean;
  onProposal: (proposal: ComarcaMigrationProposal) => void;
  /** Called only when no known viable destination is available. */
  onScoutNeeded?: (actorId: number, direction?: ComarcaEdge) => void;
}

/**
 * Adjacent destinations the proposing person actually knows. The geography
 * callback is only a viability gate; it cannot add an unknown destination.
 * In a classic world there is no frame and therefore no cross-comarca target.
 */
export function knownMigrationDestinations(
  proposer: Person,
  origin: { cx: number; cy: number },
  frame: ComarcaFrame | null,
  canEnter: (cx: number, cy: number, direction: ComarcaEdge) => boolean = () => true,
): MigrationDestination[] {
  if (!frame || !Number.isInteger(frame.mapWidth) || frame.mapWidth < 1 ||
      !Number.isInteger(frame.mapHeight) || frame.mapHeight < 1) return [];
  const lore = knowledgeOfWorld(proposer);
  const destinations: MigrationDestination[] = [];
  // This order is part of the deterministic tie-break when more than one
  // remembered neighbour can be entered.
  for (const direction of ['n', 'e', 's', 'w'] as const) {
    const neighbour = neighbourComarca(frame, origin.cx, origin.cy, direction);
    if (!neighbour || !lore.at(neighbour.cx, neighbour.cy)) continue;
    if (!canEnter(neighbour.cx, neighbour.cy, direction)) continue;
    destinations.push({ direction, ...neighbour });
  }
  return destinations;
}

/**
 * The first physically possible adjacent edge, without consulting geography
 * the scout does not know. The scout's observation is recorded only after the
 * coordinator completes the trip and return.
 */
export function scoutDirection(
  origin: { cx: number; cy: number },
  frame: ComarcaFrame | null,
  canEnter: (cx: number, cy: number, direction: ComarcaEdge) => boolean = () => true,
): ComarcaEdge | undefined {
  if (!frame || !Number.isInteger(frame.mapWidth) || frame.mapWidth < 1 ||
      !Number.isInteger(frame.mapHeight) || frame.mapHeight < 1) return undefined;
  for (const direction of ['n', 'e', 's', 'w'] as const) {
    const neighbour = neighbourComarca(frame, origin.cx, origin.cy, direction);
    if (neighbour && canEnter(neighbour.cx, neighbour.cy, direction)) return direction;
  }
  return undefined;
}

/**
 * How one adult votes on a band's migration proposal. The motive being
 * relieved contributes its own current or chronic pressure, while regard is
 * the same secondary route the existing camp-relocation vote uses.
 */
export function supportsMigration(
  proposer: Person,
  adult: Person,
  reason: MigrationReason,
  relationships: RelationshipGraph,
): boolean {
  if (adult.id === proposer.id) return true;
  const pressure = reason === 'no_fresh_water'
    ? Math.max(adult.chronic.thirst ?? 0, adult.needs.thirst / 100)
    : reason === 'sustained_hunger'
      ? Math.max(adult.chronic.hunger ?? 0, adult.needs.hunger / 100)
      : reason === 'hostile_stronger_neighbour'
        ? Math.max(adult.chronic.safety ?? 0, adult.chronic.hunger ?? 0, 0.14)
        : reason === 'overpopulation' || reason === 'exile'
          // The measured capacity/exile condition is itself the shared pressure;
          // agreement still depends on regard, so the fact cannot command a band.
          ? 0.14
          : Math.max(adult.chronic.hunger ?? 0, adult.chronic.safety ?? 0, 0.14);
  const regard = relationships.opinion(adult.id, proposer.id);
  return pressure >= 0.22 || (pressure >= 0.14 && regard >= 12);
}

export interface MigrationApproval {
  voterIds: readonly number[];
  supporterIds: readonly number[];
  approved: boolean;
}

/** Strict-majority approval shared by AI proposals and the player's propose verb. */
export function approveMigration(
  proposer: Person,
  members: readonly Person[],
  reason: MigrationReason,
  relationships: RelationshipGraph,
): MigrationApproval {
  const voters = members.filter(person => person.alive && !person.isChild && person.captiveOf === null);
  const supporterIds = voters.filter(person => supportsMigration(proposer, person, reason, relationships))
    .map(person => person.id);
  return {
    voterIds: voters.map(person => person.id),
    supporterIds,
    approved: voters.length > 0 && supporterIds.length * 2 > voters.length,
  };
}

/**
 * Whether someone may be asked to follow this leader across a comarca edge.
 * Physical safety is a hard gate except for the current need the migration
 * directly addresses; obedience is then resolved by the ordinary authority
 * roll performed by `command`.
 */
export function canFollowMigration(
  leader: Person,
  follower: Person,
  relationships: RelationshipGraph,
  reason?: MigrationReason,
): boolean {
  if (!leader.alive || !follower.alive || leader.id === follower.id ||
      leader.bandId !== follower.bandId || follower.isChild ||
      follower.captiveOf !== null || follower.order !== null) return false;
  if (follower.needs.hunger > 45 && reason !== 'sustained_hunger' ||
      follower.needs.thirst > 40 && reason !== 'no_fresh_water' ||
      follower.needs.cold > 45) return false;
  const tie = relationships.peek(follower.id, leader.id);
  if (!tie) return false;
  return tie.kinship > 0 || tie.romance > 0 || relationships.opinion(follower.id, leader.id) >= 10;
}


