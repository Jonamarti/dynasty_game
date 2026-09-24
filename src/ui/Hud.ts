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
import { stageOf, type Corpse, type CorpseStage } from '../sim/entities/Corpse.ts';
import { isHeld, isBound } from '../sim/social/Defence.ts';
import type { Simulation } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import type { ResourceKind, ResourceNode } from '../sim/entities/ResourceNode.ts';
import { isStructure, type Building, type BuildingDef } from '../sim/entities/Building.ts';
import type { Tree } from '../sim/entities/Tree.ts';
import type { ItemPile } from '../sim/entities/ItemPile.ts';
import type { Animal } from '../sim/entities/Animal.ts';
import type { Inscription } from '../sim/entities/Inscription.ts';
import { NEEDS, SKILLS, TRAITS } from '../sim/entities/Person.ts';
import { MOOD_CHANNELS } from '../sim/core/Mood.ts';
import { MACROS, malnutrition, type Macro } from '../sim/core/Macros.ts';
import { lastScores } from '../sim/ai/Brain.ts';
import { ITEMS } from '../sim/entities/Item.ts';
import { actionLabel } from '../render/Floaters.ts';
import {
  knowledgeOfPerson, knowledgeOfNode, knowledgeOfBuilding, knowledgeOfTree, corpseIdentity,
  rememberedAbout, regardFromThem, regardReasons, type RegardContext, type RegardReason,
} from '../sim/social/Knowledge.ts';
import type { Relationship, RelationshipGraph } from '../sim/social/Relationships.ts';
import { foldRepeats } from './LifeLog.ts';
import { TECH, TECH_EFFECTS, techPower, type Tech } from '../sim/knowledge/Tech.ts';
import {
  STAGE_LABELS, PRACTICE_STAGE_LABELS, PROTOTYPE_AT, TRIES_TO_TEST,
} from '../sim/knowledge/Synthesis.ts';
import { missingIngredients } from '../sim/entities/Recipe.ts';
import { itemActions } from '../sim/ai/ActionCatalog.ts';
import { DEFAULT_CONFIG } from '../sim/core/Config.ts';
import { noticeRadius } from '../sim/systems/WildlifeSystem.ts';
import { workProgressOf } from '../sim/core/Progress.ts';
import { JOBS, type JobId } from '../sim/entities/Job.ts';
import {
  AUTONOMY_LABELS, AUTONOMY_NOTES, AUTONOMY_ORDER, type Autonomy,
} from '../sim/ai/Autonomy.ts';
import { t, tc, capitalise, genderOf } from '../i18n/i18n.ts';

export type PanelTab = 'now' | 'self' | 'kit' | 'work' | 'ties' | 'life';

export type Selection =
  | { kind: 'person'; person: Person }
  | { kind: 'node'; node: ResourceNode }
  | { kind: 'building'; building: Building }
  | { kind: 'tree'; tree: Tree }
  | { kind: 'pile'; pile: ItemPile }
  | { kind: 'corpse'; corpse: Corpse }
  | { kind: 'inscription'; inscription: Inscription }
  | { kind: 'animal'; animal: Animal };

export interface HudCallbacks {
  /**
   * A verb chosen against one stack in the inspected person's pack.
   *
   * Carries the click's screen position so `give`/`store` can anchor a
   * quantity or recipient popup where the player is already looking, the way
   * the entity picker anchors on the cursor that opened it.
   */
  onItemAction: (person: Person, itemId: string, action: string, screenX: number, screenY: number) => void;
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
  /** Open the partial-stack transfer window for a nearby store. */
  onTransfer: (building: Building) => void;
  /** Cancel an unfinished player-owned construction. */
  onCancelConstruction: (building: Building) => void;
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
  /** Touch-accessible counterparts to keyboard-only camera and graph commands. */
  onRecentre: () => void;
  onOpenTech: () => void;
  onOpenFamily: () => void;
  onOpenTribe: () => void;
  /**
   * A different answer to "how much does your character do for itself?".
   *
   * Three buttons rather than one that cycles, even though `R` cycles them,
   * because the middle state is the one nobody would guess exists — a cycling
   * button shows one label at a time and hides the fact that there is a choice
   * at all, and this setting decides whether the player's character can starve
   * while they read the tech web.
   */
  onAutonomy: (mode: Autonomy) => void;
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

const MACRO_COLORS: Record<Macro, string> = {
  fat: '#d8b35c',
  protein: '#c86a5c',
  carb: '#8ac86a',
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

  private autonomyBar!: HTMLElement;

  /** What the panel was last built for, so it is rebuilt only when it changes. */
  private builtFor: string | null = null;
  /** A building panel must stay attached long enough for its buttons to be clicked. */
  private panelStateKey = '';
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

  /**
   * Shows which autonomy state is in force.
   *
   * The HUD never decides this and never stores the authority for it — the
   * simulation holds the one copy — so this is display only, called after
   * whoever owns the change has made it. Two copies of a mode is how a button
   * ends up lying about what the game is doing.
   */
  setAutonomy(mode: Autonomy): void {
    for (const button of Array.from(this.autonomyBar.children) as HTMLElement[]) {
      button.classList.toggle('is-active', button.dataset.autonomy === mode);
    }
  }

  /**
   * Builds the chrome again in the current language.
   *
   * The top bar, the help line and the panel frame are written once, in
   * `build`, so a language switch has to throw them away. What they were
   * showing — the pause state, the speed, the autonomy mode — is handed back
   * in by the caller, which is the one that owns it.
   */
  relabel(paused: boolean, speed: number, autonomy: Autonomy): void {
    this.build();
    this.delegate();
    this.applyChrome();
    this.setPaused(paused);
    this.setSpeed(speed);
    this.setAutonomy(autonomy);
    this.builtFor = null;
    this.craftBarKey = '';
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
    this.pauseButton.textContent = t('Pause');
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
    buildButton.textContent = t('Build');
    buildButton.title = t('Place a structure (B)');
    buildButton.onclick = () => this.callbacks.onToggleBuild();

    const craftButton = document.createElement('button');
    this.craftButton = craftButton;
    craftButton.className = 'hud-button';
    craftButton.textContent = t('Make');
    craftButton.title = t('Craft something by hand (M)');
    craftButton.onclick = () => this.callbacks.onToggleCraft();

    const menuButton = document.createElement('button');
    menuButton.className = 'hud-button';
    menuButton.textContent = '⚙';
    menuButton.title = t('Menu and settings (Esc)');
    menuButton.onclick = () => this.callbacks.onOpenMenu();

    // How much the character does for itself, as a segmented control. In the
    // top bar and not in the settings screen because it is a thing the player
    // changes *during* play — switched on before opening the tech web and off
    // again before doing anything deliberate — and a preference buried two
    // screens deep would be found once and then forgotten.
    this.autonomyBar = el('div', 'hud-seg');
    this.autonomyBar.title = t('How much your character does for itself (R)');
    for (const mode of AUTONOMY_ORDER) {
      const button = document.createElement('button');
      button.className = 'hud-seg-button';
      button.dataset.autonomy = mode;
      button.textContent = t(AUTONOMY_LABELS[mode]);
      button.title = t(AUTONOMY_NOTES[mode]);
      button.onclick = () => this.callbacks.onAutonomy(mode);
      this.autonomyBar.appendChild(button);
    }
    this.setAutonomy('manual');

    // Keyboard shortcuts are not shortcuts on a phone: they are missing
    // features. This row is hidden on desktop and gives touch screens the four
    // map-level commands that otherwise have no reachable control.
    const mobileTools = el('div', 'hud-mobile-tools');
    const mobileTool = (label: string, title: string, action: () => void): HTMLButtonElement => {
      const button = document.createElement('button');
      button.className = 'hud-button hud-mobile-tool';
      button.textContent = label;
      button.title = title;
      button.onclick = action;
      return button;
    };
    mobileTools.append(
      mobileTool('⌾ ' + t('Centre'), t('Re-centre on your character'), () => this.callbacks.onRecentre()),
      mobileTool(t('Tech'), t('Technology web'), () => this.callbacks.onOpenTech()),
      mobileTool(t('Family'), t('Family tree'), () => this.callbacks.onOpenFamily()),
      mobileTool(t('Tribe'), t('Tribe graph'), () => this.callbacks.onOpenTribe()),
    );

    topBar.append(
      this.clockEl, this.statsEl, this.pauseButton, speed, speedLabel,
      buildButton, craftButton, this.autonomyBar, menuButton, mobileTools);

    // The panel is a header strip plus a body, so collapsing it can leave the
    // strip in place: a panel that vanishes entirely gives the player nothing
    // to click to bring it back.
    this.panelEl = el('div', 'hud-panel');
    this.panelHeaderEl = el('div', 'hud-panel-head');
    this.panelTitleEl = el('span', 'hud-panel-title');
    this.panelTitleEl.textContent = t('Nothing selected');
    this.collapseButton = document.createElement('button');
    this.collapseButton.className = 'hud-collapse';
    this.collapseButton.textContent = '▾';
    this.collapseButton.title = t('Fold the panel away (P)');
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
      // One key per phrase, so the translation of one binding cannot drift
      // out of step with its key letter.
      '<span class="hud-help-desktop">' + [
        ['WASD', t('walk')], [t('drag'), t('pan')], ['F', t('re-centre')],
        [t('click'), t('inspect')], [t('right-click'), t('actions')],
        ['B', t('build')], ['M', t('make')], ['C', t('command')],
        ['G', t('tech web')], ['K', t('family tree')], ['T', t('tribe graph')],
        ['R', t('who steers')],
        ['P', t('fold panel')], ['H', t('hide overlay')], [t('space'), t('pause')],
        ['Esc', t('menu')],
      ].map(([key, what]) => '<b>' + key + '</b> ' + what).join(' &middot; ') + '</span>' +
      '<span class="hud-help-touch">' + [
        [t('Tap'), t('inspect')], [t('hold'), t('actions')], [t('drag'), t('pan')],
      ].map(([key, what]) => '<b>' + key + '</b> ' + what).join(' &middot; ') + '</span>';

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
        '[data-command], [data-verb], [data-job], [data-transfer], [data-cancel-construction]');
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
      if (node.dataset.transfer && this.currentSelection?.kind === 'building') {
        this.callbacks.onTransfer(this.currentSelection.building);
        return;
      }
      if (node.dataset.cancelConstruction && this.currentSelection?.kind === 'building') {
        this.callbacks.onCancelConstruction(this.currentSelection.building);
        return;
      }
      if (node.dataset.verb && node.dataset.item && this.currentSelection?.kind === 'person') {
        this.callbacks.onItemAction(
          this.currentSelection.person, node.dataset.item, node.dataset.verb,
          event.clientX, event.clientY
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
      '<b>' + escapeHtml(t('Ordering {name}', { name: person.name })) + '</b> \u2014 ' +
      t('right-click a target. Esc or C to stop.');
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? t('Resume') : t('Pause');
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
    title.textContent = t('Place a structure — click the map, Esc to cancel');
    this.buildBarEl.appendChild(title);

    const row = el('div', 'hud-buildbar-row');
    for (const def of sim.availableDesigns()) {
      const button = document.createElement('button');
      button.className = 'hud-design' + (this.activeDesign?.id === def.id ? ' is-active' : '');
      const cost = Object.entries(def.materials)
        .map(([id, n]) => n + ' ' + t(ITEMS[id]?.label ?? id).toLowerCase())
        .join(', ') || t('no materials');
      button.innerHTML =
        '<span class="hud-design-icon">' + def.icon + '</span>' +
        '<span class="hud-design-name">' + escapeHtml(t(def.label)) + '</span>' +
        '<span class="hud-design-cost">' + escapeHtml(cost) + '</span>';
      button.title = t(def.description);
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
      note.textContent = t('Not yet known: {list}', {
        list: lockedDefs.map(d => t('{thing} (needs {tech})', {
          thing: t(d.label),
          tech: d.requiresTech !== null ? t(TECH[d.requiresTech as Tech].label) : t('nothing'),
        })).join(', '),
      });
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
    title.textContent = t('Make something — Esc to cancel');
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
        ? t('There is nothing to make in this world.')
        : t('They have not worked out how to make anything yet. Every recipe below is waiting on a discovery.');
      this.craftBarEl.appendChild(none);
    }
    for (const recipe of known) {
      const button = document.createElement('button');
      const short = missingIngredients(person.inventory, recipe);
      button.className = 'hud-design' + (short === '' ? '' : ' is-disabled');
      const cost = Object.entries(recipe.ingredients)
        .map(([id, n]) => n + ' ' + t(ITEMS[id]?.label ?? id).toLowerCase())
        .join(', ') || t('nothing');
      button.innerHTML =
        '<span class="hud-design-icon">' + recipe.icon + '</span>' +
        '<span class="hud-design-name">' + escapeHtml(t(recipe.label)) + '</span>' +
        '<span class="hud-design-cost">' + escapeHtml(cost) + '</span>';
      // The standing rule: if it cannot be done, the interface says why.
      button.title = short === '' ? t(recipe.label) : short;
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
      note.textContent = t('Not yet known: {list}', {
        list: locked.map(r => t('{thing} (needs {tech})', {
          thing: t(r.label), tech: t(TECH[r.tech].label),
        })).join(', '),
      });
      this.craftBarEl.appendChild(note);
    }
  }

  // -------------------------------------------------------------------------
  // Inspector
  // -------------------------------------------------------------------------

  update(sim: Simulation, selection: Selection | null): void {
    const stats = sim.stats();
    this.clockEl.textContent = sim.time.label();
    this.statsEl.textContent = t('{era} · {alive} alive · {built}/{buildings} built · step {tick}', {
      era: t(stats.era), alive: stats.population,
      built: stats.buildingsComplete, buildings: stats.buildings, tick: stats.tick,
    });

    this.currentSim = sim;
    this.currentSelection = selection;

    const observer = sim.player;
    if (!selection || !observer) {
      this.panelBodyEl.innerHTML = '<div class="hud-empty">' + t('Nothing selected.') + '</div>';
      this.panelTitleEl.textContent = t('Nothing selected');
      this.builtFor = null;
      return;
    }

    const key = selectionKey(selection) + ':' + this.tab;
    const stateKey = key + (selection.kind === 'building'
      ? ':' + this.buildingStateKey(selection.building)
      : '');
    if (this.builtFor !== key || this.panelStateKey !== stateKey) {
      this.builtFor = key;
      this.panelStateKey = stateKey;
      this.renderPanel(observer, selection, sim);
    } else if (selection.kind === 'person') {
      this.refreshPerson(observer, selection.person, sim);
    } else if (selection.kind !== 'building') {
      // Piles, nodes and trees can change without their inspector having a
      // clickable control; keep their existing live redraw behaviour. A
      // building is the exception: rebuilding it every frame detaches the
      // transfer/cancel button before a click can land on it.
      this.renderPanel(observer, selection, sim);
    }
  }

  private buildingStateKey(building: Building): string {
    return [building.complete, building.ruined, building.store.version,
      building.delivered.version, Math.floor(building.completion * 20)].join(':');
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
        this.panelBodyEl.innerHTML =
          this.buildingRows(observer, selection.building, sim).join('');
        break;
      case 'tree':
        this.panelBodyEl.innerHTML = this.treeRows(observer, selection.tree).join('');
        break;
      case 'pile':
        this.panelBodyEl.innerHTML = this.pileRows(selection.pile, sim).join('');
        break;
      case 'corpse':
        this.panelBodyEl.innerHTML = this.corpseRows(observer, selection.corpse, sim).join('');
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
    if (doing) doing.innerHTML = this.doingLine(person, sim);

    if (!known.knowsCondition) return;

    for (const row of this.panelBodyEl.querySelectorAll('[data-need]')) {
      const need = (row as HTMLElement).dataset.need as string;
      const raw = need === 'health'
        ? person.health
        : need.startsWith('macro_')
          ? person.macroBalance[need.slice(6) as Macro] * 100
          : (person.needs as Record<string, number>)[need] ?? 0;
      const clamped = Math.max(0, Math.min(100, raw));
      const fill = row.querySelector('i') as HTMLElement | null;
      const readout = row.querySelector('.hud-need-value');
      if (fill) fill.style.width = clamped.toFixed(0) + '%';
      if (readout) readout.textContent = clamped.toFixed(0);
    }

    const today = this.panelBodyEl.querySelector('.hud-diet-today');
    if (today) today.textContent = describeEatenToday(person);

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
      (person.isPlayer ? ' <span class="hud-tag">' + t('you') + '</span>' : '') + '</div>'
    );

    // A stranger's band is only obvious if it is your own; otherwise all you can
    // say is that they are not one of yours.
    // M11 phase 15d: a captive is of their captors' band and plainly not one
    // of them — obvious to that band, and to anybody who knows them.
    const captive = person.captiveOf !== null && (sameBand || known.level !== 'stranger');
    const bandText = captive
      ? escapeHtml(t('captive of the {band}', { band: band?.name ?? '' }))
      : known.level === 'stranger'
      ? (sameBand ? escapeHtml(band?.name ?? '') : t('not of your band'))
      : escapeHtml(band?.name ?? t('no band'));
    rows.push(
      '<div class="hud-sub">' + tc('sex', person.sex) + ', ' +
      (known.knowsName
        ? t('{n} years', { n: person.years })
        : person.years < 14 ? t('about a child') : t('about {age}', { age: roughAge(person) })) +
      ' · ' + bandText + '</div>'
    );
    rows.push('<div class="hud-known">' + escapeHtml(known.because) + '</div>');
    rows.push('<div class="hud-doing">' + this.doingLine(person, sim) + '</div>');

    const tabs: [PanelTab, string][] = [
      ['now', tc('tab', 'Now')], ['self', tc('tab', 'Self')], ['kit', tc('tab', 'Kit')],
      ['work', tc('tab', 'Work')], ['ties', tc('tab', 'Ties')], ['life', tc('tab', 'Life')],
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
      rows.push('<button class="hud-button hud-possess" data-possess="1">' +
        escapeHtml(t('Play as {name}', { name: known.displayName })) + '</button>');
    }
    return rows;
  }

  /**
   * What they are doing, and — briefly — why the last thing they were told to
   * do stopped.
   *
   * For the player's own character it also says when the character is acting on
   * its own rather than on an order, and when it is trying to and cannot. The
   * top bar says which state is switched on; this says what the state is
   * actually *doing*, which is a different question — "Acts alone" on a button
   * and a character walking off to talk to somebody only line up if the player
   * can see them line up.
   */
  private doingLine(person: Person, sim: Simulation): string {
    const stop = this.lastStop;
    const fresh = stop !== null && stop.personId === person.id &&
      performance.now() - stop.at < STOP_NOTICE_MS;
    const alone = person.isPlayer && person.order === null && sim.autonomy !== 'manual';
    const stall = person.isPlayer ? sim.autonomyStall : null;
    // M11 phase 15b-c: held down or tied up is what somebody is doing, in so
    // far as they are doing anything — visible on anyone, like an injury.
    const tick = sim.time.tick;
    const pinned = isBound(person, tick) ? t('tied up')
      : isHeld(person, tick) ? t('held down') : null;
    if (pinned) return escapeHtml(pinned) +
      (fresh ? '<div class="hud-stopped">' + escapeHtml(stop!.text) + '</div>' : '');
    return escapeHtml(actionLabel(person.action, person.targetRecipe, person.talkMode)) +
      (person.order ? ' <span class="hud-ordered">' + t('ordered') + '</span>' : '') +
      (alone ? ' <span class="hud-alone">' +
        escapeHtml(t(AUTONOMY_LABELS[sim.autonomy]).toLowerCase()) + '</span>' : '') +
      (stall ? '<div class="hud-stopped">' + escapeHtml(stall) + '</div>' : '') +
      (fresh ? '<div class="hud-stopped">' + escapeHtml(stop!.text) + '</div>' : '');
  }

  private tabNow(person: Person, known: ReturnType<typeof knowledgeOfPerson>): string[] {
    const rows: string[] = [];
    rows.push('<div class="hud-section">' + t('Condition') + '</div>');

    // Injury is visible on anyone — you can see that someone is hurt. The rest
    // of a person's condition is not written on their face.
    if (!known.knowsCondition) {
      rows.push('<div class="hud-sub">' + describeHealth(person.health) + '</div>');
      rows.push(veil(t('You would have to know them better to read how they are faring.')));
      return rows;
    }

    rows.push(bar(tc('bar', 'health'), person.health, '#5cc98a', 'health'));
    for (const need of NEEDS) {
      rows.push(bar(tc('bar', need), person.needs[need], NEED_COLORS[need] ?? '#888', need));
    }

    // M11 phase 8e. Malnutrition (8d) caps health recovery invisibly unless
    // something says so here — the standing rule this project already keeps
    // for `interruption`/`abandon` refusals applies just as much to a health
    // mechanism nobody asked for and nobody can see.
    //
    // M11 phase 12a. The bars are *shares* of what has lately been eaten, and
    // move only at midnight (`decayMacroBalance`), so a meal never visibly
    // fills them — the owner's note read them as stores that eating should
    // top up. The header says what they are, and the "today" line underneath
    // is the thing that does answer a meal. Both carry a `data-need` key so
    // `refreshPerson` patches them; before this they changed only when the
    // whole panel happened to be rebuilt.
    rows.push('<div class="hud-section">' + t('Diet · share of recent meals') + '</div>');
    for (const macro of MACROS) {
      rows.push(bar(tc('bar', macro), person.macroBalance[macro] * 100, MACRO_COLORS[macro], 'macro_' + macro));
    }
    rows.push('<div class="hud-note hud-diet-today">' + escapeHtml(describeEatenToday(person)) + '</div>');
    rows.push('<div class="hud-note">' + escapeHtml(describeDiet(person)) + '</div>');

    const carried = person.inventory.entries();
    rows.push('<div class="hud-section">' + t('Carrying') + '</div>');
    rows.push('<div class="hud-sub">' +
      (carried.length === 0
        ? t('nothing')
        : carried.map(([id, n]) => escapeHtml(t(ITEMS[id]?.label ?? id)) + ' &times;' + n).join(', ')) +
      '</div>');

    // The same bar the renderer floats over the actor's head, in the panel that
    // claims to say what they are doing. A player watching a progress bar on the
    // map and a static panel beside it reasonably concludes one of them is lying
    // — and one of them was: this read `cycleProgress`, which is null for the
    // whole of felling and building, so the panel showed nothing at all for the
    // ninety seconds it takes to fell a tree by hand.
    const progress = this.currentSim ? workProgressOf(person, this.currentSim) : null;
    if (progress !== null) {
      rows.push('<div class="hud-section">' + t('Working') + '</div>');
      rows.push(bar(tc('bar', 'progress'), progress * 100, '#7fd4ff', undefined, 'hud-work'));
    }

    rows.push('<div class="hud-section">' + t('Wants to') + '</div>');
    rows.push('<div class="hud-scores">' + this.scoreRows(person).join('') + '</div>');
    return rows;
  }

  private scoreRows(person: Person): string[] {
    const scores = lastScores.get(person.id) ?? [];
    if (scores.length === 0) return ['<div class="hud-sub">' + t('nothing in particular') + '</div>'];
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
        '<div class="hud-section">' + t('Carrying') + '</div>',
        veil(t('You cannot see what a stranger has in their pack.')),
      ];
    }

    const carried = person.inventory.entries();
    rows.push('<div class="hud-section">' + t('Carrying') + '</div>');
    // Labelled as a percentage because that is what the bar's readout shows;
    // "load 45" beside a heading saying 18/40 just reads as a contradiction.
    rows.push(bar(tc('bar', '% full'), (person.carrying / person.carryCapacity) * 100,
      person.isLaden ? '#e0705c' : '#8ab4d8'));
    rows.push('<div class="hud-sub">' +
      t('{n} of {max}', { n: person.carrying, max: person.carryCapacity }) +
      (person.isLaden ? ' — ' + t('hands full') : '') + '</div>');

    if (carried.length === 0) {
      rows.push('<div class="hud-sub">' + t('Nothing at all.') + '</div>');
      return rows;
    }

    // A count, not the nearest one — see `itemActions`'s own note on why.
    const nearby = own
      ? sim.peopleHash.queryRadius(person.x, person.y, 2.2).filter(p => p.alive && p.id !== person.id)
      : [];
    const soleRecipientName = nearby.length === 1
      ? knowledgeOfPerson(observer, nearby[0]!, sim.relationships).displayName
      : null;
    const nearbyStore = own ? sim.storeWithinReach(person) : null;

    for (const [itemId, count] of carried) {
      const def = ITEMS[itemId];
      rows.push('<div class="hud-item">' +
        '<span class="hud-item-name">' + escapeHtml(t(def?.label ?? itemId)) +
        ' <b>&times;' + count + '</b></span>' +
        (def && def.nutrition > 0
          ? '<span class="hud-item-note">' + t('{n} food', { n: def.nutrition }) + '</span>'
          : '<span class="hud-item-note"></span>') +
        '</div>');

      if (!own) continue;
      const verbs = itemActions(itemId, nearby.length, soleRecipientName, nearbyStore);
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
        '<div class="hud-section">' + t('Character') + '</div>',
        veil(t('What someone is good at, and what they are like, you learn by spending time with them. Talk to them.')),
      ];
    }

    const rows: string[] = [];
    rows.push('<div class="hud-section">' + t('Skills') + '</div>');
    for (const skill of [...SKILLS].sort((a, b) => person.skills[b] - person.skills[a])) {
      rows.push(bar(tc('skill', skill), person.skills[skill], '#8ab4d8'));
    }
    rows.push('<div class="hud-section">' + t('Temperament') + '</div>');
    for (const trait of TRAITS) {
      rows.push(bar(tc('trait', trait), person.traits[trait] * 100, '#c8a45c'));
    }
    rows.push('<div class="hud-note">' +
      t('Temperament weights every choice they make. A greedy, disloyal person genuinely prefers taking to asking.') +
      '</div>');

    // Mood: four channels on a -100..100 scale, shown at rest around the middle
    // of the bar rather than the bottom. Nothing reads these yet (M9.6 phase
    // 4a is inert scaffolding), but the inspector is where the migration's own
    // discipline says the field has to show up the moment it exists.
    rows.push('<div class="hud-section">' + t('Mood') + '</div>');
    for (const channel of MOOD_CHANNELS) {
      rows.push(bar(tc('mood', channel), (person.mood[channel] + 100) / 2, '#8ac8a0'));
    }
    rows.push('<div class="hud-note">' +
      t('How their spirits are riding, resting toward a point their temperament sets.') + '</div>');

    // What they are working on now, before what they already know. An idea in
    // progress is the more interesting half: it has a story attached, it can
    // fail, and until this section existed the whole research lifecycle was
    // invisible from inside the game.
    rows.push('<div class="hud-section">' + t('Working on') + '</div>');
    if (person.ideas.length === 0) {
      rows.push('<div class="hud-sub">' + t('nothing has occurred to them lately') + '</div>');
    } else {
      for (const idea of person.ideas) {
        const def = TECH[idea.tech];
        if (!def) continue;
        const stages = def.kind === 'practice' ? PRACTICE_STAGE_LABELS : STAGE_LABELS;
        rows.push('<div class="hud-know">' +
          '<b>' + escapeHtml(t(def.label)) + ' \u2014 ' + t(stages[idea.stage]) + '</b>' +
          '<span>' + escapeHtml(t(idea.story, { g: genderOf(person) })) + '</span>' +
          '</div>');
        // Which bar depends on what is actually standing between them and
        // knowing it. While a design is on the bench that is the trials, not the
        // insight — insight barely moves then, so showing it would park a bar
        // for days while something was happening every morning.
        if (idea.stage === 'prototyped') {
          rows.push(bar(tc('bar', 'proving'), idea.proof * 100, '#7ddc96'));
          rows.push('<div class="hud-sub">' +
            (def.kind === 'practice' ? t('in use; ') : t('one built; ')) +
            (idea.trials === 0
              ? t('not tried yet')
              : idea.trials === 1
                ? t('{n} try so far', { n: 1 })
                : t('{n} tries so far', { n: idea.trials })) +
            '</div>');
        } else {
          rows.push(bar(idea.stage === 'proven' ? tc('bar', 'refining') : tc('bar', 'insight'),
            idea.insight * 100, idea.stage === 'proven' ? '#7ddc96' : '#c88ad8'));
          // A practice past the point of being worth trying is already being
          // tried, and this is the only place that says so. Without it the
          // panel would show an insight bar sitting still while the thing it
          // measures had stopped being what stands in the way.
          if (def.kind === 'practice' && idea.stage === 'researching' &&
              idea.insight >= PROTOTYPE_AT) {
            rows.push('<div class="hud-sub">' +
              t('trying it out: {n} of {max} times so far', {
                n: Math.min(idea.tries, TRIES_TO_TEST), max: TRIES_TO_TEST,
              }) + '</div>');
          }
        }
        if (idea.failedTests > 0) {
          rows.push('<div class="hud-sub">' + (idea.failedTests === 1
            ? t('{n} try that did not work', { n: 1 })
            : t('{n} tries that did not work', { n: idea.failedTests })) + '</div>');
        }
      }
      rows.push('<div class="hud-note">' +
        t('An idea has to be thought about, argued over, built and tried before it is knowledge. Any of those can fail.') +
        '</div>');
    }

    rows.push('<div class="hud-section">' + t('Knows how to') + '</div>');
    if (person.knownTech.size === 0) {
      rows.push('<div class="hud-sub">' + t('nothing anyone has had to work out yet') + '</div>');
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
          '<b>' + escapeHtml(t(def.label)) + pips + '</b>' +
          '<span>' + escapeHtml(t(TECH_EFFECTS[def.id].summary)) + '</span>' +
          '</div>');
      }
      rows.push('<div class="hud-note">' +
        t('Knowledge lives in people. Anything nobody alive knows is simply gone.') + '</div>');
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
        '<div class="hud-section">' + t('Work') + '</div>',
        veil(t('What someone spends their days doing, you learn by spending time with them. Talk to them.')),
      ];
    }

    const rows: string[] = [];
    const current = person.job ? JOBS[person.job] : null;
    rows.push('<div class="hud-section">' + t('Work') + '</div>');
    rows.push('<div class="hud-sub">' + (current
      ? t('Works as {job}.', { job: t(current.label).toLowerCase() })
      : t('Has no settled work — follows their own judgement.')) + '</div>');

    if (observer.id !== person.id) {
      const standing = sim.standing(observer, person, 'job');
      rows.push(bar(t('would take work from you'), standing.chance * 100,
        standing.chance > 0.5 ? '#5cc98a' : standing.chance > 0.25 ? '#e0b055' : '#e0705c'));
      rows.push('<div class="hud-sub">' + escapeHtml(standing.because) + '</div>');
    }

    rows.push('<div class="hud-section">' + t('Assign') + '</div>');
    rows.push('<div class="hud-buildbar-row">' +
      Object.values(JOBS).map(job =>
        '<button class="hud-design' + (person.job === job.id ? ' is-active' : '') +
        '" data-job="' + job.id + '">' +
        '<span class="hud-design-icon">' + job.icon + '</span>' +
        '<span class="hud-design-name">' + escapeHtml(t(job.label)) + '</span>' +
        '</button>'
      ).join('') +
      '<button class="hud-design' + (person.job === null ? ' is-active' : '') + '" data-job="none">' +
      '<span class="hud-design-icon">—</span><span class="hud-design-name">' + t('None') + '</span>' +
      '</button></div>');

    rows.push('<div class="hud-note">' + escapeHtml(current
      ? t('Leans them toward {list}.', { list: current.actions.map(a => actionLabel(a)).join(', ') })
      : t('A settled job leans someone toward its own work and a little away from everything else — it is a preference, not a command.')) + '</div>');
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

    // M11 phase 13b (owner's note 5): what the two of you think of each
    // other, first. Clicking somebody used to show their family, their ties
    // and how far they would obey you, but not what *you* think of *them* --
    // that lived only in your own list, which cuts at fourteen.
    if (person.id !== observer.id) rows.push(...this.betweenYou(observer, person, sim));

    // What you could actually make them do. The pillar, stated plainly.
    if (person.id !== observer.id) {
      const standing = sim.standing(observer, person, 'build');
      rows.push('<div class="hud-section">' + t('Your standing') + '</div>');
      rows.push(bar(t('would obey'), standing.chance * 100,
        standing.chance > 0.5 ? '#5cc98a' : standing.chance > 0.25 ? '#e0b055' : '#e0705c'));
      rows.push('<div class="hud-sub">' + escapeHtml(standing.because) + '</div>');
      rows.push('<button class="hud-button hud-commandbtn" data-command="1">' +
        escapeHtml(t('Command {name}', { name: person.name })) + '</button>');
    }

    // Family is gated: you do not know a stranger's children. Standing above is
    // not, because it is a fact about you rather than about them — you find out
    // whether somebody will do as you say by asking them.
    if (known.level === 'stranger') {
      rows.push(veil(t('You do not know their family, who they answer to, or who they cannot stand.')));
      return rows;
    }

    rows.push('<div class="hud-section">' + t('Family') + '</div>');
    if (household) {
      rows.push('<div class="hud-sub">' + escapeHtml(t('{name} household', { name: household.name })) +
        (household.headId === person.id ? ' · <b>' + t('head') + '</b>' : '') + '</div>');
    }
    const spouse = nameOf(person.spouseId);
    const mother = nameOf(person.motherId);
    const father = nameOf(person.fatherId);
    const children = person.childIds
      .map(id => nameOf(id))
      .filter((n): n is string => n !== null);

    const g = { g: genderOf(person) };
    rows.push('<div class="hud-sub">' +
      (spouse ? escapeHtml(t('married to {name}', { name: spouse, ...g })) : t('unmarried', g)) +
      (person.pregnant ? ' · ' + t('expecting') : '') + '</div>');
    if (mother || father) {
      rows.push('<div class="hud-sub">' + escapeHtml(t('born to {parents}', {
        parents: [mother, father].filter(Boolean).join(t(' and ')), ...g,
      })) + '</div>');
    }
    rows.push('<div class="hud-sub">' +
      (children.length === 0
        ? t('no children')
        : escapeHtml(children.length === 1
          ? t('{n} child: {names}', { n: 1, names: children.join(', ') })
          : t('{n} children: {names}', { n: children.length, names: children.join(', ') }))) +
      '</div>');

    if (!known.knowsTies) {
      rows.push(veil(t('You would have to know them better to say who they answer to, or who they cannot stand.')));
      return rows;
    }

    // M11 phase 13c (owner's note 14): the living first, the dead folded
    // away underneath. `knownBy` ranks by strength of feeling and never asked
    // who was alive, so a dead parent at +80 pushed a living neighbour out of
    // the fourteen. The fold survives the panel being refreshed: a person's
    // panel is rebuilt only when the selection or the tab changes (everything
    // else is `refreshPerson`), so an opened list stays open.
    const everyone = sim.relationships.knownBy(person.id);
    const living = everyone.filter(t => sim.peopleById.get(t.subjectId)?.alive).slice(0, 14);
    const dead = everyone.filter(t => !sim.peopleById.get(t.subjectId)?.alive).slice(0, 14);
    if (living.length === 0 && dead.length === 0) {
      rows.push('<div class="hud-section">' + t('Ties') + '</div>' +
        '<div class="hud-sub">' + t('Knows nobody yet.') + '</div>');
      return rows;
    }

    rows.push('<div class="hud-section">' + (living.length === 1
      ? t('{n} person they know', { n: 1 })
      : t('{n} people they know', { n: living.length })) + '</div>');
    rows.push(...this.tieRows(observer, living, sim));
    if (dead.length > 0) {
      rows.push('<details class="hud-dead"><summary>' +
        t('{n} dead they remember', { n: dead.length }) +
        '</summary>' + this.tieRows(observer, dead, sim).join('') + '</details>');
    }
    return rows;
  }

  /** One row per tie, for the living list and the folded list of the dead. */
  private tieRows(
    observer: Person,
    ties: ReturnType<RelationshipGraph['knownBy']>,
    sim: Simulation
  ): string[] {
    const rows: string[] = [];
    for (const tie of ties) {
      const other = sim.peopleById.get(tie.subjectId);
      if (!other) continue;
      // Names inside someone else's list are gated too: learning that Fenia has
      // an enemy does not tell you who the enemy is.
      const theirName = knowledgeOfPerson(observer, other, sim.relationships).displayName;
      const rel = tie.relationship;

      const parts = tieParts(rel);

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
            '" title="' + escapeHtml(t('Look at {name}', { name: theirName })) + '">◎</button>'
          : '<span class="hud-goto is-gone">·</span>') +
        tieMeter(tie.opinion) +
        '<div class="hud-tie-why">' + escapeHtml(parts.join(' · ') || t('barely acquainted')) +
        '</div></div>'
      );
    }
    return rows;
  }

  /**
   * Your own opinion of `person`, broken down in the same terms as the list
   * below — read with `peek`, so looking never creates an acquaintance — and
   * what you can tell of theirs of you, which is their private state and so
   * comes through `regardFromThem`.
   */
  private betweenYou(observer: Person, person: Person, sim: Simulation): string[] {
    const rows: string[] = ['<div class="hud-section">' + t('Between you') + '</div>'];
    // M12 phase 3c (owner's note 7): not only how warm, but why. The reasons
    // are filtered in `regardReasons`, which knows what of *their* opinion
    // the player's character could have found out.
    const ctx: RegardContext = {
      relationships: sim.relationships,
      nameOf: id => {
        const who = sim.peopleById.get(id);
        return who ? knowledgeOfPerson(observer, who, sim.relationships).displayName : t('someone');
      },
      weigh: (holder, actor, entry) =>
        sim.social.deedDelta(holder, actor, entry, entry.firsthand, entry.confidence),
      tick: sim.time.tick,
      ticksPerDay: sim.config.time.ticksPerDay,
    };
    const mine = sim.relationships.peek(observer.id, person.id);
    if (!mine) {
      rows.push('<div class="hud-sub">' + t('You have no opinion of them yet.') + '</div>');
    } else {
      const opinion = sim.relationships.opinion(observer.id, person.id);
      rows.push(
        '<div class="hud-tie hud-between">' +
        '<span class="hud-between-who">' + t('You of them') + '</span>' +
        tieMeter(opinion) +
        '<div class="hud-tie-why">' + escapeHtml(tieParts(mine).join(' · ') || t('barely acquainted')) +
        '</div></div>'
      );
      rows.push(reasonList(regardReasons(observer, observer, person, ctx)));
    }
    const theirs = regardFromThem(observer, person, sim.relationships);
    // Only where `regardFromThem` lets the player read the opinion at all:
    // a reason for a feeling you cannot see would give the feeling away.
    const theirReasons = theirs.words === null ? [] : regardReasons(observer, person, observer, ctx);
    if (theirs.opinion !== null) {
      rows.push(
        '<div class="hud-tie hud-between">' +
        '<span class="hud-between-who">' + t('They of you') + '</span>' +
        tieMeter(theirs.opinion) +
        '<div class="hud-tie-why">' + escapeHtml(theirs.words ?? '') + '</div></div>'
      );
      rows.push(reasonList(theirReasons));
    } else if (theirs.words !== null) {
      rows.push('<div class="hud-sub">' + escapeHtml(theirs.words) + '</div>');
      rows.push(reasonList(theirReasons));
    } else {
      rows.push('<div class="hud-sub">' + t('You cannot tell what they think of you.') + '</div>');
    }
    return rows;
  }

  private tabLife(observer: Person, person: Person, sim: Simulation): string[] {
    const rows: string[] = [];
    const own = observer.id === person.id;
    const nameOf = (id: number) => {
      const who = sim.peopleById.get(id);
      if (!who) return t('someone');
      return knowledgeOfPerson(observer, who, sim.relationships).displayName;
    };
    const entries = rememberedAbout(observer, person, nameOf);

    // M11 phase 16e: a death being looked into — the player's own, because
    // who somebody else suspects is theirs to keep.
    if (own && person.investigation) {
      const open = person.investigation;
      const daysLeft = Math.max(0, Math.ceil((open.untilTick - sim.time.tick) / sim.config.time.ticksPerDay));
      rows.push('<div class="hud-section">' + t('Looking into a death') + '</div>');
      rows.push('<div class="hud-sub">' + escapeHtml(t('who killed {name}: {n} asked so far, {d}d left', {
        name: nameOf(open.deadId), n: open.asked.size, d: daysLeft,
      })) + '</div>');
    }

    rows.push('<div class="hud-section">' +
      (own ? t('Life so far') : t('What you know of them')) + '</div>');

    if (entries.length === 0) {
      rows.push(veil(own
        ? t('Nothing has happened to you yet.')
        : t('You have never seen them do anything, and nobody has told you a thing.')));
      return rows;
    }

    // Folded before the cut, so the forty are forty *stories* and one busy
    // afternoon at a rival's store cannot push a whole life off the panel.
    // See `LifeLog.ts` for why this happens here and not in the chronicle.
    const daysAgoOf = (tick: number) =>
      Math.floor((sim.time.tick - tick) / sim.config.time.ticksPerDay);
    const ago = (days: number) => days <= 0 ? t('today') : t('{n}d', { n: days });
    for (const run of foldRepeats(entries).slice(-40).reverse()) {
      const entry = run.last;
      const daysAgo = daysAgoOf(entry.tick);
      const firstAgo = daysAgoOf(run.first.tick);
      const when = own
        ? t('{n}y', { n: Math.floor(entry.ageDays / 80) })
        : ago(daysAgo);
      // The span of a run, when it covers more than one day: "5d–today".
      const span = firstAgo !== daysAgo ? ago(firstAgo) + '–' + ago(daysAgo) : null;
      rows.push(
        '<div class="hud-life hud-life-' + entry.kind + '">' +
        '<span class="hud-life-age">' + escapeHtml(when) + '</span>' +
        '<span class="hud-life-text">' + escapeHtml(entry.text) +
          (run.count > 1 ? ' <b class="hud-life-count">×' + run.count + '</b>' : '') + '</span>' +
        '<span class="hud-life-when">' +
          (own
            ? (span ?? (daysAgo <= 0 ? t('today') : t('{n}d ago', { n: daysAgo })))
            : (span && run.count > 1 ? span : '')) + '</span>' +
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
      escapeHtml(t(NODE_LABELS[node.kind])) + '</div>');
    rows.push('<div class="hud-sub">' + escapeHtml(tc('biome', sim.world.biomeAt(node.x, node.y))) +
      ' · ' + node.x + ',' + node.y + '</div>');
    rows.push('<div class="hud-known">' + escapeHtml(known.because) + '</div>');

    rows.push('<div class="hud-section">' + t('Yield') + '</div>');
    rows.push('<div class="hud-doing">' + escapeHtml(known.estimate) + '</div>');
    if (known.amount !== null) {
      rows.push(bar(tc('bar', 'remaining'), (node.amount / node.def.maxAmount) * 100, '#7ddc96'));
      rows.push('<div class="hud-sub">' + escapeHtml(t('{n} of {max} · gives {item}', {
        n: known.amount, max: node.def.maxAmount, item: t(ITEMS[node.def.itemId]?.label ?? node.def.itemId),
      })) + '</div>');
    } else {
      rows.push(veil(t('Get closer, or learn the trade, to judge how much is left.')));
    }

    rows.push('<div class="hud-section">' + t('Regrowth') + '</div>');
    rows.push('<div class="hud-sub">' +
      (node.def.regrowPerTick === 0
        ? t('Does not come back. Once it is gone, it is gone.')
        : t('Recovers with the seasons — barely at all in winter.')) + '</div>');
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

    rows.push('<div class="hud-name">' + escapeHtml(t(animal.label)) + '</div>');
    rows.push('<div class="hud-sub">' +
      t('{d} tiles away · notices you at {n}', { d: distance.toFixed(1), n: notice.toFixed(1) }) +
      '</div>');
    rows.push('<div class="hud-doing">' +
      (animal.alarmed ? t('bolting') : distance <= notice ? t('has seen you') : t('grazing')) +
      '</div>');

    rows.push('<div class="hud-section">' + t('The hunt') + '</div>');
    const odds = Math.max(0.05, Math.min(0.9,
      observer.skillFactor('hunt') * (1 - animal.def.evasion) + 0.15
    ));
    rows.push(bar(t('your odds'), odds * 100, odds > 0.5 ? '#7ddc96' : '#e0b055'));
    rows.push('<div class="hud-sub">' +
      t('{n} meat if it goes well. Tracking is what closes the distance before it runs.', { n: animal.def.meat }) +
      '</div>');
    return rows;
  }

  private treeRows(observer: Person, tree: Tree): string[] {
    const known = knowledgeOfTree(observer, tree);
    const rows: string[] = [];

    rows.push('<div class="hud-name">' + escapeHtml(t(tree.def.label)) + '</div>');
    rows.push('<div class="hud-sub">' + escapeHtml(known.estimate) +
      ' &middot; ' + tree.x + ',' + tree.y + '</div>');
    rows.push('<div class="hud-known">' + escapeHtml(known.because) + '</div>');

    rows.push('<div class="hud-section">' + t('Growth') + '</div>');
    rows.push(bar(tc('bar', 'grown'), tree.maturity * 100, '#5cc98a'));
    if (known.years !== null) {
      rows.push('<div class="hud-sub">' + t('{n} years old &middot; bears at {bears} &middot; dies around {dies}', {
        n: known.years, bears: tree.def.maturityYears, dies: tree.def.maxAgeYears,
      }) + '</div>');
    } else {
      rows.push(veil(t('Age and timber are a woodsman judgement. Get closer, or learn to build.')));
    }

    if (tree.def.fruitItem) {
      rows.push('<div class="hud-section">' + t('Fruit') + '</div>');
      const label = t(ITEMS[tree.def.fruitItem]?.label ?? '').toLowerCase();
      rows.push('<div class="hud-sub">' +
        (known.fruit >= 1 ? known.fruit + ' ' + escapeHtml(label) : t('bare')) +
        ' &middot; ' + escapeHtml(t('bears in {seasons}', {
          seasons: tree.def.fruitSeasons.map(s => tc('season', s)).join(t(' and ')),
        })) + '</div>');
    }

    if (known.woodYield !== null) {
      rows.push('<div class="hud-section">' + t('Timber') + '</div>');
      rows.push('<div class="hud-sub">' + t('{n} if felled now', { n: known.woodYield }) +
        (tree.isMature ? '' : ' \u2014 ' + t('worth far more grown')) + '</div>');
      if (tree.chopProgress > 0) {
        rows.push(bar(tc('bar', 'cut'),
          Math.min(100, (tree.chopProgress / tree.fellingTicks) * 100), '#d98032'));
      }
    }

    rows.push(veil(t('Felled trees do not come back. New ones only ever grow from seed cast by trees still standing.')));
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

    rows.push('<div class="hud-name">' + escapeHtml(t(record.def.label)) + '</div>');
    rows.push('<div class="hud-sub">' + record.x + ',' + record.y +
      ' · ' + escapeHtml(t('cut by {name}', { name: record.authorName })) +
      (daysAgo > 0 ? ' · ' + t('{n}d ago', { n: daysAgo }) : ' · ' + t('today')) + '</div>');

    if (record.unfinished) {
      rows.push('<div class="hud-section">' + t('Half cut') + '</div>');
      rows.push(bar(tc('bar', 'cut'), record.cutProgress * 100, '#c9b06a'));
    }

    rows.push('<div class="hud-section">' + t('What it says') + '</div>');
    if (record.techs.length === 0) {
      rows.push('<div class="hud-sub">' + t('nothing yet') + '</div>');
    } else if (!literate) {
      rows.push('<div class="hud-sub">' + (record.techs.length === 1
        ? t('{n} mark you cannot read', { n: 1 })
        : t('{n} marks you cannot read', { n: record.techs.length })) +
        '</div>');
      rows.push(veil(t('A record is worth nothing to somebody who never learned to read it.')));
    } else {
      rows.push('<div class="hud-sub">' + record.techs
        .map(id => escapeHtml(t(TECH[id as Tech]?.label ?? id)))
        .join(', ') + '</div>');
    }

    if (record.def.decayPerDay > 0) {
      rows.push(veil(t('Clay does not last. What is only here is not safe here.')));
    }
    return rows;
  }

  private pileRows(pile: ItemPile, sim: Simulation): string[] {
    const rows: string[] = [];
    const owner = pile.ownerId === null ? null : sim.peopleById.get(pile.ownerId);
    const daysAgo = Math.floor((sim.time.tick - pile.droppedTick) / sim.config.time.ticksPerDay);

    rows.push('<div class="hud-name">' + t('Dropped goods') + '</div>');
    rows.push('<div class="hud-sub">' + pile.x + ',' + pile.y +
      (owner ? ' · ' + escapeHtml(t('left by {name}', { name: owner.name })) : '') +
      (daysAgo > 0 ? ' · ' + t('{n}d ago', { n: daysAgo }) : ' · ' + t('today')) + '</div>');

    rows.push('<div class="hud-section">' + t('Contents') + '</div>');
    const stacks = pile.contents.entries();
    if (stacks.length === 0) {
      rows.push('<div class="hud-sub">' + t('empty') + '</div>');
    } else {
      rows.push('<div class="hud-sub">' + stacks
        .map(([id, n]) => escapeHtml(t(ITEMS[id]?.label ?? id)) + ' &times;' + n)
        .join(', ') + '</div>');
    }
    rows.push(veil(t('Right-click it to pick it up. Anyone can.')));
    return rows;
  }

  /**
   * A body — M11 phase 16a. Named only for somebody who knew them
   * (`corpseTitle`); how long it has lain there and whether it bears wounds
   * are on it for anybody to see. The cause is not: a wound says violence,
   * not whose.
   */
  private corpseRows(observer: Person, corpse: Corpse, sim: Simulation): string[] {
    const rows: string[] = [];
    const days = Math.floor((sim.time.tick - corpse.diedTick) / sim.config.time.ticksPerDay);
    const stage = stageOf(corpse, sim.time.tick, sim.config.time.ticksPerDay);
    rows.push('<div class="hud-name">' +
      escapeHtml(corpseTitle(observer, corpse, sim.relationships, stage)) + '</div>');
    rows.push('<div class="hud-sub">' +
      (days > 0 ? t('lying here {n}d', { n: days }) : t('died today')) + '</div>');
    // Wounds read on flesh, not on bones or on a body cut up past knowing.
    if (stage !== 'bones' && !corpse.dismembered) {
      rows.push('<div class="hud-sub">' +
        (corpse.wounded ? t('The body bears wounds.') : t('No wound on the body.')) + '</div>');
    }
    if (!corpse.dismembered && corpse.dismemberWork > 0) {
      rows.push('<div class="hud-sub">' + t('Somebody has begun to cut it up.') + '</div>');
    }
    return rows;
  }

  private buildingRows(observer: Person, building: Building, sim: Simulation): string[] {
    const known = knowledgeOfBuilding(observer, building);
    const rows: string[] = [];

    rows.push('<div class="hud-name">' + building.def.icon + ' ' +
      escapeHtml(t(building.def.label)) + '</div>');
    rows.push('<div class="hud-sub">' + escapeHtml(t(building.def.description)) + '</div>');
    rows.push('<div class="hud-known">' + escapeHtml(known.because) + '</div>');

    if (!building.complete) {
      rows.push('<div class="hud-section">' + t('Under construction') + '</div>');
      rows.push(bar(tc('bar', 'progress'), building.completion * 100, '#e0b055'));
      rows.push('<div class="hud-section">' + t('Materials') + '</div>');
      for (const [itemId, needed] of Object.entries(building.def.materials)) {
        const have = building.delivered.count(itemId);
        rows.push(
          '<div class="hud-need"><span>' +
          escapeHtml(t(ITEMS[itemId]?.label ?? itemId)) + '</span>' +
          '<span class="hud-need-track"><i style="width:' +
          Math.min(100, (have / needed) * 100).toFixed(0) +
          '%;background:' + (have >= needed ? '#5cc98a' : '#d98032') + '"></i></span>' +
          '<span class="hud-need-value">' + have + '/' + needed + '</span></div>'
        );
      }
      if (building.ownerBandId === observer.bandId && observer.id === sim.player?.id) {
        rows.push('<button class="hud-button hud-cancel-build" data-cancel-construction="1">' +
          escapeHtml(t('Cancel construction')) + '</button>');
      }
      return rows;
    }

    rows.push('<div class="hud-section">' + t('Finished') + '</div>');
    // Condition, M11 phase 11b. Not gated on `known.knowsContents` the way the
    // store's contents are below: unlike what is inside, that a wall is
    // cracked or a roof is charred is visible to anyone who can see the
    // building at all, and the standing rule this project holds panels to —
    // if the simulation refuses or stops something, the UI has to say why —
    // applies just as much to *why a building stopped working* as to why a
    // person's order did. `isStructure` excludes a stockpile, which has no
    // durability to report and would otherwise show a bar permanently full
    // for a reason nobody could act on.
    if (isStructure(building.def) && building.durability !== null) {
      if (building.ruined) {
        rows.push('<div class="hud-sub" style="color:#d9705a">' +
          t('Wrecked. It shelters nobody and holds nothing new until somebody repairs it.') + '</div>');
      } else if (building.soundness < 1) {
        rows.push(bar(tc('bar', 'condition'), building.soundness * 100, '#d98032'));
        rows.push('<div class="hud-sub">' + t('Damaged. Working at {pct}% until it is repaired.', {
          pct: (building.soundness * 100).toFixed(0),
        }) + '</div>');
      }
    }
    // A trap that has stopped catching looks exactly like a trap that is
    // working, from outside, and the standing instruction on this project is
    // that anything the simulation refuses or abandons has to say so in the UI.
    // The two silent failures are both real: the band's last snare-setter dies,
    // or the thing is simply full.
    const trap = sim.trapYield(building);
    if (trap) {
      rows.push('<div class="hud-sub">' +
        (trap.perDay > 0
          ? escapeHtml(t('{item} about {n} a day', {
              item: t(ITEMS[building.def.yields!.item]?.label ?? building.def.yields!.item),
              n: trap.perDay.toFixed(1),
            })) + ' &mdash; ' + escapeHtml(trap.reason)
          : escapeHtml(trap.reason)) +
        '</div>');
    }
    // M8.2. What is standing on the plot, and what the ground under it has left
    // — the one row a farmer actually needs, and the reason `Simulation`
    // computes it rather than this panel: a HUD with its own idea of how tired
    // the ground is is a HUD that will eventually disagree with the sowing that
    // gets refused.
    //
    // In words rather than in numbers, and gated on knowing how to farm. A band
    // that has never had the idea sees that the ground is tired; a farmer sees
    // how tired, against what the same ground would carry untouched. That is the
    // same line `sim/social/Knowledge.ts` draws everywhere else, applied to the
    // ground instead of to a person.
    if (building.crop) {
      const crop = building.crop;
      const soil = sim.soilReport(building);
      const farmer = techPower(observer, 'farming') > 0;
      rows.push('<div class="hud-section">' + t('The crop') + '</div>');
      rows.push('<div class="hud-sub">' +
        (crop.isFallow
          ? t('Bare ground, waiting for seed.')
          : crop.isRipe
            ? t('Ripe, and it will not stand for ever.')
            : t('Coming on.')) + '</div>');
      if (!crop.isFallow) rows.push(bar(tc('bar', 'ripeness'), crop.ripeness * 100, '#d9b44a'));
      if (crop.harvests > 0 || crop.lost > 0) {
        rows.push('<div class="hud-sub">' +
          (crop.harvests === 1
            ? t('{n} harvest taken', { n: 1 })
            : t('{n} harvests taken', { n: crop.harvests })) +
          (crop.lastYield > 0 ? t(', the last of {n} grain', { n: crop.lastYield }) : '') +
          (crop.lost > 0 ? t('; {n} left standing too long', { n: crop.lost }) : '') +
          '.</div>');
      }

      rows.push('<div class="hud-section">' + t('The ground') + '</div>');
      const share = soil.effective / Math.max(0.001, soil.resting);
      const worn = share > 0.97 ? t('as good as it ever was')
        : share > 0.85 ? t('still in good heart')
        : share > 0.7 ? t('tiring')
        : share > 0.5 ? t('tired')
        : t('worked out');
      if (farmer) {
        rows.push(bar(tc('bar', 'in heart'), Math.min(100, share * 100), soil.spent ? '#d98032' : '#7ddc96'));
        rows.push('<div class="hud-sub">' +
          t('The ground here is {worn}: {pct}% of what it would carry untouched.', {
            worn, pct: (share * 100).toFixed(0),
          }) +
          (soil.spent ? ' ' + t('Nothing sown here will come to anything.') : '') +
          '</div>');
      } else {
        rows.push(veil(t('The ground here is {worn}, though nobody here could say why.', { worn })));
      }
    }
    // A heap that has stopped rotting down looks exactly like one that is
    // working, which is the same silent failure the trap line above exists for:
    // the band's last composter dies, or the thing is simply full.
    if (building.def.matures) {
      const ripe = building.store.count(building.def.matures.item);
      const keeper = sim.livingPeople().some(p =>
        p.bandId === building.ownerBandId && techPower(p, 'composting') > 0);
      rows.push('<div class="hud-sub">' +
        (!keeper
          ? t('Nobody here remembers how to keep a heap turning.')
          : building.storageFree <= 0
            ? t('Full, and rotting no further until somebody carries it out.')
            : t('Rotting down: about {n} a day.', { n: building.def.matures.perDay.toFixed(1) })) +
        ' ' + t('{n} ready.', { n: ripe }) + '</div>');
    }
    if (building.def.shelter > 0) {
      rows.push('<div class="hud-sub">' + t('Shelter {pct}% — people inside stay warm.', {
        pct: (building.def.shelter * 100).toFixed(0),
      }) + '</div>');
    }
    if (building.def.storage > 0) {
      rows.push('<div class="hud-section">' + tc('section', 'Store') + '</div>');
      if (!known.knowsContents) {
        rows.push(veil(t('You have not looked inside.')));
      } else {
        const stored = building.store.entries();
        rows.push(bar(tc('bar', 'used'), (building.store.total / building.def.storage) * 100, '#8ab4d8'));
        rows.push('<div class="hud-sub">' +
          (stored.length === 0
            ? t('empty')
            : stored.map(([id, n]) =>
                escapeHtml(t(ITEMS[id]?.label ?? id)) + ' &times;' + n).join(', ')) +
          '</div>');
      }
      if (observer.id === sim.player?.id && building.ownerBandId === observer.bandId &&
          building.complete && !building.ruined) {
        rows.push('<button class="hud-button" data-transfer="1">' +
          escapeHtml(t('Open transfer')) + '</button>');
      }
    }
    return rows;
  }
}

// Typed over `ResourceKind`, not a plain `Record<string, string>` — a new
// resource kind now fails the build here the same way it already fails
// `RESOURCE_COLORS` in Renderer.ts, rather than silently printing its raw id.
// This table's `wood` never matched `sticks` for exactly that reason.
export const NODE_LABELS: Record<ResourceKind, string> = {
  berries: 'Berry bush',
  flint: 'Flint outcrop',
  sticks: 'Fallen wood',
  reeds: 'Reed bed',
  clay: 'Clay bank',
  wild_grain: 'Wild grain',
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
    case 'node': return tc('node', selection.node.kind);
    case 'building': return t(selection.building.def.label);
    case 'tree': return t(selection.tree.def.label);
    case 'pile': return t('Dropped goods');
    case 'corpse': return corpseTitle(observer, selection.corpse, sim.relationships,
      stageOf(selection.corpse, sim.time.tick, sim.config.time.ticksPerDay));
    case 'inscription': return t(selection.inscription.def.label);
    case 'animal': return t(selection.animal.label);
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
    case 'corpse': return 'c' + selection.corpse.id;
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
  if (years < 25) return t('twenty');
  if (years < 45) return t('thirty');
  return t('fifty');
}

function describeHealth(health: number): string {
  if (health > 90) return t('They look well enough.');
  if (health > 60) return t('They are carrying an injury.');
  if (health > 30) return t('They look badly hurt.');
  return t('They can barely stand.');
}

/** What each macro mostly comes from, for `describeDiet`'s sentence. */
const MACRO_FOOD: Record<Macro, string> = {
  fat: 'fat',
  protein: 'meat or fish',
  carb: 'fruit or grain',
};
export const MACRO_FOOD_WORDS = Object.values(MACRO_FOOD);

/**
 * M11 phase 8e. `Macros.malnutrition` caps health recovery from 8d onward,
 * and a health mechanism nobody can see is the worst kind of difficulty —
 * see this file's header on why every refusal already gets a reason. Read
 * off `macroBalance` and `macroTarget` alone, the same two fields the bars
 * above already show, so this sentence can never claim something the panel
 * does not.
 */
function describeDiet(person: Person): string {
  const severity = malnutrition(person);
  if (severity < 0.08) return t('Eating a decent balance of food.');
  let short: Macro = 'carb';
  let shortBy = -Infinity;
  for (const macro of MACROS) {
    const gap = person.macroTarget[macro] - person.macroBalance[macro];
    if (gap > shortBy) {
      shortBy = gap;
      short = macro;
    }
  }
  const food = t(MACRO_FOOD[short]);
  if (severity < 0.2) return t('Diet is a little short on {food}.', { food });
  if (severity < 0.35) return t('Has gone without enough {food} for a while now.', { food });
  return t('Badly malnourished — needs {food} urgently.', { food });
}

/**
 * Why one person feels as they do about another, in the Ties list's terms.
 * Shared by the list and by *Between you* (13b), so the two can never explain
 * the same edge in different words.
 */
function tieParts(rel: Relationship): string[] {
  const parts: string[] = [];
  if (rel.bias !== 0) parts.push(rel.bias > 0 ? t('same band') : t('outsider'));
  if (Math.abs(rel.deeds) >= 1) {
    parts.push(t('deeds {n}', { n: (rel.deeds > 0 ? '+' : '') + rel.deeds.toFixed(0) }));
  }
  if (rel.familiarity >= 1) parts.push(t('familiar {n}', { n: rel.familiarity.toFixed(0) }));
  if (rel.kinship !== 0) parts.push(t('kin {n}', { n: rel.kinship.toFixed(0) }));
  return parts;
}

/**
 * The reasons under one opinion in *Between you*, strongest first, each
 * marked with the way it pulls. Empty when there is nothing to say, so an
 * opinion made only of nudges no memory records draws no list at all.
 */
function reasonList(reasons: RegardReason[]): string {
  if (reasons.length === 0) return '';
  return '<ul class="hud-reasons">' + reasons.map(reason =>
    '<li class="is-' + reason.tone + '">' +
    '<span class="hud-reason-mark">' + (reason.tone === 'pos' ? '+' : '−') + '</span>' +
    escapeHtml(capitalise(reason.text)) + '</li>').join('') + '</ul>';
}

/** The two-sided bar and signed number every opinion in *Ties* is drawn with. */
function tieMeter(opinion: number): string {
  const positive = opinion >= 0;
  const width = Math.min(50, Math.abs(opinion) / 2);
  return (
    '<div class="hud-tie-meter">' +
      '<span class="hud-tie-neg">' +
        (positive ? '' : '<i style="width:' + width.toFixed(0) + '%;"></i>') + '</span>' +
      '<span class="hud-tie-pos">' +
        (positive ? '<i style="width:' + width.toFixed(0) + '%;"></i>' : '') + '</span>' +
    '</div>' +
    '<span class="hud-tie-value ' + (positive ? 'is-pos' : 'is-neg') + '">' +
      (positive ? '+' : '') + opinion.toFixed(0) + '</span>'
  );
}

/**
 * M11 phase 12a. What has been eaten since the last daily tick, in units —
 * the only line in *Diet* that moves the moment somebody eats.
 */
function describeEatenToday(person: Person): string {
  if (person.eatenToday.size === 0) return t('Nothing eaten yet today.');
  const parts: string[] = [];
  for (const [id, n] of person.eatenToday) {
    parts.push(n + ' ' + t(ITEMS[id]?.label ?? id).toLowerCase());
  }
  return t('Today: {list}.', { list: parts.join(', ') });
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

/**
 * What a body is called, for `observer` — M11 phase 16a. "The body of Ana"
 * for somebody who knew Ana; "the body of a young woman" for a stranger,
 * the way `knowledgeOfPerson` names the living.
 */
export function corpseTitle(
  observer: Person, corpse: Corpse, relationships: Simulation['relationships'],
  stage: CorpseStage
): string {
  if (corpse.dismembered) return t('What is left of somebody');
  if (stage === 'bones') return t('Bones');
  if (stage === 'fresh') {
    return t('The body of {name}', {
      name: knowledgeOfPerson(observer, corpse.person, relationships).displayName,
    });
  }
  const who = corpseIdentity(observer, corpse, relationships, stage);
  return who.identified
    ? t('The body of {name}', { name: who.name })
    : t('A body, too far gone to know');
}
