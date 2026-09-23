/**
 * M11 phase 13d (owner's note 15): the *Life* panel, folded.
 *
 * Every `emit` writes one line into a chronicle, and some acts are many small
 * deeds rather than one large one — `storeItem` emits `trespass` on every
 * click, so twenty clicks at a rival's store wrote twenty "used what wasn't
 * theirs" and pushed everything else off the panel. The fold happens here, in
 * the presentation, and never in the chronicle itself: the succession screen
 * and the health checks read the chronicle, and a count of twenty deeds is a
 * different fact from one deed with "×20" written after it.
 */

/** The fields of a remembered entry this needs; `LifeEvent` has them all. */
export interface LogEntry {
  tick: number;
  ageDays: number;
  text: string;
  kind: string;
}

export interface FoldedEntry<T extends LogEntry> {
  /** The earliest of the run. */
  first: T;
  /** The latest of the run, which is the one that says how recent it is. */
  last: T;
  count: number;
}

/**
 * Runs of consecutive entries with the same text and kind, in the order
 * given. Only *consecutive* ones: a theft, a meal, then another theft is a
 * story with something in the middle, and folding it would lose the middle.
 */
export function foldRepeats<T extends LogEntry>(entries: readonly T[]): FoldedEntry<T>[] {
  const folded: FoldedEntry<T>[] = [];
  for (const entry of entries) {
    const run = folded[folded.length - 1];
    if (run && run.last.text === entry.text && run.last.kind === entry.kind) {
      run.last = entry;
      run.count++;
    } else {
      folded.push({ first: entry, last: entry, count: 1 });
    }
  }
  return folded;
}
