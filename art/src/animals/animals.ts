/** Deer, boar, hare, and the three hunters in profile, facing east. */
import { at, ell, INK, limb, poly, shade, shape, smooth, stroke, type Pt } from '../lib/draw.ts';

export type AnimalKind = 'deer' | 'boar' | 'hare' | 'wolf' | 'bear' | 'lynx' | 'donkey' | 'horse';
export const ANIMAL_KINDS: readonly AnimalKind[] = ['deer', 'boar', 'hare', 'wolf', 'bear', 'lynx', 'donkey', 'horse'];

export const ANIMAL_POSES = [
  'idle', 'w0', 'w1', 'w2', 'w3',
  'e0', 'e1', 'e2', 'e3',
  'r0', 'r1', 'r2', 'r3',
  'a0', 'a1', 'a2', 'a3',
  's0', 's1', 's2', 's3',
] as const;
export type AnimalPose = (typeof ANIMAL_POSES)[number];
type Activity = 'idle' | 'walk' | 'eat' | 'run' | 'attack' | 'sleep';

const WALK_SWING = [0, 1, 0, -1] as const;
const RUN_SWING = [2, -2, -1, 2] as const;
const ATTACK_SWING = [1, 2, -1, -2] as const;
const SLEEP_SWING = [1, 0, -1, 0] as const;

/**
 * Paint one frame of an animal. The three-argument form is retained for art
 * tools that used the original walk generator; it emits the same idle and walk
 * SVG as before. Activity poses move the relevant anatomy, never the whole
 * sprite: head/neck articulation for eating and lunging, leg extension for a
 * run or strike, tucked limbs and closed eyes for sleeping.
 */
export function paintAnimal(kind: AnimalKind, pose: AnimalPose): string;
export function paintAnimal(kind: AnimalKind, frame: number, walking: boolean): string;
export function paintAnimal(kind: AnimalKind, poseOrFrame: AnimalPose | number, walking?: boolean): string {
  const pose: AnimalPose = typeof poseOrFrame === 'number'
    ? walking ? (`w${poseOrFrame}` as AnimalPose) : 'idle'
    : poseOrFrame;
  const activity: Activity = pose === 'idle' ? 'idle'
    : pose[0] === 'w' ? 'walk' : pose[0] === 'e' ? 'eat' : pose[0] === 'r' ? 'run'
      : pose[0] === 'a' ? 'attack' : 'sleep';
  const frame = pose === 'idle' ? 0 : Number(pose[1]);
  const sw = activity === 'walk' ? WALK_SWING[frame]!
    : activity === 'run' ? RUN_SWING[frame]!
      : activity === 'attack' ? ATTACK_SWING[frame]!
        : activity === 'sleep' ? SLEEP_SWING[frame]! : 0;
  const headPose = (pivot: Pt, angle: number, contents: string): string => angle === 0
    ? contents
    : `<g data-part="head" transform="rotate(${angle} ${pivot[0]} ${pivot[1]})">${contents}</g>`;
  const headAngle = (eating: readonly number[], running: readonly number[], attacking: readonly number[]): number =>
    activity === 'eat' ? eating[frame]! : activity === 'run' ? running[frame]!
      : activity === 'attack' ? attacking[frame]!
        : activity === 'sleep' ? [12, 18, 22, 16][frame]! : 0;
  const eye = (x: number, y: number, rx: number, ry: number, color = INK): string => activity === 'sleep'
    ? `<g data-part="closed-eye">${stroke(`M${x - rx * 1.5},${y + ry * 0.25}Q${x},${y + ry * 1.5} ${x + rx * 1.5},${y + ry * 0.25}`, color, Math.max(0.8, rx * 0.75))}</g>`
    : ell(x, y, rx, ry, color);
  const tuckedLegs = (html: string): string => activity === 'sleep'
    ? `<g data-part="folded-legs">${html}</g>` : html;
  const breath = (x: number, y: number, color: string): string => activity === 'sleep'
    ? `<g data-part="breathing" transform="translate(0 ${[0, -0.55, -1, -0.45][frame]})">${stroke(`M${x - 4},${y}Q${x},${y + 1.1} ${x + 4},${y}`, color, 0.8)}</g>` : '';
  const out = [];
  const line = '#2b1d12';
  const legs = (hips: Pt[], len: number, w: number, col: string, far: boolean, spread: number): string => {
    const html = hips.map(([x, y], i) => {
    const s = (i % 2 === 0 ? 1 : -1) * (far ? -1 : 1);
    const reach = activity === 'attack' && x >= 50 ? [2, 4, 7, 3][frame]! : 0;
    const a = sw * spread * s;
    const legLength = activity === 'sleep' ? len * 0.58 : len;
    const knee: Pt = activity === 'sleep'
      ? [x + s * Math.min(7, len * 0.32), y + 3]
      : at([x + reach * 0.4, y], a, legLength * 0.52);
    const footAt: Pt = activity === 'sleep'
      ? [knee[0] - s * Math.min(8, len * 0.36), knee[1] + 4]
      : at(knee, a * 0.4 - 4, legLength * 0.5);
    const foot: Pt = [footAt[0] + (activity === 'sleep' ? 0 : reach * 0.6), footAt[1]];
    return limb([[x, y], knee, foot], w, far ? shade(col, 0.82) : col, line) + ell(foot[0] + 0.5, foot[1], w * 0.55, w * 0.4, '#2a2019');
    }).join('');
    return activity === 'attack' ? `<g data-part="strike-legs">${html}</g>`
      : activity === 'run' ? `<g data-part="run-legs">${html}</g>` : html;
  };
  if (kind === 'deer') {
    const col = '#a9773f', belly = '#e0c49a';
    out.push(ell(46, 84.5, 20, 3, 'rgba(0,0,0,0.25)'));
    out.push(tuckedLegs(legs([[34, 58], [60, 58]], 25, 3.4, col, true, 16)));
    out.push(shape(smooth([[27, 50], [36, 43.5], [52, 45], [62, 42.5], [66.5, 48], [64, 58], [56, 62], [40, 62], [30, 60], [25.5, 55]]), col, line));
    out.push(shape(smooth([[34, 60.5], [48, 61], [60, 59.5], [54, 57.5], [40, 58]]), belly));
    out.push(ell(27, 51, 3, 5, '#f1e6d4', line));
    out.push(breath(48, 60, '#c9aa7f'));
    out.push(headPose([58, 49], headAngle([92, 105, 118, 98], [-2, 1, 3, -1], [42, 55, 65, 40]),
      shape(poly([[58, 47], [63, 30], [70, 28.5], [69, 38], [66.5, 50]]), col, line)
      + shape(smooth([[63.5, 28.5], [69, 23.5], [76, 26], [80.5, 30.5], [78.5, 33.2], [71, 33.4], [66, 33]]), col, line)
      + ell(66, 21.5, 2, 4.6, shade(col, 0.9), line, -28)
      + ell(69.5, 22, 1.8, 4.2, col, line, 22)
      + eye(72.4, 27.4, 1, 1.1)
      + ell(80.2, 31, 1.2, 1, INK)));
    out.push(tuckedLegs(legs([[32, 58], [62, 58]], 25, 3.4, col, false, 16)));
    out.push(ell(44, 49, 1.1, 1.1, '#e9d6b5') + ell(49, 47.5, 1, 1, '#e9d6b5') + ell(54, 49, 1.1, 1.1, '#e9d6b5'));
  }
  if (kind === 'boar') {
    const col = '#50402f';
    out.push(ell(50, 81.5, 24, 3, 'rgba(0,0,0,0.25)'));
    out.push(tuckedLegs(legs([[34, 64], [66, 62]], 16, 4.6, col, true, 14)));
    out.push(shape(smooth([[21, 56], [27, 46], [40, 39.5], [54, 39.5], [64, 43.5], [72, 50], [80, 53.5], [84.5, 57.5], [80.5, 62], [70, 64.5], [56, 66.5], [36, 66.5], [25, 63.5]]), col, line));
    out.push(stroke('M28,45L30,41.5L32,44.5L34.5,40L36.5,43L39,38.5L41,42L43.5,37.5L45.5,41L48,37.5L50,41L52.5,38', shade(col, 0.7), 1.3));
    out.push(breath(49, 64, '#74624e'));
    out.push(headPose([71, 56], headAngle([28, 42, 58, 32], [-1, 1, 2, -1], [12, 24, 18, 4]),
      ell(84.2, 58, 1.6, 2.6, '#8a6a58', line)
      + stroke('M79.2,60.5Q82.6,59.6 81.6,55.6', '#efe7d6', 1.6)
      + shape(poly([[62, 44], [64.5, 37.5], [67.5, 45]]), shade(col, 0.85), line)
      + eye(71, 50, 1, 1, '#140d08')));
    out.push(stroke('M21,56Q17,55 18.5,59', line, 1.1));
    out.push(tuckedLegs(legs([[32, 64], [68, 62]], 16, 4.6, col, false, 14)));
  }
  if (kind === 'hare') {
    const col = '#b99a70';
    out.push(ell(52, 81, 17, 2.8, 'rgba(0,0,0,0.25)'));
    if (activity !== 'idle' && activity !== 'walk') out.push(tuckedLegs(legs([[34, 60], [60, 59]], 24, 3.6, col, true, 15)));
    const earAngle = headAngle([26, 40, 54, 30], [-2, 2, 3, -1], [18, 30, 22, 3]);
    const legacyPose = activity === 'idle' || activity === 'walk';
    const earDrop = legacyPose ? 0 : 6;
    const ears = ell(63, 31 + earDrop, 2.4, 10, shade(col, 0.88), line, -22)
      + ell(58.5, 32 + earDrop, 2.4, 10, shade(col, 0.88), line, -32)
      + ell(60, 23.5 + earDrop, 1.6, 3, '#2a2019', null, -32)
      + ell(65.2, 22.6 + earDrop, 1.6, 3, '#2a2019', null, -22);
    if (legacyPose) out.push(headPose([61, 56], earAngle, ears));
    out.push(shape(smooth([[36, 70], [38, 59], [48, 54.5], [58, 56.5], [64, 62], [66, 70], [60, 76], [44, 78], [36, 76]]), col, line));
    out.push(breath(51, 74, '#967a58'));
    const hop = sw * 3;
    out.push(shape(smooth([[40, 68], [48, 66], [52, 74 - hop * 0.3], [58 + hop, 79.5], [46, 80], [40, 76]]), shade(col, 0.92), line));
    out.push(limb([[62, 72], [63 - hop * 0.5, 80]], 3, col, line));
    const face = shape(smooth([[59, 52], [65, 47.5], [73.5, 51], [74.5, 57], [67, 60], [60.5, 58]]), col, line)
      + eye(68.5, 52, 1.1, 1.2)
      + ell(74, 55.6, 0.9, 0.7, '#6b4a3a');
    out.push(headPose([61, 56], earAngle, legacyPose ? face : ears + face));
    out.push(ell(35.5, 66, 3, 3, '#f3ece0', line));
  }
  if (kind === 'wolf') {
    const col = '#7b7d80', belly = '#c9c7c0';
    out.push(ell(48, 84.5, 22, 3, 'rgba(0,0,0,0.25)'));
    out.push(tuckedLegs(legs([[34, 60], [62, 60]], 24, 3.2, col, true, 17)));
    // The brush, carried low.
    out.push(shape(smooth([[27, 52], [17, 56], [10, 66], [14, 69], [24, 62], [30, 57]]), shade(col, 0.9), line));
    out.push(shape(smooth([[26, 54], [34, 46], [50, 46.5], [62, 44.5], [68, 49], [66, 58], [56, 62], [40, 62], [30, 60]]), col, line));
    out.push(shape(smooth([[34, 60.5], [48, 61.5], [62, 59.5], [54, 57], [40, 57.5]]), belly));
    out.push(breath(49, 60, '#989996'));
    out.push(headPose([64, 48], headAngle([28, 44, 62, 34], [-2, 1, 2, -1], [18, 30, 22, 4]),
      stroke('M44,46L47,41L52,45', shade(col, 0.7), 1.3)
      + shape(poly([[60, 48], [66, 36], [72, 36.5], [70, 49]]), col, line)
      + shape(smooth([[65, 37], [72, 31], [80, 33.5], [86, 38.5], [84.5, 42], [76, 42], [69, 42.5]]), col, line)
      + shape(poly([[68, 33], [69.5, 25.5], [74, 31.5]]), shade(col, 0.85), line)
      + shape(poly([[73, 31.5], [76.5, 25], [78.5, 32.5]]), shade(col, 0.95), line)
      + eye(76, 36.4, 1, 0.9, '#e8c14a')
      + ell(85.5, 39.4, 1.3, 1.1, INK)));
    out.push(tuckedLegs(legs([[32, 60], [64, 60]], 24, 3.2, col, false, 17)));
  }
  if (kind === 'bear') {
    const col = '#5a3e2b';
    out.push(ell(50, 84, 26, 3.6, 'rgba(0,0,0,0.28)'));
    out.push(tuckedLegs(legs([[34, 64], [66, 64]], 20, 6.2, col, true, 11)));
    out.push(shape(smooth([[18, 62], [22, 50], [34, 40], [46, 34.5], [56, 36], [66, 44], [76, 49], [80, 55], [74, 64], [56, 68], [36, 68], [24, 67]]), col, line));
    out.push(stroke('M30,48L33,43L37,47L41,41L45,45', shade(col, 0.72), 1.5));
    out.push(breath(52, 67, '#92765e'));
    out.push(headPose([71, 52], headAngle([40, 55, 68, 44], [-1, 1, 2, -1], [16, 28, 20, 3]),
      shape(smooth([[69, 44], [76, 38], [86, 41], [90, 48], [87, 53], [78, 53], [72, 51]]), col, line)
      + ell(88.5, 48.5, 2.6, 2.3, '#8b6f55', line)
      + ell(72, 38.5, 2.4, 2.4, shade(col, 0.9), line)
      + eye(77.5, 44.5, 1, 0.9)));
    out.push(ell(19.5, 59, 2.6, 2.6, shade(col, 0.9), line));
    out.push(tuckedLegs(legs([[32, 64], [68, 64]], 20, 6.2, col, false, 11)));
  }
  if (kind === 'donkey') {
    const col = '#817461', belly = '#d4c4a8';
    out.push(ell(48, 84, 21, 3, 'rgba(0,0,0,0.25)'));
    out.push(tuckedLegs(legs([[34, 61], [61, 61]], 22, 4.4, col, true, 15)));
    out.push(shape(smooth([[25, 54], [30, 46], [43, 43], [59, 45], [67, 51], [66, 61], [57, 65], [38, 65], [28, 61]]), col, line));
    out.push(shape(smooth([[34, 62], [49, 63], [61, 61], [54, 59], [40, 59]]), belly));
    out.push(breath(49, 61, '#c2a276'));
    out.push(stroke('M27,52Q18,54 16,61', line, 1.4));
    out.push(headPose([61, 49], headAngle([38, 52, 65, 42], [-2, 1, 3, -1], [18, 28, 22, 3]),
      shape(poly([[57, 50], [60, 35], [67, 37], [68, 52]]), col, line)
      + shape(smooth([[63, 39], [64, 17], [68, 12], [70, 17], [69, 40]]), shade(col, 0.86), line)
      + shape(smooth([[69, 39], [73, 17], [77, 14], [78, 20], [73, 43]]), col, line)
      + shape(smooth([[66, 31], [73, 27], [82, 32], [84, 39], [78, 43], [70, 41]]), col, line)
      + eye(76, 32, 1.2, 1.3) + ell(83, 38, 1.1, 0.9, INK)));
    out.push(tuckedLegs(legs([[32, 61], [63, 61]], 22, 4.4, col, false, 15)));
    out.push(shape(poly([[43, 45], [47, 41], [50, 45], [53, 41], [56, 46]]), shade(col, 0.75)));
  }
  if (kind === 'horse') {
    const col = '#79543a', belly = '#c9a980';
    out.push(ell(48, 84, 22, 3, 'rgba(0,0,0,0.25)'));
    out.push(tuckedLegs(legs([[34, 58], [61, 59]], 28, 3.8, col, true, 17)));
    out.push(shape(smooth([[24, 51], [31, 43], [45, 42], [59, 44], [69, 51], [66, 60], [57, 63], [37, 62], [27, 58]]), col, line));
    out.push(shape(smooth([[34, 60], [48, 61], [62, 59], [55, 57], [40, 57]]), belly));
    out.push(breath(49, 60, '#c9a980'));
    out.push(stroke('M28,50Q17,53 14,65', line, 1.8));
    out.push(headPose([61, 48], headAngle([44, 58, 70, 46], [-2, 1, 3, -1], [22, 38, 28, 4]),
      shape(poly([[56, 49], [61, 34], [67, 36], [69, 52]]), col, line)
      + shape(smooth([[63, 38], [68, 28], [76, 28], [84, 34], [82, 40], [74, 42], [67, 42]]), col, line)
      + shape(poly([[64, 34], [62, 25], [66, 28], [69, 24], [70, 34]]), shade(col, 0.72), line)
      + eye(76, 33, 1.2, 1.2) + ell(83, 37, 1.1, 0.9, INK)));
    out.push(tuckedLegs(legs([[32, 58], [63, 59]], 28, 3.8, col, false, 17)));
    out.push(stroke('M63,43Q69,38 72,31', shade(col, 0.68), 2.4));
  }
  if (kind === 'lynx') {
    const col = '#b69660', belly = '#ece0c4';
    out.push(ell(48, 84.5, 18, 2.8, 'rgba(0,0,0,0.25)'));
    out.push(tuckedLegs(legs([[34, 60], [60, 59]], 24, 3.6, col, true, 15)));
    out.push(shape(smooth([[26, 55], [22, 53], [20, 57], [24, 59]]), shade(col, 0.9), line));
    out.push(ell(20.5, 56, 1.8, 3.3, '#2a2019', null, 10));
    out.push(shape(smooth([[26, 54], [32, 46], [46, 45], [58, 43.5], [64, 48], [63, 57], [54, 62], [40, 62], [30, 60]]), col, line));
    out.push(shape(smooth([[34, 60.5], [48, 61.5], [60, 59], [52, 57], [40, 57.5]]), belly));
    for (const [x, y] of [[38, 50], [44, 52], [50, 49], [41, 56], [56, 53], [33, 54]]) out.push(ell(x, y, 1.3, 1.3, shade(col, 0.55)));
    out.push(breath(49, 61, '#c2a276'));
    out.push(headPose([59, 54], headAngle([44, 60, 76, 48], [-2, 1, 3, -1], [18, 30, 22, 3]),
      shape(poly([[56, 48], [62, 38], [68, 38.5], [66, 49]]), col, line)
      + shape(smooth([[62, 39], [68, 34], [76, 35.5], [80, 40.5], [78, 44], [70, 44.5], [64, 44]]), col, line)
      + shape(poly([[64, 36], [65.5, 27], [69.5, 34]]), shade(col, 0.88), line)
      + shape(poly([[69, 34], [72.5, 26.5], [74.5, 34.5]]), shade(col, 0.95), line)
      + stroke('M65.5,27.8L65.2,23.8', INK, 1.1) + stroke('M72.4,27.2L73,23.4', INK, 1.1)
      + stroke('M71,41.5L75,45.5', shade(col, 0.6), 1) + stroke('M65,42L62,46.5', shade(col, 0.6), 1)
      + eye(72, 38.4, 1, 0.9, '#d9b340')
      + ell(79.2, 40.6, 1.1, 0.9, '#6b4a3a')));
    out.push(tuckedLegs(legs([[32, 60], [62, 59]], 24, 3.6, col, false, 15)));
  }
  // Folded legs no longer hold the torso at its standing height. Species have
  // different leg lengths; one shared drop left deer/cats floating above their
  // shadow and pushed the already crouched hare below the ground instead.
  const sleepDrop: Record<AnimalKind, number> = { deer: 20, boar: 13, hare: 1, wolf: 17, bear: 14, lynx: 17, donkey: 18, horse: 18 };
  return activity === 'sleep' ? out[0] + `<g data-part="sleep-posture" transform="translate(0 ${sleepDrop[kind]})">${out.slice(1).join('')}</g>` : out.join('');
}
