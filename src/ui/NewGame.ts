/**
 * Choosing a life inside a world that already exists.
 *
 * The order matters and is the whole design of this screen: the island, its
 * three tribes and their families are generated *first*, and the player then
 * picks somebody already standing in it. Nothing here creates anyone — it only
 * chooses. That keeps the pillar the rest of the project rests on intact: the
 * player is a person with no extra fields, and the world was not arranged
 * around them.
 *
 * Three steps, each answering a different question:
 *
 *  - **Tribe** — where you are from, and what your neighbours will hold against
 *    you. Norms are read off the band's own numbers rather than written by
 *    hand, so a tribe that tolerates theft says so because it does.
 *  - **Person** — who you are. A shortlist rather than the whole tribe, because
 *    a list of ten strangers is a list, and three is a choice.
 *  - **Skills** — accept the life they have lived, or spend a fixed budget that
 *    *replaces* their skills. Point-buy is a different character, not a better
 *    one, which is why it replaces rather than adds.
 */
import type { Simulation, Band } from '../sim/core/Simulation.ts';
import type { Person } from '../sim/entities/Person.ts';
import { SKILLS, type Skill } from '../sim/entities/Person.ts';
import { DEFAULT_NORMS, type EventType } from '../sim/social/Events.ts';
import { TUNABLES } from '../sim/core/Difficulty.ts';
import { sliderRow, type SliderRow } from './SliderRow.ts';
import { t, tc, capitalise, genderOf, onLanguageChange } from '../i18n/i18n.ts';
import { languageSwitchHtml, handleLanguageClick } from './LanguageSwitch.ts';

/** Points to spend across the ten skills, and the ceiling on any one of them. */
const POINT_BUDGET = 60;
const POINT_CAP = 40;

/** How many of a tribe's adults are offered at a time. */
const SHORTLIST = 3;

type Step = 'tribe' | 'person' | 'skills';

/**
 * M11 phase 12c. The two settings that decide what the first step offers,
 * lifted out of the settings screen's thirty-odd rows to where the choice they
 * shape is made. Their bounds come from `TUNABLES`, so the two screens cannot
 * disagree about what is allowed.
 */
const POPULATION_PATHS = ['population.bands', 'population.peoplePerBand'] as const;
type PopulationPath = typeof POPULATION_PATHS[number];

export interface PopulationHooks {
  /** Record `value` for `path` and rebuild the island from it. */
  change(path: PopulationPath, value: number): void;
  /** The current difficulty's value for `path`, which is where ↺ goes back to. */
  anchorOf(path: PopulationPath): number;
}

/**
 * How long a drag rests before the island is rebuilt. Every value is a new
 * world, and generating one per pixel of a drag across thirty would stall it.
 */
const REBUILD_DELAY_MS = 180;

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export class NewGame {
  private root: HTMLElement;
  private step: Step = 'tribe';
  private band: Band | null = null;
  private shortlist: Person[] = [];
  private chosen: Person | null = null;
  private points: Record<Skill, number> | null = null;
  /** Rotates the shortlist without touching any simulation stream. */
  private shuffle = 0;

  /** The two population rows, built once per visit: see `renderTribe`. */
  private populationRows = new Map<PopulationPath, SliderRow>();
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * `population` is how a population row asks for a different island. The
   * caller records the setting and rebuilds the world, then hands it back
   * through `setSim`; this screen never builds a `Simulation` itself.
   */
  constructor(
    container: HTMLElement,
    private sim: Simulation,
    private readonly onDone: (person: Person) => void,
    private readonly population?: PopulationHooks
  ) {
    this.root = document.createElement('div');
    this.root.className = 'newgame';
    this.root.hidden = true;
    container.appendChild(this.root);
    this.root.addEventListener('click', event => this.onClick(event));
    // The start screen is the first thing a new player sees, so it is where a
    // player who does not read English most needs the switch to work at once.
    onLanguageChange(() => {
      if (this.isOpen) this.render();
    });
  }

  /** Points character creation at a rebuilt world. See `Renderer.setSim`. */
  setSim(sim: Simulation): void {
    this.sim = sim;
    if (this.isOpen && this.step === 'tribe') this.renderTribeOptions();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.step = 'tribe';
    this.band = null;
    this.chosen = null;
    this.points = null;
    this.root.hidden = false;
    this.render();
  }

  private close(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.populationRows.clear();
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = null;
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onClick(event: MouseEvent): void {
    if (handleLanguageClick(event.target as HTMLElement)) return;
    const node = (event.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!node) return;
    const act = node.dataset.act;

    if (act === 'band') {
      this.band = this.sim.bands.find(b => b.id === Number(node.dataset.id)) ?? null;
      this.shuffle = 0;
      this.step = 'person';
    } else if (act === 'person') {
      this.chosen = this.sim.peopleById.get(Number(node.dataset.id)) ?? null;
      this.step = 'skills';
    } else if (act === 'reroll') {
      this.shuffle++;
    } else if (act === 'back') {
      this.step = this.step === 'skills' ? 'person' : 'tribe';
    } else if (act === 'pointbuy') {
      // A blank slate the player fills in, rather than a bonus on top of the
      // life this person has already lived.
      this.points = {} as Record<Skill, number>;
      for (const skill of SKILLS) this.points[skill] = 0;
    } else if (act === 'rolled') {
      this.points = null;
    } else if (act === 'spend' && this.points) {
      const skill = node.dataset.skill as Skill;
      const delta = Number(node.dataset.delta);
      const next = this.points[skill] + delta;
      if (next >= 0 && next <= POINT_CAP && this.spent() + delta <= POINT_BUDGET) {
        this.points[skill] = next;
      }
    } else if (act === 'begin' && this.chosen) {
      if (this.points) {
        for (const skill of SKILLS) this.chosen.skills[skill] = this.points[skill];
      }
      const person = this.chosen;
      this.close();
      this.onDone(person);
      return;
    }
    this.render();
  }

  private spent(): number {
    if (!this.points) return 0;
    return SKILLS.reduce((sum, skill) => sum + this.points![skill], 0);
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private render(): void {
    this.populationRows.clear();
    if (this.step === 'tribe') {
      this.renderTribe();
      return;
    }
    const body = this.step === 'person' ? this.personStep() : this.skillsStep();
    this.root.innerHTML = '<div class="newgame-card">' + body + '</div>';
  }

  /**
   * The tribe step, built as nodes rather than one string because two of its
   * rows are sliders: rebuilding a range while it is under the pointer kills
   * the drag (see `SliderRow`), so a rebuilt island redraws only the title and
   * the tribe cards, through `renderTribeOptions`, and never the rows.
   */
  private renderTribe(): void {
    this.root.innerHTML =
      '<div class="newgame-card">' +
      languageSwitchHtml() +
      '<div class="newgame-title"></div>' +
      '<div class="newgame-lead">' +
      t('The world is already made and already inhabited. Choose whose it is you were born among.') +
      '</div>' +
      '<div class="newgame-population"></div>' +
      '<div class="newgame-options"></div>' +
      '</div>';
    const host = this.root.querySelector('.newgame-population') as HTMLElement;
    if (this.population) {
      for (const path of POPULATION_PATHS) host.appendChild(this.populationRow(path, this.population));
    } else {
      host.remove();
    }
    this.renderTribeOptions();
  }

  private populationRow(path: PopulationPath, hooks: PopulationHooks): HTMLElement {
    const tunable = TUNABLES.find(t => t.path === path)!;
    const request = (value: number): void => {
      if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
      this.rebuildTimer = setTimeout(() => {
        this.rebuildTimer = null;
        if (value !== this.populationOf(path)) hooks.change(path, value);
      }, REBUILD_DELAY_MS);
    };
    const row = sliderRow(
      {
        label: t(tunable.label), hint: t(tunable.hint),
        min: tunable.min, max: tunable.max, step: tunable.step, places: tunable.places,
      },
      this.populationOf(path),
      request,
      () => {
        const anchor = hooks.anchorOf(path);
        row.set(anchor, false);
        request(anchor);
      }
    );
    row.set(this.populationOf(path), this.populationOf(path) !== hooks.anchorOf(path));
    this.populationRows.set(path, row);
    return row.el;
  }

  /** What the island in front of the player was actually built with. */
  private populationOf(path: PopulationPath): number {
    return path === 'population.bands'
      ? this.sim.config.population.bands
      : this.sim.config.population.peoplePerBand;
  }

  private renderTribeOptions(): void {
    const title = this.root.querySelector('.newgame-title');
    const options = this.root.querySelector('.newgame-options');
    if (!title || !options) return;
    const tribes = this.sim.bands.filter(b => !b.outcast).length;
    const count = COUNT_WORDS[tribes] !== undefined ? tc('count', COUNT_WORDS[tribes]!) : String(tribes);
    title.textContent = tribes === 1
      ? t('An island, and {count} people on it', { count })
      : t('An island, and {count} peoples on it', { count });
    options.innerHTML = this.tribeCards();
    // `set` never fires the change callback, so this cannot loop back into a
    // rebuild; it only marks a row as moved off the difficulty's value.
    for (const [path, row] of this.populationRows) {
      const value = this.populationOf(path);
      row.set(value, this.population !== undefined && value !== this.population.anchorOf(path));
    }
  }

  private tribeCards(): string {
    return this.sim.bands.filter(b => !b.outcast).map(band => {
      const members = this.sim.livingPeople().filter(p => p.bandId === band.id);
      const biome = this.sim.world.biomeAt(band.homeX, band.homeY);
      return (
        '<button class="newgame-option" data-act="band" data-id="' + band.id + '">' +
        '<div class="newgame-option-name">' + escapeHtml(band.name) + '</div>' +
        '<div class="newgame-option-sub">' +
          escapeHtml(t('{n} people · camped in {biome}', { n: members.length, biome: tc('biome', biome) })) +
          '</div>' +
        '<div class="newgame-option-note">' + escapeHtml(describeNorms(band)) + '</div>' +
        '</button>'
      );
    }).join('');
  }

  private personStep(): string {
    const band = this.band;
    if (!band) return '';

    // Adults only, and rotated rather than re-rolled: the tribe is a fixed set
    // of people, so "roll again" shows a different slice of it and never
    // invents anybody.
    const adults = this.sim.livingPeople()
      .filter(p => p.bandId === band.id && !p.isChild)
      .sort((a, b) => a.id - b.id);
    this.shortlist = adults.length === 0 ? [] : Array.from(
      { length: Math.min(SHORTLIST, adults.length) },
      (_, i) => adults[(this.shuffle * SHORTLIST + i) % adults.length]!
    );

    const cards = this.shortlist.map(person => {
      const household = person.householdId === null
        ? null
        : this.sim.householdsById.get(person.householdId);
      const kin = household
        ? t('{n} in the {name} household', { n: household.memberIds.length, name: household.name })
        : t('no household');
      return (
        '<button class="newgame-option" data-act="person" data-id="' + person.id + '">' +
        '<div class="newgame-option-name">' + escapeHtml(person.fullName) + '</div>' +
        '<div class="newgame-option-sub">' +
          escapeHtml(t('{sex}, {years} years', { sex: tc('sex', person.sex), years: person.years })) +
          ' · ' + escapeHtml(kin) + '</div>' +
        '<div class="newgame-option-note">' + escapeHtml(temperament(person)) + '</div>' +
        '</button>'
      );
    }).join('');

    return (
      '<div class="newgame-title">' + escapeHtml(band.name) + '</div>' +
      '<div class="newgame-lead">' + t('Whose life do you want?') + '</div>' +
      '<div class="newgame-options">' + cards + '</div>' +
      '<div class="newgame-actions">' +
      '<button class="hud-button" data-act="back">' + t('Another tribe') + '</button>' +
      '<button class="hud-button" data-act="reroll">' + t('Roll again') + '</button>' +
      '</div>'
    );
  }

  private skillsStep(): string {
    const person = this.chosen;
    if (!person) return '';

    const rows = SKILLS.map(skill => {
      const rolled = Math.round(person.skills[skill]);
      if (!this.points) {
        return '<div class="newgame-skill"><span>' + tc('skill', skill) + '</span>' +
          '<span class="newgame-skill-value">' + rolled + '</span></div>';
      }
      return (
        '<div class="newgame-skill"><span>' + tc('skill', skill) + '</span>' +
        '<button class="newgame-step" data-act="spend" data-skill="' + skill +
          '" data-delta="-5">−</button>' +
        '<span class="newgame-skill-value">' + this.points[skill] + '</span>' +
        '<button class="newgame-step" data-act="spend" data-skill="' + skill +
          '" data-delta="5">+</button></div>'
      );
    }).join('');

    return (
      '<div class="newgame-title">' + escapeHtml(person.fullName) + '</div>' +
      '<div class="newgame-lead">' +
      (this.points
        ? t('Spending {spent} of {budget} points, at most {cap} in any one. This replaces what they have done with their life so far — a different person, not a better one.',
          { spent: this.spent(), budget: POINT_BUDGET, cap: POINT_CAP })
        : t('What this life has taught them so far.')) +
      '</div>' +
      '<div class="newgame-skills">' + rows + '</div>' +
      '<div class="newgame-actions">' +
      '<button class="hud-button" data-act="back">' + t('Someone else') + '</button>' +
      (this.points
        ? '<button class="hud-button" data-act="rolled">' + t('Keep their own skills') + '</button>'
        : '<button class="hud-button" data-act="pointbuy">' + t('Choose skills instead') + '</button>') +
      '<button class="hud-button newgame-begin" data-act="begin">' + t('Begin') + '</button>' +
      '</div>'
    );
  }
}

/**
 * A tribe's norms, in words.
 *
 * Derived by comparing the band's own numbers against `DEFAULT_NORMS` rather
 * than written per band, so this can never describe a culture the simulation
 * does not actually have.
 */
export function describeNorms(band: Band): string {
  const phrases: string[] = [];
  // M12 phase 2d, first because it is the one that most decides what kind of
  // neighbours they will be: what they teach their children about strangers.
  // Past about 0.18 either side of the middle — roughly one people in five at
  // each end of `STRANGER_REGARD_SPREAD`'s curve.
  if (band.strangerRegard <= 0.32) phrases.push(t('think a stranger fair game'));
  else if (band.strangerRegard >= 0.68) phrases.push(t('wrong a stranger no more lightly than a neighbour'));
  const named: Record<string, string> = {
    theft: t('theft'),
    assault: t('a beating'),
    murder: t('a killing'),
    gift: t('generosity'),
    share_food: t('sharing food'),
    threaten: t('menace'),
    slander: t('a bad word said behind someone\'s back'),
  };

  for (const [type, label] of Object.entries(named)) {
    const weight = band.norms[type as EventType] ?? 1;
    const baseline = DEFAULT_NORMS[type as EventType];
    const ratio = weight / baseline;
    if (ratio >= 1.35) phrases.push(t('hold {what} very gravely', { what: label }));
    else if (ratio <= 0.65) phrases.push(t('care little about {what}', { what: label }));
  }

  if (phrases.length === 0) return t('They judge much as anyone does.');
  // Capitalised for Spanish, whose template starts with the first phrase
  // rather than with a pronoun; English already starts "They".
  return capitalise(t('They {phrases}.', { phrases: phrases.slice(0, 2).join(t(', and ')) }));
}

/** One line on what weights this person's choices. */
function temperament(person: Person): string {
  const traits = person.traits;
  // Spanish adjectives agree with the person they describe.
  const g = { g: genderOf(person) };
  const notes: [number, string][] = [
    [traits.aggression, t('quick to anger', g)],
    [1 - traits.aggression, t('slow to anger', g)],
    [traits.greed, t('grasping', g)],
    [1 - traits.greed, t('open-handed', g)],
    [traits.loyalty, t('loyal', g)],
    [1 - traits.loyalty, t('their own person', g)],
    [traits.curiosity, t('curious', g)],
    [1 - traits.curiosity, t('incurious', g)],
    [traits.tradition, t('keeps to the old ways', g)],
    [1 - traits.tradition, t('careless of tradition', g)],
    [traits.intelligence, t('quick-witted', g)],
    [1 - traits.intelligence, t('slow to see it', g)],
    [traits.industriousness, t('never still', g)],
    [1 - traits.industriousness, t('takes their ease', g)],
    [traits.malice, t('conniving', g)],
    [1 - traits.malice, t('guileless', g)],
  ];
  const strongest = notes
    .filter(([weight]) => weight > 0.62)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([, text]) => text);
  return strongest.length === 0 ? t('even-tempered') : strongest.join(', ');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;' :
    ch === '>' ? '&gt;' :
    ch === '"' ? '&quot;' : '&#39;'
  );
}
