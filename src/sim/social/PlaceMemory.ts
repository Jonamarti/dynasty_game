/**
 * What one person has seen of the places around them.
 *
 * This is deliberately just a record in phase 2e: nobody reads it when making
 * decisions until phase 2f. Keeping observation separate from choice lets the
 * map be measured before a stale memory can send somebody on a long walk.
 */
export type PlaceSource = 'seen' | 'told';
export type RememberedAmount = 0 | 1 | 2;

export interface PlaceRecord {
  kind: string;
  x: number;
  y: number;
  day: number;
  amount: RememberedAmount;
  source: PlaceSource;
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
  /** Per-kind cell indexes make revisiting a visible patch O(1), not a scan of its cap. */
  private readonly places = new Map<string, Map<number, PlaceRecord>>();

  constructor(width: number, height: number, capPerKind = 48) {
    this.width = Math.max(1, Math.ceil(width));
    this.height = Math.max(1, Math.ceil(height));
    this.capPerKind = Math.max(1, Math.floor(capPerKind));
    this.explored = new Uint16Array(this.cols * this.rows);
  }

  get cols(): number { return Math.ceil(this.width / PLACE_CELL_SIZE); }
  get rows(): number { return Math.ceil(this.height / PLACE_CELL_SIZE); }

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
    for (const records of this.places.values()) {
      while (records.size > nextCap) this.deleteRecord(records, this.weakestKey(records));
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
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const centerX = cx * PLACE_CELL_SIZE + PLACE_CELL_SIZE / 2;
        const centerY = cy * PLACE_CELL_SIZE + PLACE_CELL_SIZE / 2;
        if ((centerX - x) ** 2 + (centerY - y) ** 2 > radius2) continue;
        const index = cy * this.cols + cx;
        if (this.explored[index] === 0) this.exploredCount++;
        this.explored[index] = safeDay;
      }
    }
  }

  /** Store that a place was seen. A revisit replaces its old state in that cell. */
  remember(
    kind: string, x: number, y: number, day: number, amount: RememberedAmount,
    source: PlaceSource = 'seen',
  ): void {
    const records = this.places.get(kind) ?? new Map<number, PlaceRecord>();
    const cellX = Math.floor(x / PLACE_CELL_SIZE);
    const cellY = Math.floor(y / PLACE_CELL_SIZE);
    const cellKey = cellY * this.cols + cellX;
    const safeDay = this.safeDay(day);
    const previous = records.get(cellKey);
    if (previous && previous.x === x && previous.y === y && previous.day === safeDay &&
        previous.amount === amount && previous.source === source) return;
    const record: PlaceRecord = {
      kind, x, y, day: safeDay, amount, source,
    };
    if (previous) this.setRecord(records, cellKey, record);
    else {
      if (records.size >= this.capPerKind) {
        // Forget the oldest and poorest place first. Stable sort order makes
        // ties deterministic without a random choice or an entity scan.
        this.deleteRecord(records, this.weakestKey(records));
      }
      this.setRecord(records, cellKey, record);
    }
    this.places.set(kind, records);
  }

  records(kind: string): readonly PlaceRecord[] {
    const records = this.places.get(kind);
    return records ? [...records.values()] : [];
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

  private weakestKey(records: Map<number, PlaceRecord>): number {
    let weakestKey = 0;
    let weakest: PlaceRecord | undefined;
    for (const [key, candidate] of records) {
      if (!weakest || candidate.day < weakest.day ||
          (candidate.day === weakest.day && candidate.amount < weakest.amount)) {
        weakest = candidate;
        weakestKey = key;
      }
    }
    return weakestKey;
  }

  private setRecord(records: Map<number, PlaceRecord>, key: number, record: PlaceRecord): void {
    const previous = records.get(key);
    if (previous) this.rememberedDayTotal -= previous.day;
    else this.rememberedCount++;
    records.set(key, record);
    this.rememberedDayTotal += record.day;
  }

  private deleteRecord(records: Map<number, PlaceRecord>, key: number): void {
    const previous = records.get(key);
    if (!previous) return;
    this.rememberedDayTotal -= previous.day;
    this.rememberedCount--;
    records.delete(key);
  }
}
