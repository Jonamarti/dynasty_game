/**
 * A household: the unit a dynasty is actually made of.
 *
 * Bands are a place and a culture; households are a family with a head, a
 * shared store and a line of succession. The distinction matters because the
 * design pillar is that *the head concentrates most of the power* — an order
 * from the head of your household carries weight that the same words from a
 * neighbour do not, and inheritance follows the household rather than the band.
 *
 * Households outlive their members. When a head dies the household does not
 * dissolve; it passes, which is the whole point.
 */
import { Inventory } from './Item.ts';

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

  /** Goods held in common, distinct from what anyone carries. */
  readonly store = new Inventory();

  /**
   * Deeds worth remembering, accumulated across every member and every
   * generation. This is the compounding the long game runs on, and it is the
   * one number that genuinely belongs to the family rather than the person.
   */
  renown = 0;

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
