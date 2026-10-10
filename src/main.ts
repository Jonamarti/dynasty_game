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
import { WorldState } from './sim/world/WorldState.ts';
import { deserializeSave, serializeSave, SaveError, type SaveSummary } from './sim/persistence/SaveFile.ts';
import { SaveStore, describeSaveFailure } from './ui/SaveStore.ts';
import { earthWorldGeography, randomWorldGeography, type EarthWorldGeography } from './sim/world/WorldGeography.ts';
import { loadWorldAtlas, type LoadedWorldMap } from './sim/world/WorldAtlas.ts';
import { findNearestStart, findStartInRegion, findWateredGlobeStart, localWorldConfig, type StartPlace } from './sim/world/StartPlace.ts';
import { WorldPicker } from './ui/WorldPicker.ts';
import { GAME_VERSION_LABEL } from './ui/GameVersion.ts';
import { Camera } from './render/Camera.ts';
import { Renderer, hitRadiusOf, nodeIsHidden, GRAB_MARGIN, PICK_RANGE, type HitTarget } from './render/Renderer.ts';
import { ArtAtlas } from './render/ArtAtlas.ts';
import { actionLabel, stopReasonLabel } from './render/Floaters.ts';
import { Hud, corpseTitle, nodeName, type Selection } from './ui/Hud.ts';
import { RadialMenu } from './ui/RadialMenu.ts';
import { EntityPicker, type PickerEntry } from './ui/EntityPicker.ts';
import { QuantityPicker } from './ui/QuantityPicker.ts';
import { TransferPanel } from './ui/TransferPanel.ts';
import { VerdictOverlay } from './ui/VerdictOverlay.ts';
import { NewGame } from './ui/NewGame.ts';
import { SuccessionOverlay } from './ui/Succession.ts';
import { TechWebOverlay } from './ui/TechWeb.ts';
import { WorldMapOverlay } from './ui/WorldMapView.ts';
import { FamilyTreeOverlay } from './ui/FamilyTree.ts';
import { RivalHouseOverlay } from './ui/RivalHouseView.ts';
import './ui/RivalHouseView.css';
import { TribeGraphOverlay } from './ui/TribeGraph.ts';
import { PauseMenu } from './ui/PauseMenu.ts';
import { SettingsOverlay } from './ui/Settings.ts';
import {
  configFrom, defaultSettings, loadAutonomy, loadFogOfWar, loadLanguage, loadSettings, saveAutonomy, saveFogOfWar, saveSettings,
} from './ui/SettingsStore.ts';
import { AUTONOMY_LABELS, nextAutonomy, type Autonomy } from './sim/ai/Autonomy.ts';
import { t, setLanguage, language, onLanguageChange } from './i18n/i18n.ts';
import { TUNABLES, readPath, valuesFor } from './sim/core/Difficulty.ts';
import {
  availableActions, type ActionOption, type ActionTarget,
} from './sim/ai/ActionCatalog.ts';
import { TECH, techPower, type Tech } from './sim/knowledge/Tech.ts';
import type { Person } from './sim/entities/Person.ts';
import { BUILDINGS, type Building, type BuildingDef } from './sim/entities/Building.ts';
import { earthworkTiles } from './sim/entities/Earthwork.ts';
import { ITEMS } from './sim/entities/Item.ts';
import { JOBS } from './sim/entities/Job.ts';
import { EARSHOT } from './sim/systems/ActionSystem.ts';
import { stageOf } from './sim/entities/Corpse.ts';
import type { ItemPile } from './sim/entities/ItemPile.ts';
import { describeEvent } from './sim/social/Events.ts';
import {
  canSeePlace, knowledgeOfPerson, knowledgeOfNode, knowledgeOfTree, knowledgeOfBuilding, explainPropertyUse,
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

// The language, before anything is built. The simulation writes some of its
// own sentences as they happen — the first line of every founder's life is
// written in the constructor below — so it has to be set before the world is.
// `?lang=` overrides the stored choice, the way `?seed=` does, so a bug report
// or a browser test can name the language it was seen in.
setLanguage(params.get('lang') === 'es' || params.get('lang') === 'en'
  ? params.get('lang') as 'es' | 'en'
  : loadLanguage());
document.documentElement.lang = language();
onLanguageChange(next => { document.documentElement.lang = next; });

const seedParam = params.get('seed');
const seed: string | number = seedParam ?? Math.floor(Math.random() * 1e9);

/**
 * The player's difficulty and any field they moved by hand, from last time.
 *
 * `?defaults=1` ignores them, so a seed pasted into a bug report reproduces the
 * reporter's world rather than the reader's difficulty preference — the stored
 * settings otherwise take part in world generation, and a seed alone stops
 * being enough to name a world.
 */
let settings = params.get('defaults') === '1' ? defaultSettings() : loadSettings();
// Seed last: whatever else the settings say, the URL owns the seed.
//
// A `let`, because the settings screen the game now opens on can change the
// size of the map or the amount of food on it, and those are spent when the
// world is generated. See `rebuildBeforeStart`.
// A browser profiling fixture must exercise the real frame loop and HUD. The
// settings UI caps founders at 240; this dev-only override leaves saved player
// settings alone and deliberately requires skipIntro to avoid world rebuilding.
const profileHumans = import.meta.env.DEV && params.get('skipIntro') === '1'
  ? Number(params.get('profileHumans')) : 0;
const profilePopulation = Number.isInteger(profileHumans) && profileHumans >= 2 && profileHumans <= 1000
  ? { population: { bands: 1, peoplePerBand: profileHumans } } : {};
/**
 * Three kinds of world, and the classic island is the default for every spec:
 *
 * - **the Earth**, chosen on the map the game opens on (`WorldPicker`): `earthChoice` holds the map and the window the player
 *   picked, and every rebuild before the first step (`rebuildBeforeStart`) builds that same place again;
 * - **a generated globe**, `?world=random`: a seeded map, begun at a place that is *measured* to have fresh water to drink
 *   (`findWateredGlobeStart`; the first version picked temperate country by its flags and four worlds in a row had no water);
 * - **the classic island**, which sits on no map, so there is no globe to show.
 *
 * Since 33a every world with a map also has peoples in every other region.
 */
// One map is one comarca (owner, 2026-10-08): every cell of the world map is a playable map, like the classic island and like
// RimWorld's world tiles. It was 4, provisionally (sixteen comarcas squeezed into 128 by 128 tiles under the quotas of one).
const GLOBE_SPAN = 1;
let earthChoice: { geography: EarthWorldGeography; start: { x: number; y: number } } | null = null;
function makeWorldState(overrides: Record<string, unknown>): WorldState {
  const config = { ...configFrom(settings), ...overrides, seed };
  if (earthChoice) {
    return new WorldState(config, { geography: earthChoice.geography, start: earthChoice.start, comarcasWide: GLOBE_SPAN, comarcasHigh: GLOBE_SPAN });
  }
  if (params.get('world') !== 'random') return new WorldState(config);
  const geography = randomWorldGeography(seed);
  const start = findWateredGlobeStart(geography, GLOBE_SPAN, localWorldConfig((config as { world?: object }).world), seed);
  if (!start) return new WorldState(config);
  return new WorldState(config, { geography, start: { x: start.x, y: start.y }, comarcasWide: GLOBE_SPAN, comarcasHigh: GLOBE_SPAN });
}

/**
 * `?load=<slot>` opens a saved game (M15 phase 33c) instead of making a world: the pause menu's Load and Import both end in a
 * reload with this parameter, for the reason `onNewWorld` reloads — `sim` is captured by the renderer, by `NewGame` and by two
 * dozen closures, so a world is never swapped under a running game. A save that cannot be read says why on screen (below) and the
 * game opens on a new world, never on half of the old one.
 */
const SAVE_SLOT = 'manual';
const IMPORT_SLOT = 'imported';
let loadedWorld: WorldState | null = null;
let bootLoadFailure: string | null = null;
const loadSlot = params.get('load');
if (loadSlot) {
  try {
    const store = await SaveStore.open();
    const text = await store.get(loadSlot).finally(() => store.close());
    if (text === null) throw new SaveError('not_a_save');
    loadedWorld = deserializeSave(text);
  } catch (error) {
    bootLoadFailure = describeSaveFailure(error);
  }
  // A reload of this page must not load it again over whatever the player has done since.
  const clean = new URLSearchParams(location.search);
  clean.delete('load');
  history.replaceState(null, '', location.pathname + (clean.size ? '?' + clean : '') + location.hash);
}

let worldState = loadedWorld ?? makeWorldState(profilePopulation);
let sim = worldState.current;

/**
 * `?skipIntro=1` goes straight into the first living body.
 *
 * The Playwright specs and every screenshot in the tour were written against a
 * game that starts immediately, and a character-creation screen that they all
 * have to be taught to dismiss is a screen that will silently break them.
 */
const skipIntro = params.get('skipIntro') === '1' || loadedWorld !== null;
// A loaded world already has its player (or its succession pending); possessing the first living body would undo that.
let player = loadedWorld ? sim.player : sim.possessFirst();

const camera = new Camera();
if (player) camera.snapTo(player.x, player.y);

const renderer = new Renderer(canvas, sim, camera);
// The committed art (public/art, made by `npm run art:build`). If the sheets
// cannot be fetched the renderer falls back to the procedural figures it always
// had, so a missing file never blanks the game.
renderer.setArt(await ArtAtlas.load('art/').catch(() => null));
renderer.fogEnabled = loadFogOfWar();
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

function toggleFogOfWar(): void {
  renderer.fogEnabled = !renderer.fogEnabled;
  saveFogOfWar(renderer.fogEnabled);
}

let selected: Selection | null = player ? { kind: 'person', person: player } : null;
let paused = false;
// The default lives in `Config.time.tickRate`, and the HUD slider reads the
// same number: three hardcoded 20s is how the slider and the loop came to
// disagree about what speed the game opens at.
let stepsPerSecond = sim.config.time.tickRate;
// Also from the config, for the same reason. It was declared there, never read,
// and written out as an 8 here — the very duplication the comment above says
// was fixed for `tickRate`.
const maxStepsPerFrame = sim.config.time.maxTicksPerFrame;

/**
 * Whether the settings now on the form describe a different island.
 *
 * Only the `restart` tunables are asked about: everything else is read live out
 * of `sim.config` and has already taken effect by the time this is called.
 */
function worldWouldDiffer(): boolean {
  const values = { ...valuesFor(settings.preset), ...settings.overrides };
  return TUNABLES.some(tunable => tunable.restart && values[tunable.path] !== readPath(sim.config, tunable.path));
}

/**
 * Throws the boot world away and builds the one the player actually asked for.
 *
 * **Only ever called before the first step**, from the start screen, and the
 * distinction matters. At that moment the only things holding the old world are
 * the renderer's `sim` field and its pre-rendered terrain, `NewGame`'s `sim`
 * field, and the three module variables reset below — everything else in this
 * file reaches the simulation through a function that reads `sim` when it is
 * called. A few minutes into a game that is no longer true: `lastActions`,
 * `lastEventId`, `commanding`, `selected`, the floaters and half the HUD are
 * all holding ids from the world being discarded, and the in-game "New world"
 * button therefore saves and reloads the page instead of coming through here.
 * One mechanism each, for two situations that are genuinely different.
 */
function rebuildBeforeStart(): void {
  // A new motor defaults to manual. Preserve the mode already shown by the
  // HUD, or selecting the Earth silently disables a saved autonomous player.
  const autonomy = sim.autonomy;
  worldState = makeWorldState({});
  sim = worldState.current;
  sim.autonomy = autonomy;
  player = sim.possessFirst();
  renderer.setSim(sim);
  newGame.setSim(sim);
  selected = player ? { kind: 'person', person: player } : null;
  if (player) camera.snapTo(player.x, player.y);
  stepsPerSecond = sim.config.time.tickRate;
  hud.setSpeed(stepsPerSecond);
  // The unlock dots watch these two for growth, and -1 means "nothing to
  // compare against yet" — without the reset, a smaller world reads as a
  // technology being lost and a larger one as one being gained.
  lastDesignCount = -1;
  lastRecipeCount = -1;
  hud.renderBuildBar(sim, false);
  hud.renderCraftBar(sim, sim.player, false);
}

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
let craftMode = false;
let activeDesign: BuildingDef | null = null;
/** R has turned the active design to run north-south (M15 phase 26c). */
let buildTurned = false;

// Build identity, pinned on the body (not inside the world picker's own root,
// which is `[hidden]` outside the main menu) so it reads from the main menu
// through every in-game screen without being erased when an overlay hides.
const versionLabel = document.createElement('div');
versionLabel.className = 'game-version';
versionLabel.textContent = GAME_VERSION_LABEL;
document.body.appendChild(versionLabel);

// Attached to the body, not to #hud: the HUD rebuilds its own subtree, and a
// menu living inside it was silently erased the moment the HUD re-rendered.
const radial = new RadialMenu(document.body);

// The chooser for a stack of things under one click. On the body for the same
// reason the radial menu is.
const picker = new EntityPicker<ActionTarget>(document.body);

// The same chooser, reused for M9 phase 2's two other lists of bubbles: who to
// give something to when more than one person is within reach, and which item
// to take from a store that holds more than one kind of thing. A second
// instance rather than a shared one because both a person-picker and an
// item-picker can conceivably be wanted from the same click in future, and a
// shared instance could only ever show one.
const itemPicker = new EntityPicker<string>(document.body, 'itempicker');

// A slider popup for how much of a stack to give, store or take. M9 phase 2's
// answer to note 9: none of the three ever offered less than the whole stack.
const quantityPicker = new QuantityPicker(document.body);
const transferPanel = new TransferPanel(document.body);
const verdictOverlay = new VerdictOverlay(document.body);

// The map of somebody's mind. On `document.body` rather than `#hud`, like every
// other overlay here: the HUD rebuilds its subtree every frame and would throw
// this away mid-hover.
const techWeb = new TechWebOverlay(document.body);

// The other two full-screen graphs, on the body for the same reason. Only one
// of the three is ever open: `openGraph` below is the single door into all of
// them, so opening a second cannot leave two stacked on screen at once.
const familyTree = new FamilyTreeOverlay(document.body);
const tribeGraph = new TribeGraphOverlay(document.body);
const rivalHouses = new RivalHouseOverlay(document.body);
const rivalButton = document.createElement('button');
rivalButton.type = 'button';
rivalButton.className = 'rivalhouses-trigger';
rivalButton.dataset.rivalHouses = '';
rivalButton.textContent = t('Rival households');
rivalButton.addEventListener('click', () => openGraph('rivals', sim.player));
document.body.appendChild(rivalButton);
function rivalContext() { return { observer: sim.player!, householdsById: worldState.worldHouseholds(), peopleById: worldState.worldPeople(), relationships: sim.relationships }; }
let rivalRefreshedAt = 0;

// The globe: the fourth full-screen overlay, behind the same single door.
const worldMap = new WorldMapOverlay(document.body, (action, edge) => {
  const actor = sim.player;
  if (!actor) return;
  if (!sim.order(actor, action, { edge, ...(action === 'propose' ? { recipeId: 'migration' } : {}) })) {
    renderer.floaters.push(actor.x, actor.y, sim.lastRefusal ?? t('There is no way across'), { color: '#ff8c82', boxed: true });
  }
}, destination => {
  const actor = sim.player;
  if (!actor) return;
  const refusal = worldState.startJourney(destination);
  if (refusal) renderer.floaters.push(actor.x, actor.y, refusal, { color: '#ff8c82', boxed: true });
  else syncActiveSimulation();
}, destination => {
  const refusal=worldState.dispatchCaravanForPlayer(destination);
  if(!refusal) syncActiveSimulation(true);
  return refusal;
});

// Journey progress stays visible while the travelling player has left the active comarca.
const journeyStatus = document.createElement('aside');
journeyStatus.className = 'journey-status';
journeyStatus.hidden = true;
journeyStatus.setAttribute('aria-live', 'polite');
document.body.appendChild(journeyStatus);

/**
 * Whether anything was on screen at the instant Escape was pressed.
 *
 * The three graphs, the radial menu and the picker each register their own
 * bubble-phase Escape listener when they are constructed — above this line — so
 * by the time the main handler below runs they have *already closed
 * themselves*, and it reads "nothing was open". Without this snapshot,
 * dismissing the tech web would pop the pause menu on top of it every single
 * time. A capture-phase listener runs before every one of them.
 */
let escapeFoundSomething = false;
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  escapeFoundSomething = radial.isOpen || picker.isOpen || itemPicker.isOpen ||
    quantityPicker.isOpen || transferPanel.isOpen || verdictOverlay.isOpen || graphOpen();
}, true);

/** True while any of the three full-screen graphs is open. */
function graphOpen(): boolean {
  return techWeb.isOpen || familyTree.isOpen || tribeGraph.isOpen || worldMap.isOpen || rivalHouses.isOpen;
}

/**
 * Opens one graph, closing whichever of the other two was open.
 *
 * All three occupy the same fixed, centred overlay, and each one's own
 * `toggle` only knows how to close *itself* — opening the tribe graph while
 * the tech web was already up would otherwise leave both in the DOM, one
 * painted over the other.
 */
function openGraph(which: 'tech' | 'family' | 'tribe' | 'globe' | 'rivals', subject: Person | null): void {
  if (which !== 'rivals' && rivalHouses.isOpen) rivalHouses.close();
  if (which !== 'globe' && worldMap.isOpen) worldMap.close();
  if (which !== 'tech' && techWeb.isOpen) techWeb.close();
  if (which !== 'family' && familyTree.isOpen) familyTree.close();
  if (which !== 'tribe' && tribeGraph.isOpen) tribeGraph.close();
  if (which === 'tech') techWeb.toggle(sim, subject);
  if (which === 'family') familyTree.toggle(sim, subject);
  if (which === 'tribe') tribeGraph.toggle(sim, subject);
  // The globe is the player's own character's knowledge, whoever is selected.
  if (which === 'globe') worldMap.toggle(sim, worldState.geography);
  if (which === 'rivals' && sim.player) { if (rivalHouses.isOpen) rivalHouses.close(); else rivalHouses.open(rivalContext()); }
}

// On the body for the same reason as the radial menu: the HUD rebuilds its own
// subtree and would erase anything living inside it.
const succession = new SuccessionOverlay(document.body, heir => {
  if (!heir) return;
  selected = { kind: 'person', person: heir };
  camera.recentre(heir.x, heir.y);
  renderer.floaters.push(heir.x, heir.y, t('you are now {name}', { name: heir.name }), {
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
  onPickDesign: def => {
    activeDesign = def;
    buildTurned = false;
    // The owner's note of 2026-09-24: picking a design showed no ghost at all
    // until the pointer next moved over the map — and on a touch screen,
    // where nothing hovers, never. Put it down at once where the pointer last
    // was, or in the middle of the view if it has not been over the map.
    const at = lastMapPointer ?? {
      x: camera.screenToWorldX(camera.viewWidth / 2),
      y: camera.screenToWorldY(camera.viewHeight / 2),
    };
    showBuildGhost(at.x, at.y);
  },
  onCraft: recipeId => {
    // Down the same path the radial menu's "Make a ..." already uses, so an
    // order to craft reaches the simulation one way rather than two.
    if (sim.player) sim.order(sim.player, 'craft', { recipeId });
    setCraftMode(false);
  },
  onItemAction: (person, itemId, verb, screenX, screenY) =>
    handleItemAction(person, itemId, verb, screenX, screenY),
  onTransfer: building => {
    const actor = sim.player;
    if (!actor) return;
    const near = building.contains(actor.x, actor.y, 2);
    if (!near) {
      renderer.floaters.push(actor.x, actor.y, t('Come closer to inspect the store'), {
        color: '#e0705c', boxed: true, ttl: 3.2,
      });
      return;
    }
    transferPanel.show(sim, actor, building);
  },
  onCancelConstruction: building => {
    const actor = sim.player;
    if (!actor) return;
    const ok = sim.cancelConstruction(actor, building);
    const reason = sim.lastRefusal;
    sim.lastRefusal = null;
    renderer.floaters.push(actor.x, actor.y,
      ok ? t('construction cancelled; materials are on the ground')
        : (reason ?? t('cannot do that')),
      { color: ok ? '#ffd35c' : '#e66464', boxed: true, ttl: 3.6 });
    if (ok && selected?.kind === 'building' && selected.building.id === building.id) {
      selected = null;
    }
  },
  onAssignJob: (person, job) => {
    // Down the same path a chief's own order would use, so a job handed out
    // from the panel is subject to the same compliance roll as one given in
    // the field.
    if (!sim.player) return;
    const ok = sim.assignJob(sim.player, person, job);
    const why = sim.lastRefusal;
    sim.lastRefusal = null;
    // Both outcomes reach the player. Until M9.5 phase 4c this call threw its
    // answer away, so a refused job assignment — and, from 4c, one refused
    // because nobody has yet had the idea of assigning work at all — was a
    // button that did nothing. That is precisely the silent no-op the standing
    // rule in `AGENTS.md` exists to forbid.
    renderer.floaters.push(person.x, person.y,
      ok
        ? (job === null
          ? t('{name} is released from their work', { name: person.name })
          : t('{name} takes up work as a {job}', { name: person.name, job: t(JOBS[job].label).toLowerCase() }))
        : (why
          ? t('{name} does not: {why}', { name: person.name, why })
          : t('{name} does not', { name: person.name })),
      { color: ok ? '#7ddc96' : '#e0705c', boxed: true, ttl: 3.4 });
  },
  onSetTaxRate: rate => {
    // M15 phase 38b. Refused out loud, like every order: `setTaxRate` writes
    // the reason, and it reaches the player as a floater over their head.
    if (!sim.player) return;
    const ok = sim.setTaxRate(sim.player, rate);
    const why = sim.lastRefusal;
    sim.lastRefusal = null;
    renderer.floaters.push(sim.player.x, sim.player.y,
      ok
        ? (rate === 0 ? t('No levy is owed to the temple') : t('The levy is now {share}', { share: Math.round(rate * 100) + '%' }))
        : (why ?? t('The levy stays as it was')),
      { color: ok ? '#7ddc96' : '#e0705c', boxed: true, ttl: 3.4 });
  },
  onDeclare: (bandId, kind) => {
    // M15 phase 39a. Refused out loud, like the levy.
    if (!sim.player) return;
    const ok = sim.declare(sim.player, bandId, kind);
    const why = sim.lastRefusal;
    sim.lastRefusal = null;
    const name = sim.bands.find(b => b.id === bandId)?.name ?? '';
    renderer.floaters.push(sim.player.x, sim.player.y,
      ok
        ? (kind === 'war' ? t('War with the {band}', { band: name }) : t('Peace with the {band}', { band: name }))
        : (why ?? t('Nothing is declared')),
      { color: ok ? (kind === 'war' ? '#e0705c' : '#7ddc96') : '#e0705c', boxed: true, ttl: 3.4 });
  },
  onSubmit: bandId => {
    // M15 phase 39d.
    if (!sim.player) return;
    const ok = sim.submit(sim.player, bandId);
    const why = sim.lastRefusal;
    sim.lastRefusal = null;
    const name = sim.bands.find(b => b.id === bandId)?.name ?? '';
    renderer.floaters.push(sim.player.x, sim.player.y,
      ok ? t('Your people will pay the {band} tribute', { band: name }) : (why ?? t('Nothing is declared')),
      { color: ok ? '#e0b055' : '#e0705c', boxed: true, ttl: 3.4 });
  },
  onOpenMenu: () => { if (!menuOpen()) openMenu(); },
  onToggleBuild: () => setBuildMode(!buildMode),
  onToggleCraft: () => setCraftMode(!craftMode),
  onRecentre: () => { if (sim.player) camera.recentre(sim.player.x, sim.player.y); },
  onOpenTech: () => openGraph(
    'tech', selected?.kind === 'person' ? selected.person : sim.player),
  onOpenFamily: () => openGraph(
    'family', selected?.kind === 'person' ? selected.person : sim.player),
  onOpenTribe: () => openGraph(
    'tribe', selected?.kind === 'person' ? selected.person : sim.player),
  onOpenGlobe: () => openGraph('globe', sim.player),
  onCommand: person => {
    commanding = commanding?.id === person?.id ? null : person;
    if (commanding) {
      renderer.floaters.push(commanding.x, commanding.y,
        t('commanding {name}', { name: commanding.name }), { color: '#7fd4ff', boxed: true });
    }
  },
  onAutonomy: mode => setAutonomy(mode),
}, sim.config.time.tickRate);
hud.renderBuildBar(sim, false);
hud.renderCraftBar(sim, sim.player, false);

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
}, {
  // M11 phase 12c: how many tribes and how many in each, asked where the
  // tribe is chosen. Recorded exactly as the settings screen's own `edit`
  // records a field — a value equal to the difficulty's is no override — and
  // spent through the same pre-start rebuild its Begin button uses.
  change: (path, value) => {
    if (value === valuesFor(settings.preset)[path]) delete settings.overrides[path];
    else settings.overrides[path] = value;
    saveSettings(settings);
    if (worldWouldDiffer()) rebuildBeforeStart();
  },
  anchorOf: path => valuesFor(settings.preset)[path] ?? 0,
});

/**
 * The pause menu and the tuning screen, on the body like every overlay here.
 *
 * Neither listens for Escape itself. The key means three different things
 * depending on how deep the player is, so the whole precedence chain lives in
 * one place — the `keydown` handler below — rather than being split between
 * three objects that each know only about themselves.
 */
const pauseMenu = new PauseMenu(document.body, {
  onResume: () => closeMenu(),
  fogEnabled: () => renderer.fogEnabled,
  onToggleFog: () => toggleFogOfWar(),
  onSave: () => { void saveGame(); },
  onLoad: () => reloadInto(SAVE_SLOT),
  onExport: () => exportGame(),
  onImport: text => { void importGame(text); },
  onImportFailed: error => pauseMenu.setSaveNote(describeSaveFailure(error), true),
  onSettings: () => {
    pauseMenu.close();
    settingsScreen.open(sim, settings);
  },
});

/** "Year 3, spring, day 2 · 7/10/2026, 18:03": what a save is, for the line under the buttons. */
function describeSave(summary: SaveSummary): string {
  return summary.label + ' · ' + new Date(summary.savedAt).toLocaleString(language());
}

/** What the Load button would load, from the browser's own store. Never throws: no store simply means nothing to load. */
async function refreshSaveInfo(): Promise<void> {
  try {
    const store = await SaveStore.open();
    const meta = await store.meta(SAVE_SLOT).finally(() => store.close());
    pauseMenu.setLoadable(meta ? describeSave(meta.summary) : null);
  } catch {
    pauseMenu.setLoadable(null);
  }
}

async function saveGame(): Promise<void> {
  try {
    const text = serializeSave(worldState, Date.now());
    const store = await SaveStore.open();
    const summary = await store.put(SAVE_SLOT, text).finally(() => store.close());
    pauseMenu.setLoadable(describeSave(summary));
    pauseMenu.setSaveNote(t('Saved: {what}', { what: describeSave(summary) }));
  } catch (error) {
    pauseMenu.setSaveNote(describeSaveFailure(error), true);
  }
}

/** A file with the whole game in it, for a backup or another machine. */
function exportGame(): void {
  try {
    const text = serializeSave(worldState, Date.now());
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `dynasty-${String(sim.config.seed)}-tick${sim.time.tick}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    pauseMenu.setSaveNote(t('Exported {name}', { name: link.download }));
  } catch (error) {
    pauseMenu.setSaveNote(describeSaveFailure(error), true);
  }
}

/** Read the whole file before touching anything: a bad file must leave this game exactly as it was. */
async function importGame(text: string): Promise<void> {
  try {
    deserializeSave(text);
    const store = await SaveStore.open();
    await store.put(IMPORT_SLOT, text).finally(() => store.close());
    reloadInto(IMPORT_SLOT);
  } catch (error) {
    pauseMenu.setSaveNote(describeSaveFailure(error), true);
  }
}

function reloadInto(slot: string): void {
  const next = new URLSearchParams(location.search);
  next.set('load', slot);
  // The seed in the address is the *new world's*; the loaded world brings its own.
  next.delete('seed');
  location.search = next.toString();
}

const settingsScreen = new SettingsOverlay(document.body, {
  onBegin: () => {
    settings = settingsScreen.current();
    saveSettings(settings);
    // Only when it would actually make a different island. Choosing a
    // difficulty always does; nudging a hunger rate never does.
    if (worldWouldDiffer()) rebuildBeforeStart();
    settingsScreen.close();
    newGame.open();
  },
  onBack: () => {
    settings = settingsScreen.current();
    settingsScreen.close();
    pauseMenu.open(sim);
  },
  onSpeedChange: value => {
    stepsPerSecond = value;
    hud.setSpeed(value);
  },
  onNewWorld: nextSeed => {
    saveSettings(settingsScreen.current());
    const next = new URLSearchParams(location.search);
    next.set('seed', nextSeed);
    next.delete('load');
    // A reload rather than rebuilding the world in place. `sim` is captured by
    // the renderer, by `NewGame` and by two dozen closures in this file;
    // `?seed=` and a reload is how a specific world is replayed (and, since
    // phase 33c, `?load=` how a saved one is opened — the same reload).
    location.search = next.toString();
  },
});

/**
 * The first screen of a new game: the Earth, to choose where to begin, or a random island (the classic start).
 *
 * The world built at boot is the island, as a draft; choosing a place on the Earth replaces it before the first step, through the
 * same `rebuildBeforeStart` the settings screen uses, and then the game goes on to the settings and character creation as always.
 */
let earthMap: EarthWorldGeography | null = null;
let earthAtlas: readonly LoadedWorldMap[] = [];
const worldPicker = new WorldPicker(document.body, {
  onMap: id => {
    const chosen = earthAtlas.find(map => map.entry.id === id);
    if (!chosen) return;
    earthMap = earthWorldGeography(chosen, 10);
    worldPicker.setNote(null);
    worldPicker.setGeography(earthMap);
  },
  onBegin: region => { void beginOnEarth(region); },
  onIsland: () => {
    // The island is the draft already built, unless an earlier choice replaced it.
    if (earthChoice) { earthChoice = null; rebuildBeforeStart(); }
    worldPicker.close();
    settingsScreen.open(sim, settings, 'start');
  },
});

async function openWorldPicker(): Promise<void> {
  worldPicker.open();
  if (earthMap) { worldPicker.setGeography(earthMap); return; }
  worldPicker.setBusy(t('Loading the world…'));
  try {
    const maps = await loadWorldAtlas('world/');
    earthAtlas = maps;
    const entry = maps.find(map => map.entry.recommended) ?? maps[0]!;
    earthMap = earthWorldGeography(entry, 10);
    worldPicker.setMaps(maps.map(map => map.entry), entry.entry.id);
    worldPicker.setBusy(null);
    worldPicker.setGeography(earthMap);
  } catch (error) {
    worldPicker.setBusy(null);
    worldPicker.setNote(t('Could not load the map of the world: {why}', { why: error instanceof Error ? error.message : String(error) }), true);
  }
}

/**
 * Commits to a start found for the Earth map and opens the settings screen, whichever of the three doors in `beginOnEarth`
 * got there: water within the ordinary search radius (the only door before M15 "begin anywhere"), water further out than
 * that (the confirm panel's "Go to the nearest water"), or dry land with no water found at all (the panel's "Begin here
 * anyway"). `warnNoWater` is only true for the last of those — the player chose it knowing the trade, but the game says so
 * again once it actually starts, the same way a long action's refusal is never silent (see `AGENTS.md`'s rule on that).
 */
function settleOnEarth(found: StartPlace, region: { x: number; y: number }, warnNoWater = false): void {
  earthChoice = { geography: earthMap!, start: { x: found.x, y: found.y } };
  rebuildBeforeStart();
  worldPicker.close();
  const moved = Math.max(Math.abs(found.region.x - region.x), Math.abs(found.region.y - region.y));
  if (moved > 0 && player) {
    renderer.floaters.push(player.x, player.y, t('Starting {n} regions from the place you chose, at the nearest fresh water', { n: moved }), { boxed: true });
  }
  if (warnNoWater && player) {
    renderer.floaters.push(player.x, player.y,
      t('There is no river or lake near here — you will need to look further for water.'), { boxed: true, color: '#e66464' });
  }
  settingsScreen.open(sim, settings, 'start');
}

/** How much further than the ordinary search to look before concluding there is truly nothing to offer as "go to the
 * nearest water" — only reached once that ordinary search has already failed. Widening the *ordinary* radius (2) was not
 * an option: every ordinary start on Earth, watered on the first try or moved a region or two, still has to behave exactly
 * as it did before this feature existed. This one only decides whether a button nobody has clicked yet gets to exist. */
const FAR_WATER_RADIUS = 8;

async function beginOnEarth(region: { x: number; y: number }): Promise<void> {
  if (!earthMap) return;
  worldPicker.setBusy(t('Looking for fresh water near there…'));
  worldPicker.setNote(null);
  // Let the label paint before the search holds the thread (it takes a second or so).
  await new Promise(resolve => setTimeout(resolve, 30));
  const config = localWorldConfig((configFrom(settings) as { world?: object }).world);
  const found = findNearestStart(earthMap, region.x, region.y, GLOBE_SPAN, config);
  worldPicker.setBusy(null);
  if (found) { settleOnEarth(found, region); return; }

  // M15 "begin anywhere" (2026-10-07): nothing within the ordinary search radius has fresh water. Before this, that was a
  // hard refusal (`docs/m15_phase33_world.md` phase 33's original design: "a band without a drink dies of thirst in
  // days"). The owner's decision was a choice instead of a wall: the clicked region's own best dry ground, right now, or a
  // further look for water the player can decide is worth the walk. The dry fallback is measured in the region the player
  // actually clicked — `found`, if it existed, might have moved them already; "Begin here anyway" means *here*.
  const dry = findStartInRegion(earthMap, region.x, region.y, GLOBE_SPAN, config, { requireWater: false });
  if (!dry) {
    // Genuinely nothing: no water in reach and not even dry ground close enough to call a start (open ocean with no shore
    // within a window's own half-span — `isCoastalRegion` and `findStartInRegion` already turned away anything that was at
    // least a coast). This is the one case M15 "begin anywhere" leaves as a refusal, same as it always was.
    worldPicker.setNote(t('There is no river or lake within reach of that place. Choose somewhere with water.'), true);
    return;
  }
  const far = findNearestStart(earthMap, region.x, region.y, GLOBE_SPAN, config, FAR_WATER_RADIUS);
  worldPicker.confirmNoWater(
    () => settleOnEarth(dry, region, true),
    far ? { regions: Math.max(Math.abs(far.region.x - region.x), Math.abs(far.region.y - region.y)), onGo: () => settleOnEarth(far, region) } : null,
  );
}

/** True while the player has deliberately stopped the game to look at a screen. */
function menuOpen(): boolean {
  return pauseMenu.isOpen || settingsScreen.isOpen;
}

/** Whether the game was already paused when the menu went up. */
let menuWasPaused = false;

function openMenu(): void {
  menuWasPaused = paused;
  paused = true;
  hud.setPaused(true);
  // `readIntent` walks from `held`, not from the keyboard, so a key still down
  // when the menu opened would keep walking the player the moment it closed.
  held.clear();
  pauseMenu.open(sim);
  void refreshSaveInfo();
}

function closeMenu(): void {
  pauseMenu.close();
  settingsScreen.close();
  // Back to whatever the player had, not to running: `NewGame`'s callback
  // un-pauses unconditionally, which is right for character creation and wrong
  // for a menu somebody opened while already paused.
  paused = menuWasPaused;
  hud.setPaused(paused);
}

/**
 * The game opens on its settings, then on character creation.
 *
 * In that order because the settings decide what island there is to be born on
 * — how much food is on it, how many tribes — and being asked to pick a life
 * out of a world that is about to be replaced is the wrong way round. The world
 * built at boot is a draft: `Begin` keeps it if nothing that shapes it moved,
 * and builds it again if something did.
 *
 * `?skipIntro=1` bypasses both, as it always has. Forty-two browser specs and
 * every screenshot in the tour were written against a game that starts
 * immediately, and a second screen they all have to be taught to dismiss is a
 * second screen that will silently break them.
 */
if (loadedWorld || bootLoadFailure) {
  // Opening on the saved moment, paused, so the first thing that happens is the player's choice and not the world's.
  paused = true;
  hud.setPaused(true);
  const at = player ?? { x: sim.world.width / 2, y: sim.world.height / 2 };
  if (loadedWorld) {
    renderer.floaters.push(at.x, at.y, t('Game loaded: {what}', { what: sim.time.label() }), { color: '#7ddc96', boxed: true });
  } else {
    renderer.floaters.push(at.x, at.y, bootLoadFailure!, { color: '#e66464', boxed: true });
  }
}
if (!skipIntro && sim.livingPeople().length > 0) {
  paused = true;
  hud.setPaused(true);
  // The Earth first; `?world=random` is the developer door into a generated globe and goes straight to the settings.
  if (params.get('world') === 'random') settingsScreen.open(sim, settings, 'start');
  else void openWorldPicker();
}

/**
 * A verb chosen against one stack in the pack.
 *
 * Everything here goes through the simulation rather than touching inventories
 * directly, so the UI stays a reader of the world and the same moves remain
 * available to NPCs later.
 */
function handleItemAction(
  person: Person, itemId: string, verb: string, screenX: number, screenY: number
): void {
  const say = (text: string, good: boolean) =>
    renderer.floaters.push(person.x, person.y, text,
      { color: good ? '#7ddc96' : '#e66464', boxed: true });
  const label = t(ITEMS[itemId]?.label ?? itemId);
  // What the floaters call the item. English has always printed the id here,
  // which for every item but raw meat is the label in lower case; a
  // translation has no id to fall back on, so it takes the label.
  const named = language() === 'en' ? itemId : label.toLowerCase();

  switch (verb) {
    case 'eat_item': {
      const eaten = sim.eatItem(person, itemId);
      say(eaten ? t('ate {item}', { item: named }) : t('cannot eat that'), eaten);
      break;
    }
    case 'drop_item': {
      quantityPicker.show(screenX, screenY, t('Drop {item}', { item: label.toLowerCase() }),
        person.inventory.count(itemId), count => {
          const dropped = sim.drop(person, itemId, count);
          say(dropped ? t('dropped {item}', { item: named }) : t('nothing to drop'), dropped !== null);
        });
      break;
    }
    case 'equip_left':
    case 'equip_right':
    case 'equip_back': {
      const ordered = sim.order(person, verb, { itemId });
      const reason = ordered ? null : sim.lastRefusal;
      if (!ordered) sim.lastRefusal = null;
      say(ordered ? t('changing equipment') : reason ?? t('could not equip that item'), ordered);
      break;
    }
    case 'give_item': {
      // Every living neighbour within reach, not just the nearest one — the
      // `findNearest` this replaced is exactly the bug M9's note 1 diagnosed
      // for the world picker, and giving had the same one.
      const recipients = sim.peopleHash.queryRadius(person.x, person.y, 2.2)
        .filter(p => p.alive && p.id !== person.id);
      if (recipients.length === 0) {
        say(t('nobody within reach to give it to'), false);
        break;
      }

      const giveTo = (other: Person) => {
        quantityPicker.show(screenX, screenY, t('Give {item}', { item: label.toLowerCase() }),
          person.inventory.count(itemId), count => {
            const given = sim.handOver(person, other, itemId, count);
            // A refusal says why — `handOver` sets `lastRefusal` when the
            // recipient's hands are full, and this branch used to say "nobody
            // to give it to" even when somebody was right there and simply
            // could not carry any more. That was the `give_item` defect M9's
            // triage found and this closes it.
            const reason = sim.lastRefusal;
            sim.lastRefusal = null;
            say(given > 0
              ? t('gave {n} to {name}', { n: given, name: other.name })
              : (reason ?? t('could not give it')),
              given > 0);
          });
      };

      if (recipients.length === 1) {
        giveTo(recipients[0]!);
        break;
      }
      const entries: PickerEntry<ActionTarget>[] = recipients.map(other => ({
        target: { kind: 'person', x: other.x, y: other.y, person: other },
        icon: '\u{1F464}',
        label: knowledgeOfPerson(person, other, sim.relationships).displayName,
      }));
      picker.show(screenX, screenY, entries,
        target => { if (target.person) giveTo(target.person); },
        target => { renderer.hoverRing = target ? ringFor(target) : null; });
      break;
    }
    case 'store_item': {
      const store = sim.storeWithinReach(person);
      if (!store) {
        say(t('no store within reach'), false);
        break;
      }
      quantityPicker.show(screenX, screenY, t('Store {item}', { item: label.toLowerCase() }),
        person.inventory.count(itemId), count => {
          const stored = sim.storeItem(person, store, itemId, count);
          say(stored > 0 ? t('stored {n}', { n: stored }) : t('no room in the store'), stored > 0);
        });
      break;
    }
  }
}

function possess(person: Person): void {
  if (worldState.frontier.pendingJourney?.playerTravelling) {
    const refusal = t('You cannot take control of someone else during your journey');
    sim.lastRefusal = refusal;
    renderer.floaters.push(person.x, person.y, refusal, { color: '#ff8c82', boxed: true });
    return;
  }
  sim.possess(person);
  selected = { kind: 'person', person };
  renderer.floaters.push(person.x, person.y, t('you are now {name}', { name: person.name }), {
    color: '#ffd35c', boxed: true, ttl: 3,
  });
}

/**
 * Changes how much the player's character looks after itself.
 *
 * One funnel for the button, the key and the boot path, because the simulation
 * holds the authority, the HUD holds the display and `localStorage` holds the
 * preference, and three call sites each remembering all three is how a button
 * ends up disagreeing with the game it is attached to.
 *
 * The floater is not decoration. Switching this on is the player handing part of
 * their character over, and a silent switch means the next thing the character
 * does by itself looks like a bug.
 */
function setAutonomy(mode: Autonomy, announce = true): void {
  sim.autonomy = mode;
  // A stale reason would otherwise sit under the action line saying the
  // character is thirsty and stuck, in a mode where it is no longer trying.
  sim.autonomyStall = null;
  saveAutonomy(mode);
  hud.setAutonomy(mode);
  if (announce && sim.player) {
    renderer.floaters.push(sim.player.x, sim.player.y,
      t(AUTONOMY_LABELS[mode]).toLowerCase(), { color: '#9fd8a0', boxed: true, ttl: 2.4 });
  }
}

// A new language rebuilds the HUD's chrome; the overlays listen for themselves.
// The bars are re-rendered here because only this file knows which is open.
onLanguageChange(() => {
  hud.relabel(paused, stepsPerSecond, sim.autonomy);
  hud.renderBuildBar(sim, buildMode);
  hud.renderCraftBar(sim, sim.player, craftMode);
  hud.setCommanding(commanding);
});

// The stored preference, applied once the HUD exists to show it. Silently: the
// player has not just chosen anything, and a floater on the first frame of every
// session is the kind of noise that trains people to ignore floaters.
setAutonomy(loadAutonomy(), false);

/**
 * The last stall the player was told about, so they are told once and not once
 * a frame.
 *
 * `autonomyStall` is a standing condition rather than an event — see the field
 * on `Simulation` — so the floater fires on the *change*, while the panel line
 * keeps saying it for as long as it is true.
 */
let toldAboutStall: string | null = null;

function reportAutonomyStall(): void {
  const stall = sim.autonomyStall;
  if (stall === toldAboutStall) return;
  toldAboutStall = stall;
  if (stall === null || !sim.player) return;
  renderer.floaters.push(sim.player.x, sim.player.y, stall,
    { color: '#e0b055', boxed: true, ttl: 3.4 });
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const held = new Set<string>();

window.addEventListener('keydown', event => {
  // The two screens the game opens on take no keys at all. There is no game
  // behind them yet to pause, walk around or escape back into.
  if (newGame.isOpen || worldPicker.isOpen || settingsScreen.isStartScreen) return;
  const key = event.key.toLowerCase();
  // While a menu is up, Escape is the only key the game listens to. Space must
  // not un-pause a world the player deliberately stopped, and `b` must not open
  // the build bar behind a screen that covers it.
  if (menuOpen() && key !== 'escape') return;

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
  // M15 phase 26c: R turns a line design (ditch, bank, canal, terrace) to run
  // the other way. Only while a design is being placed, and only where a
  // turned copy exists, so the key does nothing the player cannot see.
  if (key === 'r' && buildMode && activeDesign && BUILDINGS[activeDesign.id + '_ns']) {
    buildTurned = !buildTurned;
    if (lastMapPointer) showBuildGhost(lastMapPointer.x, lastMapPointer.y);
    return;
  }
  if (key === 'm') {
    setCraftMode(!craftMode);
    return;
  }
  if (key === 'escape') {
    // Innermost first. Settings steps back to the menu it was opened from
    // rather than all the way to the game: dropping two levels on one key is
    // how a player loses a screen they were still reading.
    if (settingsScreen.isOpen) {
      settings = settingsScreen.current();
      settingsScreen.close();
      pauseMenu.open(sim);
      return;
    }
    if (pauseMenu.isOpen) {
      closeMenu();
      return;
    }

    // The graphs, the radial menu and the picker have already closed
    // themselves by now — see `escapeFoundSomething` above. These three calls
    // stay as belt and braces for anything constructed after this handler.
    if (techWeb.isOpen) techWeb.close();
    if (familyTree.isOpen) familyTree.close();
    if (tribeGraph.isOpen) tribeGraph.close();
    if (worldMap.isOpen) worldMap.close();

    // Each of these *consumes* the key. That is a deliberate change: Escape
    // used to clear `commanding` even while it was also closing a graph, which
    // is fine when nothing is waiting at the end of the chain and wrong now
    // that something is.
    let consumed = escapeFoundSomething;
    if (buildMode) { setBuildMode(false); consumed = true; }
    if (craftMode) { setCraftMode(false); consumed = true; }
    if (commanding) { commanding = null; consumed = true; }

    if (!consumed) openMenu();
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
  if (key === 'v') {
    toggleFogOfWar();
    return;
  }
  // Cycles rather than toggles: there are three states and `R` has to be able
  // to reach all of them, since the segmented control it mirrors is hidden with
  // the rest of the chrome by `H`.
  if (key === 'r') {
    setAutonomy(nextAutonomy(sim.autonomy));
    return;
  }
  // Opens on whoever is selected, falling back to the player. Opening it on
  // somebody else is the point as much as opening it on yourself: knowing
  // which of your band has the idea nobody else has had, or who they cannot
  // stand, is the question each of these three panels exists to answer.
  if (key === 'g') {
    const subject = selected?.kind === 'person' ? selected.person : sim.player;
    openGraph('tech', subject);
    return;
  }
  if (key === 'o') {
    openGraph('globe', sim.player);
    return;
  }
  if (key === 'k') {
    const subject = selected?.kind === 'person' ? selected.person : sim.player;
    openGraph('family', subject);
    return;
  }
  if (key === 't') {
    const subject = selected?.kind === 'person' ? selected.person : sim.player;
    openGraph('tribe', subject);
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
  if (key === '4') hud.setTab('work');
  if (key === '5') hud.setTab('ties');
  if (key === '6') hud.setTab('life');

  held.add(key);
});
window.addEventListener('keyup', event => held.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());

/**
 * Opens and closes the craft bar.
 *
 * The two bars are mutually exclusive. Both live along the bottom edge, and a
 * player with both open would be looking at two rows of buttons where one of
 * them places a ghost on the map and the other does not.
 */
function setCraftMode(on: boolean): void {
  craftMode = on;
  if (on && buildMode) setBuildMode(false);
  hud.renderCraftBar(sim, sim.player, on);
}

function setBuildMode(on: boolean): void {
  buildMode = on;
  if (on && craftMode) setCraftMode(false);
  if (!on) {
    activeDesign = null;
    buildTurned = false;
    hud.clearDesign();
    renderer.buildGhost = null;
  }
  hud.renderBuildBar(sim, on);
}

function worldPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'>): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: camera.screenToWorldX(event.clientX - rect.left),
    y: camera.screenToWorldY(event.clientY - rect.top),
  };
}

/** How many stacked candidates the chooser will show before it stops listing. */
const PICKER_CAP = 6;

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
  const visibleToObserver = (x: number, y: number): boolean =>
    !renderer.fogEnabled || canSeePlace(sim.player, x, y, sim.config.sightRadius);

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

  // Every kind queries its own hash for *everything* in range rather than only
  // the nearest, so two people standing together are both offered instead of
  // one swallowing the other's click — `findNearest` used to be the only way
  // in, and "nearest wins" is exactly the bug this replaced.
  for (const person of sim.peopleHash.queryRadius(worldX, worldY, PICK_RANGE)) {
    if (person.id === sim.player?.id) continue;
    if (!visibleToObserver(person.x, person.y)) continue;
    consider({ kind: 'person', x: person.x, y: person.y, person },
      { kind: 'person', person }, person.x, person.y);
  }

  for (const node of sim.nodeHash.queryRadius(worldX, worldY, PICK_RANGE)) {
    // Not on the screen, so not in the list: buried under snow, or a stick
    // pile that has been picked clean and is drawn as nothing at all. The
    // renderer owns that rule — see `nodeIsHidden` — precisely so that the
    // picker cannot offer something the player cannot see.
    if (nodeIsHidden(node, (x, y) => sim.isBuried(x, y))) continue;
    if (!visibleToObserver(node.x, node.y)) continue;
    consider({ kind: 'node', x: node.x, y: node.y, node },
      { kind: 'node', node }, node.x, node.y);
  }

  for (const tree of sim.treeHash.queryRadius(worldX, worldY, PICK_RANGE)) {
    if (!tree.standing) continue;
    if (!visibleToObserver(tree.x, tree.y)) continue;
    consider({ kind: 'tree', x: tree.x, y: tree.y, tree },
      { kind: 'tree', tree }, tree.x, tree.y);
  }

  // Above piles and below people: a stone somebody is standing on should still
  // be reachable, which is the whole reason the chooser offers everything.
  for (const record of sim.inscriptionHash.queryRadius(worldX, worldY, 1.2)) {
    if (!visibleToObserver(record.x, record.y)) continue;
    consider({ kind: 'inscription', x: record.x, y: record.y, inscription: record },
      { kind: 'inscription', inscription: record }, record.x, record.y);
  }

  for (const pile of sim.pileHash.queryRadius(worldX, worldY, PICK_RANGE)) {
    if (sim.isBuried(pile.x, pile.y)) continue;
    if (!visibleToObserver(pile.x, pile.y)) continue;
    consider({ kind: 'pile', x: pile.x, y: pile.y, pile },
      { kind: 'pile', pile }, pile.x, pile.y);
  }

  // M11 phase 16a. Below the living, above the ground.
  for (const corpse of sim.corpseHash.queryRadius(worldX, worldY, PICK_RANGE)) {
    if (sim.isBuried(corpse.x, corpse.y)) continue;
    if (!visibleToObserver(corpse.x, corpse.y)) continue;
    consider({ kind: 'corpse', x: corpse.x, y: corpse.y, corpse },
      { kind: 'corpse', corpse }, corpse.x, corpse.y);
  }

  for (const animal of sim.animalHash.queryRadius(worldX, worldY, PICK_RANGE)) {
    if (!animal.alive) continue;
    if (!visibleToObserver(animal.x, animal.y)) continue;
    consider({ kind: 'animal', x: animal.x, y: animal.y, animal },
      { kind: 'animal', animal }, animal.x, animal.y);
  }

  scored.sort((a, b) => a.distance - b.distance);
  // The bubble column is DOM, not a simulation budget — nothing here needs
  // protecting except the player's ability to read the list. A crowded
  // household clustered on one tile would otherwise hand back a dozen bubbles.
  const targets = scored.slice(0, PICKER_CAP).map(entry => entry.target);

  // A building covers whole tiles rather than a point, so it sits behind the
  // things standing on it but ahead of bare ground. Its footprint is already
  // exact, so it needs no hit radius of its own.
  const building = sim.buildingAt(worldX, worldY);
  if (building && visibleToObserver(building.centerX, building.centerY)) {
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

/**
 * Whether a click should open the chooser rather than go straight through.
 *
 * It used to take *two* stacked entities. The ground was only ever offered as
 * an extra entry once a stack had already forced the chooser open, so clicking
 * a person standing on the tile you meant to walk to gave you the person and no
 * way at all to say you meant the tile — and standing on the thing you are
 * working on is the normal state of affairs in this game, not an edge case.
 *
 * The one exception is your own character alone under the cursor. Opening a
 * two-entry menu every time the player clicks themselves would put a chooser in
 * front of the most common click there is.
 */
function wantsPicker(real: ActionTarget[]): boolean {
  if (real.length === 0) return false;
  if (real.length === 1 && real[0]!.person?.id === sim.player?.id) return false;
  return true;
}

const PICKER_ICONS: Record<string, string> = {
  person: '\u{1F464}',
  node: '\u{1F33F}',
  tree: '\u{1F333}',
  pile: '\u{1F4E6}',
  corpse: '\u{1FAA6}',
  inscription: '\u{1FAA8}',
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
      return nodeName(target.node!, observer) + ' — ' + knowledgeOfNode(observer, target.node!).estimate;
    case 'tree':
      return t(target.tree!.def.label) + ' — ' + knowledgeOfTree(observer, target.tree!).estimate;
    case 'animal':
      // No knowledge gating: a deer is a deer to anyone who has seen one.
      return t(target.animal!.label) + (target.animal!.alarmed ? ' — ' + t('alarmed') : '');
    case 'pile':
      // `ItemPile.label` already exists and used to go unread here — the
      // picker said "dropped goods" for a stack of six flints and a fish.
      return target.pile!.label;
    case 'corpse':
      return corpseTitle(observer, target.corpse!, sim.relationships,
        stageOf(target.corpse!, sim.time.tick, sim.config.time.ticksPerDay));
    case 'inscription': {
      // Gated like everything else the picker says. Somebody who cannot read is
      // told there are marks, not what they are.
      const record = target.inscription!;
      const literate = techPower(observer, 'writing') > 0;
      const marks = record.unfinished
        ? t('half cut')
        : record.techs.length === 0
          ? t('blank')
          : literate
            ? record.techs.map(id => t(TECH[id as Tech]?.label ?? id)).join(', ').toLowerCase()
            : t('{n} marks', { n: record.techs.length });
      return t(record.def.label).toLowerCase() + ' — ' + marks;
    }
    case 'building':
      return t(target.building!.def.label);
    case 'ground':
      return t('the ground here');
  }
}

function pickerEntries(observer: Person, targets: ActionTarget[]): PickerEntry<ActionTarget>[] {
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
    case 'corpse':
      return { x: target.x, y: target.y, radius: 0.6 };
    case 'inscription':
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
    target.kind === 'corpse' && target.corpse ? { kind: 'corpse', corpse: target.corpse } :
    target.kind === 'inscription' && target.inscription
      ? { kind: 'inscription', inscription: target.inscription } :
    target.kind === 'animal' && target.animal ? { kind: 'animal', animal: target.animal } :
    target.kind === 'building' && target.building
      ? { kind: 'building', building: target.building }
      : (sim.player ? { kind: 'person', person: sim.player } : null);
}

canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.active) {
      updatePinch();
      return;
    }
  }
  // Only a press in progress belongs to one pointer; with none, a hover is
  // anybody's. Comparing against the idle `-1` threw every mouse hover away,
  // so the build ghost sat where it was first put until the next click and
  // the refusal reason written beside it could never follow the cursor.
  if (drag.pointerId !== -1 && event.pointerId !== drag.pointerId) return;
  if (drag.active) {
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (!drag.panning && drag.button === 0 &&
        Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) >
          (drag.pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD)) {
      drag.panning = true;
      cancelLongPress();
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
  // The ghost follows the pointer wherever it is over the page, so R turns it
  // where it is drawn even if the canvas's own listener never saw the move.
  lastMapPointer = point;
  showBuildGhost(point.x, point.y);
});

/** Where the pointer was last seen over the map, in world units. */
let lastMapPointer: { x: number; y: number } | null = null;
canvas.addEventListener('pointermove', event => {
  lastMapPointer = worldPoint(event);
  canvas.title = renderer.fogDescriptionAt(lastMapPointer.x, lastMapPointer.y) ??
    renderer.groundDescriptionAt(lastMapPointer.x, lastMapPointer.y) ?? '';
});

/** Draws the active design's ghost at a world point, green where it fits. */
function showBuildGhost(worldX: number, worldY: number): void {
  if (!buildMode || !activeDesign) return;
  const design = effectiveDesign();
  if (!design) return;
  const x = Math.round(worldX);
  const y = Math.round(worldY);
  const why = sim.placementRefusal(design, x, y);
  renderer.buildGhost = {
    x, y,
    width: design.width,
    height: design.height,
    ok: why === null,
    reason: why,
    // An earthwork previews its plan, not its bounding box: a moat is a ring.
    plan: design.earthwork
      ? earthworkTiles(design.earthwork, x, y, design.width, design.height, sim.world)
          .map(tile => ({ x: tile.x, y: tile.y, kind: tile.kind }))
      : undefined,
  };
}

/**
 * The design to place: the one picked, or its turned copy if R has turned it.
 * A line (a ditch, a bank, a canal) is the same plan running the other way,
 * so the menu lists it once and the turned copy is found by id.
 */
function effectiveDesign(): BuildingDef | null {
  if (!activeDesign) return null;
  return buildTurned ? BUILDINGS[activeDesign.id + '_ns'] ?? activeDesign : activeDesign;
}

/**
 * Drag-to-pan.
 *
 * A left press only becomes a drag once it has travelled past a few pixels, so
 * a plain click still selects. Middle-drag always pans. Panning releases the
 * camera from the player; `F` (or the button in the top bar) re-attaches it.
 */
const drag = {
  active: false, panning: false, longPressed: false,
  zoomed: false,
  lastX: 0, lastY: 0, startX: 0, startY: 0,
  button: 0, pointerId: -1, pointerType: '',
};
const DRAG_THRESHOLD = 4;
const TOUCH_DRAG_THRESHOLD = 10;
const LONG_PRESS_MS = 500;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
const touches = new Map<number, { x: number; y: number }>();
const pinch = { active: false, used: false, distance: 0, midX: 0, midY: 0 };

function cancelLongPress(): void {
  if (longPressTimer !== null) clearTimeout(longPressTimer);
  longPressTimer = null;
}

function touchPair(): [{ x: number; y: number }, { x: number; y: number }] | null {
  const points = [...touches.values()];
  return points.length >= 2 ? [points[0]!, points[1]!] : null;
}

function startPinch(): void {
  const pair = touchPair();
  if (!pair) return;
  const [a, b] = pair;
  pinch.active = true;
  pinch.used = true;
  pinch.distance = Math.hypot(b.x - a.x, b.y - a.y);
  pinch.midX = (a.x + b.x) / 2;
  pinch.midY = (a.y + b.y) / 2;
  drag.longPressed = true;
  drag.panning = false;
  cancelLongPress();
}

/** Pans with the midpoint and zooms around it, so the land between the fingers stays put. */
function updatePinch(): void {
  const pair = touchPair();
  if (!pair) return;
  const [a, b] = pair;
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  camera.panByPixels(midX - pinch.midX, midY - pinch.midY);
  if (pinch.distance > 0 && distance > 0) {
    const rect = canvas.getBoundingClientRect();
    const screenX = midX - rect.left;
    const screenY = midY - rect.top;
    const worldX = camera.screenToWorldX(screenX);
    const worldY = camera.screenToWorldY(screenY);
    camera.zoom = Math.max(0.5, Math.min(5, camera.zoom * distance / pinch.distance));
    camera.x += worldX - camera.screenToWorldX(screenX);
    camera.y += worldY - camera.screenToWorldY(screenY);
  }
  pinch.distance = distance;
  pinch.midX = midX;
  pinch.midY = midY;
}

/** Opens the action chooser shared by right-click and touch hold. */
function openActionsAt(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
  const actor = sim.player;
  if (!actor || !actor.alive) return;
  const point = worldPoint(event);
  const options = candidatesAt(point.x, point.y, true);
  const real = realCandidates(options);
  if (!wantsPicker(real)) {
    openRadial(actor, options[0]!, event.clientX, event.clientY);
    return;
  }
  picker.show(
    event.clientX, event.clientY,
    pickerEntries(actor, [...real, options[options.length - 1]!]),
    target => openRadial(actor, target, event.clientX, event.clientY),
    target => { renderer.hoverRing = target ? ringFor(target) : null; }
  );
}

canvas.addEventListener('pointerdown', event => {
  // The overlays cover the canvas, so this should be unreachable — but so
  // should the four `[hidden]` bugs this project has shipped, and it is a line.
  if (newGame.isOpen || worldPicker.isOpen || menuOpen()) return;
  if (event.pointerType === 'touch') {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (touches.size === 1) pinch.used = false;
    if (touches.size >= 2) {
      startPinch();
      return;
    }
  }
  if (event.button === 0 || event.button === 1) {
    if (drag.active) return;
    drag.active = true;
    drag.panning = event.button === 1;
    drag.longPressed = false;
    drag.zoomed = false;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.button = event.button;
    drag.pointerId = event.pointerId;
    drag.pointerType = event.pointerType;
    canvas.setPointerCapture(event.pointerId);

    if (event.pointerType === 'touch' && !buildMode) {
      cancelLongPress();
      const at = { clientX: event.clientX, clientY: event.clientY };
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!drag.active || drag.panning || drag.pointerId !== event.pointerId) return;
        drag.longPressed = true;
        openActionsAt(at);
      }, LONG_PRESS_MS);
    }
  }
  // --- Build mode: right click cancels ------------------------------------
  if (buildMode && activeDesign) {
    if (event.button === 2) {
      setBuildMode(false);
      return;
    }
    return;
  }

  // --- Right click: the radial menu ----------------------------------------
  if (event.button === 2) {
    openActionsAt(event);
    return;
  }

  // --- Left click: inspect --------------------------------------------------
  // Deferred to mouseup so that a drag pans instead of selecting whatever
  // happened to be under the cursor when the press started.
});

window.addEventListener('pointerup', event => {
  if (event.pointerType === 'touch') {
    touches.delete(event.pointerId);
    if (pinch.active && touches.size < 2) {
      pinch.active = false;
      // A pinch is one indivisible gesture. Forget the remaining contact and
      // require a fresh press; otherwise a browser that coalesces the two
      // releases can leave a ghost finger which turns the next hold into a
      // second pinch and makes the action menu unreachable.
      touches.clear();
      drag.active = false;
      drag.panning = false;
      drag.pointerId = -1;
      cancelLongPress();
    }
  }
  if (event.pointerId !== drag.pointerId) return;
  cancelLongPress();
  const wasDragging = drag.panning;
  const wasLongPress = drag.longPressed;
  const wasPinching = pinch.used;
  const wasZoomed = drag.zoomed;
  drag.active = false;
  drag.panning = false;
  drag.pointerId = -1;
  if (wasDragging || wasLongPress || wasPinching || wasZoomed || event.button !== 0) return;
  // A press is also the start of a pan or zoom gesture. Place only after the
  // shared gesture handler has confirmed that this ended as a plain click.
  if (buildMode && activeDesign && event.target === canvas) {
    const point = worldPoint(event);
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const design = effectiveDesign()!;
    const placed = sim.place(design.id, x, y, sim.player?.bandId ?? 0,
      sim.player?.id ?? null, true);
    if (placed) {
      renderer.floaters.push(placed.centerX, placed.centerY,
        placed.complete
          ? t('{building} marked out', { building: t(placed.def.label) })
          : t('{building} planned', { building: t(placed.def.label) }),
        { color: '#7ddc96', boxed: true });
    } else {
      const why = sim.placementRefusal(design, x, y)
        ?? t('that cannot be built there');
      renderer.floaters.push(x, y, why, { color: '#e66464', boxed: true });
    }
    return;
  }
  if (buildMode || radial.isOpen || picker.isOpen || graphOpen() || menuOpen()) return;
  if (event.target !== canvas) return;

  const point = worldPoint(event);
  const options = candidatesAt(point.x, point.y, false);
  const real = realCandidates(options);
  const observer = sim.player;

  // Nothing under the cursor: select the ground and be done. Anything else is
  // put to the player, with the ground among the choices, because the old
  // behaviour cycled blindly through a stack on repeated clicks and never
  // offered the tile at all.
  if (!wantsPicker(real) || !observer) {
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

window.addEventListener('pointercancel', event => {
  if (event.pointerType === 'touch') {
    touches.delete(event.pointerId);
    if (pinch.active && touches.size < 2) {
      pinch.active = false;
      touches.clear();
      drag.pointerId = -1;
    }
  }
  if (event.pointerId !== drag.pointerId) return;
  cancelLongPress();
  drag.active = false;
  drag.panning = false;
  drag.pointerId = -1;
});

// Suppressed document-wide, not just on the canvas: right-click is this game's
// primary verb, and the browser menu covered the radial one whenever the cursor
// happened to be over the HUD, the build bar, or the menu itself.
document.addEventListener('contextmenu', event => event.preventDefault());

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  if (drag.active) drag.zoomed = true;
  // Down to 0.5 so the whole island fits on screen: surveying the land is how
  // you decide where to move a camp.
  camera.zoom = Math.max(0.5, Math.min(5, camera.zoom * (event.deltaY < 0 ? 1.12 : 0.89)));
}, { passive: false });

/**
 * The finished station of a kind that `who` could actually get to, or null.
 *
 * M8.1, mechanism 4. A linear scan, deliberately: buildings have no spatial
 * hash and `optimizations.md` owns the decision that those scans stay linear,
 * and this one runs once per opened menu rather than once per tick. Doing it
 * here rather than inside `ActionCatalog` is what keeps the catalogue free of
 * world queries — the same split `nearWater` already makes.
 *
 * Any band's station, unlike the AI's own rule in `Brain`: the player is
 * allowed to try, and being refused by whoever owns it is the owner's O4 rather
 * than something to pre-empt by hiding the option.
 */
function nearestStation(who: Person, stationId: string): Building | null {
  let best: Building | null = null;
  let bestDistance = Infinity;
  for (const building of sim.buildings) {
    if (!building.complete || building.def.id !== stationId) continue;
    if (sim.mayUseBuilding(who, building).watched) continue;
    if (!sim.world.sameRegion(who.x, who.y, building.centerX, building.centerY)) continue;
    const distance = who.distanceTo({ x: building.centerX, y: building.centerY });
    if (distance < bestDistance) {
      bestDistance = distance;
      best = building;
    }
  }
  return best;
}

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
  const saltWater = sim.world.isSaltWater(target.x, target.y) ||
    (!sim.world.isFreshWater(target.x, target.y) && sim.world.isSaltShore(target.x, target.y) &&
      !sim.world.isFreshShore(target.x, target.y));
  // In command mode the verbs are worked out for the person being commanded,
  // not for the player: what *they* can carry, what *they* know how to make.
  const subject = commanding && commanding.alive ? commanding : actor;
  const options = availableActions(subject, target, {
    world: sim.world, nearWater, saltWater, drownAt: sim.config.world.drownAt, commanding,
    buildings: sim.buildings,
    backersWanted: sim.config.motivation.backersWanted,
    stationFor: stationId => nearestStation(subject, stationId),
    builtOn: (x, y) => sim.buildingAt(x, y) !== null,
    plantRefusal: (x, y) => sim.plantOrderRefusal(subject, x, y),
    ploughRefusal: (person, field) => sim.ploughOrderRefusal(person, field),
    feastVenue: sim.feastVenueFor(subject),
    propertyUse: building => sim.mayUseBuilding(subject, building),
    explainProperty: use => explainPropertyUse(actor, use, sim.relationships),
    // The player's own view of whoever was clicked, so the conversation rungs
    // offered are the ones the two of them could actually have. Deliberately
    // left out when commanding somebody else: which conversations *they* could
    // have with a third person is a reading of their private relationships,
    // and the catalogue offers all four blind instead, with `doTalk` speaking
    // the refusal — the same rule `issueTake` follows at a store.
    ...(commanding && commanding.alive
      ? {}
      : { relationships: sim.relationships, tick: sim.time.tick }),
    // M12 phase 2b: who leads a band is the one thing everybody knows.
    chiefOf: bandId => sim.bandSystem.chiefByBand.get(bandId),
    // M15 phase 20: a baby gets its own menu, and a baby in the subject's
    // arms can be laid down wherever the player clicks.
    childhood: sim.config.childhood,
    peopleById: sim.peopleById,
    carriedBabies: sim.people.filter(p => p.alive && p.carriedBy === subject.id),
  });

  // A command is a request, not a button that guarantees compliance. Put the
  // same estimate `Simulation.command` uses on each option before the player
  // commits, including nested recipe/conversation pages.
  if (commanding && commanding.alive && commanding.id !== actor.id) {
    const annotate = (items: ActionOption[]): ActionOption[] => items.map(option => {
      const siteId = option.buildingId ?? target.building?.id;
      const site = siteId === undefined ? undefined : sim.buildingsById.get(siteId);
      const foreign = site !== undefined && site.ownerBandId !== subject.bandId;
      const standing = sim.standing(actor, subject, option.id, foreign);
      const estimate = standing.chance >= 0.8 ? t('almost certain')
        : standing.chance >= 0.5 ? t('may well obey')
          : standing.chance >= 0.25 ? t('uncertain') : t('unlikely to obey');
      return {
        ...option,
        label: t('{action} ({chance})', { action: option.label, chance: estimate }),
        ...(option.children ? { children: annotate(option.children) } : {}),
      };
    });
    options.splice(0, options.length, ...annotate(options));
  }

  const title =
    target.kind === 'person'
      ? knowledgeOfPerson(actor, target.person!, sim.relationships).displayName :
    target.kind === 'node' ? nodeName(target.node!, actor) :
    target.kind === 'building' ? t(target.building!.def.label) :
    target.kind === 'tree' ? t(target.tree!.def.label) :
    target.kind === 'animal' ? t(target.animal!.label) :
    target.kind === 'inscription' ? t(target.inscription!.def.label) :
    target.kind === 'pile' ? t('Dropped goods') :
    target.kind === 'corpse' ? corpseTitle(actor, target.corpse!, sim.relationships,
      stageOf(target.corpse!, sim.time.tick, sim.config.time.ticksPerDay)) :
    t('Ground');

  radial.show(
    screenX, screenY,
    commanding && commanding.alive
      ? t('{title} — ordering {name}', { title, name: commanding.name })
      : title,
    options,
    option => issue(actor, option, target, screenX, screenY)
  );
}

/** Turns a menu choice into a simulation order. */
function issue(
  actor: Person, option: ActionOption, target: ActionTarget, screenX: number, screenY: number
): void {
  const actionId = option.id;
  if (actionId === 'follow_me' && target.person) {
    const accepted = sim.command(actor, target.person, 'follow_me', { personId: actor.id });
    if (!accepted) renderer.floaters.push(target.person.x, target.person.y, sim.lastRefusal ?? t('The request was refused'), { color: '#ff8c82', boxed: true });
    return;
  }
  if (actionId === 'possess' && target.person) {
    possess(target.person);
    return;
  }
  if (target.animal && (actionId === 'transport_pack' || actionId === 'transport_riding')) {
    const subject = commanding && commanding.alive ? commanding : actor;
    const mode = actionId === 'transport_pack' ? 'pack' : 'riding';
    if (!sim.claimTransportAnimalFor(subject.id, target.animal.id, mode)) {
      renderer.floaters.push(target.animal.x, target.animal.y, sim.lastRefusal ?? t('The request was refused'), { color: '#ff8c82', boxed: true });
    }
    return;
  }
  if (actionId === 'release_transport') {
    const subject = commanding && commanding.alive ? commanding : actor;
    if (!sim.releaseTransportAnimalFor(subject.id)) {
      renderer.floaters.push(subject.x, subject.y, sim.lastRefusal ?? t('The request was refused'), { color: '#ff8c82', boxed: true });
    }
    return;
  }
  if (actionId === 'pickup' && target.pile) {
    // The subject, not the player: what is on the ground is in plain sight of
    // anybody, so unlike a store's contents there is nothing here the player
    // should not be choosing from on a subordinate's behalf — but the room in
    // the pack, and therefore the largest amount worth asking for, is the
    // carrier's own.
    const subject = commanding && commanding.alive ? commanding : actor;
    issuePickup(actor, subject, target.pile, screenX, screenY);
    return;
  }
  // Choosing which item and how much, when there is a real choice to make and
  // the player is acting for themselves rather than commanding somebody else
  // — see `issueTake`'s own note on why commanding stays blind for now.
  if (actionId === 'take' && target.building &&
      !(commanding && commanding.alive && commanding.id !== actor.id)) {
    issueTake(actor, target.building, screenX, screenY);
    return;
  }
  if (actionId === 'store' && target.building &&
      !(commanding && commanding.alive && commanding.id !== actor.id)) {
    issueStore(actor, target.building, screenX, screenY);
    return;
  }
  if (actionId === 'threaten' && target.person &&
      !(commanding && commanding.alive && commanding.id !== actor.id)) {
    issueThreaten(actor, target.person, screenX, screenY);
    return;
  }

  // Built once and used by both branches below. It used to be written out
  // twice, identically, which is precisely how the second copy comes to be
  // missing whatever the first one gains — `recipeId` being the first such
  // field to arrive.
  const place = {
    x: target.kind === 'ground' ? target.x : undefined,
    y: target.kind === 'ground' ? target.y : undefined,
    // The option's own person first: "put the baby down here" is offered on
    // the ground and still has to say which baby.
    personId: option.personId ?? target.person?.id,
    nodeId: target.node?.id,
    // The option's own station wins over whatever was clicked: "Grind meal" is
    // offered on bare ground and has to arrive at the quern all the same.
    buildingId: option.buildingId ?? target.building?.id,
    treeId: target.tree?.id,
    animalId: target.animal?.id,
    corpseId: target.corpse?.id,
    recipeId: option.recipeId,
    itemId: option.itemId,
    inscriptionId: target.inscription?.id,
    // Which idea a `ponder` or `discuss` is about. Carried on the option
    // rather than worked out again by the action, which is what made the
    // second idea in somebody's head unreachable from the menu.
    techId: option.techId,
    // Which of the four conversations was chosen. Same story as `techId`: the
    // verb is `talk` for all of them and the option is what says which.
    mode: option.mode,
  };

  // Commanding somebody else: they may simply refuse, in public.
  if (commanding && commanding.alive && commanding.id !== actor.id) {
    const subordinate = commanding;
    const obeyed = sim.command(actor, subordinate, actionId, place);
    const why = sim.lastRefusal;
    sim.lastRefusal = null;
    renderer.floaters.push(subordinate.x, subordinate.y,
      obeyed ? t('{name} obeys', { name: subordinate.name })
        : why
          ? t('{name} refuses: {why}', { name: subordinate.name, why })
          : t('{name} refuses', { name: subordinate.name }),
      { color: obeyed ? '#7ddc96' : '#e0705c', boxed: true, ttl: 3.4 });
    return;
  }

  const ok = sim.order(actor, actionId, place);

  // A refusal says why. `lastRefusal` is set by the simulation and read once.
  const reason = sim.lastRefusal;
  sim.lastRefusal = null;
  renderer.floaters.push(actor.x, actor.y,
    ok ? actionLabel(actionId, option.recipeId, option.mode) : (reason ?? t('cannot do that')),
    { color: ok ? '#ffd35c' : '#e66464', boxed: true, ttl: ok ? 2.6 : 3.6 });
}

/** Issues a `take` order, reporting the outcome the same way `issue` does. */
function orderTake(
  actor: Person, store: Building, itemId: string | undefined, count: number | undefined
): void {
  const ok = sim.order(actor, 'take', { buildingId: store.id, itemId, count });
  const reason = sim.lastRefusal;
  sim.lastRefusal = null;
  renderer.floaters.push(actor.x, actor.y,
    ok ? actionLabel('take') : (reason ?? t('cannot do that')),
    { color: ok ? '#ffd35c' : '#e66464', boxed: true, ttl: ok ? 2.6 : 3.6 });
}

/**
 * "Take from store", turned into a choice of item and amount — M9 phase 2's
 * fix for note 9: `doTake` used to always grab a fixed six units of whatever
 * `bestFood()` picked, with no way to ask for a specific thing or a specific
 * count.
 *
 * Gated on `knowledgeOfBuilding`, the same rule the store panel already reads
 * `known.knowsContents` through: a store's contents are only legible to the
 * band it belongs to, and a picker built from what is actually in there would
 * otherwise hand a stranger's larder to anyone who right-clicked it. Blind, it
 * falls back to the old surprise grab — a real choice needs something to
 * choose between.
 *
 * Only reached for the player's own character; commanding somebody else at a
 * store they may or may not know the contents of is left blind for now, the
 * way it always was, rather than asking the player to choose on a
 * subordinate's behalf from knowledge that is really the subordinate's to
 * have or not.
 */
function issueTake(actor: Person, store: Building, screenX: number, screenY: number): void {
  const askAmount = (itemId: string) => {
    const max = store.store.count(itemId);
    quantityPicker.show(screenX, screenY, t('Take {item}', { item: t(ITEMS[itemId]?.label ?? itemId).toLowerCase() }),
      max, count => orderTake(actor, store, itemId, count), Math.min(6, max));
  };

  if (!knowledgeOfBuilding(actor, store).knowsContents) {
    orderTake(actor, store, undefined, undefined);
    return;
  }
  const contents = store.store.entries();
  if (contents.length === 0) {
    // Unreachable in practice — the menu option is disabled when the store is
    // empty — but a refusal always says why rather than doing nothing at all.
    orderTake(actor, store, undefined, undefined);
    return;
  }
  if (contents.length === 1) {
    askAmount(contents[0]![0]);
    return;
  }

  const entries: PickerEntry<string>[] = contents.map(([id, n]) => ({
    target: id,
    icon: '\u{1F4E6}',
    label: t(ITEMS[id]?.label ?? id) + ' ×' + n,
  }));
  itemPicker.show(screenX, screenY, entries, askAmount, () => {});
}

/** Issues a `threaten` order, reporting the outcome the same way `issue` does. */
function orderThreaten(
  actor: Person, target: Person, itemId: string | undefined, count: number | undefined
): void {
  const ok = sim.order(actor, 'threaten', { personId: target.id, itemId, count });
  const reason = sim.lastRefusal;
  sim.lastRefusal = null;
  renderer.floaters.push(actor.x, actor.y,
    ok ? actionLabel('threaten') : (reason ?? t('cannot do that')),
    { color: ok ? '#ffd35c' : '#e66464', boxed: true, ttl: ok ? 2.6 : 3.6 });
}

/**
 * "Threaten X", turned into a choice of item and amount — the same picker
 * `issueTake` uses, reused rather than built a second time (M9.5 phase 4a).
 *
 * This floater only confirms the demand was made, not how it went: whether
 * the target hands anything over is a compliance roll made later, at the end
 * of the wind-up, and reaches the player through the same interruption
 * channel every other mid-action refusal already uses.
 */
function issueThreaten(actor: Person, target: Person, screenX: number, screenY: number): void {
  const askAmount = (itemId: string) => {
    const max = target.inventory.count(itemId);
    quantityPicker.show(screenX, screenY, t('Demand {item}', { item: t(ITEMS[itemId]?.label ?? itemId).toLowerCase() }),
      max, count => orderThreaten(actor, target, itemId, count), Math.min(3, max));
  };

  const carried = target.inventory.entries();
  if (carried.length === 0) {
    orderThreaten(actor, target, undefined, undefined);
    return;
  }
  if (carried.length === 1) {
    askAmount(carried[0]![0]);
    return;
  }

  const entries: PickerEntry<string>[] = carried.map(([id, n]) => ({
    target: id,
    icon: '\u{1F4E6}',
    label: t(ITEMS[id]?.label ?? id) + ' ×' + n,
  }));
  itemPicker.show(screenX, screenY, entries, askAmount, () => {});
}

/** Issues a `store` order, reporting the outcome the same way `issue` does. */
function orderStore(
  actor: Person, store: Building, itemId: string | undefined, count: number | undefined
): void {
  const ok = sim.order(actor, 'store', { buildingId: store.id, itemId, count });
  const reason = sim.lastRefusal;
  sim.lastRefusal = null;
  renderer.floaters.push(actor.x, actor.y,
    ok ? actionLabel('store') : (reason ?? t('cannot do that')),
    { color: ok ? '#ffd35c' : '#e66464', boxed: true, ttl: ok ? 2.6 : 3.6 });
}

/**
 * "Store what you carry", turned into a choice of item and amount, mirroring
 * `issueTake`.
 *
 * No knowledge gate — the player is choosing from their own pack, not reading
 * a stranger's store. Skips the picker at one stack, the same precedent
 * `issueTake` follows.
 *
 * Only reached for the player's own character; commanding somebody else at a
 * store is left blind, the way `issueTake` already is, down the existing
 * `sim.command` path in `issue`.
 */
function issueStore(actor: Person, store: Building, screenX: number, screenY: number): void {
  const contents = actor.inventory.entries();
  if (contents.length === 0) {
    // Unreachable in practice — the menu option is disabled while the pack is
    // empty — but a refusal always says why rather than doing nothing at all.
    orderStore(actor, store, undefined, undefined);
    return;
  }

  const askAmount = (itemId: string) => {
    const max = actor.inventory.count(itemId);
    quantityPicker.show(screenX, screenY, t('Store {item}', { item: t(ITEMS[itemId]?.label ?? itemId).toLowerCase() }),
      max, count => orderStore(actor, store, itemId, count));
  };

  if (contents.length === 1) {
    askAmount(contents[0]![0]);
    return;
  }

  const entries: PickerEntry<string>[] = contents.map(([id, n]) => ({
    target: id,
    icon: '\u{1F4E6}',
    label: t(ITEMS[id]?.label ?? id) + ' ×' + n,
  }));
  itemPicker.show(screenX, screenY, entries, askAmount, () => {});
}

/**
 * Issues a `pickup` order, reporting the outcome the way `issue` does.
 *
 * An order rather than a transfer. Until the pass that answered the owner's
 * "to pick things up npcs must go near the object", this called
 * `Simulation.takeFromPile` on the click and the goods arrived in the pack
 * from wherever the player was standing.
 */
function orderPickup(
  leader: Person, subject: Person, pile: ItemPile,
  itemId: string | undefined, count: number | undefined
): void {
  // Commanding somebody else goes down the same road every other verb does —
  // they may refuse, in public, and the refusal has to be the subordinate's
  // rather than a floater over the player.
  if (subject.id !== leader.id) {
    const subordinate = subject;
    const obeyed = sim.command(
      leader, subordinate, 'pickup', { pileId: pile.id, itemId, count });
    const why = sim.lastRefusal;
    sim.lastRefusal = null;
    renderer.floaters.push(subordinate.x, subordinate.y,
      obeyed ? t('{name} obeys', { name: subordinate.name })
        : why
          ? t('{name} refuses: {why}', { name: subordinate.name, why })
          : t('{name} refuses', { name: subordinate.name }),
      { color: obeyed ? '#7ddc96' : '#e0705c', boxed: true, ttl: 3.4 });
    return;
  }

  const ok = sim.order(subject, 'pickup', { pileId: pile.id, itemId, count });
  const reason = sim.lastRefusal;
  sim.lastRefusal = null;
  renderer.floaters.push(subject.x, subject.y,
    ok ? actionLabel('pickup') : (reason ?? t('cannot do that')),
    { color: ok ? '#ffd35c' : '#e66464', boxed: true, ttl: ok ? 2.6 : 3.6 });
}

/**
 * "Pick up", turned into a choice of item and amount, mirroring `issueTake`.
 *
 * The room guard runs before either picker opens: `quantityPicker.show`
 * refuses a `max` of zero or less silently, and a popup that never appears
 * would be the worst outcome for a player standing over goods they cannot
 * carry.
 *
 * No knowledge gate — goods on the ground are visible to anyone standing over
 * them, unlike a store's contents.
 */
function issuePickup(
  leader: Person, subject: Person, pile: ItemPile, screenX: number, screenY: number
): void {
  if (subject.carrying >= subject.carryCapacity) {
    renderer.floaters.push(subject.x, subject.y, t('hands full'),
      { color: '#e66464', boxed: true });
    return;
  }

  const askAmount = (itemId: string) => {
    const max = Math.min(pile.contents.count(itemId), subject.carryCapacity - subject.carrying);
    quantityPicker.show(screenX, screenY, t('Pick up {item}', { item: t(ITEMS[itemId]?.label ?? itemId).toLowerCase() }),
      max, count => orderPickup(leader, subject, pile, itemId, count));
  };

  const contents = pile.contents.entries();
  if (contents.length === 0) {
    // Unreachable in practice — an empty pile removes itself — but a refusal
    // always says why rather than doing nothing at all.
    orderPickup(leader, subject, pile, undefined, undefined);
    return;
  }
  if (contents.length === 1) {
    askAmount(contents[0]![0]);
    return;
  }

  const entries: PickerEntry<string>[] = contents.map(([id, n]) => ({
    target: id,
    icon: '\u{1F4E6}',
    label: t(ITEMS[id]?.label ?? id) + ' ×' + n,
  }));
  itemPicker.show(screenX, screenY, entries, askAmount, () => {});
}

// ---------------------------------------------------------------------------
// Floaters: what people are doing, and what just happened
// ---------------------------------------------------------------------------

const lastActions = new Map<number, string>();
let lastEventId = 0;

const NOTABLE = new Set(['theft', 'assault', 'murder', 'share_food', 'gift', 'threaten']);
const EVENT_COLORS: Record<string, string> = {
  theft: '#e0a04a',
  assault: '#e06a5a',
  murder: '#ff5b5b',
  threaten: '#e0a04a',
  share_food: '#7ddc96',
  gift: '#7ddc96',
};
// M11 phase 3b: the deeds whose *secretness* is the story. A gift nobody saw is
// nobody's business, and that is all there is to it; an unseen theft is the
// difference between getting away with it and bringing the band down on you.
const CRIMES = new Set(['theft', 'assault', 'murder', 'threaten']);

/**
 * Says why an order or a familiar selected NPC's autonomous trip stopped.
 *
 * The simulation queues these; the decision about *whose* are worth reporting
 * belongs here: it depends on commands, selection and social knowledge, and
 * the simulation has no idea who the player is commanding. A chief ordering his
 * band about all day is not news.
 */
function reportInterruptions(): void {
  const notices = sim.interruptions.splice(0, sim.interruptions.length);
  for (const notice of notices) {
    const person = sim.peopleById.get(notice.personId);
    if (!person) continue;
    const observer = sim.player;
    const knowledge = observer ? knowledgeOfPerson(observer, person, sim.relationships) : null;
    const familiar = knowledge?.level === 'close' || knowledge?.level === 'known';
    // An autonomous commitment is a visible choice, but only for someone the
    // player already knows well enough to read. Selection alone must not turn
    // a stranger's private needs into a public notification.
    const selectedCommitment = notice.autonomousCommitment === true && familiar &&
      selected?.kind === 'person' && selected.person.id === person.id;
    const commanded = person.id === commanding?.id &&
      (!notice.autonomousCommitment || familiar);
    const mine = person.isPlayer || commanded || selectedCommitment;
    if (!mine) continue;

    // M11 phase 15b: being held down names whoever is doing it — as the
    // player knows them, never past `Knowledge.ts` — and reads the same
    // whether or not there was anything to stop.
    const holder = notice.reason === 'restrained' && person.heldBy !== null
      ? sim.peopleById.get(person.heldBy) : undefined;
    // M11 phase 15c: the same for being tied up.
    const binder = notice.reason === 'bound' && person.boundBy !== null
      ? sim.peopleById.get(person.boundBy) : undefined;
    // M11 phase 15d: and for being taken, naming the people who took them.
    const captors = notice.reason === 'taken_captive' && person.captiveOf !== null
      ? sim.bands.find(b => b.id === person.captiveOf) : undefined;
    const text = holder && sim.player
      ? t('Held back by {name}', {
        name: knowledgeOfPerson(sim.player, holder, sim.relationships).displayName,
      })
      : binder && sim.player
      ? t('Tied up by {name}', {
        name: knowledgeOfPerson(sim.player, binder, sim.relationships).displayName,
      })
      : captors
      ? t('Taken captive by the {band}', { band: captors.name })
      : t('{action} stopped — {reason}', {
        action: actionLabel(notice.action, notice.recipe), reason: stopReasonLabel(notice.reason),
      });
    renderer.floaters.push(person.x, person.y, text,
      { color: '#e0b055', boxed: true, ttl: 3.4 });
    hud.noteStop(person.id, stopReasonLabel(notice.reason));
  }
}

/**
 * Says that somebody called for help — M11 phase 15b.4 — if the player's
 * character was close enough to hear it. Hearing it is the only way anybody
 * learns of a call, and the player is nobody special. The caller is named as
 * the player knows them.
 */
function reportHelpCalls(): void {
  const calls = sim.helpCalls.splice(0, sim.helpCalls.length);
  const listener = sim.player;
  if (!listener || !listener.alive) return;
  for (const call of calls) {
    const caller = sim.peopleById.get(call.callerId);
    if (!caller) continue;
    if (caller.id !== listener.id &&
      Math.hypot(listener.x - call.x, listener.y - call.y) > EARSHOT) continue;
    const name = knowledgeOfPerson(listener, caller, sim.relationships).displayName;
    renderer.floaters.push(call.x, call.y,
      caller.id === listener.id
        ? t('You call for help')
        : t('{name} calls for help!', { name: name.charAt(0).toUpperCase() + name.slice(1) }),
      { color: '#e0705c', boxed: true, ttl: 3.4 });
  }
}

/**
 * Says that an owner saw one of the player's people use their band's
 * structure — M11 phase 15a.
 *
 * Being watched used to refuse the use, and the refusal reached the player as
 * a stop. It no longer refuses anything, so without this the only trace of
 * having been seen would be a change in somebody else's memory the player
 * cannot read. Same filter as `reportInterruptions`: the player's own
 * character and whoever they are commanding. The witness is named only as the
 * player knows them, through `explainPropertyUse`.
 */
function reportWatched(): void {
  const notices = sim.watchedUses.splice(0, sim.watchedUses.length);
  const observer = sim.player;
  if (!observer) return;
  for (const notice of notices) {
    const person = sim.peopleById.get(notice.personId);
    if (!person) continue;
    const mine = person.isPlayer || person.id === commanding?.id;
    if (!mine) continue;
    renderer.floaters.push(person.x, person.y,
      t('Seen: {why}', { why: explainPropertyUse(observer, notice.use, sim.relationships) }),
      { color: '#e0b055', boxed: true, ttl: 3.4 });
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
/**
 * How many designs and recipes were open to the player last frame.
 *
 * The bars already re-read `availableDesigns` and `availableRecipes` every time
 * they render, so a newly proven technology *does* appear in them — silently,
 * in a menu that is closed. Watching the counts here is what turns that into
 * something the player can see, and it catches a technology picked up by being
 * taught just as well as one worked out, which watching `prove` would not.
 */
let lastDesignCount = -1;
let lastRecipeCount = -1;

function watchUnlocks(): void {
  const designs = sim.availableDesigns().length;
  if (lastDesignCount >= 0 && designs > lastDesignCount) hud.markNew('build');
  lastDesignCount = designs;

  const player = sim.player;
  const recipes = player ? sim.availableRecipes(player).length : 0;
  if (lastRecipeCount >= 0 && recipes > lastRecipeCount) hud.markNew('craft');
  lastRecipeCount = recipes;
}

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
    renderer.floaters.push(person.x, person.y, actionLabel(person.action, person.targetRecipe), {
      color: person.isPlayer ? '#ffd35c' : '#7fd4ff',
      boxed: person.isPlayer,
    });
  }

  // Notable deeds, but only the ones your character could actually have seen,
  // and named only as far as your character could name them. Announcing every
  // theft on the island would hand the player the omniscience the whole design
  // is built to withhold — and it is also how you get told about a murder
  // committed by someone you have never met, in a place you have never been.
  //
  // The one exception is a deed the player's own character did or suffered. The
  // actor always knows what they did, wherever they have walked since, so those
  // events are not filtered by the bystander's line of sight. And when nobody
  // saw it, that is the information the owner's rule exists to hand over: an
  // unseen robbery reaches the band only if somebody is told — which is exactly
  // why phase 3a made the victim want to go and tell.
  const observer = sim.player;
  for (const event of sim.social.recent) {
    if (event.id <= lastEventId) continue;
    lastEventId = event.id;
    if (!NOTABLE.has(event.type)) continue;
    if (!observer || !observer.alive) continue;

    const involved = event.actorId === observer.id || event.targetId === observer.id;
    if (!involved) {
      const dx = event.x - observer.x;
      const dy = event.y - observer.y;
      if (Math.sqrt(dx * dx + dy * dy) > sim.config.sightRadius) continue;
    }

    const actor = sim.peopleById.get(event.actorId);
    const victim = event.targetId === null ? null : sim.peopleById.get(event.targetId);
    if (!actor) continue;

    const actorName = knowledgeOfPerson(observer, actor, sim.relationships).displayName;
    const victimName = victim
      ? knowledgeOfPerson(observer, victim, sim.relationships).displayName
      : null;

    if (involved && event.witnesses === 0 && CRIMES.has(event.type)) {
      // The character was there and knows precisely who was looking. At this
      // moment the only people who know are the two actors in it, so "no one
      // else knows yet" is true for a victim — a few frames before any
      // conversation could have spread a word of it.
      const note = event.actorId === observer.id
        ? t('No one saw you do it.')
        : t('No one else knows yet.');
      renderer.floaters.push(observer.x, observer.y,
        describeEvent(event.type, actorName, victimName) + ' ' + note,
        { color: '#bfa0ff', boxed: true, ttl: 4 });
      continue;
    }
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
/**
 * How far the world is between the last completed step and the next one.
 *
 * Held outside `frame` so that it survives a paused frame. `accumulator` stops
 * moving while paused, and recomputing alpha from it would be fine — but the
 * catch-up branch below zeroes the accumulator, and an alpha of 0 there would
 * yank everybody back to where they were a step ago.
 */
let alpha = 1;

function syncActiveSimulation(keepWorldMap = false): void {
  if (sim === worldState.current) return;
  // A globe callback can replace the root owner outside the fixed-step loop.
  // Refresh before the next step so the parked simulation never receives a tick.
  sim = worldState.current;
  renderer.setSim(sim);
  newGame.setSim(sim);
  player = sim.player;
  selected = player ? { kind: 'person', person: player } : null;
  commanding = null;
  buildMode = false; craftMode = false;
  renderer.commandedId = null; renderer.buildGhost = null;
  renderer.floaters.clear(); lastActions.clear(); lastEventId = sim.social.recent.at(-1)?.id ?? 0;
  radial.close(); picker.close();
  // Commissioning replaces an owner in the same comarca. Keep its selected
  // destination on screen so the dispatch result remains visible.
  if(keepWorldMap) worldMap.update(sim); else worldMap.close();
  if (player) camera.snapTo(player.x, player.y);
  lastDesignCount = -1; lastRecipeCount = -1;
  hud.renderBuildBar(sim, false); hud.renderCraftBar(sim, player, false);
}

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
  syncActiveSimulation();
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
      // The rest of the world (phase 33a): a no-op between game days and on the classic island, which has no map.
      worldState.advancePeoples();
      syncActiveSimulation();
      // Inside the loop, not outside it: with the speed slider up this runs
      // several times a frame, and the previous position worth drawing from is
      // the one before the *last* step.
      renderer.interpolator.capture('person', sim.livingPeople());
      renderer.interpolator.capture('animal', sim.animals);
      accumulator -= stepDuration;
      stepsThisFrame++;
    }
    // Drop any backlog we could not work through, rather than carrying it into
    // the next frame and falling further behind every frame.
    if (stepsThisFrame === maxStepsPerFrame) {
      accumulator = 0;
      // A dropped backlog means the last step is the newest truth there is.
      // Deriving alpha from the zeroed accumulator would rewind the whole world
      // by one step at exactly the moment it is already struggling.
      alpha = 1;
    } else {
      // Clamped because the speed slider can change `stepDuration` underneath
      // an accumulator filled at the old rate.
      alpha = Math.max(0, Math.min(1, accumulator / stepDuration));
    }
  }

  if (selected?.kind === 'person' && !selected.person.alive && !sim.succession) {
    selected = sim.player && sim.player.alive ? { kind: 'person', person: sim.player } : null;
  }
  // The camera follows the *drawn* player, not the stepped one. Following the
  // simulation position instead would slide the world smoothly underneath a
  // character who was still jumping, which is worse than both halves alone.
  if (sim.player && sim.player.alive) {
    const at = renderer.interpolator.at('person', sim.player, alpha);
    camera.follow(at.x, at.y, delta);
  }
  camera.clampTo(sim.world.width, sim.world.height);

  renderer.commandedId = commanding && commanding.alive ? commanding.id : null;
  hud.setCommanding(commanding);
  succession.update(sim);
  verdictOverlay.update(sim);
  techWeb.update(sim);
  familyTree.update(sim);
  tribeGraph.update(sim);
  worldMap.update(sim);
  rivalButton.hidden = !sim.player;
  rivalButton.textContent = t('Rival households');
  if (rivalHouses.isOpen && sim.player && now - rivalRefreshedAt >= 250) { rivalHouses.update(rivalContext()); rivalRefreshedAt = now; }
  const journey = worldState.frontier.pendingJourney;
  journeyStatus.hidden = !journey;
  if (journey) {
    const ticksPerDay = worldState.current.config.time.ticksPerDay;
    const encounterText = journey.encounters.length ? journey.encounters.map(kind => { switch (kind) { case 'wildlife': return t('Wildlife encounter'); case 'storm': return t('Storm delay'); default: return t('Settlement sighted'); } }).join(', ') : t('No encounters');
    const journeyMode = (() => { switch (journey.transport.mode) { case 'foot': return t('On foot'); case 'sledge': return t('By sledge'); case 'cart': return t('By cart'); case 'pack': return t('With a pack animal'); case 'riding': return t('On horseback'); case 'boat': return t('By boat'); case 'sail': return t('Under sail'); } })();
    const journeyState = worldState.current.time.tick >= journey.arrivalTick ? (worldState.current.lastRefusal ? t('Arrival delayed: {reason}', { reason: worldState.current.lastRefusal }) : t('Arriving')) : t('Travelling');
    journeyStatus.textContent = t('{status}: {mode} journey to {x}, {y}; departs day {day}; {provisions} provisions ({preserved} shelf-stable); {cargo} cargo; {encounters}; {remaining} days remaining', {
      status: journeyState, mode: journeyMode, x: journey.destination.cx + 1, y: journey.destination.cy + 1,
      day: worldState.current.config.time.startDay + Math.floor(journey.departureTick / ticksPerDay),
      provisions: journey.provisions, preserved: journey.preservedProvisions, cargo: journey.cargoUnits, encounters: encounterText,
      remaining: Math.max(0, (journey.arrivalTick - worldState.current.time.tick) / ticksPerDay).toFixed(1),
    });
  }
  reportInterruptions();
  reportWatched();
  reportHelpCalls();
  reportAutonomyStall();
  reportInsights();
  watchUnlocks();
  updateFloaters();
  renderer.floaters.update(delta);
  renderer.render((
    selected === null ? null :
    selected.kind === 'person' ? { personId: selected.person.id } :
    selected.kind === 'node' ? { nodeId: selected.node.id } :
    selected.kind === 'tree' ? { treeId: selected.tree.id } :
    selected.kind === 'pile' ? { pileId: selected.pile.id } :
    selected.kind === 'corpse' ? { corpseId: selected.corpse.id } :
    selected.kind === 'animal' ? { animalId: selected.animal.id } :
    selected.kind === 'inscription' ? { inscriptionId: selected.inscription.id } :
    { buildingId: selected.building.id }
  ), alpha);
  hud.update(sim, selected);
  // Kept current while it is open: whether a recipe can be made depends on the
  // pack, and the pack changes while the bar is on screen. `renderCraftBar`
  // keeps its own digest and does nothing when nothing has changed.
  if (craftMode) hud.renderCraftBar(sim, sim.player, true);

  requestAnimationFrame(frame);
}

/**
 * A read-only handle on the running game, for the browser tests and for poking
 * around in the console. Dev builds only — it is stripped from a production
 * bundle, so it cannot become something the game itself depends on.
 */
if (import.meta.env.DEV) {
  // `sim` behind a getter, not copied into the object. The start screen can
  // replace the world before the first step, and a handle that had snapshotted
  // the boot world would go on describing an island that no longer exists —
  // silently, and to the browser tests as much as to the console.
  (window as unknown as Record<string, unknown>).__dynasty = {
    get sim() { return sim; },
    get worldState() { return worldState; },
    camera,
    renderer,
  };
}

requestAnimationFrame(frame);
