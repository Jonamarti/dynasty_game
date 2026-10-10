/**
 * The contract between the art pipeline (`art/`, `tools/art/`) and the
 * renderer: what a manifest looks like and how a layer is named.
 *
 * M15 phase 17. Everything the game draws for a person, a building, an animal
 * or a held object is a PNG cell in a sheet under `public/art/`, produced once
 * by `npm run art:build` from the generators in `art/src/`. A manifest says
 * where each cell is. This file is imported by both sides so the *key format*
 * can only be written down once: the build names a cell with `personKey`, the
 * renderer looks it up with the same function.
 *
 * It has no DOM, no simulation state and no randomness, and lives in
 * `src/render/` only because the game needs to import it; nothing in
 * `src/sim/` may.
 */

export type ArtDir = 'S' | 'E' | 'N' | 'W';
export type ArtAge = 'infant' | 'child' | 'adolescent' | 'adult' | 'elder';
export type ArtSex = 'm' | 'f';
export type ArtPose = 'idle' | 'w0' | 'w1' | 'w2' | 'w3' | 'g0' | 'g1' | 'g2' | 'g3' | 'f0' | 'f1' | 'f2' | 'f3' | 'd0' | 'd1' | 'd2' | 'd3' | 'c0' | 'c1' | 'c2' | 'c3' | 'm0' | 'm1' | 'm2' | 'm3';

export const ART_AGES: readonly ArtAge[] = ['infant', 'child', 'adolescent', 'adult', 'elder'];
export const ART_SEXES: readonly ArtSex[] = ['m', 'f'];
/** West is the mirror of east: three drawings per pose, never four. */
export const ART_BAKED_DIRS: readonly Exclude<ArtDir, 'W'>[] = ['S', 'E', 'N'];
export const GATHER_POSES = ['g0', 'g1', 'g2', 'g3'] as const;
export const FISH_POSES = ['f0', 'f1', 'f2', 'f3'] as const;
export const DIG_POSES = ['d0', 'd1', 'd2', 'd3'] as const;
export const CHOP_POSES = ['c0', 'c1', 'c2', 'c3'] as const;
export const MAKE_POSES = ['m0', 'm1', 'm2', 'm3'] as const;
export const ART_POSES: readonly ArtPose[] = ['idle', 'w0', 'w1', 'w2', 'w3', ...GATHER_POSES, ...FISH_POSES, ...DIG_POSES, ...CHOP_POSES, ...MAKE_POSES];

/** One unique picture in a sheet: [sheet, x, y, w, h, ox, oy]. `ox`/`oy` say
 * where the trimmed picture sat inside its original 96 px cell. */
export type ArtCell = readonly [number, number, number, number, number, number, number];

export interface ArtManifest {
  version: 1;
  domain: 'people' | 'props' | 'buildings' | 'animals';
  /** Edge, in px, of the square cell every picture was drawn in. */
  cell: number;
  sheets: string[];
  cells: ArtCell[];
  /** Asset key → index into `cells`. Identical pictures share one cell. */
  keys: Record<string, number>;
  /** Domain-specific tables (anchors, draw order, tint slots). */
  meta: Record<string, unknown>;
}

/** Which colour a layer is multiplied by at draw time, or none. */
export type ArtTint = 'skin' | 'hair' | 'band' | null;

/** The variant suffix an arm-related layer carries while its wearer holds a baby. */
export const CARRY_SUFFIX = '+carry';

export const personKey = (
  slot: string, variant: string, age: ArtAge, sex: ArtSex, dir: Exclude<ArtDir, 'W'>, pose: ArtPose
): string => `p/${slot}/${variant}/${age}.${sex}/${dir}/${pose}`;

/** Where the body carries its anchors, per aspect and pose. */
export const anchorKey = (age: ArtAge, sex: ArtSex, dir: Exclude<ArtDir, 'W'>, pose: ArtPose, carry: boolean): string =>
  `${age}.${sex}/${dir}/${pose}${carry ? 'c' : ''}`;

export interface PersonAnchors {
  /** Right hand and left hand, in the 96 px cell of the body they belong to. */
  hr: readonly [number, number];
  hl: readonly [number, number];
  /** Whole pixels the upper body sits lower than in the idle drawing. */
  bob: number;
}
