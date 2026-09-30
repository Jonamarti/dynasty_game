/**
 * What somebody has learned about when each kind of plant bears, M15 phase 20.
 *
 * The owner's answer of 2026-09-30 to "does anybody know that bushes bear
 * nothing in winter?": nobody knows it to begin with. With plant lore
 * ("which leaf, which berry, and when") a person can learn it by watching,
 * kind by kind, since each kind bears in its own seasons: two winters of
 * finding a kind bare and never in fruit, having seen it in fruit some other
 * season, and they know. Only then may they pass over a remembered place of
 * that kind in that season without walking to it
 * (`Brain.collectKnownNodes`) — the rule that places are known only by
 * looking stays whole, because this is also knowledge got by looking.
 *
 * Years are counted, not sightings: one winter of walking past fifty stripped
 * bushes is still one winter, and one bush in fruit in any winter undoes the
 * lesson, because it is true that bushes can.
 */
import type { Season } from '../core/TimeManager.ts';

const SEASON_INDEX: Record<Season, number> = { spring: 0, summer: 1, autumn: 2, winter: 3 };

/** Winters (or springs, or…) of seeing a kind only bare before the lesson is learned. */
export const BARE_YEARS_TO_LEARN = 2;

interface KindRecord {
  /** Per season, the years in which it was seen in fruit. */
  bearing: Set<number>[];
  /** Per season, the years in which it was seen bare. */
  bare: Set<number>[];
}

export class SeasonLore {
  private readonly kinds = new Map<string, KindRecord>();

  /** One sighting of a plant of `kind`, in fruit or not. */
  observe(kind: string, season: Season, year: number, bearing: boolean): void {
    let record = this.kinds.get(kind);
    if (!record) {
      record = { bearing: [new Set(), new Set(), new Set(), new Set()], bare: [new Set(), new Set(), new Set(), new Set()] };
      this.kinds.set(kind, record);
    }
    (bearing ? record.bearing : record.bare)[SEASON_INDEX[season]]!.add(year);
  }

  /**
   * Known to bear nothing in `season`: bare there in `BARE_YEARS_TO_LEARN`
   * different years, never seen in fruit there, and seen in fruit in some
   * other season (so it is known as a plant that bears at all).
   */
  barrenIn(kind: string, season: Season): boolean {
    const record = this.kinds.get(kind);
    if (!record) return false;
    const s = SEASON_INDEX[season];
    if (record.bearing[s]!.size > 0 || record.bare[s]!.size < BARE_YEARS_TO_LEARN) return false;
    return record.bearing.some((years, i) => i !== s && years.size > 0);
  }

  /** The seasons `kind` is known to bear nothing in, for the panel. */
  barrenSeasons(kind: string): Season[] {
    return (Object.keys(SEASON_INDEX) as Season[]).filter(season => this.barrenIn(kind, season));
  }

  /** Every kind with something learned about it. */
  learnedKinds(): string[] {
    return [...this.kinds.keys()].filter(kind => this.barrenSeasons(kind).length > 0);
  }
}
