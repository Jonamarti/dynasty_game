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
export type ArtPose = 'idle' | 'w0' | 'w1' | 'w2' | 'w3' | 'g0' | 'g1' | 'g2' | 'g3' | 'f0' | 'f1' | 'f2' | 'f3' | 'x0' | 'x1' | 'x2' | 'x3' | 'd0' | 'd1' | 'd2' | 'd3' | 'c0' | 'c1' | 'c2' | 'c3' | 'm0' | 'm1' | 'm2' | 'm3' | 'a0' | 'a1' | 'a2' | 'a3' | 'b0' | 'b1' | 'b2' | 'b3' | 'r0' | 'r1' | 'r2' | 'r3' | 'h0' | 'h1' | 'h2' | 'h3' | 'q0' | 'q1' | 'q2' | 'q3' | 'p0' | 'p1' | 'p2' | 'p3' | 's0' | 's1' | 's2' | 's3' | 'y0' | 'y1' | 'y2' | 'y3' | 'v0' | 'v1' | 'v2' | 'v3' | 'i0' | 'i1' | 'i2' | 'i3' | 't0' | 't1' | 't2' | 't3' | 'o0' | 'o1' | 'o2' | 'o3' | 'u0' | 'u1' | 'u2' | 'u3' | 'k0' | 'k1' | 'k2' | 'k3' | 'l0' | 'l1' | 'l2' | 'l3' | 'z0' | 'z1' | 'z2' | 'z3' | 'n0' | 'n1' | 'n2' | 'n3';

export const ART_AGES: readonly ArtAge[] = ['infant', 'child', 'adolescent', 'adult', 'elder'];
export const ART_SEXES: readonly ArtSex[] = ['m', 'f'];
/** West is the mirror of east: three drawings per pose, never four. */
export const ART_BAKED_DIRS: readonly Exclude<ArtDir, 'W'>[] = ['S', 'E', 'N'];
export const GATHER_POSES = ['g0', 'g1', 'g2', 'g3'] as const;
export const FISH_POSES = ['f0', 'f1', 'f2', 'f3'] as const;
export const EXTRACT_POSES = ['x0', 'x1', 'x2', 'x3'] as const;
export const DIG_POSES = ['d0', 'd1', 'd2', 'd3'] as const;
export const CHOP_POSES = ['c0', 'c1', 'c2', 'c3'] as const;
export const MAKE_POSES = ['m0', 'm1', 'm2', 'm3'] as const;
export const FARM_POSES = ['a0', 'a1', 'a2', 'a3'] as const;
export const BUILD_POSES = ['b0', 'b1', 'b2', 'b3'] as const;
export const MEND_POSES = ['r0', 'r1', 'r2', 'r3'] as const;
export const HIDE_DRESS_POSES = ['h0', 'h1', 'h2', 'h3'] as const;
export const CUT_GRASS_POSES = ['q0', 'q1', 'q2', 'q3'] as const;
export const PLANT_POSES = ['p0', 'p1', 'p2', 'p3'] as const;
export const SPREAD_POSES = ['s0', 's1', 's2', 's3'] as const;
export const DYE_POSES = ['y0', 'y1', 'y2', 'y3'] as const;
export const ATTEND_POSES = ['v0', 'v1', 'v2', 'v3'] as const;
export const INSCRIBE_POSES = ['i0', 'i1', 'i2', 'i3'] as const;
export const TEND_POSES = ['t0', 't1', 't2', 't3'] as const;
export const PONDER_POSES = ['o0', 'o1', 'o2', 'o3'] as const;
export const PROTOTYPE_POSES = ['u0', 'u1', 'u2', 'u3'] as const;
export const FIGHT_POSES = ['k0', 'k1', 'k2', 'k3'] as const;
export const TALK_POSES = ['l0', 'l1', 'l2', 'l3'] as const;
export const TAME_POSES = ['z0', 'z1', 'z2', 'z3'] as const;
export const SWIM_POSES = ['n0', 'n1', 'n2', 'n3'] as const;
export const ART_POSES: readonly ArtPose[] = ['idle', 'w0', 'w1', 'w2', 'w3', ...GATHER_POSES, ...FISH_POSES, ...EXTRACT_POSES, ...DIG_POSES, ...CHOP_POSES, ...MAKE_POSES, ...FARM_POSES, ...BUILD_POSES, ...MEND_POSES, ...HIDE_DRESS_POSES, ...CUT_GRASS_POSES, ...PLANT_POSES, ...SPREAD_POSES, ...DYE_POSES, ...ATTEND_POSES, ...INSCRIBE_POSES, ...TEND_POSES, ...PONDER_POSES, ...PROTOTYPE_POSES, ...FIGHT_POSES, ...TALK_POSES, ...TAME_POSES, ...SWIM_POSES];

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
