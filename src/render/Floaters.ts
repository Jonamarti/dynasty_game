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
import { CONVERSATION_MODES, type ConversationMode } from '../sim/social/Conversation.ts';
import { t, aNoun } from '../i18n/i18n.ts';

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
  // Not 'thinking', which is what it said until M9 phase 5. `idle` is the gap
  // between two actions — the brain has not chosen yet — and calling that
  // thinking was the specific lie the owner's note 4 pointed at: the game
  // showed "thinking" for somebody doing nothing, and had no word left for
  // somebody actually doing it. `reflect` below now has that word.
  idle: 'at a loose end',
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
  // Distinct from `ponder` above, and from `idle`'s 'thinking': this is the
  // one of the three that is actually somebody sitting down to think.
  reflect: 'sitting and thinking',
  discuss: 'arguing it out',
  prototype: 'building the first one',
  inscribe: 'cutting it into stone',
  read: 'reading a record',
  give: 'giving food',
  steal: 'stealing',
  threaten: 'making a demand',
  attack: 'fighting',
  slander: 'speaking ill of someone',
  praise: 'speaking well of someone',
  build: 'building',
  sabotage: 'wrecking what is not theirs',
  sow: 'sowing a field',
  spread: 'spreading compost',
  reap: 'bringing in the harvest',
  haul: 'hauling materials',
  pickup: 'fetching what is on the ground',
  store: 'storing goods',
  take: 'taking from store',
  shelter: 'sheltering',
  sleep: 'asleep',
  hunt: 'hunting',
  play: 'playing a tune',
  toast: 'sharing a drink',
  tend: 'tending the hurt',
  tame: 'coaxing an animal',
  // The two verbs M11 added without words here, so the score table printed
  // their raw ids — found by the Spanish pass, where an id is plainly English.
  spar: 'sparring',
  trade: 'trading',
  // M11 phase 14b: an outsider warned off the band's ground.
  warn: 'warning them off',
  // The owner's note of 2026-09-24: a child of the band is corrected, not
  // beaten. See `social/Restraint.ts`.
  correct: 'correcting a child',
  // M12 phase 2a.
  make_amends: 'making amends',
  // M12 phase 2b.
  complain: 'taking a grievance to the chief',
  parley: 'demanding redress',
  // M11 phase 15b.
  restrain: 'holding someone back',
  call_for_help: 'calling for help',
  bind: 'tying someone up',
  escape: 'slipping away',
  patrol: 'walking the band\'s ground',
  dismember: 'cutting up a body',
  drag: 'dragging a body',
  investigate: 'asking who did it',
  gift: 'giving a gift',
  answer_call: 'answering a call for help',
};

/**
 * What somebody is doing, in words.
 *
 * `craft` takes the optional second argument because the verb alone stopped
 * being enough the moment there was more than one recipe: the label used to
 * read "making a hand axe" whatever was on the workbench. The recipe's own
 * `label` is the single source, so a new entry in `RECIPES` needs no edit here.
 */
export function actionLabel(
  action: string, recipe?: string | null, mode?: string | null
): string {
  if (action === 'craft') {
    const def = recipe ? RECIPES[recipe] : null;
    if (def) return t('making {thing}', { thing: aNoun(def.label.toLowerCase()) });
  }
  // Same story as `craft`, and for the same reason: since M9 phase 4 there are
  // four conversations behind the one verb, and "talking" for all of them
  // hides the difference between nodding at somebody in passing and sitting
  // with them for a quarter of the day.
  if (action === 'talk' && mode && mode in CONVERSATION_MODES) {
    return t(CONVERSATION_MODES[mode as ConversationMode].doing);
  }
  return t(ACTION_LABELS[action] ?? action);
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
  // M11 phase 12b. `quarry_escaped` speaks of an animal; a person who gets
  // away from an attack needed their own sentence.
  target_escaped: 'they got away',

  // They could not do it after all.
  no_water: 'there was no water within reach',
  no_food: 'they had nothing to eat',
  no_fruit: 'there was nothing to pick',
  // The season turned. Distinct from `no_fruit` because the tree visibly had
  // fruit a moment ago and there is rotten fruit lying under it — without the
  // difference, an autumn that ends mid-errand looks like the game losing track.
  fruit_fallen: 'the fruit had fallen and gone over',
  nothing_to_haul: 'they carried nothing the site needed',
  site_needs_materials: 'the site still wants materials',
  already_built: 'it was already finished',
  not_a_store: 'it is not a store',
  // M11 phase 11b: `sabotage`'s own gate on `reachBuilding`, bundling every
  // way a target can fail to be a legitimate one — unfinished, bare ground
  // with nothing to knock down, or already a ruin — the same way `no_field`
  // bundles several unrelated causes into one sentence below.
  nothing_to_sabotage: 'there was nothing standing there worth attacking',
  // The refusal `mayUse`'s `ours` branch stands in for: sabotaging one's own
  // band's building, or a close ally's, was never on offer to begin with.
  not_foreign_property: 'it belonged to their own people',
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
  // M11 phase 13f: the one reason `abandon` used that had no words, so a
  // trade that fell through said "nothing to trade" in the code's own voice.
  nothing_to_trade: 'one of them had no food to swap',
  nothing_to_steal: 'there was nothing to take',
  nothing_to_demand: 'there was nothing worth demanding',
  refused_demand: 'they refused to hand it over',
  // M12 phase 2a: making amends, and the three ways it falls through.
  amends_refused: 'what they offered was refused',
  amends_too_little: 'they had nothing worth offering',
  owe_them_nothing: 'they owed nothing there',
  // M12 phase 2b: what came of going to the chief, and of a demand put to
  // another people. Not failures, most of them — the verdict is the answer.
  not_the_chief: 'that is not their chief',
  nothing_to_complain_of: 'there was nothing to complain of',
  case_gone: 'the one it was about is gone',
  case_settled: 'it had been put right already',
  chief_takes_it_up: 'the chief will take it up with the other people',
  chief_ordered_amends: 'the chief ordered amends made',
  chief_shamed_them: 'the chief shamed the one who did it',
  chief_dismissed: 'the chief would not hear it',
  demand_refused: 'the demand was refused',
  demand_answered: 'their chief heard the demand',
  demand_carried: 'they will take it to their chief',
  no_case_against_them: 'there is nothing to demand of their people',
  // M11 phase 15b: an owner caught them at it and told them to go, and they
  // went.
  warned_off: 'someone whose it was told them to go',
  // M11 phase 15b. `restrained` is what the held person is told; main.ts
  // names the holder when it can. `broke_free` is what the holder is told.
  restrained: 'someone held them back',
  // What a corrected child is told, when they were in the middle of it.
  corrected: 'an elder of their people told them off',
  broke_free: 'they broke free',
  // M11 phase 15c. `bound` is what the tied-up person is told; main.ts names
  // whoever tied them when it can. The other two are the binder's.
  bound: 'someone tied them up',
  not_bound: 'they are not tied up',
  too_young: 'they are too young to do that',
  no_rope: 'they had no rope',
  not_held: 'nobody was holding them down',
  // M11 phase 15d.
  taken_captive: 'they were taken captive',
  escape_seen: 'one of their captors was watching',
  no_home: 'there was no camp to go back to',
  // M11 phase 16b.
  body_gone: 'the body was gone',
  // M11 phase 16d.
  nothing_to_ask: 'there was nothing left to ask about',
  no_one_named: 'nobody they asked could say',
  // M11 phase 17c.
  field_ruined_or_gone: 'the field was trampled, or gone',
  // M11 phase 5c: `slander` and `praise` need somebody to talk *about*, not
  // only somebody to talk to, and the walk over gives both of those a chance
  // to stop being true.
  subject_gone: 'the person they meant to talk about was gone',
  nothing_to_tell: 'they had nothing left worth telling',
  dont_know_how: 'they do not know how',
  // M8.2. Six ways a field can turn somebody away, and they are six different
  // problems with six different answers: gather more seed, walk to a different
  // meadow, wait for spring, come back when it is ripe, or nothing at all
  // because somebody else got there first. A single "cannot sow" would be the
  // refusal-without-a-reason defect the owner has already reported once.
  no_field: 'the field was gone',
  no_seed: 'they had no seed to sow',
  already_sown: 'it was sown already',
  wrong_season: 'nothing would come up in this cold',
  ground_spent: 'the ground there is tired',
  not_ripe: 'the crop was not ready',
  no_compost: 'there was no compost to spread',
  ground_is_rich: 'that ground wants nothing',
  nothing_to_reap: 'the field gave nothing back',
  lack_materials: 'they lacked the materials',
  no_recipe: 'they had nothing in mind to make',
  // M8.1's three verbs. Each is a way one of them can turn out to be
  // impossible, and a verb whose failures are invisible is not finished.
  nothing_to_play: 'they have no flute to play',
  nothing_to_toast: 'they have no beer to share',
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
  // Asked for a conversation these two are not close enough to have. The menu
  // greys the rung out, so this is the order that was given while they knew
  // each other better than they do now — familiarity decays — or one given to
  // a subordinate whose own view of the person the player cannot see.
  hardly_know_them: 'they hardly know them well enough for that',
  too_young_to_teach: 'they are too young to show anybody anything',
  would_not_teach: 'they would not show them',
  learned_nothing: 'they came away no wiser',
  // M12 phase 5c: the social permission verb can be declined before any land
  // is entered, so its refusal must be a named stop rather than a silent reset.
  permission_refused: 'the neighbour refused permission',
  not_a_foreign_neighbour: 'they are not a foreign neighbour',

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
  if (known !== undefined) return t(known);
  // M8.1, mechanism 4. Station reasons are per-station — `no_station_quern`,
  // and `no_station_kiln` when the kiln lands — because an aggregate cannot
  // answer "which station is everybody walking to and not finding?". That makes
  // them a family rather than a list, so they are phrased here rather than
  // written out one by one and forgotten one by one.
  if (reason.startsWith('no_station_')) {
    const id = reason.slice('no_station_'.length);
    return t('there was no {station} to work at', { station: t(BUILDINGS[id]?.label ?? id).toLowerCase() });
  }
  return reason.replace(/_/g, ' ');
}
