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
import { Renderer, hitRadiusOf, GRAB_MARGIN, type HitTarget } from './render/Renderer.ts';
import { actionLabel, stopReasonLabel } from './render/Floaters.ts';
import { Hud, type Selection } from './ui/Hud.ts';
import { RadialMenu } from './ui/RadialMenu.ts';
import { EntityPicker, type PickerEntry } from './ui/EntityPicker.ts';
import { NewGame } from './ui/NewGame.ts';
import { SuccessionOverlay } from './ui/Succession.ts';
import { TechWebOverlay } from './ui/TechWeb.ts';
import { availableActions, type ActionTarget } from './sim/ai/ActionCatalog.ts';
import type { Person } from './sim/entities/Person.ts';
import type { BuildingDef } from './sim/entities/Building.ts';
import { describeEvent } from './sim/social/Events.ts';
import {
  knowledgeOfPerson, knowledgeOfNode, knowledgeOfTree,
} from './sim/social/Knowledge.ts';

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
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const seed: string | number = seedParam ?? Math.floor(Math.random() * 1e9);
const sim = new Simulation({ seed });

/**
 * `?skipIntro=1` goes straight into the first living body.
 *
 * The Playwright specs and every screenshot in the tour were written against a
 * game that starts immediately, and a character-creation screen that they all
 * have to be taught to dismiss is a screen that will silently break them.
 */
const skipIntro = params.get('skipIntro') === '1';
const player = sim.possessFirst();

const camera = new Camera();
if (player) camera.snapTo(player.x, player.y);

const renderer = new Renderer(canvas, sim, camera);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

let selected: Selection | null = player ? { kind: 'person', person: player } : null;
let paused = false;
// The default lives in `Config.time.tickRate`, and the HUD slider reads the
// same number: three hardcoded 20s is how the slider and the loop came to
// disagree about what speed the game opens at.
let stepsPerSecond = sim.config.time.tickRate;
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

// The chooser for a stack of things under one click. On the body for the same
// reason the radial menu is.
const picker = new EntityPicker(document.body);

// The map of somebody's mind. On `document.body` rather than `#hud`, like every
// other overlay here: the HUD rebuilds its subtree every frame and would throw
// this away mid-hover.
const techWeb = new TechWebOverlay(document.body);

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
  onFocus: person => {
    // `snapTo` and release the follow, not `recentre`: recentre re-attaches the
    // camera to the player, so the view would slide straight back off whoever
    // the player just asked to look at. `F` re-attaches it when they are done.
    camera.snapTo(person.x, person.y);
    camera.following = false;
    renderer.floaters.push(person.x, person.y,
      knowledgeOfPerson(sim.player ?? person, person, sim.relationships).displayName,
      { color: '#7fd4ff', boxed: true, ttl: 2 });
  },
  onPickDesign: def => { activeDesign = def; },
  onItemAction: (person, itemId, verb) => handleItemAction(person, itemId, verb),
  onCommand: person => {
    commanding = commanding?.id === person?.id ? null : person;
    if (commanding) {
      renderer.floaters.push(commanding.x, commanding.y,
        'commanding ' + commanding.name, { color: '#7fd4ff', boxed: true });
    }
  },
}, sim.config.time.tickRate);
hud.renderBuildBar(sim, false);

/**
 * Character creation, over a world that already exists.
 *
 * The game is paused behind it, so the first step does not run until the player
 * has chosen who they are — otherwise the tribe they are reading about is
 * already burying people by the time they pick.
 */
const newGame = new NewGame(document.body, sim, person => {
  possess(person);
  camera.snapTo(person.x, person.y);
  paused = false;
  hud.setPaused(false);
});

if (!skipIntro && sim.livingPeople().length > 0) {
  paused = true;
  hud.setPaused(true);
  newGame.open();
}

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
  sim.possess(person);
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
  if (newGame.isOpen) return;
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
    if (techWeb.isOpen) techWeb.close();
    if (buildMode) setBuildMode(false);
    commanding = null;
    return;
  }
  if (key === 'h') {
    hud.toggleChrome();
    return;
  }
  if (key === 'p') {
    hud.toggleCollapsed();
    return;
  }
  if (key === 'f') {
    if (sim.player) camera.recentre(sim.player.x, sim.player.y);
    return;
  }
  if (key === 'g') {
    // Opens on whoever is selected, falling back to the player. Opening it on
    // somebody else is the point as much as opening it on yourself: knowing
    // which of your band has the idea nobody else has had is the question the
    // panel exists to answer.
    const subject = selected?.kind === 'person' ? selected.person : sim.player;
    techWeb.toggle(sim, subject);
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

  /**
   * Keeps a candidate only if the click landed on the thing as it is drawn.
   *
   * The picker used to use fixed radii regardless of how large the renderer
   * painted the target, so a seedling drawn as a two-pixel sprig captured
   * clicks a tile and a half away. `hitRadiusOf` lives beside the drawing code
   * for exactly this reason.
   */
  const consider = (target: ActionTarget, hit: HitTarget, x: number, y: number) => {
    const distance = Math.hypot(x - worldX, y - worldY);
    if (distance > hitRadiusOf(hit) + GRAB_MARGIN) return;
    scored.push({ target, distance });
  };

  const person = renderer.pickPerson(worldX, worldY);
  if (person && person.id !== sim.player?.id) {
    consider({ kind: 'person', x: person.x, y: person.y, person },
      { kind: 'person', person }, person.x, person.y);
  }

  const node = renderer.pickNode(worldX, worldY);
  if (node) {
    consider({ kind: 'node', x: node.x, y: node.y, node },
      { kind: 'node', node }, node.x, node.y);
  }

  const tree = renderer.pickTree(worldX, worldY);
  if (tree) {
    consider({ kind: 'tree', x: tree.x, y: tree.y, tree },
      { kind: 'tree', tree }, tree.x, tree.y);
  }

  const pile = renderer.pickPile(worldX, worldY);
  if (pile) {
    consider({ kind: 'pile', x: pile.x, y: pile.y, pile },
      { kind: 'pile', pile }, pile.x, pile.y);
  }

  const animal = renderer.pickAnimal(worldX, worldY);
  if (animal) {
    consider({ kind: 'animal', x: animal.x, y: animal.y, animal },
      { kind: 'animal', animal }, animal.x, animal.y);
  }

  scored.sort((a, b) => a.distance - b.distance);
  const targets = scored.map(entry => entry.target);

  // A building covers whole tiles rather than a point, so it sits behind the
  // things standing on it but ahead of bare ground. Its footprint is already
  // exact, so it needs no hit radius of its own.
  const building = sim.buildingAt(worldX, worldY);
  if (building) {
    targets.push({ kind: 'building', x: building.centerX, y: building.centerY, building });
  }

  // Your own character last: reachable by clicking a spot with nothing else on
  // it, and never in the way of the thing you were actually aiming at.
  const self = sim.player;
  if (!excludePlayer && self &&
      Math.hypot(self.x - worldX, self.y - worldY) <= hitRadiusOf({ kind: 'person', person: self }) + GRAB_MARGIN) {
    targets.push({ kind: 'person', x: self.x, y: self.y, person: self });
  }

  targets.push({ kind: 'ground', x: Math.round(worldX), y: Math.round(worldY) });
  return targets;
}

/** The candidates worth choosing between: everything but the bare ground. */
function realCandidates(targets: ActionTarget[]): ActionTarget[] {
  return targets.filter(t => t.kind !== 'ground');
}

const PICKER_ICONS: Record<string, string> = {
  person: '\u{1F464}',
  node: '\u{1F33F}',
  tree: '\u{1F333}',
  pile: '\u{1F4E6}',
  animal: '\u{1F98C}',
  building: '\u{1F3E0}',
  ground: '\u{1F45F}',
};

/**
 * How a candidate reads in the chooser.
 *
 * Routed through the knowledge layer rather than the raw entity, because a
 * picker that prints a stranger's name hands the player exactly the god's-eye
 * view the rest of the interface is built to withhold.
 */
function describeCandidate(observer: Person, target: ActionTarget): string {
  switch (target.kind) {
    case 'person':
      return knowledgeOfPerson(observer, target.person!, sim.relationships).displayName;
    case 'node':
      return target.node!.kind + ' — ' + knowledgeOfNode(observer, target.node!).estimate;
    case 'tree':
      return target.tree!.def.label + ' — ' + knowledgeOfTree(observer, target.tree!).estimate;
    case 'animal':
      // No knowledge gating: a deer is a deer to anyone who has seen one.
      return target.animal!.label + (target.animal!.alarmed ? ' — alarmed' : '');
    case 'pile':
      return 'dropped goods';
    case 'building':
      return target.building!.def.label;
    case 'ground':
      return 'the ground here';
  }
}

function pickerEntries(observer: Person, targets: ActionTarget[]): PickerEntry[] {
  return targets.map(target => ({
    target,
    icon: PICKER_ICONS[target.kind] ?? '•',
    label: describeCandidate(observer, target),
  }));
}

/** Where to draw the hover ring for a candidate, and how big. */
function ringFor(target: ActionTarget): { x: number; y: number; radius: number } {
  const pad = 0.3;
  switch (target.kind) {
    case 'person':
      return { x: target.x, y: target.y,
        radius: hitRadiusOf({ kind: 'person', person: target.person! }) + pad };
    case 'node':
      return { x: target.x, y: target.y,
        radius: hitRadiusOf({ kind: 'node', node: target.node! }) + pad };
    case 'tree':
      return { x: target.x, y: target.y,
        radius: hitRadiusOf({ kind: 'tree', tree: target.tree! }) + pad };
    case 'animal':
      return { x: target.x, y: target.y,
        radius: hitRadiusOf({ kind: 'animal', animal: target.animal! }) + pad };
    case 'pile':
      return { x: target.x, y: target.y, radius: 0.6 };
    case 'building':
      return { x: target.x, y: target.y,
        radius: Math.max(target.building!.def.width, target.building!.def.height) * 0.7 };
    case 'ground':
      return { x: target.x, y: target.y, radius: 0.5 };
  }
}

/** Makes a clicked candidate the current selection. */
function selectTarget(target: ActionTarget): void {
  selected =
    target.kind === 'person' && target.person ? { kind: 'person', person: target.person } :
    target.kind === 'node' && target.node ? { kind: 'node', node: target.node } :
    target.kind === 'tree' && target.tree ? { kind: 'tree', tree: target.tree } :
    target.kind === 'pile' && target.pile ? { kind: 'pile', pile: target.pile } :
    target.kind === 'animal' && target.animal ? { kind: 'animal', animal: target.animal } :
    target.kind === 'building' && target.building
      ? { kind: 'building', building: target.building }
      : (sim.player ? { kind: 'person', person: sim.player } : null);
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
  if (newGame.isOpen) return;
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

    const options = candidatesAt(point.x, point.y, true);
    const real = realCandidates(options);

    // Same rule as the left click: one target goes straight to the menu, a
    // stack asks which of them the order is aimed at first.
    if (real.length < 2) {
      openRadial(actor, options[0]!, event.clientX, event.clientY);
      return;
    }
    picker.show(
      event.clientX, event.clientY,
      pickerEntries(actor, [...real, options[options.length - 1]!]),
      target => openRadial(actor, target, event.clientX, event.clientY),
      target => { renderer.hoverRing = target ? ringFor(target) : null; }
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
  if (buildMode || radial.isOpen || picker.isOpen || techWeb.isOpen) return;
  if (event.target !== canvas) return;

  const point = worldPoint(event);
  const options = candidatesAt(point.x, point.y, false);
  const real = realCandidates(options);
  const observer = sim.player;

  // One thing under the cursor (or none): behave exactly as before. Two or
  // more, and the player is asked which — the old behaviour cycled blindly
  // through the stack on repeated clicks, which is a guessing game.
  if (real.length < 2 || !observer) {
    selectTarget(options[0]!);
    return;
  }

  picker.show(
    event.clientX, event.clientY,
    pickerEntries(observer, [...real, options[options.length - 1]!]),
    target => selectTarget(target),
    target => { renderer.hoverRing = target ? ringFor(target) : null; }
  );
});

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

/**
 * Opens the action menu for one target.
 *
 * Split out of the mousedown handler because the entity picker now sits in
 * front of it: with a stack under the cursor the menu opens only once the
 * player has said which of the stack they meant.
 */
function openRadial(actor: Person, target: ActionTarget, screenX: number, screenY: number): void {
  const nearWater = isNearWater(target.x, target.y);
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
    target.kind === 'animal' ? target.animal!.label :
    target.kind === 'pile' ? 'Dropped goods' :
    'Ground';

  radial.show(
    screenX, screenY,
    commanding && commanding.alive ? title + ' — ordering ' + commanding.name : title,
    options,
    option => issue(actor, option.id, target)
  );
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
    animalId: target.animal?.id,
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
    animalId: target.animal?.id,
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

/**
 * Says why an order stopped.
 *
 * The simulation queues these; the decision about *whose* are worth reporting
 * belongs here, because "worth reporting" means "the player asked for it" and
 * the simulation has no idea who the player is commanding. A chief ordering his
 * band about all day is not news.
 */
function reportInterruptions(): void {
  const notices = sim.interruptions.splice(0, sim.interruptions.length);
  for (const notice of notices) {
    const person = sim.peopleById.get(notice.personId);
    if (!person) continue;
    const mine = person.isPlayer || person.id === commanding?.id;
    if (!mine) continue;

    const text = actionLabel(notice.action) + ' stopped — ' + stopReasonLabel(notice.reason);
    renderer.floaters.push(person.x, person.y, text,
      { color: '#e0b055', boxed: true, ttl: 3.4 });
    hud.noteStop(person.id, stopReasonLabel(notice.reason));
  }
}

/**
 * Says that somebody worked something out.
 *
 * Gated on line of sight from the player's own character, exactly the way
 * witnessed deeds are. Announcing every idea on the island would hand the
 * player the omniscience the whole design is built to withhold — and knowing
 * that a stranger three valleys away has invented pottery is precisely the kind
 * of thing this game should never tell you.
 */
function reportInsights(): void {
  const notices = sim.insights.splice(0, sim.insights.length);
  const observer = sim.player;
  for (const notice of notices) {
    const person = sim.peopleById.get(notice.personId);
    if (!person) continue;
    const mine = person.isPlayer || person.id === commanding?.id;
    if (!mine) {
      if (!observer || !observer.alive) continue;
      const dx = person.x - observer.x;
      const dy = person.y - observer.y;
      if (Math.sqrt(dx * dx + dy * dy) > sim.config.sightRadius) continue;
    }
    const color = notice.kind === 'setback' ? '#e0705c'
      : notice.kind === 'gain' ? '#c88ad8' : '#8ab4d8';
    renderer.floaters.push(person.x, person.y, notice.text,
      { color, boxed: person.isPlayer, ttl: 3.4 });
  }
}

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
      // Walking by hand abandons the errand entirely, set-aside job included:
      // the player has taken the controls and is not coming back to it.
      if (intent && sim.player) sim.player.forgetPlans();
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
  techWeb.update(sim);
  reportInterruptions();
  reportInsights();
  updateFloaters();
  renderer.floaters.update(delta);
  renderer.render(
    selected === null ? null :
    selected.kind === 'person' ? { personId: selected.person.id } :
    selected.kind === 'node' ? { nodeId: selected.node.id } :
    selected.kind === 'tree' ? { treeId: selected.tree.id } :
    selected.kind === 'pile' ? { pileId: selected.pile.id } :
    selected.kind === 'animal' ? { animalId: selected.animal.id } :
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
