/**
 * Buildings, seen obliquely (the front wall and the roof at once), and the
 * bare floor plan of every building that has a roof. A plan replaces the
 * exterior while the roof is hidden (the phase 16 rule: the roof lifts when
 * somebody inside is selected, or on a key).
 */
import { ell, lerp, limb, poly, r2, shade, shape, smooth, stroke, type Pt } from '../lib/draw.ts';
import { CORD, WOOD } from '../props/items.ts';

export type BuildingArt = [id: string, label: string, tech: string, width: number, draw: () => string];
export type PlanArt = [id: string, label: string, width: number, draw: () => string];

const B = { L: '#2b1d12', mud: '#a67c52', mudL: '#bd9060', thatch: '#d0b060', thatchD: '#a98a3e', wattle: '#b58d5e', wattleD: '#8a643e', stone: '#9a9690', stoneL: '#b3afa8', stoneD: '#6e6a63', clay: '#c98a5a', dark: '#22160d', roofD: '#7a5a3a' };
const gShadow = (cx: number, cy: number, rx: number, ry: number): string => ell(cx, cy, rx, ry, 'rgba(0,0,0,0.24)');
const thatchLines = (x0: number, x1: number, yTop: number, yBot: number, n: number): string => Array.from({ length: n }, (_, i) => {
  const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t;
  return stroke(`M${r2(x)},${yTop}L${r2(x + (t - 0.5) * 14)},${yBot}`, B.thatchD, 0.9);
}).join('');
const stoneCourses = (x0: number, x1: number, y0: number, y1: number, rows: number): string => {
  let s = '';
  const h = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * h, off = r % 2 ? 9 : 0;
    s += stroke(`M${x0},${r2(y)}L${x1},${r2(y)}`, B.stoneD, 0.9);
    for (let x = x0 + off + 8; x < x1; x += 18) s += stroke(`M${x},${r2(y)}L${x},${r2(y + h)}`, B.stoneD, 0.9);
  }
  return s;
};
const door = (x: number, y: number, w: number, h: number, fill: string = B.dark): string => shape(`M${x},${y + h}L${x},${y + w / 2}Q${x + w / 2},${y - 2} ${x + w},${y + w / 2}L${x + w},${y + h}Z`, fill, B.L);
const logs = (x: number, y: number): string => ell(x, y, 15, 5.5, '#7d5a36', B.L) + ell(x + 7, y - 8, 15, 5.5, '#94703f', B.L) + ell(x - 5, y - 8, 15, 5.5, '#86633c', B.L)
  + ell(x - 13, y - 8, 3.4, 5.2, '#d0a970', B.L) + ell(x - 20, y, 3.4, 5.2, '#d0a970', B.L);
const flame = (x: number, y: number, s = 1): string => shape(smooth([[x, y - 20 * s], [x + 8 * s, y - 7 * s], [x + 5 * s, y], [x - 5 * s, y], [x - 8 * s, y - 7 * s]]), '#f2a03a', '#7a2f10')
  + shape(smooth([[x, y - 12 * s], [x + 4 * s, y - 5 * s], [x + 2.4 * s, y - 0.5], [x - 2.4 * s, y - 0.5], [x - 4 * s, y - 5 * s]]), '#ffe08a');
const smoke = (x: number, y: number): string => `<path d="M${x},${y}Q${x - 8},${y - 10} ${x},${y - 20}T${x + 2},${y - 40}" fill="none" stroke="rgba(230,230,230,0.5)" stroke-width="5" stroke-linecap="round"/>`;

export const BUILDINGS: BuildingArt[] = [
  ['mud_hut', 'Choza de barro', 'wattle_daub / hoy: “mud_hut”', 144, () =>
    gShadow(74, 100, 58, 12)
    + shape('M18,98C18,50 42,26 72,26C102,26 126,50 126,98Z', B.mud, B.L)
    + `<path d="M26,84Q72,72 118,84M30,68Q72,56 114,68M40,52Q72,42 104,52" fill="none" stroke="${B.mudL}" stroke-width="2.4" stroke-linecap="round"/>`
    + stroke('M34,90Q72,80 110,90M32,76Q72,64 112,76M36,60Q72,48 108,60', '#8a6540', 1)
    + ell(72, 27, 7, 2.8, B.dark, B.L)
    + door(58, 70, 28, 28) + ell(24, 99, 3, 2, B.stone, B.L) + ell(122, 98, 4, 2.6, B.stone, B.L)],
  ['wattle_hut', 'Choza de varas y barro', 'wattle_daub', 144, () =>
    gShadow(74, 100, 60, 12)
    + shape(poly([[28, 62], [118, 62], [118, 98], [28, 98]]), B.wattle, B.L)
    + Array.from({ length: 10 }, (_, i) => stroke(`M${34 + i * 9},62L${34 + i * 9},98`, B.wattleD, 1)).join('')
    + stroke('M28,72L118,72M28,82L118,82M28,92L118,92', '#c9a373', 1.2)
    + door(63, 72, 20, 26)
    + shape('M14,66L72,14L130,66Q100,74 72,68Q44,74 14,66Z', B.thatch, B.L)
    + thatchLines(26, 118, 30, 70, 11)
    + stroke('M72,14L66,4M72,14L80,3', WOOD, 2)
    + stroke('M18,66Q30,72 40,68Q52,74 64,69Q76,74 90,69Q104,74 126,66', B.thatchD, 1.4)],
  ['stone_house', 'Casa de piedra', 'masonry', 144, () =>
    gShadow(74, 102, 62, 12)
    + shape(poly([[22, 56], [122, 56], [122, 98], [22, 98]]), B.stone, B.L)
    + stoneCourses(22, 122, 58, 98, 4)
    + shape(poly([[14, 58], [36, 32], [108, 32], [130, 58]]), B.roofD, B.L)
    + stroke('M22,53L40,35M50,54L54,35M80,54L82,35M108,54L100,35', '#5a4128', 1)
    + stroke('M14,58L130,58', '#4a3520', 2.2)
    + door(62, 68, 20, 30) + shape(poly([[34, 68], [50, 68], [50, 80], [34, 80]]), B.dark, B.L) + shape(poly([[95, 68], [111, 68], [111, 80], [95, 80]]), B.dark, B.L)
    + shape(poly([[58, 68], [86, 68], [86, 71], [58, 71]]), B.stoneL, B.L)],
  ['longhouse', 'Casa larga', 'carpentry + wattle_daub', 288, () =>
    gShadow(146, 100, 128, 12)
    + shape(poly([[26, 62], [262, 62], [262, 98], [26, 98]]), B.wattle, B.L)
    + Array.from({ length: 26 }, (_, i) => stroke(`M${32 + i * 9},62L${32 + i * 9},98`, B.wattleD, 1)).join('')
    + stroke('M26,74L262,74M26,86L262,86', '#c9a373', 1.2)
    + door(130, 72, 22, 26)
    + shape('M8,68L58,22L232,22L282,68Q210,80 146,72Q80,80 8,68Z', B.thatch, B.L)
    + thatchLines(30, 262, 26, 72, 26)
    + stroke('M58,22L232,22', B.thatchD, 3)
    + ell(96, 28, 5, 2, B.dark) + ell(196, 28, 5, 2, B.dark) + smoke(96, 24)],
  ['stockpile', 'Almacén al aire libre', 'ya existe', 144, () =>
    shape(smooth([[10, 74], [34, 52], [80, 46], [122, 56], [136, 78], [112, 100], [56, 106], [20, 96]]), '#7c6444', B.L)
    + shape(poly([[22, 82], [58, 76], [64, 92], [26, 98]]), '#a8865a', B.L) + stroke('M28,84L58,80M30,90L60,86', '#7d5d38', 1)
    + logs(98, 92)
    + ell(72, 64, 14, 8, B.stone, B.L) + ell(84, 60, 9, 6, B.stoneL, B.L) + ell(62, 60, 8, 5, B.stoneD, B.L)
    + shape('M96,58L124,58L120,74Q110,78 100,74Z', '#b58d5e', B.L) + ell(110, 58, 14, 3.4, '#e0a24a', B.L)
    + shape(smooth([[36, 60], [50, 56], [56, 64], [44, 70], [34, 68]]), '#8d6c46', B.L)],
  ['windbreak', 'Cortavientos', 'ya existe', 96, () => {
    let s = gShadow(72, 100, 56, 8);
    s += shape('M14,58L72,74L72,100L14,84Z', B.wattle, B.L) + shape('M72,74L130,58L130,84L72,100Z', shade(B.wattle, 0.9), B.L);
    for (const t of [0.33, 0.66]) s += stroke(`M14,${r2(58 + 26 * t)}L72,${r2(74 + 26 * t)}L130,${r2(58 + 26 * t)}`, '#c9a373', 1.6);
    for (let i = 0; i <= 4; i++) { const x = 14 + i * 14.5, y = 58 + i * 4; s += limb([[x, y - 3], [x, y + 27]], 2.6, WOOD, B.L); }
    for (let i = 1; i <= 4; i++) { const x = 72 + i * 14.5, y = 74 - i * 4; s += limb([[x, y - 3], [x, y + 27]], 2.6, WOOD, B.L); }
    return s;
  }],
  ['storage_pit', 'Silo de foso', 'ya existe', 96, () =>
    gShadow(72, 88, 48, 9)
    + ell(72, 72, 40, 18, '#6b5236', B.L) + ell(72, 74, 30, 12, B.dark, B.L)
    + shape('M42,72Q72,52 102,72L94,84Q72,92 50,84Z', '#a4784c', B.L)
    + stroke('M50,76Q72,60 94,76M52,82Q72,70 92,82', '#7d5735', 1)
    + [[36, 66], [46, 58], [98, 60], [108, 68], [104, 82], [40, 82]].map(([x, y]) => ell(x, y, 4.6, 3.2, B.stone, B.L)).join('')],
  ['granary', 'Granero elevado', 'ya existe', 144, () =>
    gShadow(74, 102, 56, 9)
    + [40, 62, 84, 106].map(x => limb([[x, 78], [x, 100]], 4, WOOD, B.L) + ell(x, 84, 6.4, 2.2, B.stoneD, B.L)).join('')
    + shape(poly([[34, 44], [110, 44], [110, 78], [34, 78]]), B.wattle, B.L)
    + Array.from({ length: 8 }, (_, i) => stroke(`M${40 + i * 9},44L${40 + i * 9},78`, B.wattleD, 1)).join('')
    + stroke('M34,54L110,54M34,64L110,64', '#c9a373', 1.2)
    + shape(poly([[62, 54], [82, 54], [82, 72], [62, 72]]), B.dark, B.L)
    + shape('M22,48L72,10L122,48Q72,54 22,48Z', B.thatch, B.L) + thatchLines(34, 110, 20, 50, 8)
    + stroke('M118,60L132,98M124,60L138,98M120,70L130,70M124,80L134,80M128,90L136,90', WOOD, 2)],
  ['snare', 'Línea de lazos', 'snares', 96, () =>
    gShadow(72, 94, 46, 7)
    + `<path d="M40,96C30,60 44,26 82,22" fill="none" stroke="${B.L}" stroke-width="5.4" stroke-linecap="round"/><path d="M40,96C30,60 44,26 82,22" fill="none" stroke="${WOOD}" stroke-width="3.4" stroke-linecap="round"/>`
    + stroke('M82,22Q96,40 92,62', CORD, 1.4)
    + `<ellipse cx="92" cy="70" rx="9" ry="7" fill="none" stroke="${CORD}" stroke-width="1.8"/>`
    + limb([[100, 88], [100, 70]], 3.4, WOOD, B.L)
    + [[50, 92], [60, 90], [112, 92], [122, 90]].map(([x, y]) => limb([[x, y], [x + 2, y - 10]], 2.4, WOOD, B.L)).join('')],
  ['fish_trap', 'Nasa de pesca', 'fish_trap', 96, () =>
    ell(72, 80, 56, 24, '#3f78a8', '#2a5479')
    + stroke('M28,78Q40,74 52,78M84,88Q100,84 112,88M46,90Q56,87 66,90', '#8fbce0', 1.2)
    + [[30, 66], [38, 70], [46, 74], [54, 78], [62, 82], [114, 66], [106, 70], [98, 74], [90, 78], [82, 82]].map(([x, y]) => limb([[x, y], [x, y - 12]], 2.4, WOOD, B.L)).join('')
    + shape('M58,92L86,92L72,60Z', '#b58d5e', B.L)
    + stroke('M62,86L82,86M66,78L78,78M69,70L75,70', '#8a643e', 1)
    + ell(72, 92, 14, 3.2, '#8a643e', B.L)],
  ['pen', 'Corral', 'herding / taming', 144, () => {
    const P: Pt[] = [[38, 52], [108, 52], [124, 96], [22, 96]];
    let s = gShadow(74, 102, 58, 7);
    s += shape(poly(P), '#6a5a3a', 'none');
    s += ell(56, 74, 9, 6, '#f1ece0', B.L) + ell(64, 72, 3.2, 3.2, '#3a2c20', B.L) + ell(92, 82, 9, 6, '#e8e2d2', B.L) + ell(100, 80, 3.2, 3.2, '#3a2c20', B.L) + ell(74, 60, 6, 4.4, '#f1ece0', B.L);
    const along = (a: Pt, b: Pt, t: number): Pt => lerp(a, b, t);
    const rail = (a: Pt, b: Pt): string => limb([a, b], 2.4, WOOD, B.L);
    s += rail([P[0][0], P[0][1] - 10], [P[1][0], P[1][1] - 10]) + rail([P[0][0], P[0][1] - 20], [P[1][0], P[1][1] - 20]);
    for (let i = 0; i <= 4; i++) { const p = along(P[0], P[1], i / 4); s += limb([p, [p[0], p[1] - 24]], 3, WOOD, B.L); }
    s += rail([P[0][0], P[0][1] - 10], [P[3][0], P[3][1] - 10]) + rail([P[1][0], P[1][1] - 10], [P[2][0], P[2][1] - 10]);
    for (const [a, b] of [[P[0], P[3]], [P[1], P[2]]]) for (let i = 1; i <= 3; i++) { const p = along(a, b, i / 4); s += limb([p, [p[0], p[1] - 24]], 3, WOOD, B.L); }
    s += rail([P[3][0], P[3][1] - 8], [P[2][0], P[2][1] - 8]) + rail([P[3][0], P[3][1] - 18], [P[2][0], P[2][1] - 18]);
    for (let i = 0; i <= 4; i++) { const p = along(P[3], P[2], i / 4); s += limb([p, [p[0], p[1] - 22]], 3.4, WOOD, B.L); }
    return s;
  }],
  ['quern', 'Molino de mano', 'grinding', 144, () =>
    gShadow(74, 102, 58, 10)
    + shape(smooth([[18, 86], [30, 68], [110, 66], [128, 84], [116, 100], [30, 100]]), '#a9a49a', B.L)
    + shape(smooth([[34, 82], [70, 72], [96, 78], [80, 92], [44, 94]]), '#8e8a82', B.L)
    + shape(smooth([[54, 80], [74, 76], [84, 80], [72, 86], [58, 86]]), '#c0bbb0', B.L)
    + shape(smooth([[102, 92], [110, 78], [122, 90], [114, 100]]), '#d8c070', B.L)
    + stroke('M106,90l4,-6M112,94l4,-6', '#b39a4a', 1)
    + shape('M20,70L36,60L44,70Q34,78 22,76Z', '#b58d5e', B.L)],
  ['field', 'Campo de cultivo', 'farming', 144, () => {
    let s = shape(poly([[26, 36], [118, 36], [136, 100], [8, 100]]), '#6b5335', B.L);
    for (let r = 0; r < 5; r++) {
      const y = 46 + r * 12, k = r / 4;
      const xa = 26 - 18 * k + 3, xb = 118 + 18 * k - 3;
      s += stroke(`M${xa},${y}L${xb},${y}`, '#54402a', 1.6);
      for (let x = xa + 6; x < xb; x += 12 - r * 0.3) {
        const h = 5 + r * 1.4;
        s += stroke(`M${r2(x)},${y}L${r2(x - 1)},${r2(y - h)}M${r2(x)},${y}L${r2(x + 2.4)},${r2(y - h * 0.8)}`, '#7fa04a', 1.4 + r * 0.2);
        if (r % 2) s += ell(x - 1, y - h, 1.2, 1.6, '#d9b44a');
      }
    }
    return s;
  }],
  ['compost_heap', 'Montón de abono', 'composting', 96, () =>
    gShadow(72, 96, 46, 8)
    + [[36, 96], [108, 96]].map(([x, y]) => limb([[x, y], [x, y - 32]], 3.4, WOOD, B.L)).join('')
    + shape(smooth([[26, 90], [34, 62], [72, 48], [110, 62], [120, 90], [72, 100]]), '#4a3a26', B.L)
    + stroke('M40,80l10,-8M60,70l12,-6M82,76l10,-9M52,88l12,-7M92,86l10,-6', '#c9b060', 1.4)
    + [[50, 66], [76, 58], [96, 72], [64, 80]].map(([x, y]) => ell(x, y, 3.4, 2.2, '#5f8f3c')).join('')],
  ['loom', 'Telar de pesas', 'weaving', 144, () =>
    gShadow(74, 102, 54, 8)
    + limb([[40, 100], [40, 26]], 5, WOOD, B.L) + limb([[104, 100], [104, 26]], 5, WOOD, B.L)
    + shape(poly([[36, 28], [108, 28], [108, 34], [36, 34]]), '#94703f', B.L)
    + shape(poly([[44, 36], [100, 36], [100, 62], [44, 62]]), '#d8ccaa', B.L)
    + shape(poly([[44, 44], [100, 44], [100, 50], [44, 50]]), '#a8603b') + shape(poly([[44, 54], [100, 54], [100, 58], [44, 58]]), '#3b6ea8')
    + Array.from({ length: 12 }, (_, i) => stroke(`M${48 + i * 4.6},62L${48 + i * 4.6},84`, '#efe7d6', 0.9)).join('')
    + [0, 1, 2, 3].map(i => ell(52 + i * 13.5, 88, 4.6, 5.6, B.stoneL, B.L)).join('')
    + shape(poly([[56, 94], [88, 94], [88, 100], [56, 100]]), '#8d6c46', B.L)],
  ['oven', 'Horno de barro', 'bread', 144, () =>
    gShadow(74, 102, 58, 10)
    + shape(poly([[22, 88], [122, 88], [126, 100], [18, 100]]), B.stone, B.L)
    + shape('M28,90C28,52 48,38 72,38C96,38 116,52 116,90Z', B.clay, B.L)
    + stroke('M36,76Q72,66 108,76M40,62Q72,52 104,62', '#b3744a', 1.6)
    + shape('M56,90L56,72Q72,56 88,72L88,90Z', B.dark, B.L)
    + shape('M62,90L62,78Q72,68 82,78L82,90Z', '#f08a2c') + flame(72, 90, 0.7)
    + ell(72, 40, 4.4, 2, B.dark, B.L) + smoke(72, 36)
    + logs(120, 104).replace(/<ellipse/g, '<ellipse')],
  ['kiln', 'Horno de cerámica', 'kiln', 144, () =>
    gShadow(74, 102, 52, 10)
    + shape('M34,98L40,50Q72,40 104,50L110,98Z', '#b0623f', B.L)
    + ell(72, 48, 32, 8, B.dark, B.L)
    + stroke('M38,86L106,86M37,74L107,74M39,62L105,62', '#8f4a2c', 1.4)
    + stroke('M52,62L54,74M76,62L78,74M92,74L94,86M60,74L62,86', '#8f4a2c', 1)
    + shape('M58,98L58,84Q72,70 86,84L86,98Z', B.dark, B.L) + shape('M64,98L64,88Q72,80 80,88L80,98Z', '#f08a2c')
    + smoke(72, 40)
    + shape(smooth([[112, 94], [120, 84], [132, 90], [126, 100]]), '#c98a5a', B.L)],
  ['well', 'Pozo', 'well', 96, () =>
    gShadow(72, 96, 44, 8)
    + limb([[46, 84], [72, 22]], 3.6, WOOD, B.L) + limb([[98, 84], [72, 22]], 3.6, WOOD, B.L)
    + ell(72, 82, 36, 15, '#8f8b83', B.L) + ell(72, 82, 27, 10, '#12324a', B.L)
    + shape('M36,82L36,92Q72,112 108,92L108,82Q72,98 36,82Z', '#7d796f', B.L)
    + stroke('M46,90L50,96M60,95L62,101M76,97L77,103M90,94L92,100', B.stoneD, 1)
    + stroke('M72,24L72,64', CORD, 1.6) + shape(poly([[66, 64], [78, 64], [76, 74], [68, 74]]), '#94703f', B.L)
    + limb([[50, 50], [94, 50]], 3, WOOD, B.L)],
  ['library', 'Biblioteca', 'library + clay_tablet', 144, () =>
    gShadow(74, 104, 62, 10)
    + shape(poly([[22, 54], [122, 54], [122, 98], [22, 98]]), '#cfc6b0', B.L)
    + shape(poly([[14, 54], [72, 22], [130, 54]]), '#b9ae94', B.L)
    + shape(poly([[30, 52], [72, 30], [114, 52]]), '#a89d84') + ell(72, 44, 4.4, 4.4, '#c69a6a', B.L)
    + [34, 54, 90, 110].map(x => shape(poly([[x - 4, 58], [x + 4, 58], [x + 3.4, 96], [x - 3.4, 96]]), '#e6dfcb', B.L) + shape(poly([[x - 6, 54], [x + 6, 54], [x + 6, 59], [x - 6, 59]]), '#d9d0b8', B.L)).join('')
    + door(64, 68, 16, 30)
    + shape(poly([[18, 98], [126, 98], [126, 103], [18, 103]]), '#a89d84', B.L)
    + [0, 1, 2].map(i => shape(poly([[20 - i * 1, 92 - i * 5], [34 - i * 1, 92 - i * 5], [34 - i * 1, 96 - i * 5], [20 - i * 1, 96 - i * 5]]), '#c69a6a', B.L)).join('')],
  ['hearth', 'Hoguera', 'firemaking', 96, () =>
    gShadow(72, 96, 34, 7)
    + ell(72, 84, 30, 12, B.stone, B.L)
    + [[46, 80], [58, 72], [72, 70], [86, 72], [98, 80], [94, 92], [72, 96], [50, 92]].map(([x, y]) => ell(x, y, 7.6, 5.4, B.stoneL, B.L)).join('')
    + ell(72, 83, 22, 8, '#2a1c12')
    + limb([[54, 88], [90, 78]], 4.4, '#6a4a2a', B.L) + limb([[56, 78], [88, 90]], 4.4, '#7d5a36', B.L)
    + flame(72, 82, 1.5)],
  // M15 phase 37: a heap of deadwood sealed under turf, a vent smoking at the top.
  ['charcoal_pit', 'Carbonera', 'charcoal', 144, () =>
    gShadow(74, 102, 56, 10)
    + shape('M22,98C22,58 46,36 72,36C98,36 122,58 122,98Z', '#5a4630', B.L)
    + stroke('M30,90Q72,78 114,90M34,74Q72,62 110,74M46,58Q72,50 98,58', '#3f301f', 1.8)
    + Array.from({ length: 9 }, (_, i) => ell(34 + i * 10.5, 94 - (i % 3) * 4, 6, 2.6, '#6b5236', B.L)).join('')
    + shape('M30,98C30,70 50,50 72,50C94,50 114,70 114,98Z', '#7a6244', B.L)
    + stroke('M44,86Q72,76 100,86M52,70Q72,62 92,70', '#5d4930', 1.4)
    + ell(72, 38, 6, 2.6, B.dark, B.L) + smoke(72, 34)
    + shape(smooth([[104, 96], [114, 90], [124, 94], [118, 102], [106, 102]]), '#2b2622', B.L)
    + ell(112, 96, 3, 1.6, '#4a423a') + ell(119, 97, 2.4, 1.4, '#3a342e')],
];

const FLOOR = '#6b5236', PLANK = '#a4784c';
const hearthPlan = (x: number, y: number, r = 8): string => `<circle cx="${x}" cy="${y}" r="${r + 3}" fill="${B.stoneL}" stroke="${B.L}" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="${r - 1}" fill="#2a1c12"/>`
  + stroke(`M${x - 4},${y - 2}L${x + 4},${y + 2}M${x - 4},${y + 2}L${x + 4},${y - 2}`, '#7d5a36', 2.2) + ell(x, y, 2.6, 2.6, '#f2a03a');
const ringPlan = (cx: number, cy: number, r: number, wall: number, fill: string, tex: string): string => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${B.L}" stroke-width="2"/>`
  + `<circle cx="${cx}" cy="${cy}" r="${r - wall / 2}" fill="none" stroke="${tex}" stroke-width="${wall * 0.55}" stroke-dasharray="7 4"/>`
  + `<circle cx="${cx}" cy="${cy}" r="${r - wall}" fill="${FLOOR}" stroke="${B.L}" stroke-width="2"/>`;
export const PLANS: PlanArt[] = [
  ['mud_hut', 'Choza de barro', 144, () => ringPlan(72, 56, 48, 10, B.mud, B.mudL)
    + `<rect x="61" y="86" width="22" height="24" fill="${FLOOR}"/>` + stroke('M61,88L61,106M83,88L83,106', B.L, 2) + ell(72, 108, 12, 3, B.stoneL, B.L) + hearthPlan(72, 52)],
  ['wattle_hut', 'Choza de varas', 144, () => ringPlan(72, 56, 48, 9, B.wattle, B.wattleD)
    + Array.from({ length: 18 }, (_, i) => { const a = i / 18 * Math.PI * 2; return ell(72 + Math.cos(a) * 44, 56 + Math.sin(a) * 44, 2.2, 2.2, WOOD, B.L); }).join('')
    + `<rect x="62" y="86" width="20" height="24" fill="${FLOOR}"/>` + stroke('M62,88L62,106M82,88L82,106', B.L, 2) + hearthPlan(72, 52)],
  ['stone_house', 'Casa de piedra', 144, () => shape(poly([[22, 6], [122, 6], [122, 106], [22, 106]]), B.stone, B.L)
    + shape(poly([[34, 18], [110, 18], [110, 94], [34, 94]]), PLANK, B.L)
    + Array.from({ length: 6 }, (_, i) => stroke(`M34,${30 + i * 12}L110,${30 + i * 12}`, '#7d5735', 1)).join('')
    + Array.from({ length: 10 }, (_, i) => stroke(`M${22 + i * 10},6L${22 + i * 10},18M${22 + i * 10},94L${22 + i * 10},106`, B.stoneD, 1)).join('')
    + `<rect x="62" y="92" width="20" height="16" fill="${PLANK}"/>` + stroke('M62,94L62,106M82,94L82,106', B.L, 2)
    + shape(poly([[22, 40], [34, 40], [34, 52], [22, 52]]), B.dark, B.L) + shape(poly([[110, 40], [122, 40], [122, 52], [110, 52]]), B.dark, B.L)
    + hearthPlan(72, 50)],
  ['longhouse', 'Casa larga', 288, () => shape(poly([[34, 6], [254, 6], [254, 106], [34, 106]]), B.wattle, B.L)
    + Array.from({ length: 24 }, (_, i) => ell(40 + i * 9.2, 12, 1.8, 1.8, WOOD, B.L) + ell(40 + i * 9.2, 100, 1.8, 1.8, WOOD, B.L)).join('')
    + shape(poly([[46, 20], [242, 20], [242, 92], [46, 92]]), FLOOR, B.L)
    + `<rect x="132" y="90" width="24" height="18" fill="${FLOOR}"/>` + stroke('M132,92L132,106M156,92L156,106', B.L, 2)
    + hearthPlan(104, 54) + hearthPlan(184, 54)],
  ['granary', 'Granero elevado', 144, () => shape(poly([[22, 6], [122, 6], [122, 106], [22, 106]]), PLANK, B.L)
    + Array.from({ length: 8 }, (_, i) => stroke(`M22,${18 + i * 12}L122,${18 + i * 12}`, '#7d5735', 1)).join('')
    + [[28, 12], [116, 12], [28, 100], [116, 100]].map(([x, y]) => ell(x, y, 6, 6, B.stoneD, B.L) + ell(x, y, 3, 3, WOOD, B.L)).join('')
    + shape(poly([[56, 28], [88, 28], [88, 60], [56, 60]]), '#7d5735', B.L) + stroke('M60,32L84,56M84,32L60,56', B.L, 1.2)
    + stroke('M112,106L128,124M122,106L138,124M114,114L128,114', WOOD, 2)],
  ['library', 'Biblioteca', 144, () => shape(poly([[22, 6], [122, 6], [122, 106], [22, 106]]), '#cfc6b0', B.L)
    + shape(poly([[32, 16], [112, 16], [112, 90], [32, 90]]), '#b9ae94', B.L)
    + Array.from({ length: 8 }, (_, i) => shape(poly([[36 + i * 9.6, 18], [43 + i * 9.6, 18], [43 + i * 9.6, 26], [36 + i * 9.6, 26]]), '#c69a6a', B.L)).join('')
    + shape(poly([[36, 42], [44, 42], [44, 70], [36, 70]]), '#a68a5e', B.L) + shape(poly([[100, 42], [108, 42], [108, 70], [100, 70]]), '#a68a5e', B.L)
    + shape(poly([[56, 48], [88, 48], [88, 66], [56, 66]]), PLANK, B.L)
    + [30, 50, 94, 114].map(x => ell(x, 98, 5, 5, '#e6dfcb', B.L)).join('')
    + `<rect x="62" y="92" width="20" height="16" fill="#b9ae94"/>` + stroke('M62,94L62,106M82,94L82,106', B.L, 2)],
];

