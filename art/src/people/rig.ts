/**
 * A person, drawn as independent layers.
 *
 * `personLayers(spec)` draws one person once and hands back a list of layers
 * (`slot`, `variant`, svg). Each slot is a picture on its own: the legs, the
 * torso, the default loincloth, the arms, one garment, the hair. The build
 * calls it for every age, sex, direction and pose and for one variant of one
 * slot at a time, then de-duplicates the pictures by their text. At run time
 * the renderer stacks the slots in `SLOT_ORDER`, so a glove, a cloak and a tunic
 * never have to be drawn together and any combination is valid.
 *
 * **Colour slots.** Skin, hair and tribe colour are drawn in white and greys
 * and multiplied by the wearer's colour when the layer is composed, so ten
 * skin tones do not mean ten copies of every sheet. Everything else (garments,
 * eyes, blanket) is drawn in its final colour.
 *
 * All figures are drawn in a 96 px cell with the feet at y = 88, the same
 * frame `Sprites.ts` used before, so `hitRadiusOf` does not change.
 */
import type { ArtAge, ArtPose, ArtSex, PersonAnchors } from '../../../src/render/ArtManifest.ts';
import { at, ell, INK, lerp, limb, poly, shade, shape, smooth, stroke, type Pt } from '../lib/draw.ts';

export type FacingDir = 'S' | 'E' | 'N';
export type HairStyle = 'short' | 'long' | 'balding' | 'bald';
export type FaceExpr = 'neutral' | 'content' | 'warm' | 'stern' | 'frustrated' | 'angry' | 'afraid' | 'strained' | 'pained';

/** One garment per body region; every region is independent of the others. */
export interface Wear {
  hips?: 'hide_loincloth' | 'fibre_skirt';
  torso?: 'cape' | 'wrap' | 'tunic' | 'linen_tunic' | 'longtunic' | 'hide_armour' | 'fur_coat' | 'toggled_coat';
  legs?: 'trousers';
  feet?: 'boots' | 'wraps';
  hands?: 'gloves';
  head?: 'cap' | 'hood' | 'beads';
  cloak?: 'cloak' | 'wool_cloak';
}

export interface PersonSpec {
  age: ArtAge;
  sex: ArtSex;
  dir: FacingDir;
  pose: ArtPose;
  wear: Wear;
  /** Holding a baby in the arms. */
  carry: boolean;
  hair: HairStyle;
  beard: boolean;
  expr: FaceExpr;
  /**
   * M15 phase 19c: the belly of the last third of a pregnancy. Optional so the
   * specs written before it keep meaning what they meant; only women drawn
   * with it (`isWoman`) get anything, and only from the front and the side.
   */
  belly?: boolean;
}

export interface Layer { slot: string; variant: string; svg: string; }
export interface PersonOut { layers: Layer[]; anchors: PersonAnchors; }

/** Bottom to top, per facing. West is east flipped by the renderer. */
export const SLOT_ORDER: Record<FacingDir, readonly string[]> = {
  S: ['shadow', 'seat', 'cloak_back', 'hair_back', 'legs', 'trousers', 'feet', 'torso', 'loincloth', 'chestband', 'belly', 'torso_wear', 'belly_wear', 'cloak_front', 'baby', 'baby_skin',
    'arms', 'sleeves', 'held', 'hands', 'head_back', 'head', 'beard', 'face', 'hair', 'shine', 'head_wear'],
  N: ['shadow', 'seat', 'cloak_back', 'legs', 'trousers', 'feet', 'torso', 'loincloth', 'chestband', 'torso_wear', 'cloak_front',
    'arms', 'sleeves', 'held', 'hands', 'head_back', 'head', 'hair', 'shine', 'head_wear'],
  E: ['shadow', 'seat', 'arm_far', 'sleeve_far', 'hand_far', 'legs_far', 'trousers_far', 'feet_far', 'legs_near', 'trousers_near', 'feet_near',
    'cloak_back', 'hair_back', 'torso', 'loincloth', 'chestband', 'belly', 'torso_wear', 'belly_wear', 'cloak_front', 'baby', 'baby_skin',
    'arm_near', 'sleeve_near', 'held', 'hand_near', 'head_back', 'head', 'beard', 'face', 'hair', 'shine', 'head_wear'],
};

/** Which colour multiplies a slot when it is composed. */
export const SLOT_TINT: Record<string, 'skin' | 'hair' | 'band'> = {
  legs: 'skin', legs_far: 'skin', legs_near: 'skin', torso: 'skin', arms: 'skin', arm_far: 'skin', arm_near: 'skin', head: 'skin',
  hands: 'skin', hand_far: 'skin', hand_near: 'skin', baby_skin: 'skin', belly: 'skin',
  loincloth: 'band', chestband: 'band',
  hair: 'hair', hair_back: 'hair', beard: 'hair',
};

/** Slots whose picture changes while the wearer holds a baby. */
export const CARRY_SLOTS: ReadonlySet<string> = new Set([
  'arms', 'sleeves', 'hands', 'arm_far', 'sleeve_far', 'hand_far', 'arm_near', 'sleeve_near', 'hand_near', 'baby', 'baby_skin',
]);

// ------------------------------------------------------------------ colours
const REF = {
  skin: '#ffffff', skinD: '#cccccc', skinFar: '#dbdbdb', skinLine: '#5d4a3b',
  hair: '#ffffff', hairLine: '#8c8c8c', hairFar: '#d9d9d9',
  band: '#f2f2f2', bandD: '#b8b8b8', bandLine: '#797979', band2: '#ffffff',
};
const W = {
  fur: '#8d6c46', furL: '#b3906a', furLine: '#3a2716',
  hide: '#a4784c', hideD: '#7d5735', hideLine: '#3d2914',
  wool: '#b39264', woolD: '#8a6c44', woolLine: '#4a3822',
  leather: '#6f4b2c', leatherL: '#8d6239', trousers: '#a89070', gold: '#d9b04a', bone: '#e6dcc0',
  linen: '#d0bd87', linenLine: '#5b4a2d', linenD: '#9e8653',
};
const SWADDLE = '#d4c39a', SWADDLE_LINE = '#5a4a2c';
const BROW_INK = '#3a2a20', FACE_LINE = 'rgba(110,60,40,0.6)';

const BROW: Record<FaceExpr, number> = { strained: 1.2, pained: 1.4, afraid: 1.6, angry: -1.5, stern: -1, frustrated: -0.7, warm: 0.3, content: 0.2, neutral: 0 };
const MOUTH: Record<FaceExpr, number> = { warm: 1.5, content: 0.9, neutral: 0, frustrated: -0.6, stern: -0.5, afraid: -1, angry: -1.3, strained: -1.2, pained: -1.6 };

// ----------------------------------------------------------------- geometry
interface Geo {
  leg: number; torso: number; neck: number; hrx: number; hry: number; sh: number; wa: number; hp: number;
  limb: number; arm: number; gap: number; depth: number; stoop?: number; foot: number;
}
const BASE: Record<ArtAge, Omit<Geo, 'foot'>> = {
  adult:      { leg: 24, torso: 25,   neck: 4,   hrx: 9.4, hry: 10.4, sh: 11,   wa: 8,   hp: 8.6, limb: 5.6, arm: 23,   gap: 3.7, depth: 13 },
  adolescent: { leg: 21, torso: 21,   neck: 3.6, hrx: 9,   hry: 10,   sh: 9.2,  wa: 7,   hp: 7.6, limb: 5,   arm: 20,   gap: 3.3, depth: 11.5 },
  child:      { leg: 14, torso: 15,   neck: 2.6, hrx: 8.8, hry: 9.4,  sh: 7,    wa: 6.2, hp: 6.4, limb: 4.4, arm: 14,   gap: 2.9, depth: 10 },
  infant:     { leg: 9,  torso: 11.5, neck: 1.6, hrx: 8.2, hry: 8.6,  sh: 6,    wa: 6,   hp: 6,   limb: 4,   arm: 10.5, gap: 2.5, depth: 9.5 },
  elder:      { leg: 23, torso: 24,   neck: 3.6, hrx: 9.4, hry: 10.4, sh: 10.4, wa: 8.4, hp: 8.6, limb: 5.2, arm: 22,   gap: 3.7, depth: 13, stoop: 12 },
};
export const isWoman = (age: ArtAge, sex: ArtSex): boolean => sex === 'f' && age !== 'child' && age !== 'infant';

export function geometry(age: ArtAge, sex: ArtSex): Geo {
  const g: Geo = { ...BASE[age], foot: 88 };
  if (isWoman(age, sex)) {
    g.leg -= 1; g.torso -= 1; g.sh *= 0.86; g.wa *= 0.88; g.hp *= age === 'adolescent' ? 1.05 : 1.1;
    g.limb *= 0.9; g.arm -= 1.5; g.hrx *= 0.96; g.hry *= 0.96; g.depth *= 0.95;
  }
  return g;
}

/** Whole-pixel upper-body dip; gathering keeps its feet planted like idle. */
export const POSE_BOB: Record<ArtPose, number> = { idle: 0, w0: 0, w1: 1, w2: 0, w3: 1, g0: 0, g1: 1, g2: 2, g3: 1, f0: 0, f1: 0, f2: 0, f3: 0, x0: 0, x1: 0, x2: 0, x3: 0, d0: 0, d1: 0, d2: 0, d3: 0, c0: 0, c1: 0, c2: 0, c3: 0, m0: 1, m1: 2, m2: 1, m3: 0, a0: 1, a1: 2, a2: 1, a3: 0, b0: 0, b1: 1, b2: 0, b3: 1, r0: 0, r1: 0, r2: 0, r3: 0, h0: 0, h1: 0, h2: 0, h3: 0, q0: 0, q1: 1, q2: 1, q3: 0, p0: 0, p1: 0, p2: 0, p3: 0, s0: 1, s1: 2, s2: 1, s3: 0, y0: 0, y1: 1, y2: 1, y3: 0, v0: 0, v1: 1, v2: 1, v3: 0, i0: 1, i1: 2, i2: 1, i3: 0, t0: 0, t1: 0, t2: 1, t3: 0, o0: 0, o1: 1, o2: 0, o3: 1, u0: 0, u1: 1, u2: 0, u3: 1, k0: 0, k1: 0, k2: 1, k3: 0, l0: 0, l1: 1, l2: 1, l3: 0, z0: 0, z1: 1, z2: 1, z3: 0, n0: 0, n1: 1, n2: 0, n3: 1, e0: 0, e1: 0, e2: 0, e3: 0, j0: 0, j1: 0, j2: 0, j3: 0, H0: 0, H1: 1, H2: 0, H3: 0, L0: 0, N0: 0, N1: 0, N2: 0, N3: 0 };

const DIG_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: 0.4, handY: -0.3, elbowY: 0.05 }, { reach: 0.25, handY: -0.6, elbowY: -0.1 },
  { reach: 0.55, handY: 0.95, elbowY: 0.55 }, { reach: 0.4, handY: 0.35, elbowY: 0.5 },
];
const DIG_SIDE: readonly (readonly [number, number])[] = [[-38, 25], [-58, 5], [12, 48], [26, 68]];
// A horizontal axe swing: draw back, raise, strike and recover. The hand
// anchors carry the fitted tool through the same arc without moving the feet.
const CHOP_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: -0.3, handY: 0.35, elbowY: 0.1 }, { reach: 0.15, handY: -0.25, elbowY: -0.05 },
  { reach: 1.2, handY: 0.4, elbowY: 0.15 }, { reach: 0.6, handY: 0.65, elbowY: 0.4 },
];
const CHOP_SIDE: readonly (readonly [number, number])[] = [[-35, -65], [-65, -15], [80, 100], [40, 65]];
// A shallow-water pull reaches down, draws the catch in and resets. The
// planted stance keeps the animation from implying that the person is moving.
const FISH_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: 0.35, handY: 0.9, elbowY: 0.5 }, { reach: 1, handY: 1.15, elbowY: 0.65 },
  { reach: 0.8, handY: 0.65, elbowY: 0.45 }, { reach: 0.45, handY: 0.8, elbowY: 0.55 },
];
const FISH_SIDE: readonly (readonly [number, number])[] = [[28, 76], [55, 110], [10, 52], [24, 70]];
// A common fracture/collect cycle: set the hand tool, strike, lift material,
// then reset. Geology is selected by the node, so these poses remain generic.
const EXTRACT_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: -0.2, handY: 0.55, elbowY: 0.3 }, { reach: 0.2, handY: 0.1, elbowY: 0.05 },
  { reach: 1, handY: 0.6, elbowY: 0.35 }, { reach: 0.45, handY: 0.8, elbowY: 0.48 },
];
const EXTRACT_SIDE: readonly (readonly [number, number])[] = [[20, 50], [-28, -50], [58, 98], [36, 74]];
// Plant, press seed into the earth, reach for the next handful and reset.
// The crop work is low and deliberate; tools remain attached to the hand anchor.
const FARM_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: 0.4, handY: 0.78, elbowY: 0.53 }, { reach: 0.8, handY: 1.02, elbowY: 0.65 },
  { reach: 1, handY: 0.9, elbowY: 0.62 }, { reach: 0.48, handY: 0.73, elbowY: 0.48 },
];
const FARM_SIDE: readonly (readonly [number, number])[] = [[20, 62], [42, 82], [55, 100], [30, 68]];
// A low four-part sweep, with the feet planted like the other work cycles.
const CUT_GRASS_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: 0.2, handY: 0.95, elbowY: 0.62 }, { reach: 0.8, handY: 1.08, elbowY: 0.7 },
  { reach: 1.15, handY: 0.92, elbowY: 0.65 }, { reach: 0.45, handY: 0.82, elbowY: 0.57 },
];
const CUT_GRASS_SIDE: readonly (readonly [number, number])[] = [[24, 66], [48, 88], [70, 108], [30, 72]];
// Set the fruit in the soil, press it down, cover it, then withdraw the hand.
const PLANT_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: 0.18, handY: 2.05, elbowY: 1.1 }, { reach: 0.2, handY: 2.35, elbowY: 1.28 },
  { reach: 0.62, handY: 2.2, elbowY: 1.2 }, { reach: 0.28, handY: 1.85, elbowY: 0.98 },
];
const PLANT_SIDE: readonly (readonly [number, number])[] = [[58, 58], [76, 74], [66, 42], [42, 24]];
// Scoop compost low, fan it across the soil, then draw the hand back to load.
const SPREAD_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: 0.18, handY: 3.4, elbowY: 1.8 }, { reach: 1.1, handY: 4.4, elbowY: 2.3 },
  { reach: 1.5, handY: 4.8, elbowY: 2.5 }, { reach: 0.35, handY: 3.2, elbowY: 1.7 },
];
const SPREAD_SIDE: readonly (readonly [number, number])[] = [[15, 5], [20, 70], [42, 88], [12, 4]];
// One hand steadies the record while the other taps, lifts and resets the chisel.
const INSCRIBE_FRONT = [
  { rightX: 2.2, rightY: 1.2, leftX: 5.2, leftY: 1.05 },
  { rightX: 1.4, rightY: 1.0, leftX: 5.2, leftY: 1.05 },
  { rightX: 2.6, rightY: 0.8, leftX: 5.2, leftY: 1.05 },
  { rightX: 3.1, rightY: 1.12, leftX: 5.2, leftY: 1.05 },
] as const;
const INSCRIBE_SIDE: readonly (readonly [number, number])[] = [[30, 92], [18, 76], [45, 108], [35, 88]];
// Raise, strike the frame, drive the next blow and recover. Held tools follow
// the right-hand anchor so a mallet remains aligned through the whole cycle.
const BUILD_FRONT: readonly { reach: number; handY: number; elbowY: number }[] = [
  { reach: 0.1, handY: 0.28, elbowY: 0.05 }, { reach: 0.55, handY: -0.12, elbowY: -0.08 },
  { reach: 1.15, handY: 0.3, elbowY: 0.1 }, { reach: 0.45, handY: 0.58, elbowY: 0.35 },
];
const BUILD_SIDE: readonly (readonly [number, number])[] = [[-28, -50], [-52, -12], [68, 92], [32, 62]];
// Pinch the cloth between both hands, pass the needle through, then draw it
// snug. The tiny movements stay around the waist so the figure reads as sewing.
const MEND_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 2, rightY: 0.78, leftX: 3, leftY: 0.8 },
  { rightX: 1, rightY: 0.72, leftX: 3, leftY: 0.8 },
  { rightX: 3, rightY: 0.76, leftX: 2, leftY: 0.8 },
  { rightX: 4, rightY: 0.82, leftX: 3, leftY: 0.8 },
];
const MEND_SIDE: readonly (readonly [number, number])[] = [[28, 62], [18, 48], [42, 78], [24, 58]];
// Rub grease into a hide held in front of the body; wider hand travel than
// sewing makes the treatment read as working a whole surface, not stitching.
const HIDE_DRESS_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 7, rightY: 0.92, leftX: 3, leftY: 0.88 },
  { rightX: 1, rightY: 0.83, leftX: 6, leftY: 0.94 },
  { rightX: 6, rightY: 0.9, leftX: 1, leftY: 0.82 },
  { rightX: 3, rightY: 0.85, leftX: 5, leftY: 0.93 },
];
const HIDE_DRESS_SIDE: readonly (readonly [number, number])[] = [[35, 72], [20, 55], [48, 84], [28, 66]];
// Hold cloth at the waist with one hand and work pigment across it with the other.
const DYE_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 2, rightY: 0.82, leftX: 4, leftY: 0.82 },
  { rightX: 6, rightY: 0.78, leftX: 4, leftY: 0.82 },
  { rightX: 3, rightY: 0.76, leftX: 4, leftY: 0.82 },
  { rightX: 0, rightY: 0.83, leftX: 4, leftY: 0.82 },
];
const DYE_SIDE: readonly (readonly [number, number])[] = [[30, 72], [52, 104], [14, 48], [38, 88]];
// Guests sit with bent knees and hands resting together through a quiet feast cycle.
const ATTEND_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 2, rightY: 0.86, leftX: 3, leftY: 0.86 },
  { rightX: 5, rightY: 0.78, leftX: 2, leftY: 0.88 },
  { rightX: 3, rightY: 0.84, leftX: 5, leftY: 0.78 },
  { rightX: 2, rightY: 0.86, leftX: 3, leftY: 0.86 },
];
// The fourth feast frame intentionally returns to its first pose. Bench rest
// needs four visibly distinct frames, including when the person faces south.
const BENCH_REST_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 2, rightY: 0.86, leftX: 3, leftY: 0.86 },
  { rightX: 5, rightY: 0.78, leftX: 2, leftY: 0.88 },
  { rightX: 3, rightY: 0.84, leftX: 5, leftY: 0.78 },
  { rightX: 0, rightY: 0.9, leftX: 5, leftY: 0.82 },
];
const ATTEND_SIDE: readonly (readonly [number, number])[] = [[24, 64], [38, 82], [18, 52], [30, 70]];
// Nursing is a seated arm cycle; it draws no second, generic infant.
const NURSING_FRONT = [
  { rightX: 4, rightY: 0.88, leftX: 4, leftY: 0.86 },
  { rightX: 3, rightY: 0.76, leftX: 5, leftY: 0.82 },
  { rightX: 5, rightY: 0.8, leftX: 3, leftY: 0.76 },
  { rightX: 4, rightY: 0.86, leftX: 4, leftY: 0.9 },
] as const;
const NURSING_SIDE: readonly (readonly [number, number])[] = [[22, 62], [38, 78], [16, 54], [28, 68]];
// One hand steadies an injured arm while the other wraps the dressing around it.
// The small, symmetric reach avoids claiming which wound the healer treats.
const TEND_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 8, rightY: 0.34, leftX: 7, leftY: 0.72 },
  { rightX: 4, rightY: 0.58, leftX: 6, leftY: 0.84 },
  { rightX: 1, rightY: 0.92, leftX: 7, leftY: 0.56 },
  { rightX: 6, rightY: 0.78, leftX: 2, leftY: 0.8 },
];
const TEND_SIDE_NEAR: readonly (readonly [number, number])[] = [[20, 65], [60, 100], [95, 120], [35, 75]];
const TEND_SIDE_FAR: readonly (readonly [number, number])[] = [[-20, 20], [-5, 35], [5, 55], [-20, 20]];
// Generic assembly at mid-torso: join the hands, press a piece into place,
// inspect the fit, then return to the starting position. No design is shown.
const PROTOTYPE_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 4, rightY: 0.78, leftX: 4, leftY: 0.78 },
  { rightX: 2, rightY: 0.92, leftX: 5, leftY: 0.62 },
  { rightX: 5, rightY: 0.62, leftX: 2, leftY: 0.92 },
  { rightX: 4, rightY: 0.7, leftX: 4, leftY: 0.7 },
];
const PROTOTYPE_SIDE: readonly (readonly [number, number])[] = [[28, 62], [48, 88], [18, 50], [32, 68]];
// A generic thinking gesture: hand rises to chin, pauses, then lowers. No prop
// or pose detail identifies the private idea being considered.
const PONDER_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 6, rightY: 0.08, leftX: 6, leftY: 0.82 },
  { rightX: 4, rightY: -0.12, leftX: 6, leftY: 0.8 },
  { rightX: 2, rightY: -0.08, leftX: 5, leftY: 0.86 },
  { rightX: 5, rightY: 0.14, leftX: 7, leftY: 0.78 },
];
const PONDER_SIDE: readonly (readonly [number, number])[] = [[-12, 24], [-48, -28], [-52, -24], [-10, 26]];
// Guard, draw the fist back, drive a short punch and recover. Held weapons
// follow the striking hand anchor through the same compact cycle.
const FIGHT_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 6, rightY: 0.34, leftX: 5, leftY: 0.42 },
  { rightX: 8, rightY: 0.18, leftX: 5, leftY: 0.4 },
  { rightX: 13, rightY: 0.48, leftX: 5, leftY: 0.38 },
  { rightX: 7, rightY: 0.3, leftX: 5, leftY: 0.42 },
];
const FIGHT_SIDE: readonly (readonly [number, number])[] = [[-18, 28], [-42, -8], [28, 52], [-8, 35]];
// A hunter raises and steadies a weapon, takes aim, releases, and resets.
// The cycle stays generic across bows, spears and other carried hunting tools.
const HUNT_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 6, rightY: 0.72, leftX: 5, leftY: 0.76 },
  { rightX: 7, rightY: 0.48, leftX: 9, leftY: 0.56 },
  { rightX: 8, rightY: 0.5, leftX: 10, leftY: 0.52 },
  { rightX: 7, rightY: 0.86, leftX: 4, leftY: 0.8 },
];
const HUNT_SIDE: readonly (readonly [number, number])[] = [[18, 54], [-24, 10], [-12, 32], [22, 58]];
// Open hands carry a conversation outward, then return to a listening pose.
// All four gestures are generic and reveal no private relationship or topic.
const TALK_FRONT = [
  { rightX: 4, rightY: 0.76, leftX: 4, leftY: 0.8 },
  { rightX: 9, rightY: 0.48, leftX: 4, leftY: 0.78 },
  { rightX: 4, rightY: 0.78, leftX: 9, leftY: 0.48 },
  { rightX: 3, rightY: 0.82, leftX: 3, leftY: 0.84 },
] as const;
const TALK_SIDE: readonly (readonly [number, number])[] = [[22, 62], [10, 35], [38, 82], [28, 68]];
// Offer an open palm, hold it steady, let the hand soften, then draw it back.
// This is deliberately generic: the gesture does not imply what the animal
// knows, feels, or will choose.
const TAME_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 7, rightY: 0.82, leftX: 5, leftY: 0.9 },
  { rightX: 10, rightY: 0.86, leftX: 5, leftY: 0.9 },
  { rightX: 9, rightY: 0.92, leftX: 5, leftY: 0.9 },
  { rightX: 6, rightY: 0.84, leftX: 5, leftY: 0.9 },
];
const TAME_SIDE: readonly (readonly [number, number])[] = [[20, 58], [42, 78], [36, 68], [16, 50]];
// Alternating crawl strokes; the swimmer's legs stay in the existing moving
// cycle so the sprite changes only the arm action during real water movement.
const SWIM_FRONT: readonly { rightX: number; rightY: number; leftX: number; leftY: number }[] = [
  { rightX: 10, rightY: 0.62, leftX: 4, leftY: 0.22 },
  { rightX: 7, rightY: 0.2, leftX: 10, leftY: 0.62 },
  { rightX: 4, rightY: 0.22, leftX: 7, leftY: 0.2 },
  { rightX: 8, rightY: 0.6, leftX: 4, leftY: 0.22 },
];
const SWIM_SIDE_NEAR: readonly (readonly [number, number])[] = [[28, 70], [-8, 44], [12, 58], [52, 96]];
const SWIM_SIDE_FAR: readonly (readonly [number, number])[] = [[-18, 30], [22, 68], [-12, 36], [18, 56]];

function feastSeatFront(cx: number, hipY: number): string {
  const legs = shape(poly([[cx - 14, hipY + 6], [cx - 11, hipY + 6], [cx - 10, hipY + 20], [cx - 13, hipY + 20]]), W.hide, W.hideLine)
    + shape(poly([[cx + 11, hipY + 6], [cx + 14, hipY + 6], [cx + 13, hipY + 20], [cx + 10, hipY + 20]]), W.hide, W.hideLine);
  return legs + shape(poly([[cx - 17, hipY + 3], [cx + 17, hipY + 3], [cx + 15, hipY + 7], [cx - 15, hipY + 7]]), W.fur, W.hideLine);
}

function feastSeatSide(cx: number, hipY: number): string {
  return shape(poly([[cx - 13, hipY + 2], [cx + 9, hipY + 2], [cx + 9, hipY + 6], [cx - 13, hipY + 6]]), W.fur, W.hideLine)
    + shape(poly([[cx - 10, hipY + 5], [cx - 7, hipY + 5], [cx - 6, hipY + 19], [cx - 9, hipY + 19]]), W.hide, W.hideLine)
    + shape(poly([[cx + 5, hipY + 5], [cx + 8, hipY + 5], [cx + 7, hipY + 19], [cx + 4, hipY + 19]]), W.hide, W.hideLine);
}

function poseSwing(pose: ArtPose): { walk: boolean; f: number; sw: number } {
  if (!pose.startsWith('w')) return { walk: false, f: 0, sw: 0 };
  const f = Number(pose.slice(1));
  return { walk: true, f, sw: [0, 1, 0, -1][f]! };
}

function layoutOf(g: Geo, side: boolean): { hipY: number; sY: number; headCy: number } {
  const hipY = g.foot - g.leg;
  let sY = hipY - g.torso;
  let headCy = sY - g.neck - g.hry * 0.72;
  if (g.stoop && !side) { sY += 1.5; headCy += 3.2; }
  return { hipY, sY, headCy };
}

// ---------------------------------------------------------------- collector
class Sink {
  readonly layers: Layer[] = [];
  private n = 0;
  constructor(private readonly carry: boolean) {}
  id(): string { return 'c' + this.n++; }
  push(slot: string, variant: string, svg: string): void {
    if (!svg) return;
    const v = this.carry && CARRY_SLOTS.has(slot) ? variant + '+carry' : variant;
    this.layers.push({ slot, variant: v, svg });
  }
}

interface Pieces { [slot: string]: string; }
const add = (p: Pieces, slot: string, s: string): void => { p[slot] = (p[slot] ?? '') + s; };

// ------------------------------------------------------------------ garments
/** Trousers and the footwear below them, for one leg. */
function legWear(w: Wear, hip: Pt, knee: Pt, ank: Pt, g: Geo, near: boolean, footDX: number): { trousers: string; feet: string } {
  const k = near ? 1 : 0.86;
  let trousers = '', feet = '';
  if (w.legs) trousers = limb([hip, knee, lerp(knee, ank, 0.92)], g.limb + 1.7, shade(W.trousers, k), W.woolLine);
  if (w.feet === 'boots') {
    const a = lerp(knee, ank, 0.5);
    feet += limb([a, ank], g.limb + 2.6, shade(W.leather, k), W.hideLine);
    feet += ell(ank[0] + footDX, ank[1] + 0.5, g.limb * 0.95, g.limb * 0.46, shade(W.leatherL, k), W.hideLine);
    feet += stroke(`M${a[0] - g.limb * 0.8},${a[1]}L${a[0] + g.limb * 0.8},${a[1]}`, shade(W.fur, k), 1.8);
  } else if (w.feet === 'wraps') {
    for (const t of [0.5, 0.65, 0.8]) {
      const p = lerp(knee, ank, t);
      feet += stroke(`M${p[0] - g.limb * 0.75},${p[1] - 0.4}L${p[0] + g.limb * 0.75},${p[1] + 0.6}`, shade(W.hide, k), 1.7);
    }
    feet += ell(ank[0] + footDX, ank[1] + 0.5, g.limb * 0.8, g.limb * 0.4, shade(W.hide, k), W.hideLine);
  }
  return { trousers, feet };
}

function sleeveWear(w: Wear, s0: Pt, elbow: Pt, hand: Pt, g: Geo): string {
  if (w.torso === 'tunic') return limb([s0, lerp(s0, elbow, 0.92)], g.limb * 0.92 + 1.8, W.hide, W.hideLine);
  if (w.torso === 'linen_tunic') return limb([s0, lerp(s0, elbow, 0.92)], g.limb * 0.92 + 1.8, W.linen, W.linenLine);
  if (w.torso === 'longtunic') return limb([s0, elbow, lerp(elbow, hand, 0.8)], g.limb * 0.92 + 1.8, W.wool, W.woolLine);
  if (w.torso === 'fur_coat' || w.torso === 'toggled_coat') return limb([s0, elbow, lerp(elbow, hand, 0.8)], g.limb * 0.98 + 2, W.fur, W.furLine);
  return '';
}

/** The hand: bare skin (tinted) or a glove with its cuff. */
function handShape(gloves: boolean, hand: Pt, elbow: Pt, g: Geo, skin: string, line: string): string {
  if (!gloves) return ell(hand[0], hand[1], g.limb * 0.58, g.limb * 0.62, skin, line);
  return limb([lerp(elbow, hand, 0.7), lerp(elbow, hand, 0.95)], g.limb * 0.92 + 2, W.leather, W.hideLine)
    + ell(hand[0], hand[1], g.limb * 0.78, g.limb * 0.8, W.leatherL, W.hideLine);
}

interface FrontG { cx: number; sY: number; hipY: number; sh: number; wa: number; hp: number; T: number; g: Geo; }
function hideLoinclothFront(G: FrontG, back: boolean): string {
  const { cx, hipY, hp, g } = G, top = hipY - 1, hem = hipY + g.leg * (back ? 0.2 : 0.28);
  const shapePts: Pt[] = back
    ? [[cx - hp * 0.75, top], [cx + hp * 0.75, top], [cx + hp * 0.62, hem], [cx - hp * 0.62, hem]]
    : [[cx - hp * 0.68, top], [cx + hp * 0.68, top], [cx + hp * 0.58, hem], [cx + 1.5, hipY + 4], [cx - 1.5, hipY + 4], [cx - hp * 0.58, hem]];
  return shape(poly(shapePts), W.hide, W.hideLine)
    + stroke(`M${cx - hp * 0.72},${top}Q${cx},${top + 2} ${cx + hp * 0.72},${top}`, W.leatherL, 1.2)
    + stroke(`M${cx - hp * 0.48},${top + 2}L${cx - hp * 0.42},${hem - 1}M${cx + hp * 0.48},${top + 2}L${cx + hp * 0.42},${hem - 1}`, W.hideD, 0.8);
}

function hideLoinclothSide(G: SideG, swing: number): string {
  const { cx, d, hipY, g } = G, top = hipY - 1, hem = hipY + g.leg * 0.28;
  return shape(poly([[cx - d * 0.55, top], [cx + d * 0.28, top], [cx + d * 0.24 - swing * 0.35, hem], [cx - d * 0.46 - swing * 0.35, hem]]), W.hide, W.hideLine)
    + stroke(`M${cx - d * 0.55},${top}Q${cx - d * 0.1},${top + 1.6} ${cx + d * 0.28},${top}`, W.leatherL, 1.1)
    + stroke(`M${cx - d * 0.25},${top + 1.5}L${cx - d * 0.2 - swing * 0.2},${hem - 1}`, W.hideD, 0.8);
}

/** Plant fibres flare below the waist; the skirt owns its layer like hide does. */
function fibreSkirtFront(G: FrontG, back: boolean): string {
  const { cx, hipY, hp, g } = G, top = hipY - 1, hem = hipY + g.leg * (back ? 0.43 : 0.5);
  const width = hp * (back ? 1.18 : 1.35), hemWidth = width * 0.86;
  const points: Pt[] = back
    ? [[cx - width, top], [cx + width, top], [cx + hemWidth, hem], [cx, hem + 1], [cx - hemWidth, hem]]
    : [[cx - width, top], [cx + width, top], [cx + hemWidth, hem], [cx + width * 0.42, hem - 1], [cx, hem + 1], [cx - width * 0.42, hem - 1], [cx - hemWidth, hem]];
  return shape(poly(points), '#a89558', '#594728')
    + stroke(`M${cx - width},${top + 1}Q${cx},${top + 3} ${cx + width},${top + 1}`, '#d0bd87', 1.3)
    + stroke(`M${cx - width * 0.55},${top + 3}L${cx - hemWidth * 0.65},${hem - 2}M${cx},${top + 2}L${cx},${hem - 2}M${cx + width * 0.55},${top + 3}L${cx + hemWidth * 0.65},${hem - 2}`, '#796640', 0.8);
}

function fibreSkirtSide(G: SideG, swing: number): string {
  const { cx, d, hipY, g } = G, top = hipY - 1, hem = hipY + g.leg * 0.49;
  return shape(poly([[cx - d * 0.7, top], [cx + d * 0.38, top], [cx + d * 0.6 - swing * 0.35, hem], [cx - d * 0.75 - swing * 0.35, hem]]), '#a89558', '#594728')
    + stroke(`M${cx - d * 0.7},${top + 1}Q${cx - d * 0.1},${top + 2.5} ${cx + d * 0.38},${top + 1}`, '#d0bd87', 1.2)
    + stroke(`M${cx - d * 0.38},${top + 3}L${cx - d * 0.48 - swing * 0.2},${hem - 1}M${cx + d * 0.12},${top + 3}L${cx + d * 0.22 - swing * 0.25},${hem - 1}`, '#796640', 0.8);
}

function torsoWearFront(t: Wear['torso'], G: FrontG, back: boolean): string {
  const { cx, sY, hipY, sh, wa, hp, T, g } = G;
  const out: string[] = [];
  if (t === 'cape') {
    const y = sY + 8, n = 6, x0 = cx + sh + 4, x1 = cx - sh - 4;
    const pts: Pt[] = [[cx - 3.6, sY - 0.8], [cx + 3.6, sY - 0.8], [cx + sh + 3, sY + 2.4], [x0, y - 1]];
    for (let i = 1; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, y + (i % 2 ? 2.4 : -0.2)]);
    pts.push([x1, y - 1], [cx - sh - 3, sY + 2.4]);
    out.push(shape(poly(pts), W.fur, W.furLine));
    for (let i = 0; i < 4; i++) out.push(stroke(`M${cx - sh + i * sh * 0.55},${sY + 3}l1.2,2.4`, W.furL, 1));
  } else if (t === 'hide_armour') {
    const hem = hipY + g.leg * 0.12;
    out.push(shape(`M${cx - sh + 0.4},${sY + 1}L${cx - 3.2},${sY - 0.2}L${cx},${sY + 2.6}L${cx + 3.2},${sY - 0.2}L${cx + sh - 0.4},${sY + 1}L${cx + wa + 0.8},${sY + T * 0.62}L${cx + hp + 1.4},${hem}L${cx - hp - 1.4},${hem}L${cx - wa - 0.8},${sY + T * 0.62}Z`, W.hideD, W.hideLine));
    out.push(stroke(`M${cx - hp},${hipY - 0.5}L${cx + hp},${hipY - 0.5}`, W.leatherL, 1.4));
    if (!back) out.push(stroke(`M${cx - 3},${sY + 3}L${cx + 2},${sY + T * 0.55}M${cx + 3},${sY + 3}L${cx - 2},${sY + T * 0.55}`, W.hideLine, 1.1));
  } else if (t === 'wrap') {
    const hem = hipY + g.leg * 0.3, n = 5, xa = cx + hp + 1.8, xb = cx - hp - 1.8;
    const pts: Pt[] = [[cx - sh + 0.2, sY + 1.6], [cx - sh + 5.6, sY - 0.4], [cx + sh - 1.5, sY + T * 0.5], [xa, hem - 1]];
    for (let i = 1; i < n; i++) pts.push([xa + (xb - xa) * i / n, hem + (i % 2 ? 2 : -0.3)]);
    pts.push([xb, hem - 1], [cx - wa - 0.6, sY + T * 0.55]);
    out.push(shape(poly(pts), W.hide, W.hideLine));
    out.push(stroke(`M${cx - sh + 5.6},${sY + 0.4}L${cx + hp},${hem - 3}`, W.hideD, 1));
    out.push(ell(cx - wa * 0.4, sY + T * 0.7, 1.3, 0.9, W.hideD) + ell(cx + wa * 0.2, sY + T * 0.9, 1.1, 0.8, W.hideD));
  } else if (t === 'tunic' || t === 'linen_tunic' || t === 'longtunic' || t === 'fur_coat' || t === 'toggled_coat') {
    const fur = t === 'fur_coat' || t === 'toggled_coat', linen = t === 'linen_tunic', toggled = t === 'toggled_coat', long = t !== 'tunic' && !linen, hem = hipY + g.leg * (long ? 0.6 : 0.34);
    const fill = fur ? W.fur : linen ? W.linen : long ? W.wool : W.hide;
    const line = fur ? W.furLine : linen ? W.linenLine : long ? W.woolLine : W.hideLine;
    const dark = fur ? W.furL : linen ? W.linenD : long ? W.woolD : W.hideD;
    out.push(shape(`M${cx - sh + 0.4},${sY + 1}L${cx - 3.6},${sY - 0.2}Q${cx},${sY + (back ? 1.4 : 4.2)} ${cx + 3.6},${sY - 0.2}L${cx + sh - 0.4},${sY + 1}L${cx + wa + 1.2},${sY + T * 0.62}L${cx + hp + 2.6},${hem}L${cx - hp - 2.6},${hem}L${cx - wa - 1.2},${sY + T * 0.62}Z`, fill, line));
    out.push(stroke(`M${cx - hp - 2.4},${hem - 1.4}L${cx + hp + 2.4},${hem - 1.4}`, dark, 1.1));
    out.push(shape(poly([[cx - hp - 1.2, hipY - 2.2], [cx + hp + 1.2, hipY - 2.2], [cx + hp + 1.2, hipY + 0.6], [cx - hp - 1.2, hipY + 0.6]]), W.leather, W.hideLine));
    if (!back) out.push(ell(cx + hp * 0.75, hipY + 3.4, 2.4, 3, W.leatherL, W.hideLine));
    if (fur) for (let i = -2; i <= 2; i++) out.push(stroke(`M${cx + i * 2.2},${hem - 1}l0.7,1.8`, W.furL, 0.9));
    if (linen) for (const y of [sY + T * 0.30, sY + T * 0.52]) out.push(stroke(`M${cx - wa * 0.55},${y}L${cx + wa * 0.55},${y}`, '#eadba9', 0.7));
    if (toggled && !back) for (const y of [sY + T * 0.22, sY + T * 0.46, sY + T * 0.70]) out.push(ell(cx, y, 1.25, 1.5, W.bone, W.hideLine));
    if (toggled && back) out.push(stroke(`M${cx},${sY + T * 0.18}L${cx},${sY + T * 0.72}`, W.furL, 1));
  }
  return out.join('');
}

function cloakOverFront(G: FrontG, back: boolean, wool: boolean): string {
  const { cx, sY, hipY, sh, g } = G;
  const fill = wool ? W.wool : W.hide, line = wool ? W.woolLine : W.hideLine;
  const dark = wool ? W.woolD : W.hideD;
  if (back) {
    const y2 = hipY + g.leg * 0.55;
    return shape(poly([[cx - sh - 1, sY + 0.4], [cx + sh + 1, sY + 0.4], [cx + sh + 6, y2], [cx - sh - 6, y2]]), fill, line)
      + stroke(`M${cx},${sY + 3}L${cx},${y2 - 1.5}`, dark, 0.9);
  }
  return shape(`M${cx - sh - 2.4},${sY + 0.8}Q${cx},${sY + 5.4} ${cx + sh + 2.4},${sY + 0.8}L${cx + sh + 3},${sY + 5}Q${cx},${sY + 9.6} ${cx - sh - 3},${sY + 5}Z`, fill, line)
    + ell(cx, sY + 5.6, 1.7, 1.7, dark, line);
}

const cloakPanelFront = (G: FrontG, wool: boolean): string => {
  const { cx, sY, hipY, sh, g } = G;
  return shape(poly([[cx - sh - 1.5, sY + 1], [cx + sh + 1.5, sY + 1], [cx + sh + 7.5, hipY + g.leg * 0.5], [cx - sh - 7.5, hipY + g.leg * 0.5]]), shade(wool ? W.wool : W.hide, 0.8), wool ? W.woolLine : W.hideLine);
};

interface SideG { cx: number; d: number; sY: number; hipY: number; T: number; g: Geo; }

function torsoWearSide(t: Wear['torso'], G: SideG): string {
  const { cx, d, sY, hipY, T, g } = G;
  const out: string[] = [];
  if (t === 'cape') {
    out.push(shape(poly([[cx - d * 0.6, sY - 0.6], [cx + d * 0.5, sY - 0.6], [cx + d * 0.72, sY + 3], [cx + d * 0.66, sY + 8.6], [cx + d * 0.3, sY + 10.6], [cx, sY + 8.2], [cx - d * 0.35, sY + 10.4], [cx - d * 0.72, sY + 7]]), W.fur, W.furLine));
    out.push(stroke(`M${cx - d * 0.2},${sY + 3}l1,2.6M${cx + d * 0.2},${sY + 3}l1,2.6`, W.furL, 1));
  } else if (t === 'hide_armour') {
    const hem = hipY + g.leg * 0.12;
    out.push(shape(poly([[cx - d * 0.46, sY + 0.2], [cx + d * 0.34, sY - 0.2], [cx + d * 0.63, sY + T * 0.36], [cx + d * 0.48, hem], [cx - d * 0.48, hem], [cx - d * 0.6, sY + T * 0.36]]), W.hideD, W.hideLine));
    out.push(stroke(`M${cx - d * 0.35},${sY + T * 0.45}L${cx + d * 0.38},${sY + T * 0.45}`, W.leatherL, 1.2));
  } else if (t === 'wrap') {
    const hem = hipY + g.leg * 0.3;
    out.push(shape(poly([[cx - d * 0.45, sY + 0.2], [cx + d * 0.32, sY - 0.2], [cx + d * 0.6, sY + T * 0.4], [cx + d * 0.62, hem - 1], [cx + d * 0.3, hem + 2], [cx, hem - 0.4], [cx - d * 0.3, hem + 2], [cx - d * 0.66, hem - 1], [cx - d * 0.58, sY + T * 0.4]]), W.hide, W.hideLine));
  } else if (t === 'tunic' || t === 'linen_tunic' || t === 'longtunic' || t === 'fur_coat' || t === 'toggled_coat') {
    const fur = t === 'fur_coat' || t === 'toggled_coat', linen = t === 'linen_tunic', long = t !== 'tunic' && !linen, hem = hipY + g.leg * (long ? 0.6 : 0.34);
    const fill = fur ? W.fur : linen ? W.linen : long ? W.wool : W.hide;
    const line = fur ? W.furLine : linen ? W.linenLine : long ? W.woolLine : W.hideLine;
    const dark = fur ? W.furL : linen ? W.linenD : long ? W.woolD : W.hideD;
    out.push(shape(poly([[cx - d * 0.44, sY + 0.2], [cx + d * 0.32, sY - 0.2], [cx + d * 0.6, sY + T * 0.34], [cx + d * 0.56, hipY], [cx + d * 0.72, hem], [cx - d * 0.74, hem], [cx - d * 0.62, hipY], [cx - d * 0.56, sY + T * 0.3]]), fill, line));
    out.push(stroke(`M${cx - d * 0.72},${hem - 1.4}L${cx + d * 0.7},${hem - 1.4}`, dark, 1.1));
    out.push(shape(poly([[cx - d * 0.6, hipY - 2.2], [cx + d * 0.58, hipY - 2.2], [cx + d * 0.58, hipY + 0.6], [cx - d * 0.6, hipY + 0.6]]), W.leather, W.hideLine));
    out.push(ell(cx + d * 0.1, hipY + 3, 2.4, 3, W.leatherL, W.hideLine));
    if (linen) out.push(stroke(`M${cx - d * 0.28},${sY + T * 0.43}L${cx + d * 0.28},${sY + T * 0.43}`, '#eadba9', 0.7));
    if (t === 'toggled_coat') out.push(ell(cx + d * 0.02, sY + T * 0.42, 1.25, 1.5, W.bone, W.hideLine));
  }
  return out.join('');
}

const cloakOverSide = (G: SideG, wool: boolean): string => {
  const { cx, d, sY } = G;
  const fill = wool ? W.wool : W.hide, line = wool ? W.woolLine : W.hideLine;
  const dark = wool ? W.woolD : W.hideD;
  return shape(`M${cx - d * 0.6},${sY - 0.4}L${cx + d * 0.4},${sY - 0.2}L${cx + d * 0.5},${sY + 4}L${cx - d * 0.6},${sY + 5}Z`, fill, line)
    + ell(cx + d * 0.3, sY + 2.6, 1.6, 1.6, dark, line);
};
const cloakPanelSide = (G: SideG, sw: number, wool: boolean): string => {
  const { cx, d, sY, hipY, g } = G;
  return shape(poly([[cx - d * 0.3, sY + 1], [cx - d * 0.7, sY + 3], [cx - d * 1.5 + sw * 1.4, hipY + g.leg * 0.55], [cx - d * 0.5, hipY + g.leg * 0.6]]), shade(wool ? W.wool : W.hide, 0.82), wool ? W.woolLine : W.hideLine);
};

function hoodBackFront(g: Geo, cx: number, hy: number, sY: number): string {
  const R = g.hrx, H = g.hry;
  return shape(smooth([[cx, hy - H - 2.6], [cx + R + 3.4, hy - H * 0.35], [cx + R + 5, sY + 4], [cx, sY + 7], [cx - R - 5, sY + 4], [cx - R - 3.4, hy - H * 0.35]]), W.wool, W.woolLine);
}
function headWearFront(kind: Wear['head'], g: Geo, cx: number, hy: number, back: boolean): string {
  const R = g.hrx, H = g.hry;
  if (kind === 'beads') {
    let s = stroke(`M${cx - R - 1},${hy + 0.2}Q${cx},${hy + H * 0.8} ${cx + R + 1},${hy + 0.2}`, '#714f32', 1.5);
    for (let i = -3; i <= 3; i++) s += ell(cx + i * R / 3.2, hy + H * 0.42 - Math.abs(i) * 0.18, 1.35, 1.45, i % 2 ? '#d9c79a' : '#e8eee2', '#62523d');
    return s;
  }
  if (kind === 'cap') {
    let s = shape(`M${cx - R - 1},${hy + 0.4}A${R + 1},${H + 2.2} 0 0 1 ${cx + R + 1},${hy + 0.4}L${cx + R - 0.4},${hy - H * 0.2}Q${cx},${hy - H * 0.06 - (back ? 0 : 1.8)} ${cx - R + 0.4},${hy - H * 0.2}Z`, W.fur, W.furLine);
    for (let i = -3; i <= 3; i++) s += ell(cx + i * R / 3.1, hy - H * 0.2 + (i % 2 ? 0.8 : 0), 1.5, 1.2, W.furL);
    return s;
  }
  if (kind === 'hood') {
    if (back) return ell(cx, hy - 0.4, R + 2.4, H + 2.8, W.wool, W.woolLine) + stroke(`M${cx},${hy - H - 2}L${cx},${hy + H * 0.7}`, W.woolD, 0.9);
    const d = `M${cx - R - 1.2},${hy + 1}A${R + 1.2},${H + 1.2} 0 0 1 ${cx + R + 1.2},${hy + 1}`;
    return `<path d="${d}" fill="none" stroke="${W.woolLine}" stroke-width="4.6" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${W.wool}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return '';
}
function hoodBackSide(g: Geo, hx: number, hy: number, sY: number): string {
  const R = g.hrx, H = g.hry;
  return shape(smooth([[hx, hy - H - 2.8], [hx - R - 3.6, hy - H * 0.3], [hx - R - 4.4, sY + 4.5], [hx - R * 0.3, sY + 6.5], [hx + R * 0.3, hy + H * 0.7], [hx + R * 0.9, hy - H * 0.2]]), W.wool, W.woolLine);
}
function headWearSide(kind: Wear['head'], g: Geo, hx: number, hy: number): string {
  const R = g.hrx, H = g.hry;
  if (kind === 'beads') {
    let s = stroke(`M${hx + R * 0.9},${hy + H * 0.16}Q${hx},${hy + H * 0.88} ${hx - R},${hy + H * 0.14}`, '#714f32', 1.5);
    for (let i = 0; i < 5; i++) s += ell(hx + R * 0.78 - i * R * 0.42, hy + H * 0.35 + i * 0.05, 1.3, 1.4, i % 2 ? '#d9c79a' : '#e8eee2', '#62523d');
    return s;
  }
  if (kind === 'cap') {
    let s = shape(`M${hx + R * 0.86},${hy - H * 0.34}C${hx + R * 0.4},${hy - H - 3.6} ${hx - R - 1.6},${hy - H - 2.4} ${hx - R - 1.3},${hy + 1.2}L${hx - R * 0.15},${hy - H * 0.08}Q${hx + R * 0.35},${hy - H * 0.3} ${hx + R * 0.86},${hy - H * 0.34}Z`, W.fur, W.furLine);
    for (let i = 0; i < 4; i++) s += ell(hx + R * 0.7 - i * R * 0.42, hy - H * 0.22 + (i % 2 ? 0.7 : 0), 1.4, 1.1, W.furL);
    return s;
  }
  if (kind === 'hood') {
    const d = `M${hx + R * 0.92},${hy + H * 0.1}Q${hx + R * 0.3},${hy - H * 1.15} ${hx - R},${hy + H * 0.1}`;
    return `<path d="${d}" fill="none" stroke="${W.woolLine}" stroke-width="4.6" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${W.wool}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return '';
}

// -------------------------------------------------------------------- babies
function babyFrontPieces(G: FrontG): { blanket: string; skin: string } {
  const { cx, sY, T, g } = G, sc = g.torso / 25;
  const bx = cx - 0.5, by = sY + T * 0.62;
  let blanket = ell(bx, by, 5.4 * sc, 9.8 * sc, SWADDLE, SWADDLE_LINE, 22);
  blanket += stroke(`M${bx - 4.2 * sc},${by + 1 * sc}L${bx + 3.6 * sc},${by - 2.2 * sc}M${bx - 3.4 * sc},${by + 5 * sc}L${bx + 2.6 * sc},${by + 2.6 * sc}`, shade(SWADDLE, 0.8), 0.9);
  const hx = bx + 3.7 * sc, hy = by - 8.6 * sc;
  let skin = limb([[bx + 2.2 * sc, by - 3.6 * sc], [bx - 0.8 * sc, by - 6.6 * sc]], 1.9 * sc, REF.skin, REF.skinLine) + ell(bx - 1 * sc, by - 6.8 * sc, 1.5 * sc, 1.5 * sc, REF.skin, REF.skinLine);
  skin += limb([[bx - 2.6 * sc, by + 8.4 * sc], [bx - 4.6 * sc, by + 11 * sc]], 2 * sc, REF.skin, REF.skinLine) + limb([[bx - 0.4 * sc, by + 9.4 * sc], [bx - 1.4 * sc, by + 12.4 * sc]], 2 * sc, REF.skin, REF.skinLine);
  skin += ell(hx, hy, 3.7 * sc, 3.7 * sc, REF.skin, REF.skinLine);
  skin += stroke(`M${hx - 1.9 * sc},${hy + 0.2}q0.8,0.9 1.6,0M${hx + 0.4 * sc},${hy + 0.2}q0.8,0.9 1.6,0`, INK, 0.6);
  return { blanket, skin };
}
function babySidePieces(G: SideG): { blanket: string; skin: string } {
  const { cx, d, sY, T, g } = G, sc = g.torso / 25;
  const bx = cx + d * 0.66, by = sY + T * 0.56;
  let blanket = ell(bx, by, 5 * sc, 9.4 * sc, SWADDLE, SWADDLE_LINE, 30);
  blanket += stroke(`M${bx - 4 * sc},${by + 0.6 * sc}L${bx + 3.4 * sc},${by - 2.6 * sc}`, shade(SWADDLE, 0.8), 0.9);
  const hx = bx + 4.6 * sc, hy = by - 7.6 * sc;
  let skin = limb([[bx + 2.6 * sc, by - 3.4 * sc], [bx + 5.4 * sc, by - 5.2 * sc]], 1.9 * sc, REF.skin, REF.skinLine) + ell(bx + 5.8 * sc, by - 5.4 * sc, 1.5 * sc, 1.5 * sc, REF.skin, REF.skinLine);
  skin += limb([[bx - 3 * sc, by + 7.6 * sc], [bx - 5.4 * sc, by + 9.8 * sc]], 2 * sc, REF.skin, REF.skinLine) + limb([[bx - 0.8 * sc, by + 8.6 * sc], [bx - 2.4 * sc, by + 11.2 * sc]], 2 * sc, REF.skin, REF.skinLine);
  skin += ell(hx, hy, 3.6 * sc, 3.6 * sc, REF.skin, REF.skinLine);
  skin += stroke(`M${hx + 0.4 * sc},${hy + 0.2}q0.7,0.8 1.4,0`, INK, 0.6);
  return { blanket, skin };
}

// --------------------------------------------------------------------- belly
/**
 * The belly of the last third of a pregnancy (M15 phase 19c), as two pictures
 * that never show together: bare skin (`belly`, multiplied by the wearer's
 * skin) where nothing covers the abdomen, and the same bulge in the garment's
 * own colours (`belly_wear`) over a wrap or a tunic, which would otherwise lie
 * flat across it. Drawn above the garment and below the belt line, so the belt
 * stays visible under it. Not drawn from behind: a back does not show one.
 */
export const BELLY_COVERS: ReadonlySet<string> = new Set(['wrap', 'tunic', 'linen_tunic', 'longtunic', 'hide_armour', 'fur_coat', 'toggled_coat']);

function bellyFront(G: FrontG, fill: string, line: string, crease: string): string {
  const { cx, sY, wa, T } = G;
  const cy = sY + T * 0.65, rx = wa + 3.4, ry = T * 0.26;
  return ell(cx, cy, rx, ry, fill, line)
    + stroke(`M${cx - rx * 0.5},${cy + ry * 0.62}Q${cx},${cy + ry * 1.04} ${cx + rx * 0.62},${cy + ry * 0.5}`, crease, 0.9)
    + ell(cx, cy + ry * 0.12, 0.7, 0.9, crease);
}
function bellySide(G: SideG, fill: string, line: string, crease: string): string {
  const { cx, d, sY, T } = G;
  const bulge = smooth([
    [cx + d * 0.3, sY + T * 0.4], [cx + d * 0.78, sY + T * 0.5], [cx + d * 1.0, sY + T * 0.7],
    [cx + d * 0.8, sY + T * 0.9], [cx + d * 0.36, sY + T * 0.95], [cx - d * 0.1, sY + T * 0.86], [cx - d * 0.1, sY + T * 0.52],
  ]);
  return shape(bulge, fill, line)
    + stroke(`M${cx + d * 0.5},${sY + T * 0.86}Q${cx + d * 0.84},${sY + T * 0.82} ${cx + d * 0.94},${sY + T * 0.68}`, crease, 0.9);
}
const bellyGarment = (t: NonNullable<Wear['torso']>): [string, string, string] =>
  t === 'fur_coat' || t === 'toggled_coat' ? [W.fur, W.furLine, W.furL]
    : t === 'linen_tunic' ? [W.linen, W.linenLine, W.linenD]
    : t === 'longtunic' ? [W.wool, W.woolLine, W.woolD] : [W.hide, W.hideLine, W.hideD];

// ---------------------------------------------------------------- head parts
function faceFront(g: Geo, cx: number, hy: number, e: FaceExpr): string {
  const out: string[] = [];
  const ex = g.hrx * 0.4, ey = hy + 0.6;
  if (e === 'warm' || e === 'content') {
    out.push(ell(cx - ex - 0.8, ey + 3, 1.8, 1.1, 'rgba(214,92,80,0.28)'));
    out.push(ell(cx + ex + 0.8, ey + 3, 1.8, 1.1, 'rgba(214,92,80,0.28)'));
  }
  const er = e === 'afraid' ? [1.3, 1.7] : [1.05, 1.4];
  for (const s of [-1, 1]) {
    out.push(ell(cx + s * ex, ey, er[0]!, er[1]!, INK));
    out.push(ell(cx + s * ex + 0.35, ey - 0.45, 0.35, 0.35, '#ffffff88'));
    const by = ey - 2.9, raise = BROW[e];
    out.push(stroke(`M${cx + s * (ex + 1.9)},${by + raise * 0.3}L${cx + s * (ex - 1.6)},${by - raise}`, BROW_INK, 1.15));
  }
  out.push(stroke(`M${cx + 0.3},${hy + 1.9}Q${cx + 1.2},${hy + 3.9} ${cx - 0.6},${hy + 4.1}`, FACE_LINE, 0.9));
  const my = hy + g.hry * 0.56, curve = MOUTH[e];
  if (e === 'afraid') out.push(ell(cx, my + 0.3, 1.2, 1.5, INK));
  else out.push(stroke(`M${cx - 2.4},${my}Q${cx},${my + curve * 1.2} ${cx + 2.4},${my}`, INK, 1));
  return out.join('');
}
function beardFront(g: Geo, cx: number, hy: number): string {
  return shape(`M${cx - g.hrx + 0.4},${hy + 0.6}Q${cx - g.hrx + 0.6},${hy + g.hry + 1.6} ${cx},${hy + g.hry + 2.8}Q${cx + g.hrx - 0.6},${hy + g.hry + 1.6} ${cx + g.hrx - 0.4},${hy + 0.6}L${cx + g.hrx - 2.3},${hy + 2.4}Q${cx},${hy + 3.4} ${cx - g.hrx + 2.3},${hy + 2.4}Z`, REF.hair, REF.hairLine);
}
function hairFront(style: HairStyle, g: Geo, cx: number, hy: number, back: boolean, sY: number): { hair: string; shine: string } {
  const R = g.hrx, H = g.hry;
  const cap = `M${cx - R - 0.5},${hy + 1}A${R + 0.5},${H + 1.6} 0 0 1 ${cx + R + 0.5},${hy + 1}`;
  if (style === 'bald') return { hair: '', shine: ell(cx - R * 0.3, hy - H * 0.6, 2.4, 1.3, 'rgba(255,255,255,0.22)') };
  if (back) {
    if (style === 'balding') {
      return {
        hair: shape(`M${cx - R - 0.5},${hy - 1}Q${cx},${hy + 1.6} ${cx + R + 0.5},${hy - 1}L${cx + R - 0.3},${hy + H * 0.45}Q${cx},${hy + H * 0.95} ${cx - R + 0.3},${hy + H * 0.45}Z`, REF.hair, REF.hairLine),
        shine: ell(cx, hy - H * 0.45, 3, 1.6, 'rgba(255,255,255,0.18)'),
      };
    }
    if (style === 'long') return { hair: shape(`${cap}L${cx + R + 1.3},${sY + 9}Q${cx},${sY + 11.5} ${cx - R - 1.3},${sY + 9}Z`, REF.hair, REF.hairLine), shine: '' };
    return { hair: shape(`${cap}L${cx + R - 0.3},${hy + H * 0.45}Q${cx},${hy + H * 0.95} ${cx - R + 0.3},${hy + H * 0.45}Z`, REF.hair, REF.hairLine), shine: '' };
  }
  if (style === 'balding') {
    const tuft = (s: number): string => shape(`M${cx + s * (R + 0.6)},${hy + 1.6}L${cx + s * (R + 0.4)},${hy - 3.4}Q${cx + s * (R - 1.4)},${hy - 4.6} ${cx + s * (R - 1.7)},${hy - 2}L${cx + s * (R - 1.3)},${hy + 0.8}Z`, REF.hair, REF.hairLine);
    return { hair: tuft(-1) + tuft(1), shine: ell(cx - R * 0.3, hy - H * 0.55, 2.6, 1.4, 'rgba(255,255,255,0.22)') };
  }
  if (style === 'long') {
    return { hair: shape(`M${cx - R - 1},${hy + H * 0.72}L${cx - R - 1},${hy + 1}A${R + 1},${H + 1.8} 0 0 1 ${cx + R + 1},${hy + 1}L${cx + R + 1},${hy + H * 0.72}L${cx + R - 1.4},${hy + H * 0.45}L${cx + R - 1.5},${hy - H * 0.3}Q${cx + R * 0.35},${hy - H * 0.72} ${cx + 0.4},${hy - H * 0.74}Q${cx - R * 0.35},${hy - H * 0.72} ${cx - R + 1.5},${hy - H * 0.3}L${cx - R + 1.4},${hy + H * 0.45}Z`, REF.hair, REF.hairLine), shine: '' };
  }
  return { hair: shape(`${cap}L${cx + R - 1.2},${hy + 0.5}L${cx + R - 1.4},${hy - H * 0.32}Q${cx + R * 0.35},${hy - H * 0.66} ${cx},${hy - H * 0.46}Q${cx - R * 0.35},${hy - H * 0.66} ${cx - R + 1.4},${hy - H * 0.32}L${cx - R + 1.2},${hy + 0.5}Z`, REF.hair, REF.hairLine), shine: '' };
}
const longHairBackFront = (g: Geo, cx: number, hy: number, sY: number): string =>
  shape(`M${cx - g.hrx - 1.6},${hy - 1}L${cx - g.hrx - 1.2},${sY + 8}Q${cx},${sY + 10.5} ${cx + g.hrx + 1.2},${sY + 8}L${cx + g.hrx + 1.6},${hy - 1}Z`, REF.hairFar, REF.hairLine);
const longHairBackSide = (g: Geo, hx: number, hy: number, sY: number): string => {
  const R = g.hrx;
  return shape(`M${hx - R * 0.2},${hy - 2}L${hx - R - 0.8},${hy}L${hx - R - 1.6},${sY + 9}Q${hx - R * 0.5},${sY + 10.5} ${hx - R * 0.1},${sY + 6}Z`, REF.hairFar, REF.hairLine);
};

function headSideParts(spec: PersonSpec, g: Geo, hx: number, hy: number): { head: string; beard: string; face: string; hair: string; shine: string } {
  const R = g.hrx, H = g.hry, e = spec.expr, st = spec.hair;
  const rx = R * 0.93;
  let head = shape(`M${hx + rx - 1.2},${hy - 0.4}Q${hx + rx + 2.6},${hy + 2.6} ${hx + rx - 0.4},${hy + 3.8}Z`, REF.skin, REF.skinLine);
  head += ell(hx, hy, rx, H, REF.skin, REF.skinLine);
  head += `<path d="M${hx + rx - 1.4},${hy - 0.2}Q${hx + rx + 1.2},${hy + 2.4} ${hx + rx - 0.6},${hy + 3.4}" fill="${REF.skin}"/>`;
  head += ell(hx - R * 0.14, hy + 1.4, 1.6, 2.4, REF.skin, REF.skinLine);
  head += stroke(`M${hx - R * 0.1},${hy + 0.4}Q${hx - R * 0.26},${hy + 1.6} ${hx - R * 0.1},${hy + 2.6}`, REF.skinD, 0.7);
  const beard = shape(`M${hx - R * 0.08},${hy + 1.4}Q${hx - R * 0.12},${hy + H * 0.92} ${hx + R * 0.4},${hy + H + 2}Q${hx + R * 0.98},${hy + H + 1.4} ${hx + R * 0.92},${hy + H * 0.5}L${hx + R * 0.6},${hy + H * 0.38}Q${hx + R * 0.3},${hy + H * 0.3} ${hx + R * 0.1},${hy + 1.4}Z`, REF.hair, REF.hairLine);
  const f: string[] = [];
  if (e === 'warm' || e === 'content') f.push(ell(hx + R * 0.45, hy + 3.2, 1.8, 1.1, 'rgba(214,92,80,0.28)'));
  const ex = hx + R * 0.52, ey = hy + 0.6;
  f.push(ell(ex, ey, e === 'afraid' ? 1.15 : 0.9, e === 'afraid' ? 1.6 : 1.35, INK));
  const raise = BROW[e], by = ey - 2.9;
  f.push(stroke(`M${ex - 1.8},${by + raise * 0.3}L${ex + 1.5},${by - raise}`, BROW_INK, 1.15));
  const my = hy + H * 0.56, curve = MOUTH[e];
  if (e === 'afraid') f.push(ell(hx + R * 0.74, my + 0.3, 0.8, 1.3, INK));
  else f.push(stroke(`M${hx + R * 0.5},${my - curve * 0.35}Q${hx + R * 0.66},${my + curve * 0.35} ${hx + R * 0.86},${my}`, INK, 1));

  const F: Pt = [hx + R * 0.6, hy - H * 0.6];
  const nape = `C${hx - R - 0.7},${hy + H * 0.5} ${hx - R * 0.6},${hy + H * 0.8} ${hx - R * 0.35},${hy + H * 0.72}`;
  const back = `L${hx - R * 0.1},${hy + H * 0.1}Q${hx + R * 0.1},${hy - H * 0.3} ${hx + R * 0.35},${hy - H * 0.2}Q${hx + R * 0.5},${hy - H * 0.45} ${F[0]},${F[1]}Z`;
  const over = `M${F[0]},${F[1]}C${hx + R * 0.2},${hy - H - 4} ${hx - R - 1.2},${hy - H - 2.5} ${hx - R - 0.9},${hy + 0.5}`;
  let hair = '', shine = '';
  if (st === 'bald') shine = ell(hx - R * 0.1, hy - H * 0.62, 2.6, 1.3, 'rgba(255,255,255,0.22)');
  else if (st === 'balding') {
    hair = shape(`M${hx - R * 0.1},${hy - 1.2}Q${hx - R - 1},${hy - 3.4} ${hx - R - 0.9},${hy + 0.5}${nape}L${hx - R * 0.1},${hy + H * 0.1}Z`, REF.hair, REF.hairLine);
    shine = ell(hx - R * 0.05, hy - H * 0.6, 2.8, 1.4, 'rgba(255,255,255,0.22)');
  } else hair = shape(over + nape + back, REF.hair, REF.hairLine);
  return { head, beard, face: f.join(''), hair, shine };
}

// ---------------------------------------------------------------------- main
const rotatePt = (p: Pt, deg: number, c: Pt): Pt => {
  const a = (deg * Math.PI) / 180, dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** Draw one person once, as layers. Pure: the same spec gives the same text. */
export function personLayers(spec: PersonSpec): PersonOut {
  const out = spec.dir === 'E' ? sideLayers(spec) : frontLayers(spec, spec.dir === 'N');
  if (!spec.pose.startsWith('e') && spec.pose !== 'L0') return out;

  // The simulation's sleep order is long and stationary once it reaches its
  // surface. Rotate the generated layers as one body so the same clothing,
  // carried items and colour layers lie together without a second art rig.
  // Tiny angle changes make the four clock frames breathe without moving the
  // person's world position or changing the picking radius.
  const angle = spec.pose === 'L0' ? 90 : [88.5, 89.5, 90.5, 91.5][Number(spec.pose.slice(1))]!;
  const radians = angle * Math.PI / 180;
  const rotate = (p: readonly [number, number]): readonly [number, number] => {
    const dx = p[0] - 48, dy = p[1] - 48;
    return [48 + dx * Math.cos(radians) - dy * Math.sin(radians),
      48 + dx * Math.sin(radians) + dy * Math.cos(radians)];
  };
  return {
    layers: out.layers.map(layer => ({ ...layer, svg: `<g transform="rotate(${angle} 48 48)">${layer.svg}</g>` })),
    anchors: { ...out.anchors, hr: rotate(out.anchors.hr), hl: rotate(out.anchors.hl) },
  };
}

function frontLayers(spec: PersonSpec, back: boolean): PersonOut {
  const g = geometry(spec.age, spec.sex), w = spec.wear;
  const { sw, walk, f } = poseSwing(spec.pose);
  const { hipY, sY, headCy } = layoutOf(g, false);
  const cx = 48;
  const sink = new Sink(spec.carry);
  const P: Pieces = {};
  const woman = isWoman(spec.age, spec.sex);
  const skin = REF.skin, line = REF.skinLine;
  const sitting = spec.pose.startsWith('v') || spec.pose.startsWith('j') || spec.pose.startsWith('N');

  add(P, 'shadow', ell(cx, g.foot + 0.6, g.sh + 1.5, 3, 'rgba(0,0,0,0.26)'));
  if (spec.pose.startsWith('v')) add(P, 'seat', feastSeatFront(cx, hipY));
  const T = g.torso, sh = g.sh, wa = g.wa, hp = g.hp;
  const G: FrontG = { cx, sY, hipY, sh, wa, hp, T, g };
  if (w.cloak) add(P, 'cloak_back', cloakPanelFront(G, w.cloak === 'wool_cloak'));
  if (!back && spec.hair === 'long') add(P, 'hair_back', longHairBackFront(g, cx, headCy, sY));

  // Legs.
  const lx = cx - g.gap, rx = cx + g.gap;
  let lf = g.foot - 0.4, rf = g.foot - 0.4, lxo = 0, rxo = 0;
  if (sitting) { lf = rf = g.foot - 8; lxo = -3; rxo = 3; }
  if (sw === 1) { lf += 0.6; rf -= 2.6; lxo = -0.6; }
  if (sw === -1) { rf += 0.6; lf -= 2.6; rxo = 0.6; }
  if (walk && sw === 0) { if (f === 0) lf -= 1.4; else rf -= 1.4; }
  if (sitting) {
    add(P, 'legs', limb([[lx, hipY - 2], [lx - 4, hipY + 5], [lx + lxo - 0.3, lf]], g.limb, skin, line));
    add(P, 'legs', limb([[rx, hipY - 2], [rx + 4, hipY + 5], [rx + rxo + 0.3, rf]], g.limb, skin, line));
  } else {
    add(P, 'legs', limb([[lx, hipY - 2], [lx + lxo - 0.3, lf]], g.limb, skin, line));
    add(P, 'legs', limb([[rx, hipY - 2], [rx + rxo + 0.3, rf]], g.limb, skin, line));
  }
  add(P, 'legs', ell(lx + lxo - 0.5, lf + 0.4, g.limb * 0.62, g.limb * 0.34, REF.skinD, line));
  add(P, 'legs', ell(rx + rxo + 0.5, rf + 0.4, g.limb * 0.62, g.limb * 0.34, REF.skinD, line));
  for (const [x0, xo, ft, dx] of [[lx, lxo, lf, -0.3], [rx, rxo, rf, 0.3]] as const) {
    const lw = legWear(w, [x0, hipY - 2], [x0 + xo / 2, (hipY + ft) / 2], [x0 + xo + dx, ft], g, true, 0);
    add(P, 'trousers', lw.trousers);
    add(P, 'feet', lw.feet);
  }

  // Neck, torso.
  add(P, 'torso', limb([[cx, headCy + 3], [cx, sY + 2]], g.limb * 1.05, REF.skinD, line));
  const torsoD = smooth([
    [cx - sh, sY + 2.4], [cx - sh + 2.4, sY], [cx + sh - 2.4, sY], [cx + sh, sY + 2.4],
    [cx + wa + 0.4, sY + T * 0.62], [cx + hp, hipY], [cx + hp - 1.2, hipY + 1.8],
    [cx - hp + 1.2, hipY + 1.8], [cx - hp, hipY], [cx - wa - 0.4, sY + T * 0.62],
  ]);
  const clip = sink.id();
  const clipDef = `<clipPath id="${clip}"><path d="${torsoD}"/></clipPath>`;
  add(P, 'torso', clipDef + shape(torsoD, skin, line));
  add(P, 'torso', `<g clip-path="url(#${clip})"><path d="M${cx + sh * 0.35},${sY - 2}L${cx + sh + 3},${sY - 2}L${cx + hp + 3},${hipY + 3}L${cx + hp * 0.3},${hipY + 3}Z" fill="rgba(60,30,10,0.12)"/></g>`);
  if (!back && spec.age !== 'infant' && spec.age !== 'child' && !woman) {
    add(P, 'torso', stroke(`M${cx - sh * 0.62},${sY + T * 0.34}Q${cx - sh * 0.3},${sY + T * 0.42} ${cx - 0.6},${sY + T * 0.33}`, REF.skinD, 0.9));
    add(P, 'torso', stroke(`M${cx + sh * 0.62},${sY + T * 0.34}Q${cx + sh * 0.3},${sY + T * 0.42} ${cx + 0.6},${sY + T * 0.33}`, REF.skinD, 0.9));
  }
  if (!back) add(P, 'torso', ell(cx, sY + T * 0.74, 0.7, 0.9, REF.skinD));

  // A hip garment supplies its own layer; the empty hips variant retains
  // the existing tribe-colour appearance.
  const cl = REF.band, cl2 = REF.band2, clD = REF.bandD, clLine = REF.bandLine;
  if (w.hips) add(P, 'loincloth', w.hips === 'fibre_skirt' ? fibreSkirtFront(G, back) : hideLoinclothFront(G, back));
  else {
    add(P, 'loincloth', clipDef);
    add(P, 'loincloth', shape(poly([[cx - g.gap - g.limb * 0.6, hipY - 0.5], [cx + g.gap + g.limb * 0.6, hipY - 0.5], [cx + 1.5, hipY + 5], [cx - 1.5, hipY + 5]]), clD, clLine));
    add(P, 'loincloth', `<g clip-path="url(#${clip})"><rect x="${cx - sh - 4}" y="${hipY - 2.8}" width="${2 * sh + 8}" height="3" fill="${clD}"/></g>`);
    add(P, 'loincloth', `<path d="${torsoD}" fill="none" stroke="${line}" stroke-width="2.1" stroke-linejoin="round" clip-path="url(#${clip})"/>`);
    if (!back) {
      const fl = g.hp * 0.55, drop = g.leg * 0.36;
      add(P, 'loincloth', shape(poly([[cx - fl, hipY - 0.2], [cx + fl, hipY - 0.2], [cx + fl * 0.85, hipY + drop], [cx + fl * 0.2, hipY + drop - 0.9], [cx - fl * 0.3, hipY + drop + 0.3], [cx - fl * 0.85, hipY + drop - 0.6]]), cl, clLine));
    } else {
      const fl = g.hp * 0.8, drop = g.leg * 0.25;
      add(P, 'loincloth', shape(poly([[cx - fl, hipY - 0.2], [cx + fl, hipY - 0.2], [cx + fl * 0.8, hipY + drop], [cx - fl * 0.8, hipY + drop]]), cl, clLine));
    }
  }
  // Chest band.
  if (woman) {
    const top = sY + 3.8, bot = sY + (back ? 8.4 : 9.6);
    const d = back
      ? `M${cx - sh - 4},${top}L${cx + sh + 4},${top}L${cx + sh + 4},${bot}L${cx - sh - 4},${bot}Z`
      : `M${cx - sh - 4},${top}L${cx + sh + 4},${top}L${cx + sh + 4},${bot}Q${cx},${bot + 2.6} ${cx - sh - 4},${bot}Z`;
    add(P, 'chestband', clipDef);
    add(P, 'chestband', `<g clip-path="url(#${clip})"><path d="${d}" fill="${cl2}"/>${stroke(`M${cx - sh - 4},${bot}${back ? `L${cx + sh + 4},${bot}` : `Q${cx},${bot + 2.6} ${cx + sh + 4},${bot}`}`, clLine, 0.9)}</g>`);
    add(P, 'chestband', `<path d="${torsoD}" fill="none" stroke="${line}" stroke-width="2.1" clip-path="url(#${clip})"/>`);
    if (back) add(P, 'chestband', ell(cx, (top + bot) / 2, 1.6, 1.3, clD, clLine));
  }
  add(P, 'torso_wear', torsoWearFront(w.torso, G, back));
  if (spec.belly && woman && !back) {
    if (w.torso && BELLY_COVERS.has(w.torso)) {
      const [fill, edge, crease] = bellyGarment(w.torso);
      add(P, 'belly_wear', bellyFront(G, fill, edge, crease));
    } else add(P, 'belly', bellyFront(G, skin, line, REF.skinD));
  }
  if (w.cloak) add(P, 'cloak_front', cloakOverFront(G, back, w.cloak === 'wool_cloak'));
  if (spec.carry && !back) {
    const b = babyFrontPieces(G);
    add(P, 'baby', b.blanket);
    add(P, 'baby_skin', b.skin);
  }

  // Arms, in front of the torso. The person's right hand is on the viewer's
  // left from the front and on the viewer's right from behind.
  const rightIsLeft = !back;
  let hr: Pt = [cx, sY], hl: Pt = [cx, sY];
  for (const side of [-1, 1]) {
    const isRight = rightIsLeft ? side === -1 : side === 1;
    const sh0: Pt = [cx + side * (sh - g.limb * 0.45), sY + 2.4];
    let len = g.arm, inward = 0;
    const legFwd = sw === 0 ? 0 : (sw === 1 ? -1 : 1);
    if (legFwd !== 0) {
      if (side === legFwd) { len -= 2.4; inward = 0.9; } else { len -= 1.0; }
    }
    let hand: Pt = [cx + side * (sh + 1.2 - inward), sY + 2.4 + len];
    let elbow: Pt = [(sh0[0] + hand[0]) / 2 + side * 0.9, (sh0[1] + hand[1]) / 2];
    if (spec.pose.startsWith('N')) {
      const { rightX, rightY, leftX, leftY } = NURSING_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * 0.16), sY + g.arm * 0.56];
    } else if (spec.pose.startsWith('n')) {
      const { rightX, rightY, leftX, leftY } = SWIM_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.18 : 0.16)), sY + g.arm * (isRight ? 0.46 : 0.5)];
    } else if (spec.pose.startsWith('z')) {
      const { rightX, rightY, leftX, leftY } = TAME_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.16 : 0.12)), sY + g.arm * (isRight ? 0.58 : 0.62)];
    } else if (spec.pose.startsWith('l')) {
      const { rightX, rightY, leftX, leftY } = TALK_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * 0.14), sY + g.arm * (isRight ? 0.58 : 0.6)];
    } else if (spec.pose.startsWith('k')) {
      const { rightX, rightY, leftX, leftY } = FIGHT_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * 0.18), sY + g.arm * 0.48];
    } else if (spec.pose.startsWith('H')) {
      const { rightX, rightY, leftX, leftY } = HUNT_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * 0.16), sY + g.arm * 0.55];
    } else if (spec.pose.startsWith('u')) {
      const { rightX, rightY, leftX, leftY } = PROTOTYPE_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * 0.16), sY + g.arm * 0.55];
    } else if (spec.pose.startsWith('o')) {
      const { rightX, rightY, leftX, leftY } = PONDER_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.18 : 0.12)), sY + g.arm * (isRight ? 0.42 : 0.62)];
    } else if (spec.pose.startsWith('t')) {
      const { rightX, rightY, leftX, leftY } = TEND_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.14 : 0.12)), sY + g.arm * 0.6];
    } else if (spec.pose.startsWith('j')) {
      const { rightX, rightY, leftX, leftY } = BENCH_REST_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * 0.14), sY + g.arm * (isRight ? 0.6 : 0.62)];
    } else if (spec.pose.startsWith('v')) {
      const { rightX, rightY, leftX, leftY } = ATTEND_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.14 : 0.12)), sY + g.arm * 0.6];
    } else if (spec.pose.startsWith('h')) {
      const { rightX, rightY, leftX, leftY } = HIDE_DRESS_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.2 : 0.16)), sY + g.arm * 0.62];
    } else if (spec.pose.startsWith('y')) {
      const { rightX, rightY, leftX, leftY } = DYE_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.14 : 0.12)), sY + g.arm * 0.57];
    } else if (spec.pose.startsWith('r')) {
      const { rightX, rightY, leftX, leftY } = MEND_FRONT[Number(spec.pose.slice(1))]!;
      // Both hands meet low on the body; the right hand makes the stitch.
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.14 : 0.12)), sY + g.arm * 0.57];
    } else if (spec.pose !== 'idle' && spec.pose.startsWith('i')) {
      const { rightX, rightY, leftX, leftY } = INSCRIBE_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (isRight ? rightX : leftX), sY + g.arm * (isRight ? rightY : leftY)];
      elbow = [cx + side * (sh + g.arm * (isRight ? 0.13 : 0.1)), sY + g.arm * (isRight ? 0.62 : 0.66)];
    } else if (spec.pose.startsWith('m')) {
      const phase = Number(spec.pose.slice(1));
      // One hand supports the work at the belly; the other manipulates it.
      // Both arms meet at that point; the renderer hides packed weapons.
      hand = [cx + side * (isRight ? [2, 1, 3, 4][phase]! : 3),
        sY + g.arm * (isRight ? [0.75, 0.55, 0.85, 0.65][phase]! : 0.8)];
      elbow = [cx + side * (sh + g.arm * 0.12), sY + g.arm * 0.55];
    } else if ((spec.pose.startsWith('d') || spec.pose.startsWith('c') || spec.pose.startsWith('b')) && isRight) {
      const poses = spec.pose.startsWith('c') ? CHOP_FRONT : spec.pose.startsWith('b') ? BUILD_FRONT : DIG_FRONT;
      const { reach, handY, elbowY } = poses[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.45 * reach), sY + g.arm * handY];
      elbow = [cx + side * (sh + g.arm * 0.22), sY + g.arm * elbowY];
    } else if (spec.pose.startsWith('f') && isRight) {
      const { reach, handY, elbowY } = FISH_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.42 * reach), sY + g.arm * handY];
      elbow = [cx + side * (sh + g.arm * 0.27), sY + g.arm * elbowY];
    } else if (spec.pose.startsWith('x') && isRight) {
      const { reach, handY, elbowY } = EXTRACT_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.4 * reach), sY + g.arm * handY];
      elbow = [cx + side * (sh + g.arm * 0.25), sY + g.arm * elbowY];
    } else if (spec.pose.startsWith('a') && isRight) {
      const { reach, handY, elbowY } = FARM_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.4 * reach), sY + g.arm * handY];
      elbow = [cx + side * (sh + g.arm * 0.25), sY + g.arm * elbowY];
    } else if (spec.pose.startsWith('q') && isRight) {
      const { reach, handY, elbowY } = CUT_GRASS_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.42 * reach), sY + g.arm * handY];
      elbow = [cx + side * (sh + g.arm * 0.25), sY + g.arm * elbowY];
    } else if (spec.pose.startsWith('p') && isRight) {
      const { reach, handY, elbowY } = PLANT_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.3 * reach), sY + g.arm * handY];
      elbow = [cx + side * (sh + g.arm * 0.18), sY + g.arm * elbowY];
    } else if (spec.pose.startsWith('s') && isRight) {
      const { reach, handY, elbowY } = SPREAD_FRONT[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.3 * reach), sY + g.arm * handY];
      elbow = [cx + side * (sh + g.arm * 0.18), sY + g.arm * elbowY];
    } else if (spec.pose.startsWith('g') && isRight) {
      const reach = [0.25, 0.8, 1, 0.45][Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.35 * reach), sY + g.arm * (0.7 - 0.38 * reach)];
      elbow = [cx + side * (sh + g.arm * 0.25), sY + g.arm * 0.55];
    }
    if (spec.carry) { hand = [cx + side * 2.4, sY + T * 0.66]; elbow = [cx + side * (sh + 1.8), sY + T * 0.5]; }
    add(P, 'arms', limb([sh0, elbow, hand], g.limb * 0.92, skin, line));
    add(P, 'sleeves', sleeveWear(w, sh0, elbow, hand, g));
    add(P, 'hands', handShape(false, hand, elbow, g, skin, line));
    if (isRight) hr = hand; else hl = hand;
    // Gloved hands are a second picture of the same slot.
    add(P, 'hands:gloves', handShape(true, hand, elbow, g, skin, line));
  }

  // Head.
  if (w.head === 'hood' && !back) add(P, 'head_back', hoodBackFront(g, cx, headCy, sY));
  add(P, 'head', ell(cx - g.hrx, headCy + 1, 1.7, 2.5, REF.skinD, line));
  add(P, 'head', ell(cx + g.hrx, headCy + 1, 1.7, 2.5, REF.skinD, line));
  add(P, 'head', ell(cx, headCy, g.hrx, g.hry, skin, line));
  if (!back) {
    if (spec.beard) add(P, 'beard', beardFront(g, cx, headCy));
    add(P, 'face', faceFront(g, cx, headCy, spec.expr));
  }
  const hh = hairFront(spec.hair, g, cx, headCy, back, sY);
  add(P, 'hair', hh.hair);
  add(P, 'shine', hh.shine);
  add(P, 'head_wear', headWearFront(w.head, g, cx, headCy, back));

  flush(sink, spec, P);
  return { layers: sink.layers, anchors: { hr: [r2p(hr[0]), r2p(hr[1])], hl: [r2p(hl[0]), r2p(hl[1])], bob: POSE_BOB[spec.pose] } };
}

const r2p = (n: number): number => Math.round(n * 10) / 10;

function sideLayers(spec: PersonSpec): PersonOut {
  const g = geometry(spec.age, spec.sex), w = spec.wear;
  const { sw, walk, f } = poseSwing(spec.pose);
  const { hipY, sY, headCy } = layoutOf(g, true);
  const cx = 45, d = g.depth;
  const woman = isWoman(spec.age, spec.sex);
  const sink = new Sink(spec.carry);
  const P: Pieces = {};
  const skin = REF.skin, line = REF.skinLine;
  const stoop = g.stoop ?? 0;
  const pivot: Pt = [cx, hipY];
  const sitting = spec.pose.startsWith('v') || spec.pose.startsWith('j') || spec.pose.startsWith('N');
  const rot = (svg: string): string => (svg && stoop ? `<g transform="rotate(${stoop} ${cx} ${hipY})">${svg}</g>` : svg);

  add(P, 'shadow', ell(cx + 1, g.foot + 0.6, d * 0.9, 3, 'rgba(0,0,0,0.26)'));
  if (spec.pose.startsWith('v')) add(P, 'seat', feastSeatSide(cx, hipY));

  const hip: Pt = [cx, hipY - 1];
  for (const near of [false, true]) {
    const col = near ? skin : REF.skinFar;
    let a1 = sw * 20 * (near ? 1 : -1), a2 = a1;
    if (walk && sw === 0 && ((f === 2) === near)) { a1 = 20; a2 = -12; }
    const L = (g.leg + 0.6) / 2;
    const knee: Pt = sitting ? [hip[0] + (near ? 12 : 8), hipY + 7] : at(hip, a1, L);
    const ank: Pt = sitting ? [knee[0] + 1, g.foot - 8] : at(knee, a2, L);
    const s = near ? 'near' : 'far';
    add(P, 'legs_' + s, limb([hip, knee, ank], g.limb, col, line) + ell(ank[0] + g.limb * 0.4, ank[1] + 0.3, g.limb * 0.72, g.limb * 0.36, near ? REF.skinD : shade(REF.skinD, 0.9), line));
    const lw = legWear(w, hip, knee, ank, g, near, g.limb * 0.4);
    add(P, 'trousers_' + s, lw.trousers);
    add(P, 'feet_' + s, lw.feet);
  }

  const T = g.torso;
  const G: SideG = { cx, d, sY, hipY, T, g };
  const shoulder: Pt = [cx + 0.4, sY + 2.6];
  const hx = cx + 2.2;
  let hrAnchor: Pt = [cx, sY];
  let hlAnchor: Pt = [cx, sY];
  for (const near of [false, true]) {
    const col = near ? skin : REF.skinFar;
    const Larm = g.arm / 2;
    let a1 = -sw * 24 * (near ? 1 : -1), a2 = a1 + 14;
    if (spec.pose.startsWith('N')) {
      [a1, a2] = NURSING_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('n')) {
      [a1, a2] = (near ? SWIM_SIDE_NEAR : SWIM_SIDE_FAR)[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('z')) {
      [a1, a2] = near ? TAME_SIDE[Number(spec.pose.slice(1))]! : [[-14, 22], [-18, 24], [-16, 23], [-12, 20]][Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('l')) {
      [a1, a2] = (near ? TALK_SIDE : [[-18, 34], [-10, 24], [-24, 38], [-20, 32]])[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('k')) {
      [a1, a2] = near ? FIGHT_SIDE[Number(spec.pose.slice(1))]! : [18, 62];
    } else if (spec.pose.startsWith('H')) {
      [a1, a2] = near ? HUNT_SIDE[Number(spec.pose.slice(1))]! : [18, 56];
    } else if (spec.pose.startsWith('u')) {
      [a1, a2] = near ? PROTOTYPE_SIDE[Number(spec.pose.slice(1))]! : [36, 76];
    } else if (spec.pose.startsWith('o')) {
      [a1, a2] = near ? PONDER_SIDE[Number(spec.pose.slice(1))]! : [-8, 28];
    } else if (spec.pose.startsWith('t')) {
      [a1, a2] = (near ? TEND_SIDE_NEAR : TEND_SIDE_FAR)[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('j')) {
      [a1, a2] = ATTEND_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('v')) {
      [a1, a2] = ATTEND_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('h')) {
      [a1, a2] = HIDE_DRESS_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('y')) {
      [a1, a2] = DYE_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('r')) {
      [a1, a2] = MEND_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose !== 'idle' && spec.pose.startsWith('i')) {
      [a1, a2] = INSCRIBE_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('m')) {
      const phase = Number(spec.pose.slice(1));
      [a1, a2] = near ? [[38, 80], [20, 50], [55, 90], [35, 110]][phase]! : [45, 110];
    } else if ((spec.pose.startsWith('d') || spec.pose.startsWith('c') || spec.pose.startsWith('b')) && near) {
      const poses = spec.pose.startsWith('c') ? CHOP_SIDE : spec.pose.startsWith('b') ? BUILD_SIDE : DIG_SIDE;
      [a1, a2] = poses[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('f') && near) {
      [a1, a2] = FISH_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('x') && near) {
      [a1, a2] = EXTRACT_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('a') && near) {
      [a1, a2] = FARM_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('q') && near) {
      [a1, a2] = CUT_GRASS_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('p') && near) {
      [a1, a2] = PLANT_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('s') && near) {
      [a1, a2] = SPREAD_SIDE[Number(spec.pose.slice(1))]!;
    } else if (spec.pose.startsWith('g') && near) {
      const phase = Number(spec.pose.slice(1));
      a1 = [20, 48, 62, 28][phase]!;
      a2 = [65, 85, 100, 110][phase]!;
    }
    if (spec.carry) { a1 = 32; a2 = 104; }
    const elbow = at(shoulder, a1, Larm), hand = at(elbow, a2, Larm);
    const s = near ? 'near' : 'far';
    let armSvg = limb([shoulder, elbow, hand], g.limb * 0.92, col, line);
    let sleeve = sleeveWear(w, shoulder, elbow, hand, g);
    const hSkin = handShape(false, hand, elbow, g, col, line);
    const hGlove = handShape(true, hand, elbow, g, col, line);
    if (near) {
      hrAnchor = stoop ? rotatePt(hand, stoop, pivot) : hand;
      armSvg = rot(armSvg); sleeve = rot(sleeve);
    } else hlAnchor = hand;
    add(P, 'arm_' + s, armSvg);
    add(P, 'sleeve_' + s, sleeve);
    add(P, 'hand_' + s, near ? rot(hSkin) : hSkin);
    add(P, 'hand_' + s + ':gloves', near ? rot(hGlove) : hGlove);
  }

  if (w.cloak) add(P, 'cloak_back', rot(cloakPanelSide(G, sw, w.cloak === 'wool_cloak')));
  if (spec.hair === 'long') add(P, 'hair_back', rot(longHairBackSide(g, hx, headCy, sY)));
  let torso = limb([[hx - 0.6, headCy + 2.5], [cx + 0.6, sY + 2]], g.limb * 1.05, REF.skinD, line);
  const chest = woman ? 0.62 : 0.52, seat = woman ? 0.66 : 0.6;
  const torsoD = smooth([
    [cx - d * 0.42, sY + 0.6], [cx + d * 0.3, sY], [cx + d * chest, sY + T * 0.3], [cx + d * 0.38, sY + T * 0.72],
    [cx + d * 0.44, hipY + 1.2], [cx - d * 0.5, hipY + 1.4], [cx - d * seat, hipY - 3], [cx - d * 0.4, sY + T * 0.6],
    [cx - d * 0.55, sY + T * 0.2],
  ]);
  const clip = sink.id();
  const clipDef = `<clipPath id="${clip}"><path d="${torsoD}"/></clipPath>`;
  torso += clipDef + shape(torsoD, skin, line);
  torso += `<g clip-path="url(#${clip})"><path d="M${cx - d},${sY - 2}L${cx - d * 0.1},${sY - 2}L${cx - d * 0.2},${hipY + 3}L${cx - d},${hipY + 3}Z" fill="rgba(60,30,10,0.12)"/></g>`;
  add(P, 'torso', rot(torso));
  if (w.hips) add(P, 'loincloth', rot(w.hips === 'fibre_skirt' ? fibreSkirtSide(G, sw) : hideLoinclothSide(G, sw)));
  else {
    let loin = clipDef + `<g clip-path="url(#${clip})"><rect x="${cx - d}" y="${hipY - 2.8}" width="${2 * d}" height="3" fill="${REF.bandD}"/></g>`;
    loin += `<path d="${torsoD}" fill="none" stroke="${line}" stroke-width="2.1" clip-path="url(#${clip})"/>`;
    loin += shape(poly([[cx + d * 0.14, hipY - 0.3], [cx + d * 0.48, hipY - 0.3], [cx + d * 0.46 - sw * 0.8, hipY + g.leg * 0.36], [cx + d * 0.16 - sw * 0.8, hipY + g.leg * 0.34]]), REF.band, REF.bandLine);
    loin += shape(poly([[cx - d * 0.56, hipY - 0.3], [cx - d * 0.1, hipY - 0.3], [cx - d * 0.16 + sw * 0.6, hipY + g.leg * 0.26], [cx - d * 0.58 + sw * 0.6, hipY + g.leg * 0.28]]), REF.band, REF.bandLine);
    add(P, 'loincloth', rot(loin));
  }
  if (woman) {
    add(P, 'chestband', rot(clipDef + `<g clip-path="url(#${clip})"><path d="M${cx - d},${sY + 4}L${cx + d},${sY + 3.4}L${cx + d},${sY + 10}L${cx - d},${sY + 9.2}Z" fill="${REF.band2}"/></g><path d="${torsoD}" fill="none" stroke="${line}" stroke-width="2.1" clip-path="url(#${clip})"/>`));
  }
  add(P, 'torso_wear', rot(torsoWearSide(w.torso, G)));
  if (spec.belly && woman) {
    if (w.torso && BELLY_COVERS.has(w.torso)) {
      const [fill, edge, crease] = bellyGarment(w.torso);
      add(P, 'belly_wear', rot(bellySide(G, fill, edge, crease)));
    } else add(P, 'belly', rot(bellySide(G, skin, line, REF.skinD)));
  }
  if (w.cloak) add(P, 'cloak_front', rot(cloakOverSide(G, w.cloak === 'wool_cloak')));
  if (spec.carry) {
    const b = babySidePieces(G);
    add(P, 'baby', rot(b.blanket));
    add(P, 'baby_skin', rot(b.skin));
  }
  if (w.head === 'hood') add(P, 'head_back', rot(hoodBackSide(g, hx, headCy, sY)));
  const hp2 = headSideParts(spec, g, hx, headCy);
  add(P, 'head', rot(hp2.head));
  if (spec.beard) add(P, 'beard', rot(hp2.beard));
  add(P, 'face', rot(hp2.face));
  add(P, 'hair', rot(hp2.hair));
  add(P, 'shine', rot(hp2.shine));
  add(P, 'head_wear', rot(headWearSide(w.head, g, hx, headCy)));

  flush(sink, spec, P);
  const ha: readonly [number, number] = [r2p(hrAnchor[0]), r2p(hrAnchor[1])];
  return { layers: sink.layers, anchors: { hr: ha,
    hl: [r2p(hlAnchor[0]), r2p(hlAnchor[1])], bob: POSE_BOB[spec.pose] } };
}

/** Turn the collected pieces into layers with their variant names. */
function flush(sink: Sink, spec: PersonSpec, P: Pieces): void {
  const w = spec.wear;
  const variantOf = (slot: string): string => {
    const base = slot.replace(/_(far|near)$/, '');
    switch (base) {
      case 'cloak_back': case 'cloak_front': return w.cloak ?? '';
      case 'torso_wear': case 'sleeve': case 'sleeves': return w.torso ?? '';
      case 'trousers': return w.legs ?? '';
      // An empty variant is omitted by flush. Unfitted figures must retain
      // their base layer or the registry silently drops the old appearance.
      case 'loincloth': return w.hips ?? 'base';
      case 'feet': return w.feet ?? '';
      case 'head_back': case 'head_wear': return w.head ?? '';
      case 'hair': case 'hair_back': return spec.hair;
      case 'shine': return spec.hair;
      case 'face': return spec.expr;
      case 'beard': return 'beard';
      case 'baby': case 'baby_skin': return 'baby';
      case 'belly_wear': return w.torso ?? '';
      default: return 'base';
    }
  };
  for (const [slot, svg] of Object.entries(P)) {
    if (!svg) continue;
    if (slot.includes(':gloves')) {
      if (w.hands) sink.push(slot.replace(':gloves', ''), 'gloves', svg);
      continue;
    }
    if (slot.startsWith('hand') && w.hands) continue; // the gloved picture replaces the bare one
    const v = variantOf(slot);
    if (v === '' ) continue;
    sink.push(slot, v, svg);
  }
}
