/**
 * M15 phase 11a. What fits in a pair of hands — the gate `Person.inventory`
 * has never had.
 *
 * `Config.carry.legacyPack` keeps every function here delegating to today's
 * flat capacity (`40 × vigour × carryFactor`) so this commit changes nothing
 * about what anyone can carry. Phase 11c switches it off and gives
 * `capacityFor`, `canTake` and `stow` a second branch that checks
 * `Person.equipment`'s five slots and the container ladder (bundle, hide
 * bag, basket, sledge, cart) instead of one flat number.
 *
 * `Person.inventory` does not go away even once that lands: it stays the
 * total of everything carried, so the hundreds of existing `inventory.has(…)`
 * reads keep working. What changes is only how much of it fits — decided
 * here, not by `Inventory` itself.
 */
import type { Person } from '../entities/Person.ts';
import type { SimConfig } from './Config.ts';

/** How much this person can carry in total, right now. */
export function capacityFor(person: Person, _config: SimConfig): number {
  // The only branch that exists yet. `Person.carryCapacity` is the formula
  // this delegates to rather than duplicates, so the two can never drift.
  return person.carryCapacity;
}

/** Whether `n` more of `itemId` would fit. */
export function canTake(person: Person, config: SimConfig, _itemId: string, n: number): boolean {
  return person.carrying + n <= capacityFor(person, config);
}

/**
 * Adds `n` of `itemId` to whatever this person is carrying.
 *
 * In the legacy branch this is `Person.inventory.add` under another name —
 * there are no slots yet to choose between. Phase 11c is what makes this
 * function's name true: deciding which hand, the back, the belt or a
 * container receives the item, and refusing what does not fit anywhere.
 */
export function stow(person: Person, _config: SimConfig, itemId: string, n: number): void {
  person.inventory.add(itemId, n);
}
