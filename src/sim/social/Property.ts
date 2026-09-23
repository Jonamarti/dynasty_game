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
import type { BandRelations } from './BandRelations.ts';

export interface PropertyContext {
  peopleHash: SpatialHash<Person>;
  sightRadius: number;
  bandRelations: BandRelations;
}

/**
 * Standing at or above which two bands are close enough allies that a
 * member of one may as well be a member of the other for this question, M11
 * phase 7c. Marriage alone (`CROSS_BAND_MARRIAGE`, 15) does not reach it;
 * marriage plus a real pattern of trade, or several marriages, does — an
 * alliance this complete should be rare and earned, not the state two bands
 * fall into after one wedding.
 */
const ALLY_STANDING = 55;

export interface PropertyUse {
  /** True when no property offence exists in the first place. */
  ours: boolean;
  allowed: boolean;
  /** The nearest owner who can intervene, if there is one. */
  seen: Person | null;
  /**
   * Which of the four answers this is. M11 phase 13f: this used to be a
   * finished sentence, `seen.name + ' is close enough to see them'`, and
   * that sentence reached the screen twice — the store refusal and the radial
   * menu's greyed-out reason — carrying the real name of a stranger the
   * player had never met. This function is pure and cannot know who is
   * reading, so it no longer writes words at all; `explainPropertyUse` in
   * `Knowledge.ts` writes them for a named reader.
   */
  basis: 'own' | 'ally' | 'seen' | 'unseen';
}

export function mayUse(
  person: Person,
  building: Building,
  ctx: PropertyContext
): PropertyUse {
  if (building.ownerBandId === person.bandId) {
    return { ours: true, allowed: true, seen: null, basis: 'own' };
  }

  // M11 phase 7c: a band this close to your own is effectively your own for
  // this question. Property is protected by attention rather than
  // permission precisely so that a rival stays a rival until their own
  // deeds say otherwise (phase 4's whole point) — and an alliance this deep
  // is exactly such a deed, built from real marriages and real trade, not a
  // permission anybody switched on.
  if (ctx.bandRelations.standing(person.bandId, building.ownerBandId) >= ALLY_STANDING) {
    return { ours: true, allowed: true, seen: null, basis: 'ally' };
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
      basis: 'seen',
    };
  }
  return {
    allowed: true,
    ours: false,
    seen: null,
    basis: 'unseen',
  };
}
