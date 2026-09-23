/**
 * People, drawn once and composited every frame.
 *
 * M9.5 phase 1: a person used to be two `fillRect` calls, redrawn from
 * scratch sixty times a second for every living soul on screen. A figure with
 * limbs, a face and a held tool is twenty-odd path operations — against
 * `perf-budget`'s `crowded` scenario, which is already the one failing check.
 * So the art is rasterised once, here, into an offscreen atlas at startup,
 * exactly as `Renderer.prerenderTerrain` already does for the ground, and
 * drawing a person at runtime becomes three or four `drawImage` calls.
 *
 * **Layers, not combinations.** A body varies by size class, band colour and
 * walk-cycle frame; a head varies by hair and beard; a face varies by
 * expression; a held item varies by what is in the hand. Baking every
 * combination of all four would multiply the counts together and explode the
 * atlas. Baking each layer's own variants and compositing them at draw time
 * keeps the total small and lets the same nine faces sit on every body.
 *
 * The bake is pure arithmetic over a fixed palette and geometry table: it
 * takes no RNG draw, reads no simulation state, and touches nothing in
 * `src/sim/`. Nothing here can move a seed.
 */
import type { Person } from '../sim/entities/Person.ts';
import { ADULT_YEARS, ELDER_YEARS } from '../sim/entities/Person.ts';
import { EXPRESSIONS, type Expression } from '../sim/core/Mood.ts';
import { OUTCAST_BAND_ID_BASE } from '../sim/core/Simulation.ts';

/** One cell in the atlas, square, at a resolution above the zoom ceiling
 * (`main.ts`'s wheel handler clamps to 80 px/tile) so nothing is ever drawn
 * larger than it was baked. */
const CELL = 96;

/**
 * One colour per tribe, for as many tribes as `population.bands` allows (8),
 * and a neutral grey last for the outcasts.
 *
 * M11 phase 12c. There were six for up to eight tribes, so the seventh and
 * eighth wore the first two's colours, and the outcast band (id 1000 and up)
 * took whichever its id landed on modulo six — a cast-out man dressed as the
 * tribe that threw him out. Read through `bandColorIndex`, never by `%`.
 */
export const BAND_COLORS = [
  '#3b6ea8', '#a83b52', '#7a4ea8', '#a8843b', '#3ba88a', '#a83b8f', '#6f9a3b', '#a8603b',
  '#7d7d7d',
];

const OUTCAST_COLOR_INDEX = BAND_COLORS.length - 1;

/** Which `BAND_COLORS` entry a band wears. */
export function bandColorIndex(bandId: number): number {
  return bandId >= OUTCAST_BAND_ID_BASE ? OUTCAST_COLOR_INDEX : bandId % OUTCAST_COLOR_INDEX;
}

export type SizeClass = 'infant' | 'child' | 'adolescent' | 'adult' | 'elder';
const SIZE_CLASSES: readonly SizeClass[] = ['infant', 'child', 'adolescent', 'adult', 'elder'];

export type HairVariant = 'dark' | 'grey' | 'balding' | 'bald';
const HAIR_VARIANTS: readonly HairVariant[] = ['dark', 'grey', 'balding', 'bald'];

export type HeldItemKind = 'spear' | 'bow' | 'atlatl' | 'bone_point' | 'handaxe' | 'net' | 'basket';
/**
 * What shows in the hand when more than one thing is carried, most
 * conspicuous first. A hunter carrying both a bow and a basket reads as
 * armed, not as a forager, and that is the more useful thing for the player
 * to see at a glance.
 */
const HELD_PRIORITY: readonly HeldItemKind[] =
  ['spear', 'bow', 'atlatl', 'bone_point', 'handaxe', 'net', 'basket'];

interface BodyGeometry {
  torsoW: number;
  torsoH: number;
  legLen: number;
  armLen: number;
  limbW: number;
  centerY: number;
  /** How much bigger the head is drawn relative to an adult's, at this size. */
  headScale: number;
  /** Forward stoop, in degrees, applied to the torso and arms only. */
  stoopDeg: number;
}

/**
 * One entry per size class, in atlas-cell pixels (a 96 px cell, origin at its
 * top-left). `sizeClassOf` below is the only thing that maps a `Person` onto
 * one of these; nothing else needs to know the numbers.
 */
const BODY_GEOMETRY: Record<SizeClass, BodyGeometry> = {
  infant:     { torsoW: 13, torsoH: 20, legLen: 12, armLen: 11, limbW: 5,   centerY: 48, headScale: 1.55, stoopDeg: 0 },
  child:      { torsoW: 16, torsoH: 26, legLen: 17, armLen: 14, limbW: 5.5, centerY: 46, headScale: 1.30, stoopDeg: 0 },
  adolescent: { torsoW: 19, torsoH: 32, legLen: 21, armLen: 17, limbW: 6,   centerY: 44, headScale: 1.12, stoopDeg: 0 },
  adult:      { torsoW: 21, torsoH: 36, legLen: 24, armLen: 19, limbW: 6.5, centerY: 42, headScale: 1.00, stoopDeg: 0 },
  elder:      { torsoW: 20, torsoH: 32, legLen: 21, armLen: 18, limbW: 6,   centerY: 44, headScale: 1.05, stoopDeg: 12 },
};

/** Radius the head circle is baked at, in atlas-cell pixels. Shared with the
 * draw-time scale math so the two cannot drift apart. */
const HEAD_RADIUS = 15;

const SKIN = '#e8c9a0';

// ---------------------------------------------------------------------------
// Reading a Person into atlas keys
// ---------------------------------------------------------------------------

/**
 * Which baked body a person gets. Distinct from `bodyScaleOf`: this is the
 * five baked *shapes* (a child's head is a bigger fraction of its body, not
 * just a smaller copy of an adult's), while `bodyScaleOf` is the continuous
 * multiplier applied to whichever shape is chosen.
 */
export function sizeClassOf(person: Person): SizeClass {
  if (person.isElder) return 'elder';
  const years = person.years;
  if (years < 3) return 'infant';
  if (years < 8) return 'child';
  if (years < ADULT_YEARS) return 'adolescent';
  return 'adult';
}

/**
 * Continuous height multiplier, ~0.55 at birth to 1 at `ADULT_YEARS`, easing
 * back down for the very old. `hitRadiusOf` in `Renderer.ts` uses the same
 * function, so a child drawn small is a child clicked small — see that
 * function's header for the bug this is guarding against.
 */
export function bodyScaleOf(person: Person): number {
  const years = person.years;
  if (years < ADULT_YEARS) return 0.55 + (years / ADULT_YEARS) * 0.45;
  if (person.isElder) return Math.max(0.82, 1 - (years - ELDER_YEARS) * 0.006);
  return 1;
}

/** A cheap, stable per-id hash. Not an RNG draw — nothing here is random,
 * only *fixed once and looking it*, the way a real head of hair is. */
function hashId(id: number): number {
  let h = (id + 1) * 2654435761;
  h = (h ^ (h >>> 15)) >>> 0;
  return h;
}

/** Elders go grey, balding or bald, chosen once from the id so it never
 * flickers between frames; everyone younger keeps their natural colour. */
export function hairVariantOf(person: Person): HairVariant {
  if (!person.isElder) return 'dark';
  switch (hashId(person.id) % 3) {
    case 0: return 'bald';
    case 1: return 'balding';
    default: return 'grey';
  }
}

export function hasBeardOf(person: Person): boolean {
  if (person.sex !== 'male' || person.isChild) return false;
  return hashId(person.id * 7 + 3) % 2 === 0;
}

/**
 * What shows in a person's hand, or null for empty-handed. Reads
 * `Person.inventory` directly and nothing else, so the canvas and the HUD
 * can never disagree about what somebody is carrying — see this file's
 * header.
 */
export function heldItemFor(person: Person): HeldItemKind | null {
  for (const item of HELD_PRIORITY) {
    if (person.inventory.has(item)) return item;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A walking figure: shadow, two legs, two arms, a torso. Pose 0 and 2 are
 * the neutral stride-crossing stance; 1 and 3 swing opposite legs and arms. */
function paintBody(ctx: CanvasRenderingContext2D, geo: BodyGeometry, color: string, pose: number): void {
  const cx = CELL / 2;
  const swing = pose === 1 ? 1 : pose === 3 ? -1 : 0;
  const legSpread = swing * geo.legLen * 0.4;
  const armSwing = -swing * geo.armLen * 0.35;

  const hipY = geo.centerY + geo.torsoH / 2;
  const footY = hipY + geo.legLen;

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, footY + 1, geo.torsoW * 0.55, geo.torsoW * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = geo.limbW;
  ctx.lineCap = 'round';

  // Legs, always vertical at the hip regardless of stoop — a stooped elder
  // still stands on the ground they are drawn on.
  ctx.beginPath();
  ctx.moveTo(cx - geo.torsoW * 0.22, hipY);
  ctx.lineTo(cx - geo.torsoW * 0.22 - legSpread, footY);
  ctx.moveTo(cx + geo.torsoW * 0.22, hipY);
  ctx.lineTo(cx + geo.torsoW * 0.22 + legSpread, footY);
  ctx.stroke();

  // Torso and arms stoop together, rotated about the hip.
  ctx.save();
  ctx.translate(cx, hipY);
  ctx.rotate((geo.stoopDeg * Math.PI) / 180);
  ctx.translate(-cx, -hipY);

  const shoulderY = geo.centerY - geo.torsoH * 0.38;
  const handY = shoulderY + geo.armLen;
  ctx.beginPath();
  ctx.moveTo(cx - geo.torsoW / 2, shoulderY);
  ctx.lineTo(cx - geo.torsoW / 2 - armSwing * 0.4, handY);
  ctx.moveTo(cx + geo.torsoW / 2, shoulderY);
  ctx.lineTo(cx + geo.torsoW / 2 + armSwing * 0.4, handY);
  ctx.stroke();

  ctx.fillStyle = color;
  roundRect(
    ctx,
    cx - geo.torsoW / 2, geo.centerY - geo.torsoH / 2,
    geo.torsoW, geo.torsoH,
    geo.torsoW * 0.25
  );
  ctx.fill();
  ctx.restore();
}

/** LOD stand-in below the zoom the atlas can afford detail at: one flat
 * silhouette, no face, no tool. */
function paintSilhouette(ctx: CanvasRenderingContext2D, geo: BodyGeometry, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(
    CELL / 2, geo.centerY - geo.torsoH * 0.05,
    geo.torsoW * 0.75, (geo.torsoH + geo.legLen) * 0.55,
    0, 0, Math.PI * 2
  );
  ctx.fill();
}

function paintHead(ctx: CanvasRenderingContext2D, hair: HairVariant, beard: boolean): void {
  const cx = CELL / 2, cy = CELL / 2 + 2;

  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(cx, cy, HEAD_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  const hairColor = hair === 'dark' ? '#2b2018' : '#9a958c';
  if (hair === 'balding') {
    // A fringe only — sides and back, bare on top, the shape a horseshoe of
    // hair actually makes rather than a full cap.
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(cx, cy, HEAD_RADIUS + 1.5, Math.PI * 0.12, Math.PI * 0.88, false);
    ctx.arc(cx, cy, HEAD_RADIUS - 3, Math.PI * 0.88, Math.PI * 0.12, true);
    ctx.closePath();
    ctx.fill();
  } else if (hair !== 'bald') {
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, HEAD_RADIUS + 1.5, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();
  }

  if (beard) {
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + HEAD_RADIUS * 0.55, HEAD_RADIUS * 0.65, HEAD_RADIUS * 0.5, 0, 0, Math.PI);
    ctx.fill();
  }
}

/** Eyes, eyebrows and a mouth, positioned to land exactly over `paintHead`'s
 * circle when the two are drawn at the same rect. */
function paintFace(ctx: CanvasRenderingContext2D, expr: Expression): void {
  const cx = CELL / 2, cy = CELL / 2 + 2;
  const eyeDX = HEAD_RADIUS * 0.4, eyeY = cy - HEAD_RADIUS * 0.12;
  const ink = '#241c14';

  const eyeR = expr === 'afraid' ? HEAD_RADIUS * 0.16 : HEAD_RADIUS * 0.11;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(cx - eyeDX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.arc(cx + eyeDX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  const browTilt: Record<Expression, number> = {
    strained: 2.5, pained: 2.5, afraid: 3, angry: -3, stern: -2,
    frustrated: -1.5, warm: -0.5, content: -0.5, neutral: 0,
  };
  const tilt = browTilt[expr];
  ctx.strokeStyle = ink;
  ctx.lineWidth = HEAD_RADIUS * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - eyeDX - 3, eyeY - 4 - tilt);
  ctx.lineTo(cx - eyeDX + 3, eyeY - 4 + tilt);
  ctx.moveTo(cx + eyeDX - 3, eyeY - 4 - tilt);
  ctx.lineTo(cx + eyeDX + 3, eyeY - 4 + tilt);
  ctx.stroke();

  // Curved up for warmth, flat for neutral, down for anything unwell.
  const mouthCurve: Record<Expression, number> = {
    warm: 2.5, content: 1.5, neutral: 0, frustrated: -1, stern: -1,
    afraid: -2, angry: -2.5, strained: -2.5, pained: -3,
  };
  const curve = mouthCurve[expr];
  const mouthY = cy + HEAD_RADIUS * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - 4, mouthY);
  ctx.quadraticCurveTo(cx, mouthY - curve, cx + 4, mouthY);
  ctx.stroke();
}

/** A small icon offset toward where a raised hand would be. */
function paintHeld(ctx: CanvasRenderingContext2D, kind: HeldItemKind): void {
  const cx = CELL / 2 + 22, cy = CELL / 2 + 12;
  ctx.lineCap = 'round';

  switch (kind) {
    case 'spear':
    case 'atlatl':
    case 'bone_point':
      ctx.strokeStyle = '#7a5a34';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy + 18);
      ctx.lineTo(cx + 3, cy - 20);
      ctx.stroke();
      ctx.fillStyle = '#c8ccd0';
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy - 20);
      ctx.lineTo(cx - 1, cy - 11);
      ctx.lineTo(cx + 7, cy - 11);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bow':
      ctx.strokeStyle = '#7a5a34';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 15, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(240,237,232,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 10, cy - 6);
      ctx.lineTo(cx + 10, cy + 6);
      ctx.stroke();
      break;
    case 'handaxe':
      ctx.strokeStyle = '#7a5a34';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 12);
      ctx.lineTo(cx, cy - 8);
      ctx.stroke();
      ctx.fillStyle = '#c8ccd0';
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy - 12);
      ctx.lineTo(cx + 7, cy - 12);
      ctx.lineTo(cx, cy - 1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'net':
      ctx.strokeStyle = '#b3b76a';
      ctx.lineWidth = 1.2;
      for (let dy = -8; dy <= 8; dy += 4) {
        ctx.beginPath();
        ctx.moveTo(cx - 9, cy + dy);
        ctx.lineTo(cx + 9, cy + dy);
        ctx.stroke();
      }
      for (let dx = -8; dx <= 8; dx += 4) {
        ctx.beginPath();
        ctx.moveTo(cx + dx, cy - 9);
        ctx.lineTo(cx + dx, cy + 9);
        ctx.stroke();
      }
      break;
    case 'basket':
      ctx.fillStyle = '#a97b5d';
      roundRect(ctx, cx - 9, cy - 4, 18, 13, 3);
      ctx.fill();
      ctx.strokeStyle = '#7a5a34';
      ctx.lineWidth = 1;
      for (let x = -7; x <= 7; x += 4) {
        ctx.beginPath();
        ctx.moveTo(cx + x, cy - 4);
        ctx.lineTo(cx + x, cy + 9);
        ctx.stroke();
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// The atlas itself
// ---------------------------------------------------------------------------

interface CellRect { sx: number; sy: number; }

const bodyKey = (s: SizeClass, b: number, pose: number): string => `body:${s}:${b}:${pose}`;
const silKey = (s: SizeClass, b: number): string => `sil:${s}:${b}`;
const headKey = (h: HairVariant, beard: boolean): string => `head:${h}:${beard ? 1 : 0}`;
const faceKey = (e: Expression): string => `face:${e}`;
const heldKey = (k: HeldItemKind): string => `held:${k}`;

export interface PersonDrawOptions {
  sizeClass: SizeClass;
  bandColorIndex: number;
  pose: number;
  hairVariant: HairVariant;
  hasBeard: boolean;
  expression: Expression;
  heldItem: HeldItemKind | null;
}

export class SpriteAtlas {
  readonly canvas: HTMLCanvasElement;
  private readonly cells = new Map<string, CellRect>();

  constructor() {
    const bakes: { id: string; paint: (ctx: CanvasRenderingContext2D) => void }[] = [];

    for (const sizeClass of SIZE_CLASSES) {
      const geo = BODY_GEOMETRY[sizeClass];
      for (let b = 0; b < BAND_COLORS.length; b++) {
        const color = BAND_COLORS[b]!;
        for (let pose = 0; pose < 4; pose++) {
          bakes.push({ id: bodyKey(sizeClass, b, pose), paint: ctx => paintBody(ctx, geo, color, pose) });
        }
        bakes.push({ id: silKey(sizeClass, b), paint: ctx => paintSilhouette(ctx, geo, color) });
      }
    }
    for (const hair of HAIR_VARIANTS) {
      for (const beard of [false, true]) {
        bakes.push({ id: headKey(hair, beard), paint: ctx => paintHead(ctx, hair, beard) });
      }
    }
    for (const expr of EXPRESSIONS) {
      bakes.push({ id: faceKey(expr), paint: ctx => paintFace(ctx, expr) });
    }
    for (const item of HELD_PRIORITY) {
      bakes.push({ id: heldKey(item), paint: ctx => paintHeld(ctx, item) });
    }

    const columns = Math.max(1, Math.ceil(Math.sqrt(bakes.length)));
    const rows = Math.ceil(bakes.length / columns);
    this.canvas = document.createElement('canvas');
    this.canvas.width = columns * CELL;
    this.canvas.height = rows * CELL;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

    bakes.forEach((bake, i) => {
      const sx = (i % columns) * CELL;
      const sy = Math.floor(i / columns) * CELL;
      this.cells.set(bake.id, { sx, sy });
      ctx.save();
      ctx.translate(sx, sy);
      bake.paint(ctx);
      ctx.restore();
    });
  }

  private rect(key: string): CellRect {
    const r = this.cells.get(key);
    if (!r) throw new Error(`Sprite atlas: unbaked cell "${key}"`);
    return r;
  }

  /**
   * The on-screen size a body cell must be drawn at for its baked torso to
   * come out `torsoWidthOnScreen` wide — the same width `hitRadiusOf` is
   * tuned against, so what is drawn and what is clickable stay in step.
   */
  bodyDrawSize(sizeClass: SizeClass, torsoWidthOnScreen: number): number {
    return torsoWidthOnScreen / (BODY_GEOMETRY[sizeClass].torsoW / CELL);
  }

  /** The on-screen size a head+face cell must be drawn at, given the body
   * cell's own draw size, honouring that size class's larger-head fraction. */
  headDrawSize(sizeClass: SizeClass, bodyDrawSize: number): number {
    return bodyDrawSize * BODY_GEOMETRY[sizeClass].headScale * ((HEAD_RADIUS * 2) / CELL);
  }

  /** LOD: a single flat silhouette. One `drawImage`, no face, no tool. */
  drawSilhouette(
    ctx: CanvasRenderingContext2D, sizeClass: SizeClass, bandColorIndex: number,
    dx: number, dy: number, size: number
  ): void {
    const { sx, sy } = this.rect(silKey(sizeClass, bandColorIndex));
    ctx.drawImage(this.canvas, sx, sy, CELL, CELL, dx - size / 2, dy - size / 2, size, size);
  }

  /** The full figure: body, head, face and — if carried — a held item. */
  drawPerson(
    ctx: CanvasRenderingContext2D, opts: PersonDrawOptions,
    dx: number, dy: number, bodySize: number
  ): void {
    const body = this.rect(bodyKey(opts.sizeClass, opts.bandColorIndex, opts.pose));
    ctx.drawImage(this.canvas, body.sx, body.sy, CELL, CELL, dx - bodySize / 2, dy - bodySize / 2, bodySize, bodySize);

    const headSize = this.headDrawSize(opts.sizeClass, bodySize);
    const headDY = dy - bodySize * 0.36;
    const head = this.rect(headKey(opts.hairVariant, opts.hasBeard));
    ctx.drawImage(this.canvas, head.sx, head.sy, CELL, CELL, dx - headSize / 2, headDY - headSize / 2, headSize, headSize);

    const face = this.rect(faceKey(opts.expression));
    ctx.drawImage(this.canvas, face.sx, face.sy, CELL, CELL, dx - headSize / 2, headDY - headSize / 2, headSize, headSize);

    if (opts.heldItem) {
      const held = this.rect(heldKey(opts.heldItem));
      ctx.drawImage(this.canvas, held.sx, held.sy, CELL, CELL, dx - bodySize / 2, dy - bodySize / 2, bodySize, bodySize);
    }
  }
}
