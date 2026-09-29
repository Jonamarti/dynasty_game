/**
 * Objects as they look in a hand, and babies lying down.
 *
 * A held object is drawn once with its grip at `HAND` (the centre of a 96 px
 * cell) and the renderer places it on the wearer's hand anchor, so the same
 * spear sits correctly on a child, a woman and an elder without being drawn
 * per body. Facing east is drawn tilted a little forward; west is the mirror.
 */
import { ell, limb, poly, shade, shape, smooth, stroke } from '../lib/draw.ts';
import { CORD, STONE_D, WOOD, WOOD_D } from './items.ts';

/** Where the grip is inside a held object's cell. */
export const HAND: readonly [number, number] = [48, 48];

/** What the sim can put in a hand today, plus the torch phase 12 adds. */
export const HELD_KINDS = ['spear', 'bow', 'atlatl', 'bone_point', 'handaxe', 'net', 'basket', 'torch'] as const;
export type HeldKind = (typeof HELD_KINDS)[number];

/** `side` is true when seen from the east or west. */
export function heldSvg(kind: HeldKind, side: boolean): string {
  const [x, y] = HAND;
  switch (kind) {
    case 'spear': {
      const top: [number, number] = side ? [x + 7, y - 38] : [x, y - 38];
      const bot: [number, number] = side ? [x - 3, y + 14] : [x, y + 14];
      const dx = top[0] - bot[0], dy = top[1] - bot[1], len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const b: [number, number] = [top[0] - ux * 7, top[1] - uy * 7];
      return limb([bot, top], 1.9, WOOD, WOOD_D)
        + shape(poly([[top[0] + ux * 1.5, top[1] + uy * 1.5], [b[0] + px * 2.4, b[1] + py * 2.4], [b[0] - px * 2.4, b[1] - py * 2.4]]), '#9aa1a4', STONE_D)
        + limb([[b[0] - ux * 0.5, b[1] - uy * 0.5], [b[0] - ux * 2.5, b[1] - uy * 2.5]], 2.6, CORD, '#5b4a2a');
    }
    case 'bow':
      return stroke(`M${x + 1},${y - 19}Q${x - 9},${y} ${x + 1},${y + 19}`, WOOD, 2.2)
        + stroke(`M${x + 1},${y - 19}L${x + 1},${y + 19}`, '#efe7d6', 0.7);
    case 'atlatl': {
      const tx = side ? 5 : 0;
      return limb([[x - 2, y + 14], [x + tx, y - 24]], 1.8, WOOD, WOOD_D)
        + shape(`M${x + tx - 1},${y - 24}Q${x + tx - 3},${y - 29} ${x + tx + 2},${y - 29}L${x + tx + 3},${y - 26}L${x + tx + 1},${y - 26}Z`, WOOD, WOOD_D)
        + limb([[x + 4, y + 2], [x + 4 + tx * 0.4, y - 8]], 1.1, CORD, null);
    }
    case 'bone_point': {
      const tx = side ? 3 : 0;
      return shape(smooth([[x + tx, y - 24], [x + tx + 3.4, y - 6], [x + 2.4, y + 8], [x - 2.4, y + 8], [x + tx - 3.2, y - 6]]), '#e6dcc0', '#7a6d4e')
        + stroke(`M${x + tx - 1},${y - 12}L${x - 1},${y + 4}`, '#c9bd9c', 0.8);
    }
    case 'handaxe':
      return shape(smooth([[x, y - 10], [x + 5.4, y - 3], [x + 4, y + 5], [x - 4, y + 5], [x - 5.4, y - 3]]), '#a4a8ab', STONE_D)
        + stroke(`M${x - 1},${y - 5}L${x + 2},${y - 1}`, '#7d8285', 0.9);
    case 'net':
      return shape(smooth([[x - 9, y - 4], [x, y - 8], [x + 10, y - 3], [x + 12, y + 8], [x + 2, y + 15], [x - 10, y + 10]]), '#b3b76a', '#6d6535')
        + stroke(`M${x - 8},${y}L${x + 8},${y + 6}M${x - 6},${y + 6}L${x + 9},${y + 1}M${x - 2},${y - 6}L${x + 4},${y + 12}M${x + 4},${y - 6}L${x - 4},${y + 12}`, '#6d6535', 0.8)
        + ell(x - 8, y - 2, 1.8, 1.4, WOOD, WOOD_D) + ell(x + 9, y - 1, 1.8, 1.4, WOOD, WOOD_D);
    case 'basket': {
      const cx = x + (side ? 1 : 0), top = y + 3.5;
      return stroke(`M${cx - 4.6},${top + 0.5}Q${cx},${y - 3.5} ${cx + 4.6},${top + 0.5}`, '#6d4c2c', 1.3)
        + shape(`M${cx - 6},${top}L${cx + 6},${top}L${cx + 4.6},${top + 9}Q${cx},${top + 10.2} ${cx - 4.6},${top + 9}Z`, '#b58a5a', '#5a3d22')
        + stroke(`M${cx - 5.4},${top + 3.2}L${cx + 5.4},${top + 3.2}M${cx - 5},${top + 6.2}L${cx + 5},${top + 6.2}`, '#8a643e', 0.9)
        + ell(cx, top + 0.4, 6.2, 1.4, '#e0a24a', '#5a3d22');
    }
    case 'torch': {
      const tx = x + (side ? 1 : 0);
      return limb([[x, y + 9], [tx, y - 14]], 2.4, WOOD, WOOD_D)
        + ell(tx, y - 15, 2.8, 3.6, '#4a3020', WOOD_D)
        + shape(smooth([[tx, y - 31], [tx + 4.6, y - 23], [tx + 3, y - 18], [tx - 2, y - 18], [tx - 3.6, y - 23]]), '#f2a03a', '#7a2f10')
        + shape(smooth([[tx, y - 26], [tx + 2.4, y - 22], [tx + 1.4, y - 19], [tx - 0.6, y - 19], [tx - 1.6, y - 22]]), '#ffe08a');
    }
  }
}

// ------------------------------------------------------------- lying babies
export type BabyBed = 'ground' | 'mat' | 'cradle';
export const BABY_BEDS: readonly BabyBed[] = ['ground', 'mat', 'cradle'];

const SWADDLE = '#d4c39a', SWADDLE_LINE = '#5a4a2c';
const SK = '#ffffff', SK_LINE = '#5d4a3b';

/** A baby lying down, as four stacked pictures. `skin` is multiplied by the baby's tone. */
export function babyLyingLayers(bed: BabyBed, awake: boolean): { bed: string; blanket: string; skin: string; bedFront: string } {
  const y = { ground: 62, mat: 58, cradle: 52 }[bed];
  let under = '';
  if (bed === 'ground') {
    under += ell(48, y + 8, 30, 5, 'rgba(0,0,0,0.22)');
    under += stroke('M14,70l-2,-5M80,71l3,-5M22,73l1,-4', '#2f5a30', 1.4);
  } else if (bed === 'mat') {
    under += shape(poly([[10, 50], [86, 50], [92, 74], [4, 74]]), '#b9976a', '#5a4025');
    under += stroke('M9,58L87,58M7,66L89,66M30,50L26,74M52,50L52,74M74,50L78,74', '#8f6f47', 0.9);
  } else {
    under += stroke('M12,82Q48,98 84,82', WOOD, 3);
    under += ell(48, 56, 38, 8, '#7d5a36', WOOD_D);
  }
  let blanket = ell(50, y, 18, 8, SWADDLE, SWADDLE_LINE, -3);
  blanket += stroke(`M44,${y - 6}L46,${y + 6}M52,${y - 6.6}L54,${y + 5.6}M60,${y - 6}L61,${y + 4.4}`, shade(SWADDLE, 0.78), 0.9);
  let skin = limb([[38, y - 3], [33, y - 10]], 2.8, SK, SK_LINE) + ell(32.4, y - 10.6, 2.1, 2.1, SK, SK_LINE);
  skin += limb([[40, y + 4], [35, y + 9]], 2.8, SK, SK_LINE) + ell(34.4, y + 9.6, 2.1, 2.1, SK, SK_LINE);
  skin += limb([[66, y - 2], [73, y - 5]], 3, SK, SK_LINE) + ell(74.4, y - 5.4, 2.4, 2, SK, SK_LINE);
  skin += limb([[66, y + 2], [74, y + 3]], 3, SK, SK_LINE) + ell(75.6, y + 3.2, 2.4, 2, SK, SK_LINE);
  skin += ell(30, y - 1, 8, 8, SK, SK_LINE);
  skin += awake
    ? ell(27.5, y - 1.8, 1, 1.3, '#22170f') + ell(32.5, y - 1.8, 1, 1.3, '#22170f') + stroke(`M28.6,${y + 2.6}q1.4,1.1 2.8,0`, '#22170f', 0.8)
    : stroke(`M25.8,${y - 1.6}q1.6,1.4 3,0M31,${y - 1.6}q1.6,1.4 3,0`, '#22170f', 0.9) + ell(28.2, y + 3, 1, 0.7, '#b3b3b3');
  skin += ell(24, y - 6, 1.4, 1, '#bfbfbf');
  let bedFront = '';
  if (bed === 'cradle') {
    bedFront += shape('M10,56Q48,66 86,56L80,74Q48,88 16,74Z', '#b58d5e', '#5a3d22');
    bedFront += stroke('M14,62Q48,72 82,62M15,68Q48,78 81,68M28,60L30,80M48,63L48,83M68,60L66,80', '#8a643e', 0.9);
  }
  return { bed: under, blanket, skin, bedFront };
}

