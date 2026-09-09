/**
 * The overlay: clock, speed, build menu, and the inspector panel.
 *
 * Everything the panel shows is filtered through what the player's own
 * character knows (see `sim/social/Knowledge.ts`). This is not decoration. The
 * whole design rests on reputation being *local* — held in the heads of people
 * who saw something or were told about it — and an inspector that reads out a
 * stranger's skills, temperament and life story hands the player exactly the
 * god's-eye view the simulation is built to withhold.
 *
 * For a person the panel has four tabs, because someone is four different
 * things depending on what you are asking:
 *
 *  - **Now** — needs, what they carry, and the utility score table. Knowing
 *    what someone wants is what you need in order to deal with them.
 *  - **Self** — skills and the temperament that weights their choices.
 *  - **Ties** — who they know, how warmly, and *why*: the opinion is split back
 *    into kinship, deeds, familiarity and the standing regard owed to their
 *    band, so "she dislikes him" always has a reason attached.
 *  - **Life** — not their diary, but *what you remember about them*, which is a
 *    very different and usually much shorter list.
 */
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import type { ResourceNode } from '../sim/entities/ResourceNode.ts';
import type { Building, BuildingDef } from '../sim/entities/Building.ts';
import type { Tree } from '../sim/entities/Tree.ts';
import type { ItemPile } from '../sim/entities/ItemPile.ts';
import type { Animal } from '../sim/entities/Animal.ts';
import type { Inscription } from '../sim/entities/Inscription.ts';
import { NEEDS, SKILLS, TRAITS } from '../sim/entities/Person.ts';
import { lastScores } from '../sim/ai/Brain.ts';
import { ITEMS } from '../sim/entities/Item.ts';
import { actionLabel } from '../render/Floaters.ts';
import {
  knowledgeOfPerson, knowledgeOfNode, knowledgeOfBuilding, knowledgeOfTree,
  rememberedAbout,
} from '../sim/social/Knowledge.ts';
import { TECH, TECH_EFFECTS, techPower, type Tech } from '../sim/knowledge/Tech.ts';
import { STAGE_LABELS } from '../sim/knowledge/Synthesis.ts';
import { missingIngredients } from '../sim/entities/Recipe.ts';
import { itemActions } from '../sim/ai/ActionCatalog.ts';
import { DEFAULT_CONFIG } from '../sim/core/Config.ts';
import { noticeRadius } from '../sim/systems/WildlifeSystem.ts';
import { workProgressOf } from '../sim/core/Progress.ts';
import { JOBS, type JobId } from '../sim/entities/Job.ts';

export type PanelTab = 'now' | 'self' | 'kit' | 'work' | 'ties' | 'life';

export type Selection =
  | { kind: 'person'; person: Person }
  | { kind: 'node'; node: ResourceNode }
  | { kind: 'building'; building: Building }
  | { kind: 'tree'; tree: Tree }
  | { kind: 'pile'; pile: ItemPile }
  | { kind: 'inscription'; inscription: Inscription }
  | { kind: 'animal'; animal: Animal };

export interface HudCallbacks {
  /** A verb chosen against one stack in the inspected person's pack. */
  onItemAction: (person: Person, itemId: string, action: string) => void;
  /** Enter or leave command mode for the selected person. */
  onCommand: (person: Person | null) => void;
  /** Move the camera to somebody named in the Ties tab. */
  onFocus: (person: Person) => void;
  onSpeedChange: (stepsPerSecond: number) => void;
  onTogglePause: () => void;
  onPossess: (person: Person) => void;
  onSelect: (person: Person) => void;
  onPickDesign: (def: BuildingDef | null) => void;
  /** A recipe chosen from the craft bar. Ordered against the player's own hands. */
  onCraft: (recipeId: string) => void;
  /** A job chosen from the Work tab, for the inspected person. Null clears it. */
  onAssignJob: (person: Person, job: JobId | null) => void;
  /**
   * The three modes the top bar can now reach.
   *
   * Build and Make were keys and nothing else, so the whole crafting half of
   * the game was invisible to anybody who had not read the help line — which is
   * itself hideable with `H`. The menu is the same argument for Escape.
   */
  onOpenMenu: () => void;
  onToggleBuild: () => void;
  onToggleCraft: () => void;
}

/** How long the panel keeps saying why the last order stopped. */
const STOP_NOTICE_MS = 6000;

const NEED_COLORS: Record<string, string> = {
  hunger: '#d98032',
  thirst: '#3f9fd8',
  fatigue: '#9a7fd8',
  cold: '#7fd4ff',
  company: '#d87fa8',
};

export class Hud {
  private root: HTMLElement;
  private clockEl!: HTMLElement;
  private statsEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private panelHeaderEl!: HTMLElement;
  private panelTitleEl!: HTMLElement;
  private panelBodyEl!: HTMLElement;
  private collapseButton!: HTMLButtonElement;
  private buildBarEl!: HTMLElement;
  private craftBarEl!: HTMLElement;
  /**
   * A digest of what the craft bar is showing, so it redraws only on a change.
   *
   * The bar is called every frame, because whether a recipe is makeable changes
   * as the pack does and a stale "you need 1 flint" is exactly the sort of lie
   * this pass exists to remove. Rebuilding `innerHTML` sixty times a second
   * detaches whatever the cursor is over before a hover or a click can land —
   * `TechWeb` learned this the hard way and Playwright reported it as "element
   * was detached from the DOM, retrying", a hundred times over.
   */
  private craftBarKey = '';
  private commandBarEl!: HTMLElement;
  private pauseButton!: HTMLButtonElement;
  private speedEl!: HTMLInputElement;
  private speedLabelEl!: HTMLElement;
  private buildButton!: HTMLButtonElement;
  private craftButton!: HTMLButtonElement;

  private tab: PanelTab = 'now';
  private activeDesign: BuildingDef | null = null;

  /**
   * The last reason an order stopped, and who it happened to.
   *
   * Held for a few seconds beside the action line. The floater on the map fades
   * in three; a player who looked away needs it to still be somewhere.
   */
  private lastStop: { personId: number; text: string; at: number } | null = null;

  /** Folded down to its header strip, so the map behind it is visible. */
  private collapsed = false;
  /** Every piece of chrome hidden at once. Not persisted: it is a look, not a setting. */
  private chromeHidden = false;

  /** What the panel was last built for, so it is rebuilt only when it changes. */
  private builtFor: string | null = null;
  private currentSim: Simulation | null = null;
  private currentSelection: Selection | null = null;

  constructor(
    container: HTMLElement,
    private readonly callbacks: HudCallbacks,
    /**
     * Steps per second the slider opens on. Passed in from the simulation's own
     * config rather than repeated here — it used to be written out in three
     * places, and they disagreed the moment one of them changed.
     */
    private readonly initialSpeed: number = DEFAULT_CONFIG.time.tickRate
  ) {
    this.root = container;
    this.collapsed = readFlag(COLLAPSED_KEY);
    this.build();
    this.delegate();
    this.applyChrome();
  }

  /**
   * Folds the character panel down to its header strip.
   *
   * The panel is 286px of opaque overlay pinned to the right edge, and the map
   * is the game. Mirrored to `localStorage` because a player who folds it away
   * has said something about how they want to play, and asking again on every
   * reload is the wrong answer.
   */
  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    writeFlag(COLLAPSED_KEY, this.collapsed);
    this.applyChrome();
  }

  /** Records why somebody's order stopped, for the panel's action line. */
  noteStop(personId: number, text: string): void {
    this.lastStop = { personId, text, at: performance.now() };
  }

  /** Hides every piece of HUD chrome at once, for the map and for screenshots. */
  toggleChrome(): void {
    this.chromeHidden = !this.chromeHidden;
    this.applyChrome();
  }

  private applyChrome(): void {
    this.root.classList.toggle('is-hidden', this.chromeHidden);
    this.panelEl.classList.toggle('is-collapsed', this.collapsed);
    if (this.collapseButton) this.collapseButton.textContent = this.collapsed ? '▸' : '▾';
  }

  private build(): void {
    this.root.innerHTML = '';

    const topBar = el('div', 'hud-bar');
    this.clockEl = el('span', 'hud-clock');
    this.statsEl = el('span', 'hud-stats');

    this.pauseButton = document.createElement('button');
    this.pauseButton.className = 'hud-button';
    this.pauseButton.textContent = 'Pause';
    this.pauseButton.onclick = () => this.callbacks.onTogglePause();

    const speed = document.createElement('input');
    speed.type = 'range';
    speed.min = '1';
    speed.max = '120';
    speed.value = String(this.initialSpeed);
    speed.className = 'hud-speed';
    this.speedEl = speed;

    const speedLabel = el('span', 'hud-speed-label');
    speedLabel.textContent = this.initialSpeed + '/s';
    this.speedLabelEl = speedLabel;
    speed.oninput = () => {
      this.callbacks.onSpeedChange(Number(speed.value));
      speedLabel.textContent = speed.value + '/s';
    };

    // Build, Make and the menu as buttons as well as keys. Until now the craft
    // bar could only be reached by pressing `M`, which is named in one line of
    // chrome that `H` hides — the owner reported the craft menu as missing, and
    // a menu nobody can find is missing whether or not it renders.
    const buildButton = document.createElement('button');
    this.buildButton = buildButton;
    buildButton.className = 'hud-button';
    buildButton.textContent = 'Build';
    buildButton.title = 'Place a structure (B)';
    buildButton.onclick = () => this.callbacks.onToggleBuild();

    const craftButton = document.createElement('button');
    this.craftButton = craftButton;
    craftButton.className = 'hud-button';
    craftButton.textContent = 'Make';
    craftButton.title = 'Craft something by hand (M)';
    craftButton.onclick = () => this.callbacks.onToggleCraft();

    const menuButton = document.createElement('button');
    menuButton.className = 'hud-button';
    menuButton.textContent = '⚙';
    menuButton.title = 'Menu and settings (Esc)';
    menuButton.onclick = () => this.callbacks.onOpenMenu();

    topBar.append(
      this.clockEl, this.statsEl, this.pauseButton, speed, speedLabel,
      buildButton, craftButton, menuButton);

    // The panel is a header strip plus a body, so collapsing it can leave the
    // strip in place: a panel that vanishes entirely gives the player nothing
    // to click to bring it back.
    this.panelEl = el('div', 'hud-panel');
    this.panelHeaderEl = el('div', 'hud-panel-head');
    this.panelTitleEl = el('span', 'hud-panel-title');
    this.panelTitleEl.textContent = 'Nothing selected';
    this.collapseButton = document.createElement('button');
    this.collapseButton.className = 'hud-collapse';
    this.collapseButton.textContent = '▾';
    this.collapseButton.title = 'Fold the panel away (P)';
    this.collapseButton.onclick = () => this.toggleCollapsed();
    this.panelHeaderEl.append(this.panelTitleEl, this.collapseButton);
    this.panelBodyEl = el('div', 'hud-panel-body');
    this.panelEl.append(this.panelHeaderEl, this.panelBodyEl);

    this.buildBarEl = el('div', 'hud-buildbar');
    // Its own bar rather than a second row inside the build bar: a structure is
    // placed on the map and a hand axe is not, so one bar would have carried two
    // different interactions under one heading.
    // Its own class, not `hud-buildbar` as well. Sharing the container class
    // made `.hud-buildbar` match two elements, which is a selector that can no
    // longer name either bar — Playwright called it a strict mode violation and
    // it would have been just as ambiguous in a stylesheet. The styling is
    // shared by naming both in the CSS instead.
    this.craftBarEl = el('div', 'hud-craftbar');
    this.craftBarEl.hidden = true;
    this.commandBarEl = el('div', 'hud-commandbar');
    this.commandBarEl.hidden = true;

    const help = el('div', 'hud-help');
    help.innerHTML =
      '<b>WASD</b> walk &middot; <b>drag</b> pan &middot; <b>F</b> re-centre &middot; ' +
      '<b>click</b> inspect &middot; <b>right-click</b> actions &middot; ' +
      '<b>B</b> build &middot; <b>M</b> make &middot; <b>C</b> command &middot; ' +
      '<b>G</b> tech web &middot; <b>K</b> family tree &middot; <b>T</b> tribe graph &middot; ' +
      '<b>P</b> fold panel &middot; <b>H</b> hide overlay &middot; <b>space</b> pause &middot; ' +
      '<b>Esc</b> menu';

    this.root.append(
      topBar, this.panelEl, this.buildBarEl, this.craftBarEl, this.commandBarEl, help);
  }

  /**
   * One listener on the panel, dispatching by data attribute.
   *
   * Wiring handlers onto each button after every render looks fine and is
   * quietly broken: the panel re-renders constantly, so a click can land on a
   * node that has already been replaced and the press does nothing at all.
   */
  private delegate(): void {
    this.panelEl.addEventListener('click', event => {
      const found = (event.target as HTMLElement)
        .closest('[data-tab], [data-person], [data-focus], [data-possess], ' +
          '[data-command], [data-verb], [data-job]');
      if (!found) return;
      const node = found as HTMLElement;

      if (node.dataset.job !== undefined && this.currentSelection?.kind === 'person') {
        const job = node.dataset.job === 'none' ? null : node.dataset.job as JobId;
        this.callbacks.onAssignJob(this.currentSelection.person, job);
        this.builtFor = null;
        return;
      }
      if (node.dataset.tab) {
        this.tab = node.dataset.tab as PanelTab;
        this.builtFor = null;
        return;
      }
      if (node.dataset.focus && this.currentSim) {
        const target = this.currentSim.peopleById.get(Number(node.dataset.focus));
        if (target && target.alive) this.callbacks.onFocus(target);
        return;
      }
      if (node.dataset.person && this.currentSim) {
        const other = this.currentSim.peopleById.get(Number(node.dataset.person));
        if (other && other.alive) this.callbacks.onSelect(other);
        return;
      }
      if (node.dataset.possess && this.currentSelection?.kind === 'person') {
        this.callbacks.onPossess(this.currentSelection.person);
        return;
      }
      if (node.dataset.command && this.currentSelection?.kind === 'person') {
        this.callbacks.onCommand(this.currentSelection.person);
        return;
      }
      if (node.dataset.verb && node.dataset.item && this.currentSelection?.kind === 'person') {
        this.callbacks.onItemAction(
          this.currentSelection.person, node.dataset.item, node.dataset.verb
        );
        // The pack changed, so the panel has to be rebuilt rather than refreshed.
        this.builtFor = null;
      }
    });
  }

  /**
   * Shows who the player is giving orders to.
   *
   * A persistent banner rather than a one-off message: command mode changes
   * what every right-click does, and a mode you cannot see is a mode you will
   * forget you are in.
   */
  setCommanding(person: Person | null): void {
    if (!person) {
      this.commandBarEl.hidden = true;
      this.commandBarEl.innerHTML = '';
      return;
    }
    this.commandBarEl.hidden = false;
    this.commandBarEl.innerHTML =
      '<b>Ordering ' + escapeHtml(person.name) + '</b> \u2014 right-click a target. ' +
      'Esc or C to stop.';
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause';
  }

  setTab(tab: PanelTab): void {
    if (this.tab === tab) return;
    this.tab = tab;
    this.builtFor = null;
  }

  // -------------------------------------------------------------------------
  // Build bar
  // -------------------------------------------------------------------------

  renderBuildBar(sim: Simulation, visible: boolean): void {
    if (!visible) {
      this.buildBarEl.innerHTML = '';
      this.buildBarEl.hidden = true;
      return;
    }
    this.buildBarEl.hidden = false;
    this.buildBarEl.innerHTML = '';
    this.buildButton.classList.remove('has-new');

    const title = el('div', 'hud-buildbar-title');
    title.textContent = 'Place a structure — click the map, Esc to cancel';
    this.buildBarEl.appendChild(title);

    const row = el('div', 'hud-buildbar-row');
    for (const def of sim.availableDesigns()) {
      const button = document.createElement('button');
      button.className = 'hud-design' + (this.activeDesign?.id === def.id ? ' is-active' : '');
      const cost = Object.entries(def.materials)
        .map(([id, n]) => n + ' ' + (ITEMS[id]?.label ?? id).toLowerCase())
        .join(', ') || 'no materials';
      button.innerHTML =
        '<span class="hud-design-icon">' + def.icon + '</span>' +
        '<span class="hud-design-name">' + escapeHtml(def.label) + '</span>' +
        '<span class="hud-design-cost">' + escapeHtml(cost) + '</span>';
      button.title = def.description;
      button.onclick = () => {
        this.activeDesign = this.activeDesign?.id === def.id ? null : def;
        this.callbacks.onPickDesign(this.activeDesign);
        this.renderBuildBar(sim, true);
      };
      row.appendChild(button);
    }
    this.buildBarEl.appendChild(row);

    const lockedDefs = sim.lockedDesigns();
    if (lockedDefs.length > 0) {
      const note = el('div', 'hud-buildbar-locked');
      // `TECH[...].label`, not the raw id: this line read "Granary (needs
      // pottery)" only because the ids happen to be English words, and would
      // have read "(needs clay_tablet)" the moment one of them was not.
      note.textContent = 'Not yet known: ' +
        lockedDefs.map(d => d.label + ' (needs ' +
          (d.requiresTech !== null
            ? TECH[d.requiresTech as Tech].label
            : 'nothing') + ')').join(', ');
      this.buildBarEl.appendChild(note);
    }
  }

  /**
   * Moves the speed slider from outside, without firing its own handler.
   *
   * The settings screen owns `time.tickRate` too, and the slider is built once
   * with `initialSpeed`: without this it would go on showing the old number
   * while the game ran at the new one, which is the same class of lie as a stale
   * ingredient list.
   */
  /**
   * Marks that something new can be built or made.
   *
   * A technology proved in the field already announces itself over the person
   * who worked it out, but the *consequence* of it lands in a bar the player has
   * no reason to open. Without this a discovery changes a menu nobody is looking
   * at, which from the outside is indistinguishable from changing nothing.
   */
  markNew(which: 'build' | 'craft'): void {
    (which === 'build' ? this.buildButton : this.craftButton)
      .classList.add('has-new');
  }

  setSpeed(value: number): void {
    this.speedEl.value = String(value);
    this.speedLabelEl.textContent = value + '/s';
  }

  clearDesign(): void {
    this.activeDesign = null;
  }

  // -------------------------------------------------------------------------
  // Craft bar
  // -------------------------------------------------------------------------

  /**
   * What the player can make with their own hands, and what they cannot yet.
   *
   * A deliberate copy of `renderBuildBar`'s shape rather than a shared generic
   * one: the two lists answer different questions of different objects, and the
   * only thing they share is a row of buttons. What they *do* share — the
   * "why can I not do this?" wording — comes from `missingIngredients` in the
   * simulation, so the greyed-out reason here is the same sentence the radial
   * menu gives.
   *
   * Unlike the build bar this is per person, because a recipe is gated on what
   * *this* pair of hands knows. See `Simulation.availableRecipes`.
   */
  renderCraftBar(sim: Simulation, person: Person | null, visible: boolean): void {
    if (!visible || !person) {
      this.craftBarEl.innerHTML = '';
      this.craftBarEl.hidden = true;
      this.craftBarKey = '';
      return;
    }

    const key = person.id + '|' + person.inventory.version + '|' +
      sim.availableRecipes(person).map(r => r.id).join(',');
    if (key === this.craftBarKey && this.craftBarEl.childElementCount > 0) return;
    this.craftBarKey = key;

    this.craftBarEl.hidden = false;
    this.craftBarEl.innerHTML = '';
    this.craftButton.classList.remove('has-new');

    const title = el('div', 'hud-buildbar-title');
    title.textContent = 'Make something — Esc to cancel';
    this.craftBarEl.appendChild(title);

    const row = el('div', 'hud-buildbar-row');
    const known = sim.availableRecipes(person);
    if (known.length === 0) {
      const none = el('div', 'hud-buildbar-locked');
      // Naming what it is waiting on, not just that it is empty. An empty bar
      // is indistinguishable from a bar that does not work — which is how the
      // owner reported it — and the standing rule is that when the game cannot
      // do something, the interface says why.
      const waiting = sim.lockedRecipes(person);
      none.textContent = waiting.length === 0
        ? 'There is nothing to make in this world.'
        : 'They have not worked out how to make anything yet. Every recipe ' +
          'below is waiting on a discovery.';
      this.craftBarEl.appendChild(none);
    }
    for (const recipe of known) {
      const button = document.createElement('button');
      const short = missingIngredients(person.inventory, recipe);
      button.className = 'hud-design' + (short === '' ? '' : ' is-disabled');
      const cost = Object.entries(recipe.ingredients)
        .map(([id, n]) => n + ' ' + (ITEMS[id]?.label ?? id).toLowerCase())
        .join(', ') || 'nothing';
      button.innerHTML =
        '<span class="hud-design-icon">' + recipe.icon + '</span>' +
        '<span class="hud-design-name">' + escapeHtml(recipe.label) + '</span>' +
        '<span class="hud-design-cost">' + escapeHtml(cost) + '</span>';
      // The standing rule: if it cannot be done, the interface says why.
      button.title = short === '' ? recipe.label : short;
      if (short === '') button.onclick = () => this.callbacks.onCraft(recipe.id);
      row.appendChild(button);
    }
    this.craftBarEl.appendChild(row);

    // Shown, not hidden, and named by their technology rather than its id. The
    // build bar's own reasoning: progression the player can see from the first
    // hut beats content that appears out of nowhere in a later age.
    const locked = sim.lockedRecipes(person);
    if (locked.length > 0) {
      const note = el('div', 'hud-buildbar-locked');
      note.textContent = 'Not yet known: ' +
        locked.map(r => r.label + ' (needs ' + TECH[r.tech].label + ')').join(', ');
      this.craftBarEl.appendChild(note);
    }
  }

  // -------------------------------------------------------------------------
  // Inspector
  // -------------------------------------------------------------------------

  update(sim: Simulation, selection: Selection | null): void {
    const stats = sim.stats();
    this.clockEl.textContent = sim.time.label();
    this.statsEl.textContent =
      stats.era + ' · ' + stats.population + ' alive · ' +
      stats.buildingsComplete + '/' + stats.buildings + ' built · step ' + stats.tick;

    this.currentSim = sim;
    this.currentSelection = selection;

    const observer = sim.player;
    if (!selection || !observer) {
      this.panelBodyEl.innerHTML = '<div class="hud-empty">Nothing selected.</div>';
      this.panelTitleEl.textContent = 'Nothing selected';
      this.builtFor = null;
      return;
    }

    const key = selectionKey(selection) + ':' + this.tab;
    if (this.builtFor !== key) {
      this.builtFor = key;
      this.renderPanel(observer, selection, sim);
    } else if (selection.kind === 'person') {
      this.refreshPerson(observer, selection.person, sim);
    } else {
      // Nodes and buildings change slowly and have no clickable innards, so a
      // straight redraw is simpler than patching values in place.
      this.renderPanel(observer, selection, sim);
    }
  }

  private renderPanel(observer: Person, selection: Selection, sim: Simulation): void {
    // The header names what is selected even when the body is folded away, so
    // a collapsed panel still says who you are looking at.
    this.panelTitleEl.textContent = panelTitle(observer, selection, sim);

    switch (selection.kind) {
      case 'person':
        this.panelBodyEl.innerHTML = this.personRows(observer, selection.person, sim).join('');
        break;
      case 'node':
        this.panelBodyEl.innerHTML = this.nodeRows(observer, selection.node, sim).join('');
        break;
      case 'building':
        this.panelBodyEl.innerHTML = this.buildingRows(observer, selection.building).join('');
        break;
      case 'tree':
        this.panelBodyEl.innerHTML = this.treeRows(observer, selection.tree).join('');
        break;
      case 'pile':
        this.panelBodyEl.innerHTML = this.pileRows(selection.pile, sim).join('');
        break;
      case 'inscription':
        this.panelBodyEl.innerHTML =
          this.recordRows(observer, selection.inscription, sim).join('');
        break;
      case 'animal':
        this.panelBodyEl.innerHTML = this.animalRows(observer, selection.animal).join('');
        break;
    }
  }

  /** Updates values inside an already-built person panel, touching no structure. */
  private refreshPerson(observer: Person, person: Person, sim: Simulation): void {
    const known = knowledgeOfPerson(observer, person, sim.relationships);

    const doing = this.panelBodyEl.querySelector('.hud-doing');
    if (doing) doing.innerHTML = this.doingLine(person);

    if (!known.knowsCondition) return;

    for (const row of this.panelBodyEl.querySelectorAll('[data-need]')) {
      const need = (row as HTMLElement).dataset.need as string;
      const raw = need === 'health'
        ? person.health
        : (person.needs as Record<string, number>)[need] ?? 0;
      const clamped = Math.max(0, Math.min(100, raw));
      const fill = row.querySelector('i') as HTMLElement | null;
      const readout = row.querySelector('.hud-need-value');
      if (fill) fill.style.width = clamped.toFixed(0) + '%';
      if (readout) readout.textContent = clamped.toFixed(0);
    }

    // The work bar is patched rather than rebuilt: it moves every tick, and
    // rebuilding the panel that often would fight every click landing in it.
    const work = this.panelBodyEl.querySelector('.hud-work');
    if (work) {
      const pct = Math.max(0, Math.min(100, (workProgressOf(person, sim) ?? 0) * 100));
      const fill = work.querySelector('i') as HTMLElement | null;
      const readout = work.querySelector('.hud-need-value');
      if (fill) fill.style.width = pct.toFixed(0) + '%';
      if (readout) readout.textContent = pct.toFixed(0);
    }

    const scoreHost = this.panelBodyEl.querySelector('.hud-scores');
    if (scoreHost) scoreHost.innerHTML = this.scoreRows(person).join('');
  }

  // -------------------------------------------------------------------------
  // People
  // -------------------------------------------------------------------------

  private personRows(observer: Person, person: Person, sim: Simulation): string[] {
    const known = knowledgeOfPerson(observer, person, sim.relationships);
    const band = sim.bands.find(b => b.id === person.bandId);
    const sameBand = person.bandId === observer.bandId;
    const rows: string[] = [];

    rows.push(
      '<div class="hud-name">' +
      escapeHtml(known.knowsName ? person.fullName : known.displayName) +
      (person.isPlayer ? ' <span class="hud-tag">you</span>' : '') + '</div>'
    );

    // A stranger's band is only obvious if it is your own; otherwise all you can
    // say is that they are not one of yours.
    const bandText = known.level === 'stranger'
      ? (sameBand ? escapeHtml(band?.name ?? '') : 'not of your band')
      : escapeHtml(band?.name ?? 'no band');
    rows.push(
      '<div class="hud-sub">' + person.sex + ', ' +
      (known.knowsName ? person.years + ' years' : 'about ' + roughAge(person)) +
      ' · ' + bandText + '</div>'
    );
    rows.push('<div class="hud-known">' + escapeHtml(known.because) + '</div>');
    rows.push('<div class="hud-doing">' + this.doingLine(person) + '</div>');

    const tabs: [PanelTab, string][] = [
      ['now', 'Now'], ['self', 'Self'], ['kit', 'Kit'], ['work', 'Work'],
      ['ties', 'Ties'], ['life', 'Life'],
    ];
    rows.push(
      '<div class="hud-tabs">' +
      tabs.map(([id, label]) =>
        '<button class="hud-tab' + (this.tab === id ? ' is-active' : '') +
        '" data-tab="' + id + '">' + label + '</button>'
      ).join('') +
      '</div>'
    );

    switch (this.tab) {
      case 'now': rows.push(...this.tabNow(person, known)); break;
      case 'self': rows.push(...this.tabSelf(person, known)); break;
      case 'kit': rows.push(...this.tabKit(observer, person, known, sim)); break;
      case 'work': rows.push(...this.tabWork(observer, person, known, sim)); break;
      case 'ties': rows.push(...this.tabTies(observer, person, known, sim)); break;
      case 'life': rows.push(...this.tabLife(observer, person, sim)); break;
    }

    if (!person.isPlayer) {
      rows.push('<button class="hud-button hud-possess" data-possess="1">Play as ' +
        escapeHtml(known.displayName) + '</button>');
    }
    return rows;
  }

  /**
   * What they are doing, and — briefly — why the last thing they were told to
   * do stopped.
   */
  private doingLine(person: Person): string {
    const stop = this.lastStop;
    const fresh = stop !== null && stop.personId === person.id &&
      performance.now() - stop.at < STOP_NOTICE_MS;
    return escapeHtml(actionLabel(person.action, person.targetRecipe)) +
      (person.order ? ' <span class="hud-ordered">ordered</span>' : '') +
      (fresh ? '<div class="hud-stopped">' + escapeHtml(stop!.text) + '</div>' : '');
  }

  private tabNow(person: Person, known: ReturnType<typeof knowledgeOfPerson>): string[] {
    const rows: string[] = [];
    rows.push('<div class="hud-section">Condition</div>');

    // Injury is visible on anyone — you can see that someone is hurt. The rest
    // of a person's condition is not written on their face.
    if (!known.knowsCondition) {
      rows.push('<div class="hud-sub">' + describeHealth(person.health) + '</div>');
      rows.push(veil('You would have to know them better to read how they are faring.'));
      return rows;
    }

    rows.push(bar('health', person.health, '#5cc98a', 'health'));
    for (const need of NEEDS) {
      rows.push(bar(need, person.needs[need], NEED_COLORS[need] ?? '#888', need));
    }

    const carried = person.inventory.entries();
    rows.push('<div class="hud-section">Carrying</div>');
    rows.push('<div class="hud-sub">' +
      (carried.length === 0
        ? 'nothing'
        : carried.map(([id, n]) => escapeHtml(ITEMS[id]?.label ?? id) + ' &times;' + n).join(', ')) +
      '</div>');

    // The same bar the renderer floats over the actor's head, in the panel that
    // claims to say what they are doing. A player watching a progress bar on the
    // map and a static panel beside it reasonably concludes one of them is lying
    // — and one of them was: this read `cycleProgress`, which is null for the
    // whole of felling and building, so the panel showed nothing at all for the
    // ninety seconds it takes to fell a tree by hand.
    const progress = this.currentSim ? workProgressOf(person, this.currentSim) : null;
    if (progress !== null) {
      rows.push('<div class="hud-section">Working</div>');
      rows.push(bar('progress', progress * 100, '#7fd4ff', undefined, 'hud-work'));
    }

    rows.push('<div class="hud-section">Wants to</div>');
    rows.push('<div class="hud-scores">' + this.scoreRows(person).join('') + '</div>');
    return rows;
  }

  private scoreRows(person: Person): string[] {
    const scores = lastScores.get(person.id) ?? [];
    if (scores.length === 0) return ['<div class="hud-sub">nothing in particular</div>'];
    const top = scores[0]!.score;
    return scores.map(entry => {
      const width = Math.max(2, (entry.score / top) * 100);
      return '<div class="hud-score"><span>' + escapeHtml(actionLabel(entry.id)) + '</span>' +
        '<span class="hud-score-track"><i style="width:' + width.toFixed(0) + '%"></i></span>' +
        '<span>' + entry.score.toFixed(2) + '</span></div>';
    });
  }

  /**
   * What somebody is carrying, and what can be done with it.
   *
   * Only actionable for your own character — you can look in a friend's pack
   * once you know them well enough, but the verbs are yours alone.
   */
  private tabKit(
    observer: Person,
    person: Person,
    known: ReturnType<typeof knowledgeOfPerson>,
    sim: Simulation
  ): string[] {
    const rows: string[] = [];
    const own = observer.id === person.id;

    if (!own && !known.knowsCondition) {
      return [
        '<div class="hud-section">Carrying</div>',
        veil('You cannot see what a stranger has in their pack.'),
      ];
    }

    const carried = person.inventory.entries();
    rows.push('<div class="hud-section">Carrying</div>');
    // Labelled as a percentage because that is what the bar's readout shows;
    // "load 45" beside a heading saying 18/40 just reads as a contradiction.
    rows.push(bar('% full', (person.carrying / person.carryCapacity) * 100,
      person.isLaden ? '#e0705c' : '#8ab4d8'));
    rows.push('<div class="hud-sub">' + person.carrying + ' of ' +
      person.carryCapacity + (person.isLaden ? ' — hands full' : '') + '</div>');

    if (carried.length === 0) {
      rows.push('<div class="hud-sub">Nothing at all.</div>');
      return rows;
    }

    const nearbyPerson = own
      ? sim.peopleHash.findNearest(person.x, person.y, 2.2, p => p.alive && p.id !== person.id)
      : null;
    const nearbyStore = own ? sim.storeWithinReach(person) : null;

    for (const [itemId, count] of carried) {
      const def = ITEMS[itemId];
      rows.push('<div class="hud-item">' +
        '<span class="hud-item-name">' + escapeHtml(def?.label ?? itemId) +
        ' <b>&times;' + count + '</b></span>' +
        (def && def.nutrition > 0
          ? '<span class="hud-item-note">' + def.nutrition + ' food</span>'
          : '<span class="hud-item-note"></span>') +
        '</div>');

      if (!own) continue;
      const verbs = itemActions(itemId, nearbyPerson, nearbyStore);
      rows.push('<div class="hud-item-verbs">' +
        verbs.map(v =>
          '<button class="hud-verb' + (v.enabled ? '' : ' is-disabled') + '"' +
          (v.enabled
            ? ' data-item="' + escapeHtml(itemId) + '" data-verb="' + v.id + '"'
            : ' title="' + escapeHtml(v.reason ?? '') + '"') +
          '>' + v.icon + ' ' + escapeHtml(v.label) + '</button>'
        ).join('') +
        '</div>');
    }
    return rows;
  }

  private tabSelf(person: Person, known: ReturnType<typeof knowledgeOfPerson>): string[] {
    if (!known.knowsCharacter) {
      return [
        '<div class="hud-section">Character</div>',
        veil('What someone is good at, and what they are like, you learn by ' +
          'spending time with them. Talk to them.'),
      ];
    }

    const rows: string[] = [];
    rows.push('<div class="hud-section">Skills</div>');
    for (const skill of [...SKILLS].sort((a, b) => person.skills[b] - person.skills[a])) {
      rows.push(bar(skill, person.skills[skill], '#8ab4d8'));
    }
    rows.push('<div class="hud-section">Temperament</div>');
    for (const trait of TRAITS) {
      rows.push(bar(trait, person.traits[trait] * 100, '#c8a45c'));
    }
    rows.push('<div class="hud-note">Temperament weights every choice they make. ' +
      'A greedy, disloyal person genuinely prefers taking to asking.</div>');

    // What they are working on now, before what they already know. An idea in
    // progress is the more interesting half: it has a story attached, it can
    // fail, and until this section existed the whole research lifecycle was
    // invisible from inside the game.
    rows.push('<div class="hud-section">Working on</div>');
    if (person.ideas.length === 0) {
      rows.push('<div class="hud-sub">nothing has occurred to them lately</div>');
    } else {
      for (const idea of person.ideas) {
        const def = TECH[idea.tech];
        if (!def) continue;
        rows.push('<div class="hud-know">' +
          '<b>' + escapeHtml(def.label) + ' \u2014 ' + STAGE_LABELS[idea.stage] + '</b>' +
          '<span>' + escapeHtml(idea.story) + '</span>' +
          '</div>');
        // Which bar depends on what is actually standing between them and
        // knowing it. While a design is on the bench that is the trials, not the
        // insight — insight barely moves then, so showing it would park a bar
        // for days while something was happening every morning.
        if (idea.stage === 'prototyped') {
          rows.push(bar('proving', idea.proof * 100, '#7ddc96'));
          rows.push('<div class="hud-sub">one built; ' +
            (idea.trials === 0
              ? 'not tried yet'
              : idea.trials + (idea.trials === 1 ? ' try' : ' tries') + ' so far') +
            '</div>');
        } else {
          rows.push(bar(idea.stage === 'proven' ? 'refining' : 'insight',
            idea.insight * 100, idea.stage === 'proven' ? '#7ddc96' : '#c88ad8'));
        }
        if (idea.failedTests > 0) {
          rows.push('<div class="hud-sub">' + idea.failedTests +
            (idea.failedTests === 1 ? ' try' : ' tries') + ' that did not work</div>');
        }
      }
      rows.push('<div class="hud-note">An idea has to be thought about, argued ' +
        'over, built and tried before it is knowledge. Any of those can fail.</div>');
    }

    rows.push('<div class="hud-section">Knows how to</div>');
    if (person.knownTech.size === 0) {
      rows.push('<div class="hud-sub">nothing anyone has had to work out yet</div>');
    } else {
      // What it is *for*, not just its name. A list of nouns told the player
      // nothing about why a dead potter mattered.
      for (const id of person.knownTech) {
        const def = TECH[id as Tech];
        if (!def) continue;
        // Pips, not a number. Refinement is a small integer with a per-tech
        // ceiling, and a filled circle against an empty one says "there is more
        // of this to be had" in a way that "2" does not.
        const level = person.techLevel.get(id) ?? 0;
        const pips = def.maxRefinement > 0
          ? ' <i class="hud-pips">' +
            '\u25CF'.repeat(level) + '\u25CB'.repeat(Math.max(0, def.maxRefinement - level)) +
            '</i>'
          : '';
        rows.push('<div class="hud-know">' +
          '<b>' + escapeHtml(def.label) + pips + '</b>' +
          '<span>' + escapeHtml(TECH_EFFECTS[def.id].summary) + '</span>' +
          '</div>');
      }
      rows.push('<div class="hud-note">Knowledge lives in people. Anything nobody ' +
        'alive knows is simply gone.</div>');
    }
    return rows;
  }

  /**
   * A standing job, and the option to give somebody a different one.
   *
   * Gated the same way `tabSelf` is: a job is something you learn about
   * somebody by spending time with them, not something written on their face.
   */
  private tabWork(
    observer: Person,
    person: Person,
    known: ReturnType<typeof knowledgeOfPerson>,
    sim: Simulation
  ): string[] {
    if (!known.knowsCharacter) {
      return [
        '<div class="hud-section">Work</div>',
        veil('What someone spends their days doing, you learn by spending time ' +
          'with them. Talk to them.'),
      ];
    }

    const rows: string[] = [];
    const current = person.job ? JOBS[person.job] : null;
    rows.push('<div class="hud-section">Work</div>');
    rows.push('<div class="hud-sub">' + (current
      ? 'Works as ' + current.label.toLowerCase() + '.'
      : 'Has no settled work — follows their own judgement.') + '</div>');

    if (observer.id !== person.id) {
      const standing = sim.standing(observer, person, 'job');
      rows.push(bar('would take work from you', standing.chance * 100,
        standing.chance > 0.5 ? '#5cc98a' : standing.chance > 0.25 ? '#e0b055' : '#e0705c'));
      rows.push('<div class="hud-sub">' + escapeHtml(standing.because) + '</div>');
    }

    rows.push('<div class="hud-section">Assign</div>');
    rows.push('<div class="hud-buildbar-row">' +
      Object.values(JOBS).map(job =>
        '<button class="hud-design' + (person.job === job.id ? ' is-active' : '') +
        '" data-job="' + job.id + '">' +
        '<span class="hud-design-icon">' + job.icon + '</span>' +
        '<span class="hud-design-name">' + escapeHtml(job.label) + '</span>' +
        '</button>'
      ).join('') +
      '<button class="hud-design' + (person.job === null ? ' is-active' : '') + '" data-job="none">' +
      '<span class="hud-design-icon">—</span><span class="hud-design-name">None</span>' +
      '</button></div>');

    rows.push('<div class="hud-note">' + escapeHtml(current
      ? 'Leans them toward ' + current.actions.map(a => actionLabel(a)).join(', ') + '.'
      : 'A settled job leans someone toward its own work and a little away ' +
        'from everything else — it is a preference, not a command.') + '</div>');
    return rows;
  }

  private tabTies(
    observer: Person,
    person: Person,
    known: ReturnType<typeof knowledgeOfPerson>,
    sim: Simulation
  ): string[] {
    const rows: string[] = [];
    const household = person.householdId === null
      ? null
      : sim.householdsById.get(person.householdId);
    const nameOf = (id: number | null) => {
      if (id === null) return null;
      const who = sim.peopleById.get(id);
      if (!who) return null;
      const label = knowledgeOfPerson(observer, who, sim.relationships).displayName;
      return label + (who.alive ? '' : ' †');
    };

    // What you could actually make them do. The pillar, stated plainly.
    if (person.id !== observer.id) {
      const standing = sim.standing(observer, person, 'build');
      rows.push('<div class="hud-section">Your standing</div>');
      rows.push(bar('would obey', standing.chance * 100,
        standing.chance > 0.5 ? '#5cc98a' : standing.chance > 0.25 ? '#e0b055' : '#e0705c'));
      rows.push('<div class="hud-sub">' + escapeHtml(standing.because) + '</div>');
      rows.push('<button class="hud-button hud-commandbtn" data-command="1">Command ' +
        escapeHtml(person.name) + '</button>');
    }

    // Family is gated: you do not know a stranger's children. Standing above is
    // not, because it is a fact about you rather than about them — you find out
    // whether somebody will do as you say by asking them.
    if (known.level === 'stranger') {
      rows.push(veil('You do not know their family, who they answer to, or who ' +
        'they cannot stand.'));
      return rows;
    }

    rows.push('<div class="hud-section">Family</div>');
    if (household) {
      rows.push('<div class="hud-sub">' + escapeHtml(household.name) + ' household' +
        (household.headId === person.id ? ' · <b>head</b>' : '') + '</div>');
    }
    const spouse = nameOf(person.spouseId);
    const mother = nameOf(person.motherId);
    const father = nameOf(person.fatherId);
    const children = person.childIds
      .map(id => nameOf(id))
      .filter((n): n is string => n !== null);

    rows.push('<div class="hud-sub">' +
      (spouse ? 'married to ' + escapeHtml(spouse) : 'unmarried') +
      (person.pregnant ? ' · expecting' : '') + '</div>');
    if (mother || father) {
      rows.push('<div class="hud-sub">born to ' +
        escapeHtml([mother, father].filter(Boolean).join(' and ')) + '</div>');
    }
    rows.push('<div class="hud-sub">' +
      (children.length === 0
        ? 'no children'
        : children.length + (children.length === 1 ? ' child: ' : ' children: ') +
          escapeHtml(children.join(', '))) +
      '</div>');

    if (!known.knowsTies) {
      rows.push(veil('You would have to know them better to say who they answer ' +
        'to, or who they cannot stand.'));
      return rows;
    }

    const ties = sim.relationships.knownBy(person.id).slice(0, 14);
    if (ties.length === 0) {
      rows.push('<div class="hud-section">Ties</div>' +
        '<div class="hud-sub">Knows nobody yet.</div>');
      return rows;
    }

    rows.push('<div class="hud-section">' + ties.length +
      (ties.length === 1 ? ' person' : ' people') + ' they know</div>');

    for (const tie of ties) {
      const other = sim.peopleById.get(tie.subjectId);
      if (!other) continue;
      // Names inside someone else's list are gated too: learning that Fenia has
      // an enemy does not tell you who the enemy is.
      const theirName = knowledgeOfPerson(observer, other, sim.relationships).displayName;
      const rel = tie.relationship;
      const positive = tie.opinion >= 0;
      const width = Math.min(50, Math.abs(tie.opinion) / 2);

      const parts: string[] = [];
      if (rel.bias !== 0) parts.push(rel.bias > 0 ? 'same band' : 'outsider');
      if (Math.abs(rel.deeds) >= 1) {
        parts.push((rel.deeds > 0 ? 'deeds +' : 'deeds ') + rel.deeds.toFixed(0));
      }
      if (rel.familiarity >= 1) parts.push('familiar ' + rel.familiarity.toFixed(0));
      if (rel.kinship !== 0) parts.push('kin ' + rel.kinship.toFixed(0));

      rows.push(
        '<div class="hud-tie">' +
        '<button class="hud-person-link" data-person="' + other.id + '">' +
          escapeHtml(theirName) + (other.alive ? '' : ' †') + '</button>' +
        // A name you cannot find on the map is a dead end. This moves the view,
        // and nothing else: what the knowledge layer withholds is a stranger's
        // name, skills, condition and history, none of which a camera position
        // touches — and the player can already pan anywhere on the island.
        (other.alive
          ? '<button class="hud-goto" data-focus="' + other.id +
            '" title="Look at ' + escapeHtml(theirName) + '">◎</button>'
          : '<span class="hud-goto is-gone">·</span>') +
        '<div class="hud-tie-meter">' +
          '<span class="hud-tie-neg">' +
            (positive ? '' : '<i style="width:' + width.toFixed(0) + '%;"></i>') + '</span>' +
          '<span class="hud-tie-pos">' +
            (positive ? '<i style="width:' + width.toFixed(0) + '%;"></i>' : '') + '</span>' +
        '</div>' +
        '<span class="hud-tie-value ' + (positive ? 'is-pos' : 'is-neg') + '">' +
          (positive ? '+' : '') + tie.opinion.toFixed(0) + '</span>' +
        '<div class="hud-tie-why">' + escapeHtml(parts.join(' · ') || 'barely acquainted') +
        '</div></div>'
      );
    }
    return rows;
  }

  private tabLife(observer: Person, person: Person, sim: Simulation): string[] {
    const rows: string[] = [];
    const own = observer.id === person.id;
    const nameOf = (id: number) => {
      const who = sim.peopleById.get(id);
      if (!who) return 'someone';
      return knowledgeOfPerson(observer, who, sim.relationships).displayName;
    };
    const entries = rememberedAbout(observer, person, nameOf);

    rows.push('<div class="hud-section">' +
      (own ? 'Life so far' : 'What you know of them') + '</div>');

    if (entries.length === 0) {
      rows.push(veil(own
        ? 'Nothing has happened to you yet.'
        : 'You have never seen them do anything, and nobody has told you a thing.'));
      return rows;
    }

    for (const entry of [...entries].slice(-40).reverse()) {
      const daysAgo = Math.floor((sim.time.tick - entry.tick) / sim.config.time.ticksPerDay);
      const when = own
        ? Math.floor(entry.ageDays / 80) + 'y'
        : (daysAgo <= 0 ? 'today' : daysAgo + 'd');
      rows.push(
        '<div class="hud-life hud-life-' + entry.kind + '">' +
        '<span class="hud-life-age">' + escapeHtml(when) + '</span>' +
        '<span class="hud-life-text">' + escapeHtml(entry.text) + '</span>' +
        '<span class="hud-life-when">' +
          (own ? (daysAgo <= 0 ? 'today' : daysAgo + 'd ago') : '') + '</span>' +
        '</div>'
      );
    }
    return rows;
  }

  // -------------------------------------------------------------------------
  // Things
  // -------------------------------------------------------------------------

  private nodeRows(observer: Person, node: ResourceNode, sim: Simulation): string[] {
    const known = knowledgeOfNode(observer, node);
    const rows: string[] = [];

    rows.push('<div class="hud-name">' +
      escapeHtml(NODE_LABELS[node.kind] ?? node.kind) + '</div>');
    rows.push('<div class="hud-sub">' + escapeHtml(sim.world.biomeAt(node.x, node.y)) +
      ' · ' + node.x + ',' + node.y + '</div>');
    rows.push('<div class="hud-known">' + escapeHtml(known.because) + '</div>');

    rows.push('<div class="hud-section">Yield</div>');
    rows.push('<div class="hud-doing">' + escapeHtml(known.estimate) + '</div>');
    if (known.amount !== null) {
      rows.push(bar('remaining', (node.amount / node.def.maxAmount) * 100, '#7ddc96'));
      rows.push('<div class="hud-sub">' + known.amount + ' of ' + node.def.maxAmount +
        ' · gives ' + escapeHtml(ITEMS[node.def.itemId]?.label ?? node.def.itemId) + '</div>');
    } else {
      rows.push(veil('Get closer, or learn the trade, to judge how much is left.'));
    }

    rows.push('<div class="hud-section">Regrowth</div>');
    rows.push('<div class="hud-sub">' +
      (node.def.regrowPerTick === 0
        ? 'Does not come back. Once it is gone, it is gone.'
        : 'Recovers with the seasons — barely at all in winter.') + '</div>');
    return rows;
  }

  /**
   * What a person can tell about an animal.
   *
   * Not routed through `sim/social/Knowledge.ts` the way people and bushes are,
   * and deliberately: the knowledge layer exists to withhold what is *private*
   * — a stranger's name, their skills, their history. A deer standing in a
   * field is none of those. What a hunter reads off it is whether it has seen
   * them, and that is legible to anyone with eyes.
   */
  private animalRows(observer: Person, animal: Animal): string[] {
    const rows: string[] = [];
    const distance = observer.distanceTo(animal);
    const notice = noticeRadius(animal, observer);

    rows.push('<div class="hud-name">' + escapeHtml(animal.label) + '</div>');
    rows.push('<div class="hud-sub">' +
      distance.toFixed(1) + ' tiles away · notices you at ' + notice.toFixed(1) +
      '</div>');
    rows.push('<div class="hud-doing">' +
      (animal.alarmed ? 'bolting' : distance <= notice ? 'has seen you' : 'grazing') +
      '</div>');

    rows.push('<div class="hud-section">The hunt</div>');
    const odds = Math.max(0.05, Math.min(0.9,
      observer.skillFactor('hunt') * (1 - animal.def.evasion) + 0.15
    ));
    rows.push(bar('your odds', odds * 100, odds > 0.5 ? '#7ddc96' : '#e0b055'));
    rows.push('<div class="hud-sub">' + animal.def.meat + ' meat if it goes well. ' +
      'Tracking is what closes the distance before it runs.</div>');
    return rows;
  }

  private treeRows(observer: Person, tree: Tree): string[] {
    const known = knowledgeOfTree(observer, tree);
    const rows: string[] = [];

    rows.push('<div class="hud-name">' + escapeHtml(tree.def.label) + '</div>');
    rows.push('<div class="hud-sub">' + escapeHtml(known.estimate) +
      ' &middot; ' + tree.x + ',' + tree.y + '</div>');
    rows.push('<div class="hud-known">' + escapeHtml(known.because) + '</div>');

    rows.push('<div class="hud-section">Growth</div>');
    rows.push(bar('grown', tree.maturity * 100, '#5cc98a'));
    if (known.years !== null) {
      rows.push('<div class="hud-sub">' + known.years + ' years old &middot; bears at ' +
        tree.def.maturityYears + ' &middot; dies around ' + tree.def.maxAgeYears + '</div>');
    } else {
      rows.push(veil('Age and timber are a woodsman judgement. Get closer, or learn to build.'));
    }

    if (tree.def.fruitItem) {
      rows.push('<div class="hud-section">Fruit</div>');
      const label = (ITEMS[tree.def.fruitItem]?.label ?? '').toLowerCase();
      rows.push('<div class="hud-sub">' +
        (known.fruit >= 1 ? known.fruit + ' ' + escapeHtml(label) : 'bare') +
        ' &middot; bears in ' + escapeHtml(tree.def.fruitSeasons.join(' and ')) + '</div>');
    }

    if (known.woodYield !== null) {
      rows.push('<div class="hud-section">Timber</div>');
      rows.push('<div class="hud-sub">' + known.woodYield + ' if felled now' +
        (tree.isMature ? '' : ' \u2014 worth far more grown') + '</div>');
      if (tree.chopProgress > 0) {
        rows.push(bar('cut',
          Math.min(100, (tree.chopProgress / tree.fellingTicks) * 100), '#d98032'));
      }
    }

    rows.push(veil('Felled trees do not come back. New ones only ever grow from seed ' +
      'cast by trees still standing.'));
    return rows;
  }

  /**
   * What a record says, to whoever is looking at it.
   *
   * Gated on literacy exactly as the action is, and that is the whole point of
   * the panel: an illiterate player character is told there are marks and not
   * what they say. Naming the technologies to somebody who cannot read them
   * would hand over the one thing writing is supposed to cost.
   */
  private recordRows(observer: Person, record: Inscription, sim: Simulation): string[] {
    const rows: string[] = [];
    const literate = techPower(observer, 'writing') > 0;
    const daysAgo = Math.floor((sim.time.tick - record.madeTick) / sim.config.time.ticksPerDay);

    rows.push('<div class="hud-name">' + escapeHtml(record.def.label) + '</div>');
    rows.push('<div class="hud-sub">' + record.x + ',' + record.y +
      ' · cut by ' + escapeHtml(record.authorName) +
      (daysAgo > 0 ? ' · ' + daysAgo + 'd ago' : ' · today') + '</div>');

    if (record.unfinished) {
      rows.push('<div class="hud-section">Half cut</div>');
      rows.push(bar('cut', record.cutProgress * 100, '#c9b06a'));
    }

    rows.push('<div class="hud-section">What it says</div>');
    if (record.techs.length === 0) {
      rows.push('<div class="hud-sub">nothing yet</div>');
    } else if (!literate) {
      rows.push('<div class="hud-sub">' + record.techs.length +
        (record.techs.length === 1 ? ' mark you cannot read' : ' marks you cannot read') +
        '</div>');
      rows.push(veil('A record is worth nothing to somebody who never learned to read it.'));
    } else {
      rows.push('<div class="hud-sub">' + record.techs
        .map(t => escapeHtml(TECH[t as Tech]?.label ?? t))
        .join(', ') + '</div>');
    }

    if (record.def.decayPerDay > 0) {
      rows.push(veil('Clay does not last. What is only here is not safe here.'));
    }
    return rows;
  }

  private pileRows(pile: ItemPile, sim: Simulation): string[] {
    const rows: string[] = [];
    const owner = pile.ownerId === null ? null : sim.peopleById.get(pile.ownerId);
    const daysAgo = Math.floor((sim.time.tick - pile.droppedTick) / sim.config.time.ticksPerDay);

    rows.push('<div class="hud-name">Dropped goods</div>');
    rows.push('<div class="hud-sub">' + pile.x + ',' + pile.y +
      (owner ? ' · left by ' + escapeHtml(owner.name) : '') +
      (daysAgo > 0 ? ' · ' + daysAgo + 'd ago' : ' · today') + '</div>');

    rows.push('<div class="hud-section">Contents</div>');
    const stacks = pile.contents.entries();
    if (stacks.length === 0) {
      rows.push('<div class="hud-sub">empty</div>');
    } else {
      rows.push('<div class="hud-sub">' + stacks
        .map(([id, n]) => escapeHtml(ITEMS[id]?.label ?? id) + ' &times;' + n)
        .join(', ') + '</div>');
    }
    rows.push(veil('Right-click it to pick it up. Anyone can.'));
    return rows;
  }

  private buildingRows(observer: Person, building: Building): string[] {
    const known = knowledgeOfBuilding(observer, building);
    const rows: string[] = [];

    rows.push('<div class="hud-name">' + building.def.icon + ' ' +
      escapeHtml(building.def.label) + '</div>');
    rows.push('<div class="hud-sub">' + escapeHtml(building.def.description) + '</div>');
    rows.push('<div class="hud-known">' + escapeHtml(known.because) + '</div>');

    if (!building.complete) {
      rows.push('<div class="hud-section">Under construction</div>');
      rows.push(bar('progress', building.completion * 100, '#e0b055'));
      rows.push('<div class="hud-section">Materials</div>');
      for (const [itemId, needed] of Object.entries(building.def.materials)) {
        const have = building.delivered.count(itemId);
        rows.push(
          '<div class="hud-need"><span>' +
          escapeHtml(ITEMS[itemId]?.label ?? itemId) + '</span>' +
          '<span class="hud-need-track"><i style="width:' +
          Math.min(100, (have / needed) * 100).toFixed(0) +
          '%;background:' + (have >= needed ? '#5cc98a' : '#d98032') + '"></i></span>' +
          '<span class="hud-need-value">' + have + '/' + needed + '</span></div>'
        );
      }
      return rows;
    }

    rows.push('<div class="hud-section">Finished</div>');
    if (building.def.shelter > 0) {
      rows.push('<div class="hud-sub">Shelter ' +
        (building.def.shelter * 100).toFixed(0) + '% — people inside stay warm.</div>');
    }
    if (building.def.storage > 0) {
      rows.push('<div class="hud-section">Store</div>');
      if (!known.knowsContents) {
        rows.push(veil('You have not looked inside.'));
      } else {
        const stored = building.store.entries();
        rows.push(bar('used', (building.store.total / building.def.storage) * 100, '#8ab4d8'));
        rows.push('<div class="hud-sub">' +
          (stored.length === 0
            ? 'empty'
            : stored.map(([id, n]) =>
                escapeHtml(ITEMS[id]?.label ?? id) + ' &times;' + n).join(', ')) +
          '</div>');
      }
    }
    return rows;
  }
}

const NODE_LABELS: Record<string, string> = {
  berries: 'Berry bush',
  flint: 'Flint outcrop',
  wood: 'Fallen wood',
  reeds: 'Reed bed',
  clay: 'Clay bank',
  fish: 'Fishing spot',
};

/** Where the panel's folded state is remembered between sessions. */
const COLLAPSED_KEY = 'dynasty.panelCollapsed';

/**
 * localStorage, defensively.
 *
 * A page opened from a file:// URL or in a private window can throw on the
 * first access, and losing a UI preference is never worth an exception that
 * stops the whole HUD from being built.
 */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Nothing to do: the preference simply does not persist.
  }
}

/** The header line: what is selected, named as far as the player can name it. */
function panelTitle(observer: Person, selection: Selection, sim: Simulation): string {
  switch (selection.kind) {
    case 'person': {
      const known = knowledgeOfPerson(observer, selection.person, sim.relationships);
      return known.knowsName ? selection.person.fullName : known.displayName;
    }
    case 'node': return selection.node.kind;
    case 'building': return selection.building.def.label;
    case 'tree': return selection.tree.def.label;
    case 'pile': return 'Dropped goods';
    case 'inscription': return selection.inscription.def.label;
    case 'animal': return selection.animal.label;
  }
}

export function selectionKey(selection: Selection): string {
  switch (selection.kind) {
    // The pack's version is part of a person's identity as far as the panel is
    // concerned. Without it the Kit tab is built once and never touched again:
    // `refreshPerson` patches only the action line, the need bars and the score
    // table, none of which the Kit tab has, so berries landed in the pack and
    // the panel went on saying what it said a minute ago.
    case 'person': return 'p' + selection.person.id +
      'v' + selection.person.inventory.version +
      // Whether there *is* a work bar, not how full it is: the row has to be
      // created and removed on a rebuild, but its width is patched every frame.
      (selection.person.action === 'chop' || selection.person.action === 'build' ||
        selection.person.cycleProgress !== null ? 'w1' : 'w0');
    case 'node': return 'n' + selection.node.id;
    case 'building': return 'b' + selection.building.id;
    case 'tree': return 't' + selection.tree.id;
    case 'pile': return 'i' + selection.pile.id;
    // The marks on it change as it is cut, and the reading of it changes with
    // who is looking, so both go in the key.
    case 'inscription': return 'r' + selection.inscription.id +
      'm' + selection.inscription.techs.length +
      (selection.inscription.unfinished ? 'u' : 'f');
    case 'animal': return 'a' + selection.animal.id;
  }
}

function roughAge(person: Person): string {
  const years = person.years;
  if (years < 14) return 'a child';
  if (years < 25) return 'twenty';
  if (years < 45) return 'thirty';
  return 'fifty';
}

function describeHealth(health: number): string {
  if (health > 90) return 'They look well enough.';
  if (health > 60) return 'They are carrying an injury.';
  if (health > 30) return 'They look badly hurt.';
  return 'They can barely stand.';
}

/**
 * The stages of an idea, in the player's words rather than the simulation's.
 *
 * `proven` reads as "refining" because from the outside that is what a proven
 * idea somebody is still working on *is* — the technology is already theirs and
 * what remains is making it better.
 */
function veil(text: string): string {
  return '<div class="hud-veil">' + escapeHtml(text) + '</div>';
}

function bar(label: string, value: number, color: string, need?: string, extra?: string): string {
  const pct = Math.max(0, Math.min(100, value));
  return (
    '<div class="hud-need' + (extra ? ' ' + extra : '') + '"' +
    (need ? ' data-need="' + need + '"' : '') + '>' +
    '<span>' + escapeHtml(label) + '</span>' +
    '<span class="hud-need-track"><i style="width:' + pct.toFixed(0) +
    '%;background:' + color + '"></i></span>' +
    '<span class="hud-need-value">' + pct.toFixed(0) + '</span></div>'
  );
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;' :
    ch === '>' ? '&gt;' :
    ch === '"' ? '&quot;' : '&#39;'
  );
}
