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
  sleep: 'asleep',
  hunt: 'hunting',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * Why an action stopped, in words a player can act on.
 *
 * The simulation names these for itself — `hands_full`, `tree_gone` — and until
 * this table existed every one of them was a telemetry counter and nothing
 * else. Kept beside `ACTION_LABELS` because it answers the other half of the
 * same question: what were they doing, and why did they stop?
 */
export const STOP_REASONS: Record<string, string> = {
  // Ran out of room, need or patience.
  hands_full: 'their hands are full',
  thirsty: 'they stopped for a drink',
  hungry: 'they stopped to eat',
  cold: 'they were too cold to carry on',
  under_attack: 'somebody attacked them',
  long_enough: 'they had worked long enough',
  daylight: 'nobody sleeps through the day',
  rested: 'they had slept enough',

  // The job finished itself.
  node_empty: 'there was nothing left to take',
  tree_bare: 'there was no fruit left on it',

  // The world changed underneath them.
  node_gone: 'it was gone',
  tree_gone: 'the tree was gone',
  site_gone: 'the site was gone',
  target_gone: 'they were gone',
  quarry_gone: 'the animal was gone',
  quarry_escaped: 'the animal outran them',

  // They could not do it after all.
  no_water: 'there was no water within reach',
  no_food: 'they had nothing to eat',
  no_fruit: 'there was nothing to pick',
  nothing_to_haul: 'they carried nothing the site needed',
  site_needs_materials: 'the site still wants materials',
  already_built: 'it was already finished',
  not_a_store: 'it is not a store',
  store_full: 'the store was full',
  store_empty: 'the store was empty',
  nothing_to_give: 'they had nothing to give',
  nothing_to_steal: 'there was nothing to take',
  dont_know_how: 'they do not know how',
  lack_materials: 'they lacked the materials',
  already_wed: 'they are already married',
};

export function stopReasonLabel(reason: string): string {
  return STOP_REASONS[reason] ?? reason.replace(/_/g, ' ');
}
