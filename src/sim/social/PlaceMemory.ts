import { SpatialHash } from '../core/SpatialHash.ts';

/**
 * What one person has seen of the places around them.
 *
 * This is deliberately just a record in phase 2e: nobody reads it when making
 * decisions until phase 2f. Keeping observation separate from choice lets the
 * map be measured before a stale memory can send somebody on a long walk.
 */
export type PlaceSource = 'seen' | 'told';
export type RememberedAmount = 0 | 1 | 2;

/** Visual facts visible to the observer, kept apart from private entity state. */
export type PlaceVisual =
  | { type: 'tree'; species: string; maturity: number; bare: boolean; autumn: boolean; fruit: number }
  | { type: 'person'; id: number; sex: 'male' | 'female'; age: 'infant' | 'child' | 'adolescent' | 'adult' | 'elder'; bandId: number }
  | { type: 'building'; id: string; complete: boolean }
  // M15 phase 20: which shrub a berry bush is, and whether it was in leaf.
  // The species is plain to anybody looking at it; when it bears is not, and
  // that is `SeasonLore`'s to learn.
  | { type: 'bush'; species: string; leafless: boolean };

export interface PlaceRecord {
  kind: string;
  x: number;
  y: number;
  day: number;
  amount: RememberedAmount;
  source: PlaceSource;
  visual?: PlaceVisual;
}

export const PLACE_CELL_SIZE = 4;

export class PlaceMemory {
  private width: number;
  private height: number;
  private capPerKind: number;
  private explored: Uint16Array;
  private exploredCount = 0;
  private rememberedCount = 0;
  private rememberedDayTotal = 0;
  /** Changes only when the remembered map actually changes, for renderer caches. */
  private revisionValue = 0;
  /** Per-kind cell indexes make revisiting a visible patch O(1), not a scan of its cap. */
  private readonly places = new Map<string, Map<number, PlaceRecord>>();
  /** All remembered markers, including spent places, indexed for hover/hit tests. */
  private readonly allPlacesHash = new SpatialHash<PlaceRecord>(8);
  /** Non-exhausted subset: the scorer must not rescan empty remembered spots. */
  private readonly available = new Map<string, Map<number, PlaceRecord>>();
  /** Per-kind spatial indexes keep nearest-known-place queries bounded. */
  private readonly availableHashes = new Map<string, SpatialHash<PlaceRecord>>();

  constructor(width: number, height: number, capPerKind = 48) {
    this.width = Math.max(1, Math.ceil(width));
    this.height = Math.max(1, Math.ceil(height));
    this.capPerKind = Math.max(1, Math.floor(capPerKind));
    this.explored = new Uint16Array(this.cols * this.rows);
  }

  get cols(): number { return Math.ceil(this.width / PLACE_CELL_SIZE); }
  get rows(): number { return Math.ceil(this.height / PLACE_CELL_SIZE); }
  get revision(): number { return this.revisionValue; }

  /** Resize for the actual comarca; initialising a person in a small test world is common. */
  configure(width: number, height: number, capPerKind: number): void {
    const cols = Math.ceil(Math.max(1, width) / PLACE_CELL_SIZE);
    const rows = Math.ceil(Math.max(1, height) / PLACE_CELL_SIZE);
    const nextCap = Math.max(1, Math.floor(capPerKind));
    if (cols !== this.cols || rows !== this.rows) {
      this.width = Math.max(1, Math.ceil(width));
      this.height = Math.max(1, Math.ceil(height));
      this.explored = new Uint16Array(this.cols * this.rows);
      this.exploredCount = 0;
    }
    this.capPerKind = nextCap;
    for (const [kind, records] of this.places) {
      while (records.size > nextCap) this.deleteRecord(kind, records, this.weakestKey(records));
    }
  }

  /** Mark the cells whose centres fall within the person's current sight. */
  observe(x: number, y: number, radius: number, day: number): void {
    const safeDay = this.safeDay(day);
    const minX = Math.max(0, Math.floor((x - radius) / PLACE_CELL_SIZE));
    const maxX = Math.min(this.cols - 1, Math.floor((x + radius) / PLACE_CELL_SIZE));
    const minY = Math.max(0, Math.floor((y - radius) / PLACE_CELL_SIZE));
    const maxY = Math.min(this.rows - 1, Math.floor((y + radius) / PLACE_CELL_SIZE));
    const radius2 = radius * radius;
    let changed = false;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const centerX = cx * PLACE_CELL_SIZE + PLACE_CELL_SIZE / 2;
        const centerY = cy * PLACE_CELL_SIZE + PLACE_CELL_SIZE / 2;
        if ((centerX - x) ** 2 + (centerY - y) ** 2 > radius2) continue;
        const index = cy * this.cols + cx;
        if (this.explored[index] === 0) this.exploredCount++;
        if (this.explored[index] !== safeDay) changed = true;
        this.explored[index] = safeDay;
      }
    }
    if (changed) this.revisionValue++;
  }

  /**
   * Store that a place was seen. A revisit replaces its old state in that
   * cell — or, for a person, wherever they were last seen.
   */
  remember(
    kind: string, x: number, y: number, day: number, amount: RememberedAmount,
    source: PlaceSource = 'seen', visual?: PlaceVisual,
  ): void {
    const existing = this.places.get(kind);
    const records = existing ?? new Map<number, PlaceRecord>();
    const cellX = Math.floor(x / PLACE_CELL_SIZE);
    const cellY = Math.floor(y / PLACE_CELL_SIZE);
    // A person is remembered once, where they were last seen, not once per
    // cell they were seen in (M15 phase 20). Keyed by cell, somebody who
    // walked across the observer's view left a trail of copies of themselves
    // in the fog, and two people standing in one cell left one. The key is
    // negative so it can never be a cell's; nothing looks people up by cell.
    const cellKey = visual?.type === 'person' ? -1 - visual.id : cellY * this.cols + cellX;
    const safeDay = this.safeDay(day);
    const previous = records.get(cellKey);
    if (previous && previous.x === x && previous.y === y && previous.day === safeDay &&
        previous.amount === amount && previous.source === source && sameVisual(previous.visual, visual)) return;
    const record: PlaceRecord = {
      kind, x, y, day: safeDay, amount, source,
    };
    if (visual) record.visual = { ...visual };
    if (previous) this.setRecord(records, cellKey, record);
    else {
      // Water is the one place a person never forgets. It is also bounded by
      // the size of this comarca (one record per coarse cell), so keeping it
      // cannot grow without limit over a long save.
      if (kind !== 'water' && records.size >= this.capPerKind) {
        // Forget the oldest and poorest place first. Stable sort order makes
        // ties deterministic without a random choice or an entity scan.
        this.deleteRecord(kind, records, this.weakestKey(records));
      }
      this.setRecord(records, cellKey, record);
    }
    this.indexAvailability(kind, cellKey, record);
    // `Map.set` on a key already present neither moves it nor changes anything
    // else, so only the first record of a kind needs to say so. (Saying it every
    // time was a Map write per sighting, and a sighting happens a hundred
    // thousand times a step in a camp of three hundred.)
    if (!existing) this.places.set(kind, records);
    this.revisionValue++;
  }

  /**
   * Drop every remembered person. Only the player's character keeps them (the
   * fog of war is their only reader), so a character who stops being the
   * player's is cleared and no NPC is left holding stale sightings.
   */
  forgetPeople(): void {
    const records = this.places.get('person');
    if (!records) return;
    for (const key of [...records.keys()]) this.deleteRecord('person', records, key);
    this.places.delete('person');
    this.revisionValue++;
  }

  records(kind: string): readonly PlaceRecord[] {
    const records = this.places.get(kind);
    return records ? [...records.values()] : [];
  }

  /** Constant-time check for knowledge at a remembered map cell. */
  hasAt(kind: string, x: number, y: number): boolean {
    const records = this.places.get(kind);
    if (!records) return false;
    const key = Math.floor(y / PLACE_CELL_SIZE) * this.cols + Math.floor(x / PLACE_CELL_SIZE);
    return records.has(key);
  }

  /** Knowledge check for a live entity resolved a tile or less from its remembered cell. */
  hasNear(kind: string, x: number, y: number, radius = 1): boolean {
    const records = this.places.get(kind);
    if (!records) return false;
    const minX = Math.floor((x - radius) / PLACE_CELL_SIZE);
    const maxX = Math.floor((x + radius) / PLACE_CELL_SIZE);
    const minY = Math.floor((y - radius) / PLACE_CELL_SIZE);
    const maxY = Math.floor((y + radius) / PLACE_CELL_SIZE);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const record = records.get(cy * this.cols + cx);
        if (record && Math.hypot(record.x - x, record.y - y) <= radius) return true;
      }
    }
    return false;
  }

  /** Find the nearest matching record from this person's bounded place memory. */
  nearest(
    kind: string, x: number, y: number, accepts: (place: PlaceRecord) => boolean = () => true,
    maxDistance = Math.hypot(this.width, this.height),
  ): PlaceRecord | null {
    const hash = this.availableHashes.get(kind);
    if (!hash) return null;
    const found = hash.findNearest(x, y, maxDistance, accepts);
    return found ? { ...found } : null;
  }

  /** Nearest remembered marker of any kind; one spatial query, including spent places. */
  nearestAny(
    x: number, y: number, maxDistance: number,
    accepts: (place: PlaceRecord) => boolean = () => true,
  ): PlaceRecord | null {
    const found = this.allPlacesHash.findNearest(x, y, maxDistance, accepts);
    return found ? { ...found } : null;
  }

  /**
   * Replace a remembered place with what was actually found there. The source
   * and observation day stay intact: arriving does not make an old rumour true
   * today, it only corrects its remembered amount.
   */
  updateAt(kind: string, x: number, y: number, amount: RememberedAmount): boolean {
    const records = this.places.get(kind);
    if (!records) return false;
    const cell = Math.floor(y / PLACE_CELL_SIZE) * this.cols + Math.floor(x / PLACE_CELL_SIZE);
    const previous = records.get(cell);
    if (!previous) return false;
    const next = { ...previous, amount };
    this.setRecord(records, cell, next);
    this.indexAvailability(kind, cell, next);
    this.revisionValue++;
    return true;
  }

  /** A copy keeps renderer and UI callers from changing the person's private map. */
  allRecords(): PlaceRecord[] {
    return [...this.places.values()].flatMap(records => [...records.values()].map(record => ({ ...record })));
  }

  exploredFraction(): number {
    return this.exploredCount / this.explored.length;
  }

  /** Day last observed for the cell containing this point; zero means unknown. */
  seenDayAt(x: number, y: number): number {
    const cx = Math.floor(x / PLACE_CELL_SIZE);
    const cy = Math.floor(y / PLACE_CELL_SIZE);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return 0;
    return this.explored[cy * this.cols + cx] ?? 0;
  }

  averageAge(day: number): number {
    return this.rememberedCount === 0
      ? 0
      : Math.max(0, day - this.rememberedDayTotal / this.rememberedCount);
  }

  private safeDay(day: number): number {
    return Math.max(1, Math.min(65535, Math.floor(day)));
  }

  /**
   * The key to forget first: the earliest-inserted record among those with the
   * lowest (day, amount). The answer is what a scan of every record gives, and
   * that scan was the largest single cost in a camp of three hundred, where the
   * 48 places a person holds for "people" are evicted and refilled on every
   * look around. So it is not scanned any more: `weakness` counts the records
   * by `day * 3 + amount` (the same order, because an amount is 0 to 2), which
   * names the lowest code at once, and the scan only runs from the front of the
   * map until it meets a record with that code. In the common case, a queue of
   * people seen today, that is the first record.
   */
  private weakestKey(records: Map<number, PlaceRecord>): number {
    if (records.size === 0) return 0;
    const target = weaknessOf(records).min;
    for (const [key, candidate] of records) {
      if (candidate.day * 3 + candidate.amount === target) return key;
    }
    return 0;
  }

  private setRecord(records: Map<number, PlaceRecord>, key: number, record: PlaceRecord): void {
    const previous = records.get(key);
    const weakness = WEAKNESS.get(records);
    if (previous) {
      this.rememberedDayTotal -= previous.day;
      this.allPlacesHash.remove(previous);
      if (weakness) dropWeakness(weakness, previous);
    }
    else this.rememberedCount++;
    if (weakness) addWeakness(weakness, record);
    records.set(key, record);
    this.allPlacesHash.insert(record);
    this.rememberedDayTotal += record.day;
  }

  private indexAvailability(kind: string, key: number, record: PlaceRecord): void {
    if (record.amount === 0) {
      this.unindexAvailability(kind, key);
      return;
    }
    const existing = this.available.get(kind);
    const records = existing ?? new Map<number, PlaceRecord>();
    const previous = records.get(key);
    const existingHash = this.availableHashes.get(kind);
    if (previous) existingHash?.remove(previous);
    records.set(key, record);
    const hash = existingHash ?? new SpatialHash<PlaceRecord>(8);
    hash.insert(record);
    // Both `set`s below are no-ops when the kind is already indexed (a present
    // key keeps its place in a Map), so they are made only the first time.
    if (!existingHash) this.availableHashes.set(kind, hash);
    if (!existing) this.available.set(kind, records);
  }

  /**
   * `indexAvailability` for a spent place (amount 0), written out: the eviction
   * path used to build a `{ ...previous, amount: 0 }` copy of the record only so
   * that this branch could read the zero off it.
   */
  private unindexAvailability(kind: string, key: number): void {
    const records = this.available.get(kind);
    if (records) {
      const previous = records.get(key);
      if (previous) this.availableHashes.get(kind)?.remove(previous);
      records.delete(key);
      if (records.size !== 0) return;
    }
    this.available.delete(kind);
    if ((this.availableHashes.get(kind)?.stats().items ?? 0) === 0) {
      this.availableHashes.delete(kind);
    }
  }

  private deleteRecord(kind: string, records: Map<number, PlaceRecord>, key: number): void {
    const previous = records.get(key);
    if (!previous) return;
    this.rememberedDayTotal -= previous.day;
    this.rememberedCount--;
    records.delete(key);
    const weakness = WEAKNESS.get(records);
    if (weakness) dropWeakness(weakness, previous);
    this.allPlacesHash.remove(previous);
    this.unindexAvailability(kind, key);
  }
}

/**
 * How many records of one kind sit at each (day, amount), for `weakestKey`.
 * Kept beside the class and not in it, keyed by the kind's own record map: it is
 * derived data, so it must not be saved, must not change what a saved game
 * contains, and must be rebuilt (below) for a map that was loaded without it.
 */
interface Weakness { counts: Map<number, number>; min: number }
const WEAKNESS = new WeakMap<Map<number, PlaceRecord>, Weakness>();

function weaknessOf(records: Map<number, PlaceRecord>): Weakness {
  let weakness = WEAKNESS.get(records);
  if (!weakness) {
    weakness = { counts: new Map(), min: Infinity };
    for (const record of records.values()) addWeakness(weakness, record);
    WEAKNESS.set(records, weakness);
  }
  return weakness;
}

function addWeakness(weakness: Weakness, record: PlaceRecord): void {
  const code = record.day * 3 + record.amount;
  weakness.counts.set(code, (weakness.counts.get(code) ?? 0) + 1);
  if (code < weakness.min) weakness.min = code;
}

function dropWeakness(weakness: Weakness, record: PlaceRecord): void {
  const code = record.day * 3 + record.amount;
  const left = (weakness.counts.get(code) ?? 1) - 1;
  if (left > 0) {
    weakness.counts.set(code, left);
    return;
  }
  weakness.counts.delete(code);
  if (code === weakness.min) {
    let min = Infinity;
    for (const other of weakness.counts.keys()) if (other < min) min = other;
    weakness.min = min;
  }
}

function sameVisual(a: PlaceVisual | undefined, b: PlaceVisual | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === 'tree' && b.type === 'tree') {
    return a.species === b.species && a.maturity === b.maturity && a.bare === b.bare &&
      a.autumn === b.autumn && a.fruit === b.fruit;
  }
  if (a.type === 'bush' && b.type === 'bush') return a.species === b.species && a.leafless === b.leafless;
  if (a.type === 'person' && b.type === 'person') {
    return a.id === b.id && a.sex === b.sex && a.age === b.age && a.bandId === b.bandId;
  }
  if (a.type === 'building' && b.type === 'building') {
    return a.id === b.id && a.complete === b.complete;
  }
  return false;
}
