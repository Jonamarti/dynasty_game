/** Objects a person can hold or carry, drawn as 64 px icons and as hand-held pictures. */
import { ell, limb, poly, shape, smooth, stroke } from '../lib/draw.ts';

export type ItemArt = [id: string, label: string, tech: string, draw: () => string];

export const WOOD = '#86633c', WOOD_D = '#3a2716', STONE = '#a9adb0', STONE_D = '#3d4244', BONE = '#e6dcc0', BONE_D = '#7a6d4e', CORD = '#c9b27f';
const rot = (inner: string, deg: number, cx = 32, cy = 32): string => `<g transform="rotate(${deg} ${cx} ${cy})">${inner}</g>`;
export const ITEMS: ItemArt[] = [
  ['antler_pick', 'Pico de asta', 'bone_working', () => rot(
    limb([[28, 58], [32, 14]], 5, BONE, BONE_D)
    + shape('M30,16Q40,4 54,12Q44,14 35,23Z', BONE, BONE_D)
    + stroke('M28,38L20,28M30,28L24,18', BONE, 3), 18)],
  ['spade', 'Pala de madera', 'carpentry', () => rot(
    limb([[32, 6], [32, 39]], 3.4, WOOD, WOOD_D)
    + shape('M24,36L40,36L42,53Q32,66 22,53Z', WOOD, WOOD_D)
    + stroke('M30,39L28,53M34,39L36,53', '#b19165', 1), 20)],
  ['handaxe', 'Hacha de mano', 'ya existe', () =>
    shape(smooth([[32, 8], [43, 24], [47, 44], [32, 57], [18, 44], [22, 24]]), '#a4a8ab', STONE_D)
    + stroke('M27,26L34,32M25,40L37,45M31,15L30,23M38,36L42,42', '#7d8285', 1.1)],
  ['stone_axe', 'Hacha pulida', 'ground_stone', () => rot(
    limb([[32, 60], [32, 10]], 3.6, WOOD, WOOD_D)
    + shape(poly([[32, 8], [47, 5], [52, 21], [32, 22]]), '#8fa393', '#3b4a3f')
    + stroke('M30,14L35,14M30,18L35,18M30,22L35,22', CORD, 1.6)
    + stroke('M46,8L50,20', '#c7d6c9', 1.2), 30)],
  ['adze', 'Azuela', 'carpentry', () => rot(
    limb([[30, 60], [30, 14]], 3.4, WOOD, WOOD_D)
    + shape(poly([[26, 14], [48, 9], [50, 15], [30, 20]]), '#8fa393', '#3b4a3f')
    + stroke('M30,17L34,15.6M30,21L34,19.6', CORD, 1.6), 24)],
  ['spear', 'Lanza', 'spear', () => rot(
    limb([[32, 62], [32, 14]], 2.6, WOOD, WOOD_D)
    + shape(poly([[32, 2], [37, 14], [32, 18], [27, 14]]), '#a9adb0', STONE_D)
    + stroke('M29.5,17L34.5,17M29.5,20L34.5,20', CORD, 1.5), 28)],
  ['bow', 'Arco y flecha', 'bow', () =>
    stroke('M22,6Q4,32 22,58', WOOD, 3.4)
    + stroke('M22,6L22,58', '#efe7d6', 0.9)
    + limb([[12, 32], [56, 32]], 1.5, '#a9835a', WOOD_D)
    + shape(poly([[60, 32], [54, 29.5], [54, 34.5]]), STONE, STONE_D)
    + shape(poly([[12, 32], [8, 28.5], [17, 30]]), '#d9d4c6', '#6a6558') + shape(poly([[12, 32], [8, 35.5], [17, 34]]), '#d9d4c6', '#6a6558')],
  ['atlatl', 'Lanzadardos', 'atlatl', () => rot(
    limb([[32, 58], [32, 14]], 3.2, WOOD, WOOD_D)
    + shape('M28,14Q28,8 33,8L36,8L36,12L33,12L32,16Z', WOOD, WOOD_D)
    + ell(28, 46, 3, 2, 'none', WOOD_D) + stroke('M25,44L25,52', CORD, 1.6), 32)
    + limb([[10, 18], [54, 10]], 1.4, '#a9835a', WOOD_D)],
  ['bone_point', 'Punta de hueso', 'bone_working', () => rot(
    shape(smooth([[32, 6], [37, 30], [36, 56], [28, 56], [27, 30]]), BONE, BONE_D)
    + stroke('M30,22L30,50M33,20L33,48', '#c9bd9c', 0.9), 20)],
  ['net', 'Red', 'netting', () =>
    shape(poly([[8, 14], [56, 14], [52, 52], [12, 52]]), 'none', '#6d6535')
    + Array.from({ length: 6 }, (_, i) => stroke(`M${10 + i * 8},14L${16 + i * 8},52M${18 + i * 8},14L${12 + i * 8},52`, '#b3b76a', 1)).join('')
    + ell(14, 14, 2.6, 2, WOOD, WOOD_D) + ell(32, 14, 2.6, 2, WOOD, WOOD_D) + ell(50, 14, 2.6, 2, WOOD, WOOD_D)
    + ell(16, 52, 2.6, 2, STONE, STONE_D) + ell(48, 52, 2.6, 2, STONE, STONE_D)],
  ['flute', 'Flauta de hueso', 'flute', () => rot(
    limb([[32, 58], [32, 8]], 6.4, BONE, BONE_D)
    + [16, 24, 32, 40].map(y => ell(32, y, 1.5, 1.2, BONE_D)).join('')
    + ell(32, 12, 2.4, 1.6, '#3a3222'), 34)],
  ['needle', 'Aguja de hueso', 'bone_working', () =>
    limb([[12, 52], [50, 14]], 2.4, BONE, BONE_D)
    + ell(50, 14, 1.4, 1.4, BONE_D)
    + stroke('M50,14Q60,8 58,24Q56,40 34,44Q18,46 22,34', '#d9c9a0', 1.3)],
  ['sickle', 'Hoz', 'sickle', () =>
    limb([[14, 56], [26, 34]], 4.2, WOOD, WOOD_D)
    + `<path d="M26,36Q38,8 56,26" fill="none" stroke="${STONE_D}" stroke-width="5.2" stroke-linecap="round"/><path d="M26,36Q38,8 56,26" fill="none" stroke="${STONE}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="3.4 1.4"/>`],
  ['torch', 'Antorcha', 'firemaking', () =>
    limb([[26, 60], [26, 26]], 3.4, WOOD, WOOD_D)
    + ell(26, 24, 5.4, 7.4, '#4a3020', WOOD_D)
    + shape(smooth([[26, 2], [34, 13], [31, 22], [21, 22], [18, 13]]), '#f2a03a', '#7a2f10')
    + shape(smooth([[26, 9], [30, 15], [28, 21], [24, 21], [22, 15]]), '#ffe08a')],
  ['basket', 'Cesta', 'basketry', () =>
    stroke('M14,28Q32,2 50,28', '#6d4c2c', 2.4)
    + shape('M14,28L50,28L44,54Q32,59 20,54Z', '#b58d5e', '#5a3d22')
    + stroke('M16,36L48,36M18,44L46,44M24,28L24,55M32,28L32,57M40,28L40,55', '#8a643e', 1)
    + ell(32, 28, 18, 4, '#e0a24a', '#5a3d22')],
  ['hide_bag', 'Bolsa de piel', 'leatherwork', () =>
    shape(smooth([[32, 14], [45, 22], [51, 42], [41, 56], [23, 56], [13, 42], [19, 22]]), '#9a6f45', '#3d2914')
    + stroke('M20,22Q32,30 44,22', CORD, 1.8) + stroke('M32,26Q34,34 30,36', CORD, 1.2)
    + shape(smooth([[26, 12], [32, 6], [38, 12], [32, 17]]), '#8a6038', '#3d2914')],
  ['bundle', 'Hatillo de palos', 'cordage', () => rot(
    [-8, -3, 2, 7, 12].map((dx, i) => limb([[32 + dx, 56 + (i % 2)], [32 + dx, 8 + (i % 3) * 2]], 4, i % 2 ? '#94703f' : WOOD, WOOD_D)).join('')
    + stroke('M18,22L46,22M18,42L46,42', CORD, 2.6), 14)],
  ['pottery', 'Vasija', 'pottery', () =>
    shape('M19,18Q8,38 21,55L43,55Q56,38 45,18Z', '#c98a5a', '#5b3319')
    + ell(32, 18, 13.4, 4, '#a8693f', '#5b3319')
    + stroke('M14,30L50,30M13,38L51,38', '#7d4a2a', 1.3)
    + stroke('M16,34l3,-3l3,3l3,-3l3,3l3,-3l3,3l3,-3l3,3l3,-3l3,3', '#7d4a2a', 1)],
  ['rope', 'Cuerda', 'cordage', () =>
    [19, 13, 7].map(r => `<ellipse cx="32" cy="34" rx="${r + 4}" ry="${r}" fill="none" stroke="${CORD}" stroke-width="3.6"/><ellipse cx="32" cy="34" rx="${r + 4}" ry="${r}" fill="none" stroke="#8f7a4c" stroke-width="3.6" stroke-dasharray="1.6 3"/>`).join('')
    + stroke('M50,40Q58,52 48,58', CORD, 3.2)],
  ['sledge', 'Trineo', 'carpentry', () =>
    stroke('M6,50Q4,50 6,46L58,46', WOOD, 3.6) + stroke('M6,58Q2,58 6,54L58,54', WOOD, 3.6)
    + shape(poly([[10, 36], [54, 36], [58, 46], [6, 46]]), '#a67c4c', WOOD_D)
    + stroke('M16,36L14,46M28,36L28,46M40,36L42,46', WOOD_D, 1)
    + stroke('M58,44Q62,36 56,30', CORD, 1.8)],
  ['cart', 'Carro', 'the_wheel', () =>
    shape(poly([[8, 22], [46, 22], [46, 36], [8, 36]]), '#a67c4c', WOOD_D)
    + stroke('M46,30L62,46', WOOD, 3)
    + `<circle cx="26" cy="44" r="13" fill="${WOOD}" stroke="${WOOD_D}" stroke-width="1.6"/><circle cx="26" cy="44" r="10.4" fill="#a67c4c"/>`
    + stroke('M26,34L26,54M16,44L36,44', WOOD_D, 1.4) + ell(26, 44, 2.6, 2.6, WOOD_D)],
  ['spindle', 'Huso', 'spinning', () =>
    limb([[32, 6], [32, 58]], 2.2, WOOD, WOOD_D)
    + ell(32, 44, 10, 3.6, '#c98a5a', '#5b3319')
    + shape(smooth([[27, 20], [37, 20], [36, 34], [28, 34]]), '#e8e0c8', BONE_D)
    + stroke('M27,24L37,25M27,28L37,29', '#c9bd9c', 0.9)],
  ['ochre', 'Concha de ocre', 'ochre', () =>
    shape(smooth([[10, 34], [20, 24], [44, 24], [54, 34], [44, 48], [20, 48]]), '#e9e0c8', BONE_D)
    + ell(32, 34, 15, 7, '#a53a20', '#5b1d10') + ell(28, 32, 5, 2, '#c95a3a')
    + stroke('M16,28l-4,-6M48,28l4,-6', '#a53a20', 2)],
  ['hoe', 'Azada de asta', 'farming', () => rot(
    limb([[32, 60], [32, 12]], 3.2, WOOD, WOOD_D)
    + shape(poly([[32, 12], [50, 8], [52, 14], [34, 22]]), BONE, BONE_D)
    + stroke('M32,15L38,14M32,19L38,18', CORD, 1.6), 16)],
];
