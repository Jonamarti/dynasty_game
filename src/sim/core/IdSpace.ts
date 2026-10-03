/** Per-world entity identity allocation. Snapshots are inert JSON data. */
export const ID_KINDS = [
  'person', 'household', 'tree', 'resourceNode', 'building', 'animal',
  'corpse', 'inscription', 'itemPile', 'socialEvent',
] as const;
export type IdKind = (typeof ID_KINDS)[number];
export interface IdSpaceSnapshot {
  version: 1;
  next: Record<IdKind, number>;
}

export class IdSpace {
  private readonly nextIds: Record<IdKind, number>;

  constructor(snapshot?: unknown) {
    this.nextIds = snapshot !== undefined ? IdSpace.validate(snapshot) : Object.fromEntries(
      ID_KINDS.map(kind => [kind, 1]),
    ) as Record<IdKind, number>;
  }

  allocate(kind: IdKind): number {
    if (!(ID_KINDS as readonly string[]).includes(kind)) throw new TypeError(`Unknown ID kind: ${kind}`);
    const id = this.nextIds[kind];
    if (!Number.isSafeInteger(id) || id >= Number.MAX_SAFE_INTEGER) throw new RangeError(`ID space exhausted: ${kind}`);
    this.nextIds[kind] = id + 1;
    return id;
  }

  snapshot(): IdSpaceSnapshot {
    return { version: 1, next: { ...this.nextIds } };
  }

  /** Restore monotonically: an already-used identity can never be issued again. */
  restore(snapshot: unknown): void {
    const validated = IdSpace.validate(snapshot);
    for (const kind of ID_KINDS) this.nextIds[kind] = Math.max(this.nextIds[kind], validated[kind]);
  }

  static fromSnapshot(snapshot: unknown): IdSpace {
    // `undefined` is the fresh-constructor default, but a missing saved
    // checkpoint must fail instead of silently reissuing identities from 1.
    IdSpace.validate(snapshot);
    return new IdSpace(snapshot);
  }

  private static validate(snapshot: unknown): Record<IdKind, number> {
    if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') {
      throw new TypeError('Invalid IdSpace snapshot version or shape');
    }
    const raw = snapshot as Record<string, unknown>;
    if (Object.keys(raw).length !== 2 || !Object.hasOwn(raw, 'version') ||
      !Object.hasOwn(raw, 'next') || raw.version !== 1 || !raw.next ||
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
    return { ...next } as Record<IdKind, number>;
  }
}
