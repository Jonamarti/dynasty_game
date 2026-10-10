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

export const FURNITURE: BuildingArt[] = [
  ['bedding', 'Lecho', 'cordage', 96, bedding],
  ['bed', 'Cama', 'carpentry', 96, bed],
];
