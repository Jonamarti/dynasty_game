/**
 * Knowledge that outlives the person who had it.
 *
 * The deliberate exception to this project's central conceit. Everywhere else,
 * knowledge is held by individuals: `Simulation.knownTech` is recounted daily
 * from who is alive, so a technology leaves the world when its last holder
 * dies, and dark ages are not scripted — they are what happens when the chain
 * breaks. An inscription is the first thing that can survive a winter which
 * kills everyone who understood it.
 *
 * It is bought on purpose and it is not bought cheaply:
 *
 *  - it costs materials and a long job;
 *  - stone cannot be moved, so a record is tied to the place it was cut;
 *  - the later, cheaper forms perish;
 *  - and **a record is inert to anyone who cannot read**. A band can sit on a
 *    library holding the answer to its own dark age. That last one is the whole
 *    point: it makes literacy itself the thing worth having, and it makes the
 *    death of the last reader a different and worse event than the death of the
 *    last potter.
 *
 * ## Why this is not an item
 *
 * An inscription is a *placed* thing with a position, so this mirrors
 * `BuildingDef` rather than `ItemDef`. That also keeps it out of `Inventory`'s
 * stacks, which are a plain id-to-count map that nearly everything in the
 * project relies on being one — a marked stone and an unmarked stone are not
 * interchangeable, and a stack cannot say so.
 */
import type { Tech } from '../knowledge/Tech.ts';

/** The forms a record can take, in the order they are worked out. */
export type InscriptionForm = 'stone' | 'clay' | 'ochre';

export interface InscriptionDef {
  id: InscriptionForm;
  label: string;
  icon: string;
  /** What cutting one costs, taken from the inscriber's pack. */
  materials: Record<string, number>;
  /**
   * Ticks of work at skill factor 1 to cut one thing into it.
   *
   * **Banked on the stone, not on the carver.** This is the one number in the
   * feature that had to be got right by changing the shape rather than the
   * value. Written as a single uninterrupted pull, a stone took a novice twelve
   * hundred ticks — and a novice picks up thirty-five points of thirst in four
   * hundred, so the interruption check stopped them every time and the action
   * restarted from nothing. A run spent forty-five thousand ticks carving and
   * produced not one record: from outside, people standing in a field.
   *
   * Lowering it only moves the line. Work accumulates on the record the way it
   * accumulates on a building site instead, so breaking off to drink costs the
   * time already spent and nothing else, and a half-cut stone is a thing you
   * can see in the world.
   */
  workTicks: number;
  /** The hand it takes: a chisel is not a stylus. */
  skill: 'knap' | 'build';
  /** How many separate technologies one can hold. */
  capacity: number;
  /**
   * Daily chance of the record being lost. 0 means it lasts as long as the map.
   *
   * Stone is permanent and immovable; clay is cheap and holds more, and pays
   * for both by crumbling. That trade is the whole reason there are two forms
   * rather than one, and it is why the cheap form arriving later does not make
   * the expensive one obsolete.
   */
  decayPerDay: number;
  /**
   * What somebody must know to make marks in this, and to take them back out.
   *
   * **The two are the same and they are not always `writing`**, which is M8.1's
   * `ochre` and the whole historical point of it. Script is an agreed code and
   * is worth nothing to anybody outside the agreement; a painted picture of a
   * thing being done is legible to whoever can recognise the thing. So a band
   * that has never worked out writing can still leave a record on a rock wall,
   * and a literate stranger who has never seen ochre cannot read it.
   *
   * Before this the gate was the bare string `'writing'` in five places —
   * `doInscribe`, `doRead`, `inscriptionForm`, `Brain` and `ActionCatalog` —
   * and the clay tablet's own extra gate was a hardcoded `def.id !== 'clay'`
   * beside it. Both are data now, for the reason the house style gives: five
   * copies of one predicate is how the five answers drift apart.
   */
  literacy: Tech;
  description: string;
}

export const INSCRIPTIONS: Record<InscriptionForm, InscriptionDef> = {
  stone: {
    id: 'stone',
    label: 'Carved stone',
    icon: '\u{1FAA8}',
    // Flint to cut with, and the labour is the real cost.
    materials: { flint: 2 },
    workTicks: 420,
    skill: 'knap',
    capacity: 1,
    decayPerDay: 0,
    literacy: 'writing',
    description: 'One thing, cut into rock. It will be here long after everyone who can read it.',
  },
  clay: {
    id: 'clay',
    label: 'Clay tablet',
    icon: '\u{1F4DC}',
    materials: { mud: 3, pottery: 1 },
    workTicks: 260,
    skill: 'build',
    capacity: 2,
    // About one in a hundred and forty days: a lifetime for a person, an
    // eyeblink for a record that is supposed to outlast one.
    decayPerDay: 0.007,
    literacy: 'clay_tablet',
    description: 'Quicker to write and holds more, and it will not see out a century.',
  },
  // M8.1. The cheapest record in the game and the only one that is not writing.
  //
  // It is the *first* record most bands will ever make, despite being listed
  // last, because it is the only one that does not sit behind `writing` — and
  // `writing` sits behind `marking` and `stoneworking`, which no run in the
  // suite reaches from nothing. A painted hand and a painted animal is what
  // people actually left on rock walls for thirty thousand years before anybody
  // wrote anything down.
  //
  // It pays for that with everything else: one thing only, and gone in about six
  // weeks of weather.
  ochre: {
    id: 'ochre',
    label: 'Ochre painting',
    icon: '\u{1F58C}',
    // Red earth, and the fire that makes it red. `firemaking` is what `ochre`
    // requires and this is why: heating yellow earth is what turns it.
    materials: { mud: 2 },
    workTicks: 150,
    skill: 'build',
    capacity: 1,
    // About one day in fifty. A record that will not see out a bad summer,
    // which is the trade for its being the one anybody can make.
    decayPerDay: 0.02,
    literacy: 'ochre',
    description:
      'Earth burnt red and laid on rock. Anybody who knows what the picture ' +
      'is of can read it, which is more than can be said for a script.',
  },
};

let nextInscriptionId = 1;

export function resetInscriptionIds(): void {
  nextInscriptionId = 1;
}

export class Inscription {
  readonly id: number;
  readonly def: InscriptionDef;
  readonly x: number;
  readonly y: number;
  /** Who cut it, and when, so the panel can say whose hand this was. */
  readonly authorId: number;
  readonly authorName: string;
  readonly madeTick: number;
  /**
   * What is recorded here.
   *
   * Strings rather than `Tech` because `Simulation` holds these alongside a set
   * of the same shape and the whole file would otherwise be casting at every
   * boundary; `records-name-real-things` asserts every id is a real technology.
   */
  readonly techs: string[] = [];

  /**
   * What is being cut right now, and how far in.
   *
   * The same arrangement `Building` uses, and for the same reason: a long job
   * that loses everything when its worker stops for a drink is a job that never
   * finishes. A record with something pending is a half-cut stone.
   */
  pending: string | null = null;
  progress = 0;

  constructor(
    def: InscriptionDef,
    x: number,
    y: number,
    author: { id: number; name: string },
    tick: number
  ) {
    this.id = nextInscriptionId++;
    this.def = def;
    this.x = x;
    this.y = y;
    this.authorId = author.id;
    this.authorName = author.name;
    this.madeTick = tick;
  }

  get isFull(): boolean {
    return this.techs.length + (this.pending === null ? 0 : 1) >= this.def.capacity;
  }

  /** True while somebody is part way through cutting something into it. */
  get unfinished(): boolean {
    return this.pending !== null;
  }

  /** 0-1 through whatever is being cut, for the panel and the renderer. */
  get cutProgress(): number {
    if (this.pending === null) return 1;
    return Math.max(0, Math.min(1, this.progress / this.def.workTicks));
  }

  /** Starts cutting something. Returns false if there is no room for it. */
  begin(tech: string): boolean {
    if (this.isFull || this.techs.includes(tech)) return false;
    this.pending = tech;
    this.progress = 0;
    return true;
  }

  /**
   * Adds work. Returns true on the tick the thing becomes legible.
   *
   * Until then the record holds nothing: an abandoned half-cut stone is not a
   * record of anything, which is what stops a band banking knowledge by
   * starting a hundred carvings and finishing none.
   */
  addWork(amount: number): boolean {
    if (this.pending === null) return false;
    this.progress += amount;
    if (this.progress < this.def.workTicks) return false;
    this.techs.push(this.pending);
    this.pending = null;
    this.progress = 0;
    return true;
  }

}
