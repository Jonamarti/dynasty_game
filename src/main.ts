/**
 * Browser entry point: creates the simulation, drives it on a fixed timestep,
 * renders it, and routes input into orders.
 *
 * The loop uses an accumulator so simulation speed is independent of frame
 * rate — at 20 steps/s the world advances at the same pace on a 144Hz monitor
 * and a struggling laptop. `maxStepsPerFrame` caps catch-up so a stall (an
 * alt-tab, a breakpoint) cannot produce a spiral of death.
 */
import './style.css';
import { Simulation } from './sim/core/Simulation.ts';
import { Camera } from './render/Camera.ts';
import { Renderer } from './render/Renderer.ts';
import { actionLabel } from './render/Floaters.ts';
import { Hud, type Selection } from './ui/Hud.ts';
import { RadialMenu } from './ui/RadialMenu.ts';
import { SuccessionOverlay } from './ui/Succession.ts';
import { availableActions, type ActionTarget } from './sim/ai/ActionCatalog.ts';
import type { Person } from './sim/entities/Person.ts';
import type { BuildingDef } from './sim/entities/Building.ts';
import { describeEvent } from './sim/social/Events.ts';
import { knowledgeOfPerson } from './sim/social/Knowledge.ts';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;

/**
 * A fresh world per load, unless one is named.
 *
 * `?seed=anything` replays a specific world exactly — the simulation is
 * deterministic from its seed, so a bug seen once can be seen again. The
 * browser tests pin a seed for the same reason: without it they were rolling a
 * new world every run and passing or failing on where the player happened to
 * be standing.
 */
const seedParam = new URLSearchParams(location.search).get('seed');
const seed: string | number = seedParam ?? Math.floor(Math.random() * 1e9);
const sim = new Simulation({ seed });
const player = sim.possessFirst();

const camera = new Camera();
if (player) camera.snapTo(player.x, player.y);

const renderer = new Renderer(canvas, sim, camera);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

let selected: Selection | null = player ? { kind: 'person', person: player } : null;
let paused = false;
let stepsPerSecond = 20;
const maxStepsPerFrame = 8;

/**
 * Who the player is currently giving orders to, or null for themselves.
 *
 * Command mode is how household authority reaches the world: pick one of your
 * own, then right-click a target and the order goes to *them*, subject to
 * whether they will actually do it. Keeping it as a mode rather than doubling
 * every verb in the radial menu keeps the menu readable.
 */
let commanding: Person | null = null;

let buildMode = false;
let activeDesign: BuildingDef | null = null;

// Attached to the body, not to #hud: the HUD rebuilds its own subtree, and a
// menu living inside it was silently erased the moment the HUD re-rendered.
const radial = new RadialMenu(document.body);

// On the body for the same reason as the radial menu: the HUD rebuilds its own
// subtree and would erase anything living inside it.
const succession = new SuccessionOverlay(document.body, heir => {
  if (!heir) return;
  selected = { kind: 'person', person: heir };
  camera.recentre(heir.x, heir.y);
  renderer.floaters.push(heir.x, heir.y, 'you are now ' + heir.name, {
    color: '#ffd35c', boxed: true, ttl: 4,
  });
});

const hud = new Hud(hudRoot, {
  onSpeedChange: value => { stepsPerSecond = value; },
  onTogglePause: () => { paused = !paused; hud.setPaused(paused); },
  onPossess: person => possess(person),
  onSelect: person => { selected = { kind: 'person', person }; },
  onPickDesign: def => { activeDesign = def; },
  onItemAction: (person, itemId, verb) => handleItemAction(person, itemId, verb),
  onCommand: person => {
    commanding = commanding?.id === person?.id ? null : person;
    if (commanding) {
      renderer.floaters.push(commanding.x, commanding.y,
        'commanding ' + commanding.name, { color: '#7fd4ff', boxed: true });
    }
  },
});
hud.renderBuildBar(sim, false);

/**
 * A verb chosen against one stack in the pack.
 *
 * Everything here goes through the simulation rather than touching inventories
 * directly, so the UI stays a reader of the world and the same moves remain
 * available to NPCs later.
 */
function handleItemAction(person: Person, itemId: string, verb: string): void {
  const say = (text: string, good: boolean) =>
    renderer.floaters.push(person.x, person.y, text,
      { color: good ? '#7ddc96' : '#e66464', boxed: true });

  switch (verb) {
    case 'eat_item': {
      const eaten = sim.eatItem(person, itemId);
      say(eaten ? 'ate ' + itemId : 'cannot eat that', eaten);
      break;
    }
    case 'drop_item': {
      const dropped = sim.drop(person, itemId, person.inventory.count(itemId));
      say(dropped ? 'dropped ' + itemId : 'nothing to drop', dropped !== null);
      break;
    }
    case 'give_item': {
      const other = sim.peopleHash.findNearest(person.x, person.y, 2.2,
        p => p.alive && p.id !== person.id);
      const given = other ? sim.handOver(person, other, itemId) : 0;
      say(given > 0 ? 'gave ' + given + ' to ' + other!.name : 'nobody to give it to', given > 0);
      break;
    }
    case 'store_item': {
      const store = sim.storeWithinReach(person);
      const stored = store ? sim.storeItem(person, store, itemId) : 0;
      say(stored > 0 ? 'stored ' + stored : 'no room in the store', stored > 0);
      break;
    }
  }
}

function possess(person: Person): void {
  if (sim.player) sim.player.isPlayer = false;
  person.isPlayer = true;
  sim.player = person;
  selected = { kind: 'person', person };
  renderer.floaters.push(person.x, person.y, 'you are now ' + person.name, {
    color: '#ffd35c', boxed: true, ttl: 3,
  });
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const held = new Set<string>();

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();

  if (key === ' ') {
    event.preventDefault();
    paused = !paused;
    hud.setPaused(paused);
    return;
  }
  if (key === 'b') {
    setBuildMode(!buildMode);
    return;
  }
  if (key === 'escape') {
    if (buildMode) setBuildMode(false);
    commanding = null;
    return;
  }
  if (key === 'f') {
    if (sim.player) camera.recentre(sim.player.x, sim.player.y);
    return;
  }
  if (key === 'c') {
    commanding = commanding
      ? null
      : (selected?.kind === 'person' && selected.person.id !== sim.player?.id
          ? selected.person
          : null);
    return;
  }
  // Tab keys for the character panel, so the player can flick between what
  // someone wants, who they know and what has happened to them.
  if (key === '1') hud.setTab('now');
  if (key === '2') hud.setTab('self');
  if (key === '3') hud.setTab('kit');
  if (key === '4') hud.setTab('ties');
  if (key === '5') hud.setTab('life');

  held.add(key);
});
window.addEventListener('keyup', event => held.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());

function setBuildMode(on: boolean): void {
  buildMode = on;
  if (!on) {
    activeDesign = null;
    hud.clearDesign();
    renderer.buildGhost = null;
  }
  hud.renderBuildBar(sim, on);
}

function worldPoint(event: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: camera.screenToWorldX(event.clientX - rect.left),
    y: camera.screenToWorldY(event.clientY - rect.top),
  };
}

/**
 * Everything under the cursor, nearest first.
 *
 * Order used to be fixed — person, then building, then node or tree — and that
 * made the bush you were standing on unclickable: harvesting puts your own
 * character exactly on top of the node, so every click there returned you. The
 * player is now the *last* candidate rather than the first, and repeated clicks
 * in the same spot cycle through whatever else is stacked there.
 */
function candidatesAt(worldX: number, worldY: number, excludePlayer: boolean): ActionTarget[] {
  const scored: { target: ActionTarget; distance: number }[] = [];

  // A click on water is a click on water. Nothing stands in a lake, and letting
  // a shoreline tree a tile and a half away capture the click meant clicking a
  // lake offered you an axe instead of a drink.
  if (sim.world.isWater(Math.round(worldX), Math.round(worldY))) {
    return [{ kind: 'ground', x: Math.round(worldX), y: Math.round(worldY) }];
  }

  const person = renderer.pickPerson(worldX, worldY, 1.2);
  if (person && person.id !== sim.player?.id) {
    scored.push({
      target: { kind: 'person', x: person.x, y: person.y, person },
      distance: Math.hypot(person.x - worldX, person.y - worldY),
    });
  }

  const node = renderer.pickNode(worldX, worldY, 1.4);
  if (node) {
    scored.push({
      target: { kind: 'node', x: node.x, y: node.y, node },
      distance: Math.hypot(node.x - worldX, node.y - worldY),
    });
  }

  const tree = renderer.pickTree(worldX, worldY, 1.6);
  if (tree) {
    scored.push({
      target: { kind: 'tree', x: tree.x, y: tree.y, tree },
      distance: Math.hypot(tree.x - worldX, tree.y - worldY),
    });
  }

  const pile = renderer.pickPile(worldX, worldY, 1.2);
  if (pile) {
    scored.push({
      target: { kind: 'pile', x: pile.x, y: pile.y, pile },
      distance: Math.hypot(pile.x - worldX, pile.y - worldY),
    });
  }

  scored.sort((a, b) => a.distance - b.distance);
  const targets = scored.map(entry => entry.target);

  // A building covers whole tiles rather than a point, so it sits behind the
  // things standing on it but ahead of bare ground.
  const building = sim.buildingAt(worldX, worldY);
  if (building) {
    targets.push({ kind: 'building', x: building.centerX, y: building.centerY, building });
  }

  // Your own character last: reachable by clicking a spot with nothing else on
  // it, and never in the way of the thing you were actually aiming at.
  const self = sim.player;
  if (!excludePlayer && self && person && person.id === self.id) {
    targets.push({ kind: 'person', x: self.x, y: self.y, person: self });
  }

  targets.push({ kind: 'ground', x: Math.round(worldX), y: Math.round(worldY) });
  return targets;
}

/** Nearest thing under the cursor. */
function targetAt(worldX: number, worldY: number, excludePlayer = false): ActionTarget {
  return candidatesAt(worldX, worldY, excludePlayer)[0]!;
}

canvas.addEventListener('mousemove', event => {
  if (drag.active) {
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (!drag.panning && drag.button === 0 &&
        Math.abs(event.clientX - drag.lastX) + Math.abs(event.clientY - drag.lastY) > DRAG_THRESHOLD) {
      drag.panning = true;
    }
    if (drag.panning) {
      camera.panByPixels(dx, dy);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }
  }

  if (!buildMode || !activeDesign) {
    renderer.buildGhost = null;
    return;
  }
  const point = worldPoint(event);
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  renderer.buildGhost = {
    x, y,
    width: activeDesign.width,
    height: activeDesign.height,
    ok: sim.canPlace(activeDesign, x, y),
  };
});

/**
 * Drag-to-pan.
 *
 * A left press only becomes a drag once it has travelled past a few pixels, so
 * a plain click still selects. Middle-drag always pans. Panning releases the
 * camera from the player; `F` (or the button in the top bar) re-attaches it.
 */
const drag = { active: false, panning: false, lastX: 0, lastY: 0, button: 0 };
const DRAG_THRESHOLD = 4;

canvas.addEventListener('mousedown', event => {
  if (event.button === 0 || event.button === 1) {
    drag.active = true;
    drag.panning = event.button === 1;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.button = event.button;
  }
  const point = worldPoint(event);

  // --- Build mode: left click places, right click cancels ------------------
  if (buildMode && activeDesign) {
    if (event.button === 2) {
      setBuildMode(false);
      return;
    }
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const placed = sim.place(activeDesign.id, x, y, sim.player?.bandId ?? 0);
    if (placed) {
      renderer.floaters.push(placed.centerX, placed.centerY,
        placed.complete ? placed.def.label + ' marked out' : placed.def.label + ' planned',
        { color: '#7ddc96', boxed: true });
    } else {
      renderer.floaters.push(x, y, 'cannot build there', { color: '#e66464', boxed: true });
    }
    return;
  }

  // --- Right click: the radial menu ----------------------------------------
  if (event.button === 2) {
    const actor = sim.player;
    if (!actor || !actor.alive) return;

    const target = targetAt(point.x, point.y, true);
    const nearWater = isNearWater(point.x, point.y);
    // In command mode the verbs are worked out for the person being commanded,
    // not for the player: what *they* can carry, what *they* know how to make.
    const subject = commanding && commanding.alive ? commanding : actor;
    const options = availableActions(subject, target, {
      world: sim.world, nearWater, commanding,
    });

    const title =
      target.kind === 'person'
        ? knowledgeOfPerson(actor, target.person!, sim.relationships).displayName :
      target.kind === 'node' ? target.node!.kind :
      target.kind === 'building' ? target.building!.def.label :
      target.kind === 'tree' ? target.tree!.def.label :
      target.kind === 'pile' ? 'Dropped goods' :
      'Ground';

    radial.show(
      event.clientX, event.clientY,
      commanding && commanding.alive ? title + ' \u2014 ordering ' + commanding.name : title,
      options,
      option => issue(actor, option.id, target)
    );
    return;
  }

  // --- Left click: inspect --------------------------------------------------
  // Deferred to mouseup so that a drag pans instead of selecting whatever
  // happened to be under the cursor when the press started.
});

window.addEventListener('mouseup', event => {
  const wasDragging = drag.panning;
  drag.active = false;
  drag.panning = false;
  if (wasDragging || event.button !== 0) return;
  if (buildMode || radial.isOpen) return;
  if (event.target !== canvas) return;

  const point = worldPoint(event);
  const options = candidatesAt(point.x, point.y, false);

  // Clicking the same spot again steps to the next thing stacked there, so a
  // person, the bush they are picking and the hut they are standing in are all
  // reachable without moving the mouse.
  const samePlace = Math.hypot(point.x - lastPick.x, point.y - lastPick.y) < 1;
  lastPick.index = samePlace ? (lastPick.index + 1) % options.length : 0;
  lastPick.x = point.x;
  lastPick.y = point.y;

  const target = options[lastPick.index]!;
  selected =
    target.kind === 'person' && target.person ? { kind: 'person', person: target.person } :
    target.kind === 'node' && target.node ? { kind: 'node', node: target.node } :
    target.kind === 'tree' && target.tree ? { kind: 'tree', tree: target.tree } :
    target.kind === 'pile' && target.pile ? { kind: 'pile', pile: target.pile } :
    target.kind === 'building' && target.building
      ? { kind: 'building', building: target.building }
      : (sim.player ? { kind: 'person', person: sim.player } : null);
});

/** Where the last selecting click landed, and how deep into the stack it went. */
const lastPick = { x: Number.NaN, y: Number.NaN, index: 0 };

// Suppressed document-wide, not just on the canvas: right-click is this game's
// primary verb, and the browser menu covered the radial one whenever the cursor
// happened to be over the HUD, the build bar, or the menu itself.
document.addEventListener('contextmenu', event => event.preventDefault());

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  // Down to 0.5 so the whole island fits on screen: surveying the land is how
  // you decide where to move a camp.
  camera.zoom = Math.max(0.5, Math.min(5, camera.zoom * (event.deltaY < 0 ? 1.12 : 0.89)));
}, { passive: false });

function isNearWater(x: number, y: number): boolean {
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (sim.world.isWater(cx + dx, cy + dy)) return true;
    }
  }
  return false;
}

/** Turns a menu choice into a simulation order. */
function issue(actor: Person, actionId: string, target: ActionTarget): void {
  if (actionId === 'possess' && target.person) {
    possess(target.person);
    return;
  }
  if (actionId === 'pickup' && target.pile) {
    const taken = sim.takeFromPile(actor, target.pile);
    renderer.floaters.push(actor.x, actor.y,
      taken > 0 ? 'picked up ' + taken : 'hands full',
      { color: taken > 0 ? '#7ddc96' : '#e66464', boxed: true });
    return;
  }

  const place = {
    x: target.kind === 'ground' ? target.x : undefined,
    y: target.kind === 'ground' ? target.y : undefined,
    personId: target.person?.id,
    nodeId: target.node?.id,
    buildingId: target.building?.id,
    treeId: target.tree?.id,
  };

  // Commanding somebody else: they may simply refuse, in public.
  if (commanding && commanding.alive && commanding.id !== actor.id) {
    const subordinate = commanding;
    const obeyed = sim.command(actor, subordinate, actionId, place);
    const why = sim.lastRefusal;
    sim.lastRefusal = null;
    renderer.floaters.push(subordinate.x, subordinate.y,
      obeyed ? subordinate.name + ' obeys'
        : subordinate.name + ' refuses' + (why ? ': ' + why : ''),
      { color: obeyed ? '#7ddc96' : '#e0705c', boxed: true, ttl: 3.4 });
    return;
  }

  const ok = sim.order(actor, actionId, {
    x: target.kind === 'ground' ? target.x : undefined,
    y: target.kind === 'ground' ? target.y : undefined,
    personId: target.person?.id,
    nodeId: target.node?.id,
    buildingId: target.building?.id,
    treeId: target.tree?.id,
  });

  // A refusal says why. `lastRefusal` is set by the simulation and read once.
  const reason = sim.lastRefusal;
  sim.lastRefusal = null;
  renderer.floaters.push(actor.x, actor.y,
    ok ? actionLabel(actionId) : (reason ?? 'cannot do that'),
    { color: ok ? '#ffd35c' : '#e66464', boxed: true, ttl: ok ? 2.6 : 3.6 });
}

// ---------------------------------------------------------------------------
// Floaters: what people are doing, and what just happened
// ---------------------------------------------------------------------------

const lastActions = new Map<number, string>();
let lastEventId = 0;

const NOTABLE = new Set(['theft', 'assault', 'murder', 'share_food', 'gift']);
const EVENT_COLORS: Record<string, string> = {
  theft: '#e0a04a',
  assault: '#e06a5a',
  murder: '#ff5b5b',
  share_food: '#7ddc96',
  gift: '#7ddc96',
};

function updateFloaters(): void {
  // The player's own action, and the selected person's, are always labelled:
  // these are the two people whose behaviour the player is actually tracking.
  const watched = [sim.player, selected?.kind === 'person' ? selected.person : null];
  for (const person of watched) {
    if (!person || !person.alive) continue;
    const previous = lastActions.get(person.id);
    if (previous === person.action) continue;
    lastActions.set(person.id, person.action);
    if (person.action === 'idle') continue;
    renderer.floaters.push(person.x, person.y, actionLabel(person.action), {
      color: person.isPlayer ? '#ffd35c' : '#7fd4ff',
      boxed: person.isPlayer,
    });
  }

  // Notable deeds, but only the ones your character could actually have seen,
  // and named only as far as your character could name them. Announcing every
  // theft on the island would hand the player the omniscience the whole design
  // is built to withhold — and it is also how you get told about a murder
  // committed by someone you have never met, in a place you have never been.
  const observer = sim.player;
  for (const event of sim.social.recent) {
    if (event.id <= lastEventId) continue;
    lastEventId = event.id;
    if (!NOTABLE.has(event.type)) continue;
    if (!observer || !observer.alive) continue;

    const dx = event.x - observer.x;
    const dy = event.y - observer.y;
    if (Math.sqrt(dx * dx + dy * dy) > sim.config.sightRadius) continue;

    const actor = sim.peopleById.get(event.actorId);
    const victim = event.targetId === null ? null : sim.peopleById.get(event.targetId);
    if (!actor) continue;

    const actorName = knowledgeOfPerson(observer, actor, sim.relationships).displayName;
    const victimName = victim
      ? knowledgeOfPerson(observer, victim, sim.relationships).displayName
      : null;
    renderer.floaters.push(event.x, event.y,
      describeEvent(event.type, actorName, victimName),
      { color: EVENT_COLORS[event.type] ?? '#f0ede8', ttl: 3.4 });
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

let lastTime = performance.now();
let accumulator = 0;

function readIntent(): { dx: number; dy: number } | null {
  let dx = 0;
  let dy = 0;
  if (held.has('a') || held.has('arrowleft')) dx -= 1;
  if (held.has('d') || held.has('arrowright')) dx += 1;
  if (held.has('w') || held.has('arrowup')) dy -= 1;
  if (held.has('s') || held.has('arrowdown')) dy += 1;
  return dx === 0 && dy === 0 ? null : { dx, dy };
}

function frame(now: number): void {
  const delta = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;

  if (!paused) {
    accumulator += delta;
    const stepDuration = 1 / stepsPerSecond;
    let stepsThisFrame = 0;
    while (accumulator >= stepDuration && stepsThisFrame < maxStepsPerFrame) {
      const intent = readIntent();
      // Walking by hand overrides a standing order; the player has changed
      // their mind, and fighting them over it is maddening.
      if (intent && sim.player) sim.player.clearOrder();
      sim.playerIntent = intent;
      sim.step();
      accumulator -= stepDuration;
      stepsThisFrame++;
    }
    // Drop any backlog we could not work through, rather than carrying it into
    // the next frame and falling further behind every frame.
    if (stepsThisFrame === maxStepsPerFrame) accumulator = 0;
  }

  if (selected?.kind === 'person' && !selected.person.alive && !sim.succession) {
    selected = sim.player && sim.player.alive ? { kind: 'person', person: sim.player } : null;
  }
  if (sim.player && sim.player.alive) camera.follow(sim.player.x, sim.player.y);
  camera.clampTo(sim.world.width, sim.world.height);

  renderer.commandedId = commanding && commanding.alive ? commanding.id : null;
  hud.setCommanding(commanding);
  succession.update(sim);
  updateFloaters();
  renderer.floaters.update(delta);
  renderer.render(
    selected === null ? null :
    selected.kind === 'person' ? { personId: selected.person.id } :
    selected.kind === 'node' ? { nodeId: selected.node.id } :
    selected.kind === 'tree' ? { treeId: selected.tree.id } :
    selected.kind === 'pile' ? { pileId: selected.pile.id } :
    { buildingId: selected.building.id }
  );
  hud.update(sim, selected);

  requestAnimationFrame(frame);
}

/**
 * A read-only handle on the running game, for the browser tests and for poking
 * around in the console. Dev builds only — it is stripped from a production
 * bundle, so it cannot become something the game itself depends on.
 */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dynasty = { sim, camera, renderer };
}

requestAnimationFrame(frame);
