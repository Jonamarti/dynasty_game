/**
 * A household: the unit a dynasty is actually made of.
 *
 * Bands are a place and a culture; households are a family with a head, a
 * home and a line of succession. The distinction matters because the design
 * pillar is that *the head concentrates most of the power* — an order from
 * the head of your household carries weight that the same words from a
 * neighbour do not, and inheritance follows the household rather than the band.
 *
 * Households outlive their members. When a head dies the household does not
 * dissolve; it passes, which is the whole point.
 */
let nextHouseholdId = 1;

export function resetHouseholdIds(): void {
  nextHouseholdId = 1;
}

export class Household {
  readonly id: number;
  /** The founding surname. Children carry it; it is what a dynasty is called. */
  readonly name: string;
  headId: number;
  memberIds: number[] = [];
  bandId: number;

  /**
   * The building where this family's goods live — wherever `shareTheHearth`
   * last found a member of it asleep under a roof. Null until somebody in it
   * has slept anywhere but the open ground.
   *
   * **M11 phase 6a** replaced a `store` of its own here: an `Inventory`
   * hanging off a `Household` has no position, so nobody could ever walk to
   * it — which meant nothing could be stolen from it either, exactly the
   * property phase 4's `mayUse` needs. A family's goods now live in a real
   * building, which is somewhere a rival can actually go.
   */
  homeBuildingId: number | null = null;

  /**
   * Deeds worth remembering, accumulated across every member and every
   * generation. This is the compounding the long game runs on, and it is the
   * one number that genuinely belongs to the family rather than the person.
   */
  renown = 0;
  /** Stored wealth remembered by the household, including inherited position. */
  wealth = 0;

  /** Persistent hostility toward other houses, keyed by household id. */
  readonly feud = new Map<number, number>();
  /** The last known culprit for each feud, so revenge names a person rather
   * than falling back to the first unrelated stranger nearby. */
  readonly feudSuspects = new Map<number, number>();

  /** Ticks at which the household was founded and (if ever) died out. */
  readonly foundedTick: number;
  endedTick: number | null = null;

  constructor(name: string, headId: number, bandId: number, tick: number) {
    this.id = nextHouseholdId++;
    this.name = name;
    this.headId = headId;
    this.bandId = bandId;
    this.foundedTick = tick;
  }

  get extinct(): boolean {
    return this.memberIds.length === 0;
  }

  add(personId: number): void {
    if (!this.memberIds.includes(personId)) this.memberIds.push(personId);
  }

  remove(personId: number): void {
    const index = this.memberIds.indexOf(personId);
    if (index >= 0) this.memberIds.splice(index, 1);
  }
}

/**
 * A band's own average `renown` across its households — the reference every
 * reader of renown compares one household against, rather than any fixed
 * number, so that a band where every household is equally regarded produces
 * a term of exactly zero for all of them. Shared between `Authority.ts`'s
 * `inequalityTerm` and `BandSystem.ts`'s `standingScore` because both ask
 * this same question and a second copy is how the two would quietly drift
 * apart the first time either one changed what counts as a household's band.
 */
export function averageRenown(bandId: number, householdsById: ReadonlyMap<number, Household>): number {
  let total = 0;
  let count = 0;
  for (const household of householdsById.values()) {
    if (household.bandId !== bandId || household.extinct) continue;
    total += household.renown;
    count++;
  }
  return count > 0 ? total / count : 0;
}
