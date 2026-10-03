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
  torso?: 'cape' | 'wrap' | 'tunic' | 'longtunic';
  legs?: 'trousers';
  feet?: 'boots' | 'wraps';
  hands?: 'gloves';
  head?: 'cap' | 'hood';
  cloak?: 'cloak';
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
}

export interface Layer { slot: string; variant: string; svg: string; }
export interface PersonOut { layers: Layer[]; anchors: PersonAnchors; }

/** Bottom to top, per facing. West is east flipped by the renderer. */
export const SLOT_ORDER: Record<FacingDir, readonly string[]> = {
  S: ['shadow', 'cloak_back', 'hair_back', 'legs', 'trousers', 'feet', 'torso', 'loincloth', 'chestband', 'torso_wear', 'cloak_front', 'baby', 'baby_skin',
    'arms', 'sleeves', 'held', 'hands', 'head_back', 'head', 'beard', 'face', 'hair', 'shine', 'head_wear'],
  N: ['shadow', 'cloak_back', 'legs', 'trousers', 'feet', 'torso', 'loincloth', 'chestband', 'torso_wear', 'cloak_front',
    'arms', 'sleeves', 'held', 'hands', 'head_back', 'head', 'hair', 'shine', 'head_wear'],
  E: ['shadow', 'arm_far', 'sleeve_far', 'hand_far', 'legs_far', 'trousers_far', 'feet_far', 'legs_near', 'trousers_near', 'feet_near',
    'cloak_back', 'hair_back', 'torso', 'loincloth', 'chestband', 'torso_wear', 'cloak_front', 'baby', 'baby_skin',
    'arm_near', 'sleeve_near', 'held', 'hand_near', 'head_back', 'head', 'beard', 'face', 'hair', 'shine', 'head_wear'],
};

/** Which colour multiplies a slot when it is composed. */
export const SLOT_TINT: Record<string, 'skin' | 'hair' | 'band'> = {
  legs: 'skin', legs_far: 'skin', legs_near: 'skin', torso: 'skin', arms: 'skin', arm_far: 'skin', arm_near: 'skin', head: 'skin',
  hands: 'skin', hand_far: 'skin', hand_near: 'skin', baby_skin: 'skin',
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
  leather: '#6f4b2c', leatherL: '#8d6239', trousers: '#a89070', gold: '#d9b04a',
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
const isWoman = (age: ArtAge, sex: ArtSex): boolean => sex === 'f' && age !== 'child' && age !== 'infant';

export function geometry(age: ArtAge, sex: ArtSex): Geo {
  const g: Geo = { ...BASE[age], foot: 88 };
  if (isWoman(age, sex)) {
    g.leg -= 1; g.torso -= 1; g.sh *= 0.86; g.wa *= 0.88; g.hp *= age === 'adolescent' ? 1.05 : 1.1;
    g.limb *= 0.9; g.arm -= 1.5; g.hrx *= 0.96; g.hry *= 0.96; g.depth *= 0.95;
  }
  return g;
}

/** Whole-pixel upper-body dip; gathering keeps its feet planted like idle. */
export const POSE_BOB: Record<ArtPose, number> = { idle: 0, w0: 0, w1: 1, w2: 0, w3: 1, g0: 0, g1: 1, g2: 2, g3: 1, d0: 0, d1: 0, d2: 0, d3: 0, c0: 0, c1: 0, c2: 0, c3: 0 };

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
  if (w.torso === 'longtunic') return limb([s0, elbow, lerp(elbow, hand, 0.8)], g.limb * 0.92 + 1.8, W.wool, W.woolLine);
  return '';
}

/** The hand: bare skin (tinted) or a glove with its cuff. */
function handShape(gloves: boolean, hand: Pt, elbow: Pt, g: Geo, skin: string, line: string): string {
  if (!gloves) return ell(hand[0], hand[1], g.limb * 0.58, g.limb * 0.62, skin, line);
  return limb([lerp(elbow, hand, 0.7), lerp(elbow, hand, 0.95)], g.limb * 0.92 + 2, W.leather, W.hideLine)
    + ell(hand[0], hand[1], g.limb * 0.78, g.limb * 0.8, W.leatherL, W.hideLine);
}

interface FrontG { cx: number; sY: number; hipY: number; sh: number; wa: number; hp: number; T: number; g: Geo; }

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
  } else if (t === 'wrap') {
    const hem = hipY + g.leg * 0.3, n = 5, xa = cx + hp + 1.8, xb = cx - hp - 1.8;
    const pts: Pt[] = [[cx - sh + 0.2, sY + 1.6], [cx - sh + 5.6, sY - 0.4], [cx + sh - 1.5, sY + T * 0.5], [xa, hem - 1]];
    for (let i = 1; i < n; i++) pts.push([xa + (xb - xa) * i / n, hem + (i % 2 ? 2 : -0.3)]);
    pts.push([xb, hem - 1], [cx - wa - 0.6, sY + T * 0.55]);
    out.push(shape(poly(pts), W.hide, W.hideLine));
    out.push(stroke(`M${cx - sh + 5.6},${sY + 0.4}L${cx + hp},${hem - 3}`, W.hideD, 1));
    out.push(ell(cx - wa * 0.4, sY + T * 0.7, 1.3, 0.9, W.hideD) + ell(cx + wa * 0.2, sY + T * 0.9, 1.1, 0.8, W.hideD));
  } else if (t === 'tunic' || t === 'longtunic') {
    const long = t === 'longtunic', hem = hipY + g.leg * (long ? 0.6 : 0.34);
    const fill = long ? W.wool : W.hide, line = long ? W.woolLine : W.hideLine, dark = long ? W.woolD : W.hideD;
    out.push(shape(`M${cx - sh + 0.4},${sY + 1}L${cx - 3.6},${sY - 0.2}Q${cx},${sY + (back ? 1.4 : 4.2)} ${cx + 3.6},${sY - 0.2}L${cx + sh - 0.4},${sY + 1}L${cx + wa + 1.2},${sY + T * 0.62}L${cx + hp + 2.6},${hem}L${cx - hp - 2.6},${hem}L${cx - wa - 1.2},${sY + T * 0.62}Z`, fill, line));
    out.push(stroke(`M${cx - hp - 2.4},${hem - 1.4}L${cx + hp + 2.4},${hem - 1.4}`, dark, 1.1));
    out.push(shape(poly([[cx - hp - 1.2, hipY - 2.2], [cx + hp + 1.2, hipY - 2.2], [cx + hp + 1.2, hipY + 0.6], [cx - hp - 1.2, hipY + 0.6]]), W.leather, W.hideLine));
    if (!back) out.push(ell(cx + hp * 0.75, hipY + 3.4, 2.4, 3, W.leatherL, W.hideLine));
  }
  return out.join('');
}

function cloakOverFront(G: FrontG, back: boolean): string {
  const { cx, sY, hipY, sh, g } = G;
  if (back) {
    const y2 = hipY + g.leg * 0.55;
    return shape(poly([[cx - sh - 1, sY + 0.4], [cx + sh + 1, sY + 0.4], [cx + sh + 6, y2], [cx - sh - 6, y2]]), W.wool, W.woolLine)
      + stroke(`M${cx},${sY + 3}L${cx},${y2 - 1.5}`, W.woolD, 0.9);
  }
  return shape(`M${cx - sh - 2.4},${sY + 0.8}Q${cx},${sY + 5.4} ${cx + sh + 2.4},${sY + 0.8}L${cx + sh + 3},${sY + 5}Q${cx},${sY + 9.6} ${cx - sh - 3},${sY + 5}Z`, W.wool, W.woolLine)
    + ell(cx, sY + 5.6, 1.7, 1.7, W.gold, W.woolLine);
}

const cloakPanelFront = (G: FrontG): string => {
  const { cx, sY, hipY, sh, g } = G;
  return shape(poly([[cx - sh - 1.5, sY + 1], [cx + sh + 1.5, sY + 1], [cx + sh + 7.5, hipY + g.leg * 0.5], [cx - sh - 7.5, hipY + g.leg * 0.5]]), shade(W.wool, 0.8), W.woolLine);
};

interface SideG { cx: number; d: number; sY: number; hipY: number; T: number; g: Geo; }

function torsoWearSide(t: Wear['torso'], G: SideG): string {
  const { cx, d, sY, hipY, T, g } = G;
  const out: string[] = [];
  if (t === 'cape') {
    out.push(shape(poly([[cx - d * 0.6, sY - 0.6], [cx + d * 0.5, sY - 0.6], [cx + d * 0.72, sY + 3], [cx + d * 0.66, sY + 8.6], [cx + d * 0.3, sY + 10.6], [cx, sY + 8.2], [cx - d * 0.35, sY + 10.4], [cx - d * 0.72, sY + 7]]), W.fur, W.furLine));
    out.push(stroke(`M${cx - d * 0.2},${sY + 3}l1,2.6M${cx + d * 0.2},${sY + 3}l1,2.6`, W.furL, 1));
  } else if (t === 'wrap') {
    const hem = hipY + g.leg * 0.3;
    out.push(shape(poly([[cx - d * 0.45, sY + 0.2], [cx + d * 0.32, sY - 0.2], [cx + d * 0.6, sY + T * 0.4], [cx + d * 0.62, hem - 1], [cx + d * 0.3, hem + 2], [cx, hem - 0.4], [cx - d * 0.3, hem + 2], [cx - d * 0.66, hem - 1], [cx - d * 0.58, sY + T * 0.4]]), W.hide, W.hideLine));
  } else if (t === 'tunic' || t === 'longtunic') {
    const long = t === 'longtunic', hem = hipY + g.leg * (long ? 0.6 : 0.34);
    out.push(shape(poly([[cx - d * 0.44, sY + 0.2], [cx + d * 0.32, sY - 0.2], [cx + d * 0.6, sY + T * 0.34], [cx + d * 0.56, hipY], [cx + d * 0.72, hem], [cx - d * 0.74, hem], [cx - d * 0.62, hipY], [cx - d * 0.56, sY + T * 0.3]]), long ? W.wool : W.hide, long ? W.woolLine : W.hideLine));
    out.push(stroke(`M${cx - d * 0.72},${hem - 1.4}L${cx + d * 0.7},${hem - 1.4}`, long ? W.woolD : W.hideD, 1.1));
    out.push(shape(poly([[cx - d * 0.6, hipY - 2.2], [cx + d * 0.58, hipY - 2.2], [cx + d * 0.58, hipY + 0.6], [cx - d * 0.6, hipY + 0.6]]), W.leather, W.hideLine));
    out.push(ell(cx + d * 0.1, hipY + 3, 2.4, 3, W.leatherL, W.hideLine));
  }
  return out.join('');
}

const cloakOverSide = (G: SideG): string => {
  const { cx, d, sY } = G;
  return shape(`M${cx - d * 0.6},${sY - 0.4}L${cx + d * 0.4},${sY - 0.2}L${cx + d * 0.5},${sY + 4}L${cx - d * 0.6},${sY + 5}Z`, W.wool, W.woolLine)
    + ell(cx + d * 0.3, sY + 2.6, 1.6, 1.6, W.gold, W.woolLine);
};
const cloakPanelSide = (G: SideG, sw: number): string => {
  const { cx, d, sY, hipY, g } = G;
  return shape(poly([[cx - d * 0.3, sY + 1], [cx - d * 0.7, sY + 3], [cx - d * 1.5 + sw * 1.4, hipY + g.leg * 0.55], [cx - d * 0.5, hipY + g.leg * 0.6]]), shade(W.wool, 0.82), W.woolLine);
};

function hoodBackFront(g: Geo, cx: number, hy: number, sY: number): string {
  const R = g.hrx, H = g.hry;
  return shape(smooth([[cx, hy - H - 2.6], [cx + R + 3.4, hy - H * 0.35], [cx + R + 5, sY + 4], [cx, sY + 7], [cx - R - 5, sY + 4], [cx - R - 3.4, hy - H * 0.35]]), W.wool, W.woolLine);
}
function headWearFront(kind: Wear['head'], g: Geo, cx: number, hy: number, back: boolean): string {
  const R = g.hrx, H = g.hry;
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
  return spec.dir === 'E' ? sideLayers(spec) : frontLayers(spec, spec.dir === 'N');
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

  add(P, 'shadow', ell(cx, g.foot + 0.6, g.sh + 1.5, 3, 'rgba(0,0,0,0.26)'));
  const T = g.torso, sh = g.sh, wa = g.wa, hp = g.hp;
  const G: FrontG = { cx, sY, hipY, sh, wa, hp, T, g };
  if (w.cloak) add(P, 'cloak_back', cloakPanelFront(G));
  if (!back && spec.hair === 'long') add(P, 'hair_back', longHairBackFront(g, cx, headCy, sY));

  // Legs.
  const lx = cx - g.gap, rx = cx + g.gap;
  let lf = g.foot - 0.4, rf = g.foot - 0.4, lxo = 0, rxo = 0;
  if (sw === 1) { lf += 0.6; rf -= 2.6; lxo = -0.6; }
  if (sw === -1) { rf += 0.6; lf -= 2.6; rxo = 0.6; }
  if (walk && sw === 0) { if (f === 0) lf -= 1.4; else rf -= 1.4; }
  add(P, 'legs', limb([[lx, hipY - 2], [lx + lxo - 0.3, lf]], g.limb, skin, line));
  add(P, 'legs', limb([[rx, hipY - 2], [rx + rxo + 0.3, rf]], g.limb, skin, line));
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

  // Loincloth: belt, a wrap between the legs and a hanging flap. Drawn in the tribe colour.
  const cl = REF.band, cl2 = REF.band2, clD = REF.bandD, clLine = REF.bandLine;
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
  if (w.cloak) add(P, 'cloak_front', cloakOverFront(G, back));
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
    if ((spec.pose.startsWith('d') || spec.pose.startsWith('c')) && isRight) {
      const poses = spec.pose.startsWith('c') ? CHOP_FRONT : DIG_FRONT;
      const { reach, handY, elbowY } = poses[Number(spec.pose.slice(1))]!;
      hand = [cx + side * (sh + g.arm * 0.45 * reach), sY + g.arm * handY];
      elbow = [cx + side * (sh + g.arm * 0.22), sY + g.arm * elbowY];
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
  const rot = (svg: string): string => (svg && stoop ? `<g transform="rotate(${stoop} ${cx} ${hipY})">${svg}</g>` : svg);

  add(P, 'shadow', ell(cx + 1, g.foot + 0.6, d * 0.9, 3, 'rgba(0,0,0,0.26)'));

  const hip: Pt = [cx, hipY - 1];
  for (const near of [false, true]) {
    const col = near ? skin : REF.skinFar;
    let a1 = sw * 20 * (near ? 1 : -1), a2 = a1;
    if (walk && sw === 0 && ((f === 2) === near)) { a1 = 20; a2 = -12; }
    const L = (g.leg + 0.6) / 2;
    const knee = at(hip, a1, L), ank = at(knee, a2, L);
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
  for (const near of [false, true]) {
    const col = near ? skin : REF.skinFar;
    const Larm = g.arm / 2;
    let a1 = -sw * 24 * (near ? 1 : -1), a2 = a1 + 14;
    if ((spec.pose.startsWith('d') || spec.pose.startsWith('c')) && near) {
      const poses = spec.pose.startsWith('c') ? CHOP_SIDE : DIG_SIDE;
      [a1, a2] = poses[Number(spec.pose.slice(1))]!;
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
    }
    add(P, 'arm_' + s, armSvg);
    add(P, 'sleeve_' + s, sleeve);
    add(P, 'hand_' + s, near ? rot(hSkin) : hSkin);
    add(P, 'hand_' + s + ':gloves', near ? rot(hGlove) : hGlove);
  }

  if (w.cloak) add(P, 'cloak_back', rot(cloakPanelSide(G, sw)));
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
  let loin = clipDef + `<g clip-path="url(#${clip})"><rect x="${cx - d}" y="${hipY - 2.8}" width="${2 * d}" height="3" fill="${REF.bandD}"/></g>`;
  loin += `<path d="${torsoD}" fill="none" stroke="${line}" stroke-width="2.1" clip-path="url(#${clip})"/>`;
  loin += shape(poly([[cx + d * 0.14, hipY - 0.3], [cx + d * 0.48, hipY - 0.3], [cx + d * 0.46 - sw * 0.8, hipY + g.leg * 0.36], [cx + d * 0.16 - sw * 0.8, hipY + g.leg * 0.34]]), REF.band, REF.bandLine);
  loin += shape(poly([[cx - d * 0.56, hipY - 0.3], [cx - d * 0.1, hipY - 0.3], [cx - d * 0.16 + sw * 0.6, hipY + g.leg * 0.26], [cx - d * 0.58 + sw * 0.6, hipY + g.leg * 0.28]]), REF.band, REF.bandLine);
  add(P, 'loincloth', rot(loin));
  if (woman) {
    add(P, 'chestband', rot(clipDef + `<g clip-path="url(#${clip})"><path d="M${cx - d},${sY + 4}L${cx + d},${sY + 3.4}L${cx + d},${sY + 10}L${cx - d},${sY + 9.2}Z" fill="${REF.band2}"/></g><path d="${torsoD}" fill="none" stroke="${line}" stroke-width="2.1" clip-path="url(#${clip})"/>`));
  }
  add(P, 'torso_wear', rot(torsoWearSide(w.torso, G)));
  if (w.cloak) add(P, 'cloak_front', rot(cloakOverSide(G)));
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
  return { layers: sink.layers, anchors: { hr: ha, hl: ha, bob: POSE_BOB[spec.pose] } };
}

/** Turn the collected pieces into layers with their variant names. */
function flush(sink: Sink, spec: PersonSpec, P: Pieces): void {
  const w = spec.wear;
  const variantOf = (slot: string): string => {
    const base = slot.replace(/_(far|near)$/, '');
    switch (base) {
      case 'cloak_back': case 'cloak_front': return 'cloak';
      case 'torso_wear': case 'sleeve': case 'sleeves': return w.torso ?? '';
      case 'trousers': return w.legs ?? '';
      case 'feet': return w.feet ?? '';
      case 'head_back': case 'head_wear': return w.head ?? '';
      case 'hair': case 'hair_back': return spec.hair;
      case 'shine': return spec.hair;
      case 'face': return spec.expr;
      case 'beard': return 'beard';
      case 'baby': case 'baby_skin': return 'baby';
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
