/** Objects a person can hold or carry, drawn as 64 px icons and as hand-held pictures. */
import { ell, limb, poly, shape, smooth, stroke } from '../lib/draw.ts';

export type ItemArt = [id: string, label: string, tech: string, draw: () => string];

export const WOOD = '#86633c', WOOD_D = '#3a2716', STONE = '#a9adb0', STONE_D = '#3d4244', BONE = '#e6dcc0', BONE_D = '#7a6d4e', CORD = '#c9b27f';
const rot = (inner: string, deg: number, cx = 32, cy = 32): string => `<g transform="rotate(${deg} ${cx} ${cy})">${inner}</g>`;
export const ITEMS: ItemArt[] = [
  ['hide_cape', 'Capa de piel', 'clothing', () =>
    shape(smooth([[20, 10], [32, 16], [44, 10], [58, 48], [44, 55], [20, 55], [6, 48]]), '#aa875a', '#513a24')
    + stroke('M20,10Q32,22 44,10M32,18L32,49', CORD, 1.6)],
  ['sewn_tunic', 'Túnica cosida', 'tailoring', () =>
    shape(poly([[18, 9], [26, 14], [38, 14], [46, 9], [59, 26], [48, 32], [44, 25], [47, 55], [17, 55], [20, 25], [16, 32], [5, 26]]), '#ba9b6f', '#513a24')
    + stroke('M25,16L25,51M39,16L39,51M18,51L46,51', '#e5d4b0', 1.2)],
  ['bedding', 'Lecho', 'cordage', () =>
    ell(32, 51, 24, 5, 'rgba(0,0,0,0.18)')
    + shape(poly([[8, 31], [31, 18], [56, 31], [32, 45]]), '#c2a36a', WOOD_D)
    + shape(poly([[13, 31], [31, 21], [51, 32], [32, 42]]), '#b7a17c', '#79684d')
    + stroke('M17,31L33,40M26,26L42,35M37,23L49,30', '#e0d0ae', 1.4)],
  ['bed', 'Cama', 'carpentry', () =>
    ell(32, 53, 25, 5, 'rgba(0,0,0,0.2)')
    + shape(poly([[7, 26], [31, 13], [57, 27], [32, 41]]), WOOD, WOOD_D)
    + shape(poly([[7, 30], [32, 44], [32, 52], [7, 38]]), '#6f4c2d', WOOD_D)
    + shape(poly([[32, 44], [57, 30], [57, 38], [32, 52]]), '#593c25', WOOD_D)
    + shape(poly([[12, 27], [32, 16], [52, 28], [32, 39]]), '#d7ccb4', '#76684f')
    + shape(poly([[13, 26], [23, 21], [30, 25], [20, 29]]), '#eee5d3', '#8f8065')
    + stroke('M14,34L14,41M50,32L50,39M32,44L32,51', WOOD, 2)],
  ['raft', 'Balsa de juncos', 'cordage', () =>
    [16, 24, 32, 40, 48].map(x => limb([[x, 12], [x, 52]], 7, '#b89d5c', '#685332')).join('')
    + stroke('M12,23L52,23M12,41L52,41', CORD, 2.6)
    + limb([[10, 56], [52, 8]], 2.2, WOOD, WOOD_D)],
  ['logboat', 'Canoa de tronco', 'logboat', () =>
    shape(smooth([[4, 30], [12, 25], [20, 26], [32, 28], [44, 26], [52, 25], [60, 30], [54, 42], [46, 48], [32, 51], [18, 48], [10, 42]]), '#9a7144', WOOD_D)
    + shape(smooth([[12, 31], [22, 34], [32, 35], [42, 34], [52, 31], [48, 41], [40, 45], [32, 47], [24, 45], [16, 41]]), '#5b472f', WOOD_D)
    + stroke('M11,30Q32,38 53,30M19,39L24,42M45,39L40,42', '#d1aa70', 1.8)],
  ['sail', 'Vela', 'sail', () =>
    limb([[20, 57], [20, 9]], 2.8, WOOD, WOOD_D)
    + shape(poly([[23, 12], [51, 43], [23, 43]]), '#e7ddc4', '#65583f')
    + stroke('M25,17L45,40M28,22L40,40M20,44L51,44', '#a89570', 1.3)
    + stroke('M20,57Q37,51 55,57', WOOD, 3)],
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
  ['copper_nugget', 'Pepita de cobre', 'native_copper', () =>
    shape(smooth([[12, 40], [20, 26], [34, 24], [44, 34], [40, 48], [22, 50]]), '#c9803c', '#6b3a14')
    + shape(smooth([[34, 20], [44, 12], [54, 18], [52, 30], [42, 30]]), '#d99454', '#6b3a14')
    + ell(24, 34, 3.2, 2.2, '#5f9a7c') + stroke('M18,40L30,36M38,38L46,34', '#e8b27a', 1.1)],
  ['copper_awl', 'Punzón de cobre', 'native_copper', () => rot(
    limb([[32, 58], [32, 28]], 5, WOOD, WOOD_D)
    + shape(poly([[32, 4], [35.5, 28], [28.5, 28]]), '#c9803c', '#6b3a14')
    + stroke('M32,8L32,26', '#e8b27a', 1), 26)],
  ['copper_pendant', 'Colgante de cobre', 'native_copper', () =>
    stroke('M14,10Q32,2 50,10', CORD, 1.8)
    + stroke('M32,6L32,24', CORD, 1.6)
    + shape(smooth([[32, 24], [42, 32], [40, 46], [32, 54], [24, 46], [22, 32]]), '#c9803c', '#6b3a14')
    + ell(32, 36, 5, 5, 'none', '#6b3a14') + stroke('M26,34Q30,28 36,30', '#e8b27a', 1.1)],
  ['copper_ore', 'Mineral de cobre', 'mining', () =>
    shape(smooth([[8, 46], [14, 28], [30, 20], [48, 26], [56, 42], [44, 54], [20, 54]]), '#7a8f86', '#2f3d38')
    + [[22, 32], [34, 28], [44, 38], [26, 44], [38, 46]].map(([x, y]) => ell(x!, y!, 3.2, 2.2, '#3fae8a', '#1f5c49')).join('')
    + stroke('M14,44L30,38M34,24L46,30', '#a9bdb4', 1.1)],
  ['tin_ore', 'Mineral de estaño', 'mining', () =>
    shape(smooth([[8, 46], [14, 28], [30, 20], [48, 26], [56, 42], [44, 54], [20, 54]]), '#aeb4bb', '#3f444a')
    + [[22, 32], [34, 28], [44, 38], [26, 44], [38, 46]].map(([x, y]) => ell(x!, y!, 3, 2, '#eef1f3', '#69717a')).join('')
    + stroke('M14,44L30,38M34,24L46,30', '#d4d8dc', 1.1)],
  ['copper', 'Lingote de cobre', 'smelting', () =>
    shape(poly([[8, 42], [18, 24], [48, 24], [58, 42], [50, 52], [16, 52]]), '#c9803c', '#6b3a14')
    + shape(poly([[18, 24], [48, 24], [44, 32], [22, 32]]), '#e8b27a', '#6b3a14')
    + stroke('M18,40L48,40M22,46L44,46', '#a8642a', 1.2)],
  ['copper_axe', 'Hacha de cobre', 'casting', () => rot(
    limb([[32, 60], [32, 10]], 3.6, WOOD, WOOD_D)
    + shape(poly([[32, 6], [49, 3], [54, 22], [32, 24]]), '#c9803c', '#6b3a14')
    + stroke('M30,14L35,14M30,18L35,18M30,22L35,22', CORD, 1.6)
    + stroke('M47,7L51,20', '#e8b27a', 1.2), 30)],
  ['copper_dagger', 'Daga de cobre', 'casting', () => rot(
    shape(poly([[32, 4], [37, 38], [27, 38]]), '#c9803c', '#6b3a14')
    + stroke('M32,9L32,34', '#e8b27a', 1.1)
    + limb([[22, 40], [42, 40]], 3, '#6b3a14', null)
    + limb([[32, 40], [32, 58]], 4.6, WOOD, WOOD_D), 24)],
  ['tin', 'Lingote de estaño', 'alloying', () =>
    shape(poly([[8, 42], [18, 24], [48, 24], [58, 42], [50, 52], [16, 52]]), '#b9bec4', '#4a5058')
    + shape(poly([[18, 24], [48, 24], [44, 32], [22, 32]]), '#e6eaee', '#4a5058')
    + stroke('M18,40L48,40M22,46L44,46', '#8d949b', 1.2)],
  ['bronze', 'Lingote de bronce', 'alloying', () =>
    shape(poly([[8, 42], [18, 24], [48, 24], [58, 42], [50, 52], [16, 52]]), '#b08a3e', '#5a4216')
    + shape(poly([[18, 24], [48, 24], [44, 32], [22, 32]]), '#dcc072', '#5a4216')
    + stroke('M18,40L48,40M22,46L44,46', '#8a6a28', 1.2)],
  ['bronze_axe', 'Hacha de bronce', 'bronze_tools', () => rot(
    limb([[32, 60], [32, 10]], 3.6, WOOD, WOOD_D)
    + shape(poly([[32, 6], [50, 3], [55, 22], [32, 24]]), '#b08a3e', '#5a4216')
    + stroke('M30,14L35,14M30,18L35,18M30,22L35,22', CORD, 1.6)
    + stroke('M48,7L52,20', '#dcc072', 1.2), 30)],
  ['bronze_adze', 'Azuela de bronce', 'bronze_tools', () => rot(
    limb([[30, 60], [30, 14]], 3.4, WOOD, WOOD_D)
    + shape(poly([[26, 14], [48, 9], [50, 15], [30, 20]]), '#b08a3e', '#5a4216')
    + stroke('M30,17L34,15.6M30,21L34,19.6', CORD, 1.6), 24)],
  ['bronze_sickle', 'Hoz de bronce', 'bronze_tools', () =>
    stroke('M16,56Q10,24 40,14Q52,12 56,22Q40,20 30,34Q26,46 22,56', '#b08a3e', 4)
    + stroke('M14,56L22,56', WOOD, 5)
    + stroke('M20,26Q30,18 44,16', '#dcc072', 1.2)],
  ['bronze_spade', 'Pala de bronce', 'bronze_tools', () => rot(
    limb([[32, 6], [32, 39]], 3.4, WOOD, WOOD_D)
    + shape('M24,36L40,36L42,53Q32,66 22,53Z', '#b08a3e', '#5a4216')
    + stroke('M30,39L28,53M34,39L36,53', '#dcc072', 1), 20)],
  ['iron_axe', 'Hacha de hierro', 'iron_tools', () => rot(
    limb([[32, 60], [32, 10]], 3.6, WOOD, WOOD_D)
    + shape(poly([[32, 6], [50, 3], [55, 22], [32, 24]]), '#7d898d', '#293237')
    + stroke('M30,14L35,14M30,18L35,18M30,22L35,22', CORD, 1.6)
    + stroke('M48,7L52,20', '#dce5e7', 1.2), 30)],
  ['iron_adze', 'Azuela de hierro', 'iron_tools', () => rot(
    limb([[30, 60], [30, 14]], 3.4, WOOD, WOOD_D)
    + shape(poly([[26, 14], [48, 9], [50, 15], [30, 20]]), '#7d898d', '#293237')
    + stroke('M30,17L34,15.6M30,21L34,19.6', CORD, 1.6), 24)],
  ['iron_sickle', 'Hoz de hierro', 'iron_tools', () =>
    stroke('M16,56Q10,24 40,14Q52,12 56,22Q40,20 30,34Q26,46 22,56', '#7d898d', 4)
    + stroke('M14,56L22,56', WOOD, 5)
    + stroke('M20,26Q30,18 44,16', '#dce5e7', 1.2)],
  ['iron_spade', 'Pala de hierro', 'iron_tools', () => rot(
    limb([[32, 6], [32, 39]], 3.4, WOOD, WOOD_D)
    + shape('M24,36L40,36L42,53Q32,66 22,53Z', '#7d898d', '#293237')
    + stroke('M30,39L28,53M34,39L36,53', '#dce5e7', 1), 20)],
  ['iron_plough', 'Arado de hierro', 'ploughshare', () => rot(
    limb([[18, 10], [32, 48], [50, 52]], 3.2, WOOD, WOOD_D)
    + shape(poly([[44, 44], [56, 48], [50, 58], [40, 52]]), '#7d898d', '#293237')
    + stroke('M42,49L52,53', '#dce5e7', 1.2)
    + stroke('M20,14L14,8M30,46L24,54', CORD, 1.5), 18)],
  ['bronze_sword', 'Espada de bronce', 'bronze_arms', () => rot(
    shape(poly([[32, 2], [37.5, 40], [26.5, 40]]), '#b08a3e', '#5a4216')
    + stroke('M32,8L32,36', '#dcc072', 1.2)
    + limb([[20, 42], [44, 42]], 3.2, '#6b4f1c', null)
    + limb([[32, 42], [32, 60]], 4.8, WOOD, WOOD_D), 26)],
  ['bronze_helm', 'Yelmo de bronce', 'bronze_arms', () =>
    shape(smooth([[12, 44], [14, 26], [32, 12], [50, 26], [52, 44], [44, 48], [20, 48]]), '#b08a3e', '#5a4216')
    + shape(poly([[26, 30], [38, 30], [36, 48], [28, 48]]), '#2b1d12', '#2b1d12')
    + stroke('M16,32Q32,16 48,32', '#dcc072', 1.4)
    + ell(32, 14, 3, 3, '#6b4f1c', '#3a2a0c')],
  ['gold_nugget', 'Pepita de oro', 'goldwork', () =>
    shape(smooth([[12, 40], [20, 26], [34, 24], [44, 34], [40, 48], [22, 50]]), '#e6c34a', '#7a5f10')
    + shape(smooth([[34, 20], [44, 12], [54, 18], [52, 30], [42, 30]]), '#f4dc7a', '#7a5f10')
    + stroke('M18,40L30,36M38,38L46,34', '#fff3b0', 1.2)],
  ['gold_ornament', 'Adorno de oro', 'goldwork', () =>
    stroke('M14,10Q32,2 50,10', CORD, 1.8)
    + stroke('M32,6L32,22', CORD, 1.6)
    + shape(smooth([[32, 22], [44, 30], [42, 46], [32, 56], [22, 46], [20, 30]]), '#e6c34a', '#7a5f10')
    + ell(32, 36, 6, 6, 'none', '#7a5f10') + ell(32, 36, 2.4, 2.4, '#fff3b0', '#7a5f10')
    + stroke('M25,32Q30,26 38,29', '#fff3b0', 1.2)],
  ['charcoal', 'Carbón vegetal', 'charcoal', () =>
    shape(smooth([[10, 44], [22, 30], [36, 34], [40, 48], [26, 54]]), '#2f2b28', STONE_D)
    + shape(smooth([[32, 30], [46, 18], [58, 28], [52, 42], [38, 42]]), '#3a3532', STONE_D)
    + shape(smooth([[26, 54], [40, 46], [54, 52], [48, 60], [30, 60]]), '#262321', STONE_D)
    + stroke('M16,40L28,38M40,26L52,28M32,56L46,54', '#5a534e', 1.1)],
  // A bloom is a rough, porous lump from the bloomery, not a clean iron bar.
  ['iron_bloom', 'Lupia de hierro', 'bloomery', () =>
    shape(smooth([[10, 40], [13, 30], [21, 25], [27, 18], [35, 23], [43, 19], [51, 27], [55, 38], [50, 48], [41, 53], [29, 52], [20, 56], [13, 49]]), '#514943', '#292523')
    + shape(smooth([[17, 31], [24, 27], [29, 31], [26, 37], [19, 38]]), '#75685c', '#292523')
    + shape(smooth([[35, 27], [42, 25], [48, 31], [45, 36], [37, 35]]), '#66594f', '#292523')
    + shape(smooth([[28, 41], [34, 37], [41, 41], [39, 47], [31, 48]]), '#403a36', '#292523')
    + ell(22, 44, 2.2, 1.6, '#262321') + ell(47, 42, 2.1, 1.5, '#262321')
    + stroke('M17,30L23,27M36,26L42,25M15,45L20,50M43,49L49,45', '#8a7460', 1.2)],
  // The wrought bar is dense and smooth where the bloom was porous and slaggy.
  ['wrought_iron', 'Hierro forjado', 'forging', () =>
    shape(smooth([[10, 40], [14, 31], [23, 29], [28, 34], [40, 34], [47, 29], [55, 34], [53, 43], [46, 47], [26, 47], [18, 51], [11, 47]]), '#747a7b', '#343839')
    + shape(smooth([[17, 35], [25, 33], [29, 37], [24, 40], [16, 40]]), '#c3c5c2')
    + stroke('M29,36L43,36M27,43L47,43', '#a4a9a8', 1.2)],
  ['steel', 'Acero', 'carburising', () =>
    shape(poly([[8, 42], [18, 24], [48, 24], [58, 42], [50, 52], [16, 52]]), '#59666c', '#202a2e')
    + shape(poly([[18, 24], [48, 24], [44, 32], [22, 32]]), '#d5e1e4', '#202a2e')
    + stroke('M18,40L48,40M22,46L44,46', '#87989e', 1.2)],
  ['steel_sword', 'Espada de acero', 'carburising', () => rot(
    shape(poly([[32, 2], [37.5, 40], [26.5, 40]]), '#77858a', '#202a2e')
    + stroke('M32,8L32,36', '#e4edef', 1.2)
    + limb([[20, 42], [44, 42]], 3.2, '#40484c', null)
    + limb([[32, 42], [32, 60]], 4.8, WOOD, WOOD_D), 26)],
  ['sling', 'Honda', 'sling', () =>
    stroke('M10,34Q16,10 30,26', CORD, 2.4)
    + stroke('M10,34Q16,52 30,40', CORD, 2.4)
    + shape(smooth([[28, 24], [42, 24], [46, 33], [42, 42], [28, 42], [24, 33]]), '#9c7b50', WOOD_D)
    + stroke('M30,28L40,28M28,33L42,33M30,38L40,38', '#6d5434', 1)
    + ell(36, 33, 4.2, 3.4, STONE, STONE_D)
    + stroke('M44,30Q54,22 58,14', CORD, 2.2)
    + stroke('M44,36Q54,44 58,52', CORD, 2.2)],
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
  ['sledge', 'Trineo', 'sledge', () =>
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
