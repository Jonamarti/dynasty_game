/**
 * Which comarcas of the world one person knows of, and how they know it.
 * M15 phase 31 (M14 phase 13c).
 *
 * **`PlaceMemory` at the scale of the world.** A person's `PlaceMemory` is a
 * map of tiles inside one comarca; this is a map of comarcas inside the globe.
 * The rule is the same one that governs every other memory in the game and the
 * owner's rule for the globe: nothing is known that was not seen or told. A
 * comarca is
 *
 *  - **seen** when this person stood in it, or within sight of it. It carries
 *    the day it was last seen and which peoples were met there;
 *  - **told** when somebody described it — a story that travels by
 *    conversation like the gossip does, or a mother's map handed to the child
 *    she raises. It carries the day *the teller* last knew it, which is how old
 *    the rumour is, and nothing else: a rumour has no peoples in it and no
 *    detail beyond what the geography can say from far away;
 *  - **unknown** otherwise, and there is no entry at all. The globe paints
 *    that dark and reveals nothing about it.
 *
 * Seen beats told and never goes back: hearing about a place you have stood in
 * does not make you forget you were there, and a rumour never replaces a
 * sighting.
 *
 * **Draw-free.** Nothing here touches an RNG; what is recorded is a pure
 * function of where people stand and who they talk to, so recording it cannot
 * move a stream. It is also **absent, not empty, in a classic world**: the
 * island has no globe, `Person.worldKnowledge` is never created there, and the
 * persisted state of every classic seed stays byte for byte what it was.
 *
 * Read through `Knowledge.ts` (`knowledgeOfComarca`), never directly by a panel:
 * what somebody else knows of the world is as private as what they know of
 * anything else.
 */

export type ComarcaSource = 'seen' | 'told';

export interface ComarcaEntry {
  /** The day this was last seen — or, for a rumour, last known by the teller. */
  day: number;
  source: ComarcaSource;
  /**
   * Other bands met here, band id to the day they were last seen. Present only
   * on a comarca that was seen: a rumour carries no people (see `hear`).
   */
  peoples?: Record<number, number>;
}

/** Comarcas are far fewer than 65 536 across, so a row-major key is exact. */
const ROW = 65536;
export const comarcaKey = (cx: number, cy: number): number => cy * ROW + cx;
export const comarcaX = (key: number): number => key % ROW;
export const comarcaY = (key: number): number => Math.floor(key / ROW);

export class WorldKnowledge {
  private readonly cells = new Map<number, ComarcaEntry>();
  /** Changes only when the map does, so a panel can redraw only then. */
  revision = 0;

  get size(): number { return this.cells.size; }

  entry(cx: number, cy: number): ComarcaEntry | undefined {
    return this.cells.get(comarcaKey(cx, cy));
  }

  /** Every known comarca as `[key, entry]`, in the order they were first learned. */
  entries(): IterableIterator<[number, ComarcaEntry]> {
    return this.cells.entries();
  }

  /** This person is in, or in sight of, this comarca today. */
  see(cx: number, cy: number, day: number): void {
    const key = comarcaKey(cx, cy);
    const entry = this.cells.get(key);
    if (!entry) {
      this.cells.set(key, { day, source: 'seen' });
      this.revision++;
    } else if (entry.source === 'told') {
      // Standing there overrules the rumour; what the rumour said of peoples
      // was never recorded, so there is nothing to carry over.
      entry.source = 'seen';
      entry.day = day;
      this.revision++;
    } else if (day > entry.day) {
      entry.day = day;
      // A new day alone is not a change anyone can see on the globe.
    }
  }

  /** A person of another band was seen standing in this comarca. */
  meet(cx: number, cy: number, bandId: number, day: number): void {
    const entry = this.cells.get(comarcaKey(cx, cy));
    if (!entry || entry.source !== 'seen') return;
    const peoples = entry.peoples ??= {};
    if (peoples[bandId] === undefined) this.revision++;
    peoples[bandId] = Math.max(peoples[bandId] ?? 0, day);
  }

  /**
   * Somebody described this comarca. `day` is when the teller last knew it.
   * Never downgrades a sighting, and never makes a rumour newer than the
   * freshest account of it.
   */
  hear(cx: number, cy: number, day: number): boolean {
    const key = comarcaKey(cx, cy);
    const entry = this.cells.get(key);
    if (!entry) {
      this.cells.set(key, { day, source: 'told' });
      this.revision++;
      return true;
    }
    if (entry.source === 'told' && day > entry.day) entry.day = day;
    return false;
  }

  /**
   * One conversation's worth of geography: up to `count` comarcas the teller
   * knows and the listener does not, the most recently known first (ties by
   * key, so the order is the same on every run). Returns how many landed.
   *
   * Stories carry only the place and the date. A teller who has seen a people
   * somewhere does not hand over that sighting — the listener would then "know"
   * a band they have never laid eyes on.
   */
  tellTo(listener: WorldKnowledge, count: number): number {
    if (count <= 0) return 0;
    const fresh: [number, number][] = [];
    for (const [key, entry] of this.cells) {
      if (!listener.cells.has(key)) fresh.push([key, entry.day]);
    }
    fresh.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    let landed = 0;
    for (const [key, day] of fresh.slice(0, count)) {
      if (listener.hear(comarcaX(key), comarcaY(key), day)) landed++;
    }
    return landed;
  }

  /**
   * Everything this person knows, handed on as hearsay — the map a mother
   * gives the child she raises, and (phase 34) the one a stranger brings from
   * home when they marry in or are taken.
   */
  tellAllTo(listener: WorldKnowledge): number {
    return this.tellTo(listener, this.cells.size);
  }
}
