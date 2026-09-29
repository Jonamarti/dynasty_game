/** Deer, boar and hare in profile, facing east, with a four-frame walk. */
import { at, ell, INK, limb, poly, shade, shape, smooth, stroke, type Pt } from '../lib/draw.ts';

export type AnimalKind = 'deer' | 'boar' | 'hare';
export const ANIMAL_KINDS: readonly AnimalKind[] = ['deer', 'boar', 'hare'];

export function paintAnimal(kind: AnimalKind, frame: number, walking: boolean): string {
  const sw = walking ? [0, 1, 0, -1][frame] : 0;
  const out = [];
  const line = '#2b1d12';
  const legs = (hips: Pt[], len: number, w: number, col: string, far: boolean, spread: number): string => hips.map(([x, y], i) => {
    const s = (i % 2 === 0 ? 1 : -1) * (far ? -1 : 1);
    const a = sw * spread * s;
    const knee = at([x, y], a, len * 0.52), foot = at(knee, a * 0.4 - 4, len * 0.5);
    return limb([[x, y], knee, foot], w, far ? shade(col, 0.82) : col, line) + ell(foot[0] + 0.5, foot[1], w * 0.55, w * 0.4, '#2a2019');
  }).join('');
  if (kind === 'deer') {
    const col = '#a9773f', belly = '#e0c49a';
    out.push(ell(46, 84.5, 20, 3, 'rgba(0,0,0,0.25)'));
    out.push(legs([[34, 58], [60, 58]], 25, 3.4, col, true, 16));
    out.push(shape(smooth([[27, 50], [36, 43.5], [52, 45], [62, 42.5], [66.5, 48], [64, 58], [56, 62], [40, 62], [30, 60], [25.5, 55]]), col, line));
    out.push(shape(smooth([[34, 60.5], [48, 61], [60, 59.5], [54, 57.5], [40, 58]]), belly));
    out.push(ell(27, 51, 3, 5, '#f1e6d4', line));
    out.push(shape(poly([[58, 47], [63, 30], [70, 28.5], [69, 38], [66.5, 50]]), col, line));
    out.push(shape(smooth([[63.5, 28.5], [69, 23.5], [76, 26], [80.5, 30.5], [78.5, 33.2], [71, 33.4], [66, 33]]), col, line));
    out.push(ell(66, 21.5, 2, 4.6, shade(col, 0.9), line, -28));
    out.push(ell(69.5, 22, 1.8, 4.2, col, line, 22));
    out.push(ell(72.4, 27.4, 1, 1.1, INK));
    out.push(ell(80.2, 31, 1.2, 1, INK));
    out.push(legs([[32, 58], [62, 58]], 25, 3.4, col, false, 16));
    out.push(ell(44, 49, 1.1, 1.1, '#e9d6b5') + ell(49, 47.5, 1, 1, '#e9d6b5') + ell(54, 49, 1.1, 1.1, '#e9d6b5'));
  }
  if (kind === 'boar') {
    const col = '#50402f';
    out.push(ell(50, 81.5, 24, 3, 'rgba(0,0,0,0.25)'));
    out.push(legs([[34, 64], [66, 62]], 16, 4.6, col, true, 14));
    out.push(shape(smooth([[21, 56], [27, 46], [40, 39.5], [54, 39.5], [64, 43.5], [72, 50], [80, 53.5], [84.5, 57.5], [80.5, 62], [70, 64.5], [56, 66.5], [36, 66.5], [25, 63.5]]), col, line));
    out.push(stroke('M28,45L30,41.5L32,44.5L34.5,40L36.5,43L39,38.5L41,42L43.5,37.5L45.5,41L48,37.5L50,41L52.5,38', shade(col, 0.7), 1.3));
    out.push(ell(84.2, 58, 1.6, 2.6, '#8a6a58', line));
    out.push(stroke('M79.2,60.5Q82.6,59.6 81.6,55.6', '#efe7d6', 1.6));
    out.push(shape(poly([[62, 44], [64.5, 37.5], [67.5, 45]]), shade(col, 0.85), line));
    out.push(ell(71, 50, 1, 1, '#140d08'));
    out.push(stroke('M21,56Q17,55 18.5,59', line, 1.1));
    out.push(legs([[32, 64], [68, 62]], 16, 4.6, col, false, 14));
  }
  if (kind === 'hare') {
    const col = '#b99a70';
    out.push(ell(52, 81, 17, 2.8, 'rgba(0,0,0,0.25)'));
    out.push(ell(63, 31, 2.4, 10, shade(col, 0.88), line, -22));
    out.push(ell(58.5, 32, 2.4, 10, shade(col, 0.88), line, -32));
    out.push(ell(60, 23.5, 1.6, 3, '#2a2019', null, -32));
    out.push(ell(65.2, 22.6, 1.6, 3, '#2a2019', null, -22));
    out.push(shape(smooth([[36, 70], [38, 59], [48, 54.5], [58, 56.5], [64, 62], [66, 70], [60, 76], [44, 78], [36, 76]]), col, line));
    const hop = sw * 3;
    out.push(shape(smooth([[40, 68], [48, 66], [52, 74 - hop * 0.3], [58 + hop, 79.5], [46, 80], [40, 76]]), shade(col, 0.92), line));
    out.push(limb([[62, 72], [63 - hop * 0.5, 80]], 3, col, line));
    out.push(shape(smooth([[59, 52], [65, 47.5], [73.5, 51], [74.5, 57], [67, 60], [60.5, 58]]), col, line));
    out.push(ell(68.5, 52, 1.1, 1.2, INK));
    out.push(ell(74, 55.6, 0.9, 0.7, '#6b4a3a'));
    out.push(ell(35.5, 66, 3, 3, '#f3ece0', line));
  }
  return out.join('');
}
