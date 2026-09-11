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
import { RECIPES } from '../sim/entities/Recipe.ts';
import { BUILDINGS } from '../sim/entities/Building.ts';

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
  ask: 'asking to be shown',
  // A scorer alias: `Brain.setup` rewrites it to `teach` before the action
  // system ever sees it. Listed so the HUD's score table has words for it.
  teach_child: 'teaching a child',
  craft: 'making something',
  ponder: 'turning something over',
  discuss: 'arguing it out',
  prototype: 'building the first one',
  inscribe: 'cutting it into stone',
  read: 'reading a record',
  give: 'giving food',
  steal: 'stealing',
  attack: 'fighting',
  build: 'building',
  haul: 'hauling materials',
  pickup: 'fetching what is on the ground',
  store: 'storing goods',
  take: 'taking from store',
  shelter: 'sheltering',
  sleep: 'asleep',
  hunt: 'hunting',
  play: 'playing a tune',
  tend: 'tending the hurt',
  tame: 'coaxing an animal',
};

/**
 * What somebody is doing, in words.
 *
 * `craft` takes the optional second argument because the verb alone stopped
 * being enough the moment there was more than one recipe: the label used to
 * read "making a hand axe" whatever was on the workbench. The recipe's own
 * `label` is the single source, so a new entry in `RECIPES` needs no edit here.
 */
export function actionLabel(action: string, recipe?: string | null): string {
  if (action === 'craft') {
    const def = recipe ? RECIPES[recipe] : null;
    if (def) return 'making a ' + def.label.toLowerCase();
  }
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
  // M7: greedy steering gave up on a route that does not exist — a concave
  // shoreline, a lagoon, a rock ridge. Not resumable: a route that does not
  // exist now will not exist in two hundred ticks either.
  cannot_reach: 'they could not get there',
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
  // What was actually asked for was gone by the time they got there — someone
  // else emptied that stack between the order and the walk. Kept apart from
  // `store_empty`, which means the whole store was bare: this store may still
  // hold plenty of everything else.
  take_item_gone: 'it was gone by the time they got there',
  // The two ways a walk to a heap of dropped goods can come to nothing. The
  // heap itself is gone — somebody else cleared it, or it rotted away — or the
  // one stack that was asked for is, which is a different sentence because the
  // rest of the heap may still be sitting there.
  goods_gone: 'the goods were gone',
  pile_item_gone: 'somebody else had taken it',
  // The same story as `take_item_gone`, from the other end of the trip: what
  // was chosen to store left the pack — given away, dropped, eaten — before
  // they reached the store.
  store_item_gone: 'they no longer had it to store',
  nothing_to_give: 'they had nothing to give',
  nothing_to_steal: 'there was nothing to take',
  dont_know_how: 'they do not know how',
  lack_materials: 'they lacked the materials',
  no_recipe: 'they had nothing in mind to make',
  // M8.1's three verbs. Each is a way one of them can turn out to be
  // impossible, and a verb whose failures are invisible is not finished.
  nothing_to_play: 'they have no flute to play',
  nobody_to_tend: 'there is nobody here to look after',
  nothing_to_treat: 'they are not hurt any more',
  nothing_to_offer: 'they had no food to offer it',
  already_tame: 'it already follows somebody',
  already_wed: 'they are already married',

  // Research. Every one of these is a way an idea can stall, and a stalled idea
  // that says nothing is indistinguishable from a character standing still.
  nothing_to_think_about: 'they have nothing on their mind',
  // They were told which idea to work on and it has moved past working on —
  // proven while they walked over, or given up as stale. Kept apart from
  // having nothing on their mind, which is a different thing entirely.
  idea_moved_on: 'that idea had moved on without them',
  nothing_came_of_it: 'nothing came of it this time',
  nothing_to_build_yet: 'the idea is not ready to build',
  // There is no first one to build: what is on their mind is a way of doing
  // something, not a thing. It is tried by going and doing it.
  nothing_to_build: 'that is not something you build',
  partner_ignorant: 'they know nothing about it',
  partner_unwilling: 'they would not discuss it',
  // The three ways asking to be taught can come to nothing. Kept apart because
  // they call for different things from the player: wait until the child grows
  // up, mend the relationship, or try again.
  too_young_to_teach: 'they are too young to show anybody anything',
  would_not_teach: 'they would not show them',
  learned_nothing: 'they came away no wiser',

  // Records. The literacy gate is the one worth spelling out: a stone that
  // grants nothing to somebody who cannot read is the point of writing, and a
  // silent refusal there would read as a bug.
  cannot_write: 'they never learned to write',
  cannot_read: 'they cannot read it',
  nothing_to_record: 'everything they know is already written down',
  nowhere_to_write: 'there was nowhere left to cut it',
  record_gone: 'the record is gone',
  nothing_new_on_it: 'there was nothing on it they did not know',
};

export function stopReasonLabel(reason: string): string {
  const known = STOP_REASONS[reason];
  if (known !== undefined) return known;
  // M8.1, mechanism 4. Station reasons are per-station — `no_station_quern`,
  // and `no_station_kiln` when the kiln lands — because an aggregate cannot
  // answer "which station is everybody walking to and not finding?". That makes
  // them a family rather than a list, so they are phrased here rather than
  // written out one by one and forgotten one by one.
  if (reason.startsWith('no_station_')) {
    const id = reason.slice('no_station_'.length);
    return 'there was no ' + (BUILDINGS[id]?.label.toLowerCase() ?? id) + ' to work at';
  }
  return reason.replace(/_/g, ' ');
}
