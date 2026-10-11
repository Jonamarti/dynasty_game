/** Phase 16d sleep surfaces; kept separate from the active house-art work. */
import { ell, poly, shape, stroke } from '../lib/draw.ts';
import type { BuildingArt } from './buildings.ts';

const OUTLINE = '#382718';
const WOOD = '#91663b';
const WOOD_LIGHT = '#bd925d';
const GRASS = '#c2a36a';
const HIDE = '#b7a17c';

const bedding = (): string =>
  ell(72, 99, 37, 7, 'rgba(0,0,0,0.2)') +
  shape(poly([[38, 68], [72, 53], [106, 68], [72, 85]]), GRASS, OUTLINE) +
  shape(poly([[42, 68], [72, 56], [101, 69], [72, 81]]), HIDE, '#79684d') +
  stroke('M48,68L73,78M57,64L82,74M68,60L93,70', '#d4c39f', 1.5) +
  stroke('M47,72L71,83M76,57L99,68', '#907952', 1);

const bed = (): string =>
  ell(72, 101, 42, 7, 'rgba(0,0,0,0.22)') +
  shape(poly([[36, 62], [74, 46], [111, 63], [73, 82]]), WOOD_LIGHT, OUTLINE) +
  shape(poly([[38, 67], [73, 83], [73, 94], [38, 77]]), WOOD, OUTLINE) +
  shape(poly([[73, 83], [109, 66], [109, 78], [73, 95]]), '#76502f', OUTLINE) +
  shape(poly([[42, 62], [74, 48], [105, 63], [73, 78]]), '#d1c4a5', OUTLINE) +
  shape(poly([[43, 61], [57, 55], [68, 61], [54, 67]]), '#e5d9c0', '#88795f') +
  stroke('M48,73L48,83M100,69L100,80M73,83L73,94', WOOD_LIGHT, 2.4) +
  stroke('M58,55L58,61M68,59L68,65', '#9b8b6e', 1);

const bench = (): string =>
  ell(72, 102, 34, 6, 'rgba(0,0,0,0.2)') +
  shape(poly([[39, 57], [72, 43], [105, 57], [72, 72]]), WOOD_LIGHT, OUTLINE) +
  shape(poly([[42, 67], [72, 80], [72, 91], [42, 78]]), WOOD, OUTLINE) +
  shape(poly([[72, 80], [102, 67], [102, 78], [72, 91]]), '#76502f', OUTLINE) +
  stroke('M48,70L48,85M96,70L96,85M72,81L72,92', WOOD_LIGHT, 2.5) +
  stroke('M50,58L72,68M72,47L95,57', '#d0a874', 1.4);

const fatLamp = (): string =>
  ell(72, 99, 22, 5, 'rgba(0,0,0,0.2)') +
  shape(poly([[45, 73], [56, 60], [83, 60], [96, 73], [88, 88], [54, 88]]), '#8a8170', OUTLINE) +
  ell(70, 70, 14, 5, '#55483a', '#30251a') +
  shape(poly([[67, 65], [71, 47], [77, 66], [73, 72]]), '#f0a443', '#9a431b') +
  shape(poly([[70, 64], [72, 53], [74, 65], [72, 68]]), '#ffe5a0');

const shelf = (): string =>
  ell(72, 101, 30, 6, 'rgba(0,0,0,0.2)') +
  shape(poly([[40, 39], [72, 25], [104, 39], [72, 54]]), WOOD_LIGHT, OUTLINE) +
  shape(poly([[42, 44], [72, 57], [72, 88], [42, 75]]), WOOD, OUTLINE) +
  shape(poly([[72, 57], [102, 44], [102, 75], [72, 88]]), '#76502f', OUTLINE) +
  stroke('M43,57L72,70L101,57M43,70L72,83L101,70', WOOD_LIGHT, 3) +
  shape(poly([[52, 41], [60, 37], [60, 50], [52, 53]]), '#b95f3b', '#65351f') +
  shape(poly([[76, 45], [87, 40], [87, 53], [76, 58]]), '#d0b276', '#71572e') +
  shape(poly([[61, 62], [68, 59], [68, 70], [61, 73]]), '#7b9b70', '#3f5738');

const fireplace = (): string =>
  ell(72, 101, 35, 7, 'rgba(0,0,0,0.22)') +
  shape(poly([[38, 60], [57, 50], [89, 50], [107, 60], [101, 85], [45, 85]]), '#a77b55', OUTLINE) +
  shape(poly([[43, 61], [59, 55], [87, 55], [101, 61], [96, 79], [48, 79]]), '#c19362', '#684a30') +
  shape(poly([[52, 65], [68, 59], [85, 66], [71, 74]]), '#453328', '#2b2119') +
  shape(poly([[68, 64], [72, 47], [78, 65], [73, 70]]), '#e67c32', '#99451f') +
  shape(poly([[71, 62], [73, 53], [75, 63], [73, 66]]), '#ffe5a0') +
  stroke('M48,67L58,71M89,71L98,67M55,77L63,74M82,74L92,77', '#755034', 2);

export const FURNITURE: BuildingArt[] = [
  ['bedding', 'Lecho', 'cordage', 96, bedding],
  ['bed', 'Cama', 'carpentry', 96, bed],
  ['bench', 'Banco', 'carpentry', 96, bench],
  ['fat_lamp', 'Lámpara de grasa', 'firemaking', 96, fatLamp],
  ['shelf', 'Estante', 'carpentry', 96, shelf],
  ['fireplace', 'Hogar interior', 'fireplace', 96, fireplace],
];
