/**
 * Fading labels that rise from a point in the world.
 *
 * The simulation is legible in the health report and opaque on screen: a person
 * walks somewhere and something happens, and nothing tells you what. A floater
 * says "picking berries" over the person picking them, and "stole from Korak"
 * over the theft — which is the difference between watching pixels shuffle and
 * watching a society.
 *
 * Purely presentational. Nothing here is simulation state, so floaters can be
 * dropped, doubled or skipped without affecting a single outcome.
 */
import type { Camera } from './Camera.ts';

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  /** Seconds elapsed. */
  age: number;
  /** Seconds it lives for. */
  ttl: number;
  /** Drawn with a background plate; used for the player's own actions. */
  boxed: boolean;
}

/** Beyond this the oldest are dropped, so a fast-forward cannot flood the view. */
const CAPACITY = 60;

export class Floaters {
  private items: Floater[] = [];

  push(
    x: number,
    y: number,
    text: string,
    options: { color?: string; ttl?: number; boxed?: boolean } = {}
  ): void {
    this.items.push({
      x, y, text,
      color: options.color ?? '#f0ede8',
      age: 0,
      ttl: options.ttl ?? 2.6,
      boxed: options.boxed ?? false,
    });
    if (this.items.length > CAPACITY) this.items.splice(0, this.items.length - CAPACITY);
  }

  /** Seconds of real time, not simulation ticks: these fade at a readable pace
   *  whatever speed the world is running at. */
  update(deltaSeconds: number): void {
    for (const item of this.items) item.age += deltaSeconds;
    this.items = this.items.filter(item => item.age < item.ttl);
  }

  clear(): void {
    this.items.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.items.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const item of this.items) {
      const progress = item.age / item.ttl;
      // Hold at full opacity for the first third, then fade out. A label that
      // starts fading immediately is hard to read at speed.
      const alpha = progress < 0.33 ? 1 : 1 - (progress - 0.33) / 0.67;
      const rise = progress * camera.scale * 0.9;

      const px = camera.worldToScreenX(item.x);
      const py = camera.worldToScreenY(item.y) - camera.scale * 0.75 - rise;
      if (px < -120 || px > camera.viewWidth + 120) continue;
      if (py < -40 || py > camera.viewHeight + 40) continue;

      const size = item.boxed ? 13 : 11;
      ctx.font = (item.boxed ? '600 ' : '') + size + 'px ui-sans-serif, system-ui, sans-serif';

      if (item.boxed) {
        const width = ctx.measureText(item.text).width + 14;
        const height = size + 10;
        ctx.globalAlpha = alpha * 0.75;
        ctx.fillStyle = 'rgba(14, 17, 24, 0.9)';
        roundRect(ctx, px - width / 2, py - height / 2, width, height, 4);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // An unboxed label still needs to survive a bright beach, so it gets a
        // dark outline rather than a plate.
        ctx.globalAlpha = alpha * 0.85;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10, 12, 18, 0.85)';
        ctx.strokeText(item.text, px, py);
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, px, py);
    }

    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Human-readable label for an action id, for the floaters and the HUD. */
export const ACTION_LABELS: Record<string, string> = {
  idle: 'thinking',
  wander: 'wandering',
  goto: 'walking',
  walk: 'walking',
  drink: 'drinking',
  eat: 'eating',
  forage: 'foraging',
  gather: 'gathering',
  pick: 'picking fruit',
  chop: 'felling a tree',
  gather_for_site: 'fetching materials',
  rest: 'resting',
  flee: 'fleeing',
  talk: 'talking',
  court: 'courting',
  teach: 'teaching',
  craft: 'making a hand axe',
  give: 'giving food',
  steal: 'stealing',
  attack: 'fighting',
  build: 'building',
  haul: 'hauling materials',
  store: 'storing goods',
  take: 'taking from store',
  shelter: 'sheltering',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
