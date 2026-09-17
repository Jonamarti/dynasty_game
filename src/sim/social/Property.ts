/**
 * Whether somebody can use a structure without its owners stopping them.
 *
 * Ownership used to be a hard permission check copied through the scorer: a
 * foreign store simply did not exist to an NPC, while a player order bypassed
 * the rule entirely. Property is attention instead. A structure is always
 * physically usable; what protects it is a living member of the owning band
 * standing close enough to see what is happening.
 *
 * Kept pure because the scorer asks this for many buildings on every think.
 * The deed, telemetry and refusal belong at the point where use is attempted.
 */
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { Building } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';

export interface PropertyContext {
  peopleHash: SpatialHash<Person>;
  sightRadius: number;
}

export interface PropertyUse {
  /** True when no property offence exists in the first place. */
  ours: boolean;
  allowed: boolean;
  /** The nearest owner who can intervene, if there is one. */
  seen: Person | null;
  /** Player-facing explanation; callers still use a stable code for telemetry. */
  because: string;
}

export function mayUse(
  person: Person,
  building: Building,
  ctx: PropertyContext
): PropertyUse {
  if (building.ownerBandId === person.bandId) {
    return { ours: true, allowed: true, seen: null, because: 'it belongs to their band' };
  }

  const seen = ctx.peopleHash.findNearest(
    building.centerX,
    building.centerY,
    ctx.sightRadius,
    other => other.alive && other.id !== person.id && other.bandId === building.ownerBandId
  );
  if (seen) {
    return {
      allowed: false,
      ours: false,
      seen,
      because: seen.name + ' is close enough to see them',
    };
  }
  return {
    allowed: true,
    ours: false,
    seen: null,
    because: 'nobody from the owning band is watching',
  };
}
