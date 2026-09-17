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

/** Points to spend across the ten skills, and the ceiling on any one of them. */
const POINT_BUDGET = 60;
const POINT_CAP = 40;

/** How many of a tribe's adults are offered at a time. */
const SHORTLIST = 3;

type Step = 'tribe' | 'person' | 'skills';

export class NewGame {
  private root: HTMLElement;
  private step: Step = 'tribe';
  private band: Band | null = null;
  private shortlist: Person[] = [];
  private chosen: Person | null = null;
  private points: Record<Skill, number> | null = null;
  /** Rotates the shortlist without touching any simulation stream. */
  private shuffle = 0;

  constructor(
    container: HTMLElement,
    private sim: Simulation,
    private readonly onDone: (person: Person) => void
  ) {
    this.root = document.createElement('div');
    this.root.className = 'newgame';
    this.root.hidden = true;
    container.appendChild(this.root);
    this.root.addEventListener('click', event => this.onClick(event));
  }

  /** Points character creation at a rebuilt world. See `Renderer.setSim`. */
  setSim(sim: Simulation): void {
    this.sim = sim;
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
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onClick(event: MouseEvent): void {
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
    const body =
      this.step === 'tribe' ? this.tribeStep() :
      this.step === 'person' ? this.personStep() :
      this.skillsStep();

    this.root.innerHTML = '<div class="newgame-card">' + body + '</div>';
  }

  private tribeStep(): string {
    const cards = this.sim.bands.filter(b => !b.outcast).map(band => {
      const members = this.sim.livingPeople().filter(p => p.bandId === band.id);
      const biome = this.sim.world.biomeAt(band.homeX, band.homeY);
      return (
        '<button class="newgame-option" data-act="band" data-id="' + band.id + '">' +
        '<div class="newgame-option-name">' + escapeHtml(band.name) + '</div>' +
        '<div class="newgame-option-sub">' + members.length + ' people · camped in ' +
          escapeHtml(biome) + '</div>' +
        '<div class="newgame-option-note">' + escapeHtml(describeNorms(band)) + '</div>' +
        '</button>'
      );
    }).join('');

    return (
      '<div class="newgame-title">An island, and three peoples on it</div>' +
      '<div class="newgame-lead">The world is already made and already inhabited. ' +
      'Choose whose it is you were born among.</div>' +
      '<div class="newgame-options">' + cards + '</div>'
    );
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
        ? household.memberIds.length + (household.memberIds.length === 1 ? ' in the ' : ' in the ') +
          household.name + ' household'
        : 'no household';
      return (
        '<button class="newgame-option" data-act="person" data-id="' + person.id + '">' +
        '<div class="newgame-option-name">' + escapeHtml(person.fullName) + '</div>' +
        '<div class="newgame-option-sub">' + person.sex + ', ' + person.years +
          ' years · ' + escapeHtml(kin) + '</div>' +
        '<div class="newgame-option-note">' + escapeHtml(temperament(person)) + '</div>' +
        '</button>'
      );
    }).join('');

    return (
      '<div class="newgame-title">' + escapeHtml(band.name) + '</div>' +
      '<div class="newgame-lead">Whose life do you want?</div>' +
      '<div class="newgame-options">' + cards + '</div>' +
      '<div class="newgame-actions">' +
      '<button class="hud-button" data-act="back">Another tribe</button>' +
      '<button class="hud-button" data-act="reroll">Roll again</button>' +
      '</div>'
    );
  }

  private skillsStep(): string {
    const person = this.chosen;
    if (!person) return '';

    const rows = SKILLS.map(skill => {
      const rolled = Math.round(person.skills[skill]);
      if (!this.points) {
        return '<div class="newgame-skill"><span>' + skill + '</span>' +
          '<span class="newgame-skill-value">' + rolled + '</span></div>';
      }
      return (
        '<div class="newgame-skill"><span>' + skill + '</span>' +
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
        ? 'Spending ' + this.spent() + ' of ' + POINT_BUDGET + ' points, at most ' +
          POINT_CAP + ' in any one. This replaces what they have done with their ' +
          'life so far — a different person, not a better one.'
        : 'What this life has taught them so far.') +
      '</div>' +
      '<div class="newgame-skills">' + rows + '</div>' +
      '<div class="newgame-actions">' +
      '<button class="hud-button" data-act="back">Someone else</button>' +
      (this.points
        ? '<button class="hud-button" data-act="rolled">Keep their own skills</button>'
        : '<button class="hud-button" data-act="pointbuy">Choose skills instead</button>') +
      '<button class="hud-button newgame-begin" data-act="begin">Begin</button>' +
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
  const named: Record<string, string> = {
    theft: 'theft',
    assault: 'a beating',
    murder: 'a killing',
    gift: 'generosity',
    share_food: 'sharing food',
    threaten: 'menace',
  };

  for (const [type, label] of Object.entries(named)) {
    const weight = band.norms[type as EventType] ?? 1;
    const baseline = DEFAULT_NORMS[type as EventType];
    const ratio = weight / baseline;
    if (ratio >= 1.35) phrases.push('hold ' + label + ' very gravely');
    else if (ratio <= 0.65) phrases.push('care little about ' + label);
  }

  if (phrases.length === 0) return 'They judge much as anyone does.';
  return 'They ' + phrases.slice(0, 2).join(', and ') + '.';
}

/** One line on what weights this person's choices. */
function temperament(person: Person): string {
  const traits = person.traits;
  const notes: [number, string][] = [
    [traits.aggression, 'quick to anger'],
    [1 - traits.aggression, 'slow to anger'],
    [traits.greed, 'grasping'],
    [1 - traits.greed, 'open-handed'],
    [traits.loyalty, 'loyal'],
    [1 - traits.loyalty, 'their own person'],
    [traits.curiosity, 'curious'],
    [1 - traits.curiosity, 'incurious'],
    [traits.tradition, 'keeps to the old ways'],
    [1 - traits.tradition, 'careless of tradition'],
    [traits.intelligence, 'quick-witted'],
    [1 - traits.intelligence, 'slow to see it'],
    [traits.industriousness, 'never still'],
    [1 - traits.industriousness, 'takes their ease'],
    [traits.malice, 'conniving'],
    [1 - traits.malice, 'guileless'],
  ];
  const strongest = notes
    .filter(([weight]) => weight > 0.62)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([, text]) => text);
  return strongest.length === 0 ? 'even-tempered' : strongest.join(', ');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;' :
    ch === '>' ? '&gt;' :
    ch === '"' ? '&quot;' : '&#39;'
  );
}
