/** Per-world entity identity allocation. Snapshots are inert JSON data. */
export const ID_KINDS = [
  'person', 'household', 'tree', 'resourceNode', 'building', 'animal',
  'corpse', 'inscription', 'itemPile', 'socialEvent',
] as const;
export type IdKind = (typeof ID_KINDS)[number];
export const GROUP_ID_KINDS = ['band', 'herd'] as const;
export type GroupIdKind = (typeof GROUP_ID_KINDS)[number];
export interface GroupIdState { occupied: number[]; nextCandidate: number }
export interface IdSpaceSnapshot {
  version: 2;
  next: Record<IdKind, number>;
  groups: Record<GroupIdKind, GroupIdState>;
}

export class IdSpace {
  private readonly nextIds: Record<IdKind, number>;
  private readonly groupIds: Record<GroupIdKind, { occupied: Set<number>; nextCandidate: number }>;

  constructor(snapshot?: unknown) {
    if (snapshot !== undefined) {
      const validated = IdSpace.validate(snapshot);
      this.nextIds = validated.next;
      this.groupIds = {
        band: { occupied: new Set(validated.groups.band.occupied), nextCandidate: validated.groups.band.nextCandidate },
        herd: { occupied: new Set(validated.groups.herd.occupied), nextCandidate: validated.groups.herd.nextCandidate },
      };
    } else {
      this.nextIds = Object.fromEntries(ID_KINDS.map(kind => [kind, 1])) as Record<IdKind, number>;
      this.groupIds = {
        band: { occupied: new Set(), nextCandidate: 0 },
        herd: { occupied: new Set(), nextCandidate: 0 },
      };
    }
  }

  allocate(kind: IdKind): number {
    if (!(ID_KINDS as readonly string[]).includes(kind)) throw new TypeError(`Unknown ID kind: ${kind}`);
    const id = this.nextIds[kind];
    if (!Number.isSafeInteger(id) || id >= Number.MAX_SAFE_INTEGER) throw new RangeError(`ID space exhausted: ${kind}`);
    this.nextIds[kind] = id + 1;
    return id;
  }

  /** Keep a legacy group ID when free; collisions fall back to the lowest free ID. */
  claimGroupId(kind: GroupIdKind, preferred: number): number {
    IdSpace.validateGroupId(preferred);
    const state = this.groupIds[kind];
    if (!state) throw new TypeError(`Unknown group ID kind: ${kind}`);
    if (!state.occupied.has(preferred)) {
      state.occupied.add(preferred);
      this.advanceCursor(state);
      return preferred;
    }
    const fallback = this.claimGroupAtOrAfter(kind, state.nextCandidate);
    return fallback;
  }

  /** Reserve the first free group ID at or above a persistent range start. */
  claimGroupAtOrAfter(kind: GroupIdKind, preferred: number): number {
    IdSpace.validateGroupId(preferred);
    const state = this.groupIds[kind];
    if (!state) throw new TypeError(`Unknown group ID kind: ${kind}`);
    let id = preferred;
    while (state.occupied.has(id)) {
      if (id >= Number.MAX_SAFE_INTEGER - 1) throw new RangeError(`Group ID space exhausted: ${kind}`);
      id++;
    }
    state.occupied.add(id);
    this.advanceCursor(state);
    return id;
  }

  snapshot(): IdSpaceSnapshot {
    const sorted = (values: Set<number>) => [...values].sort((a, b) => a - b);
    return {
      version: 2,
      next: { ...this.nextIds },
      groups: {
        band: { occupied: sorted(this.groupIds.band.occupied), nextCandidate: this.groupIds.band.nextCandidate },
        herd: { occupied: sorted(this.groupIds.herd.occupied), nextCandidate: this.groupIds.herd.nextCandidate },
      },
    };
  }

  /** Restore monotonically: an already-used identity can never be issued again. */
  restore(snapshot: unknown): void {
    const validated = IdSpace.validate(snapshot);
    for (const kind of ID_KINDS) this.nextIds[kind] = Math.max(this.nextIds[kind], validated.next[kind]);
    for (const kind of GROUP_ID_KINDS) {
      const current = this.groupIds[kind];
      const saved = validated.groups[kind];
      for (const id of saved.occupied) current.occupied.add(id);
      current.nextCandidate = Math.max(current.nextCandidate, saved.nextCandidate);
      this.advanceCursor(current);
    }
  }

  static fromSnapshot(snapshot: unknown): IdSpace {
    // `undefined` is the fresh-constructor default, but a missing saved
    // checkpoint must fail instead of silently reissuing identities from 1.
    IdSpace.validate(snapshot);
    return new IdSpace(snapshot);
  }

  private static validate(snapshot: unknown): { next: Record<IdKind, number>; groups: Record<GroupIdKind, GroupIdState> } {
    if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') {
      throw new TypeError('Invalid IdSpace snapshot version or shape');
    }
    const raw = snapshot as Record<string, unknown>;
    if (Object.keys(raw).length !== 3 || !Object.hasOwn(raw, 'version') ||
      !Object.hasOwn(raw, 'next') || !Object.hasOwn(raw, 'groups') || raw.version !== 2 || !raw.next ||
      Array.isArray(raw.next) || typeof raw.next !== 'object') throw new TypeError('Invalid IdSpace snapshot version or shape');
    const next = raw.next as Record<string, unknown>;
    const keys = Object.keys(next);
    if (keys.length !== ID_KINDS.length || keys.some(key => !(ID_KINDS as readonly string[]).includes(key))) {
      throw new TypeError('Invalid IdSpace snapshot kinds');
    }
    if (Object.getPrototypeOf(next) !== Object.prototype && Object.getPrototypeOf(next) !== null) {
      throw new TypeError('Invalid IdSpace snapshot record');
    }
    for (const kind of ID_KINDS) {
      const value = next[kind];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`Invalid next ID for ${kind}`);
      }
    }
    const groups = raw.groups;
    if (!groups || Array.isArray(groups) || typeof groups !== 'object') throw new TypeError('Invalid group ID snapshot');
    const groupRecord = groups as Record<string, unknown>;
    if (Object.keys(groupRecord).length !== GROUP_ID_KINDS.length || GROUP_ID_KINDS.some(kind => !Object.hasOwn(groupRecord, kind))) {
      throw new TypeError('Invalid group ID namespaces');
    }
    const result = {} as Record<GroupIdKind, GroupIdState>;
    for (const kind of GROUP_ID_KINDS) {
      const entry = groupRecord[kind];
      if (!entry || Array.isArray(entry) || typeof entry !== 'object') throw new TypeError(`Invalid ${kind} ID state`);
      const state = entry as Record<string, unknown>;
      if (Object.keys(state).length !== 2 || !Object.hasOwn(state, 'occupied') ||
        !Array.isArray(state.occupied) || !Object.hasOwn(state, 'nextCandidate') ||
        typeof state.nextCandidate !== 'number' || !Number.isSafeInteger(state.nextCandidate) || state.nextCandidate < 0) {
        throw new TypeError(`Invalid ${kind} ID state`);
      }
      const occupied = state.occupied as unknown[];
      let prior = -1;
      for (const id of occupied) {
        IdSpace.validateGroupId(id);
        if (id <= prior) throw new TypeError(`${kind} IDs must be unique and sorted`);
        prior = id;
      }
      let canonicalCursor = 0;
      for (const id of occupied) {
        if (id !== canonicalCursor) break;
        canonicalCursor++;
      }
      if (state.nextCandidate !== canonicalCursor) throw new TypeError(`${kind} group cursor is not canonical`);
      result[kind] = { occupied: occupied as number[], nextCandidate: state.nextCandidate };
    }
    return { next: { ...next } as Record<IdKind, number>, groups: result };
  }

  private static validateGroupId(value: unknown): asserts value is number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
      throw new TypeError('Group IDs must be nonnegative safe integers');
    }
  }

  private advanceCursor(state: { occupied: Set<number>; nextCandidate: number }): void {
    while (state.occupied.has(state.nextCandidate)) state.nextCandidate++;
  }
}
