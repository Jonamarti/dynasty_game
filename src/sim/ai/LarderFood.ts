import type { CarryConfig } from '../core/Config.ts';
import { canTake } from '../core/Carry.ts';
import { knowsPoisonous } from '../core/Macros.ts';
import { isHerd, type Building } from '../entities/Building.ts';
import { ITEMS } from '../entities/Item.ts';
import type { Person } from '../entities/Person.ts';
import { availableDraftHeads } from '../systems/Draft.ts';

/** Keep the old nutrition ranking among viable food stacks. No transfer or RNG. */
export function withdrawableLarderFood(
  person: Person, store: Building, carry: CarryConfig | undefined,
  peopleById: ReadonlyMap<number, Person>, buildingsById: ReadonlyMap<number, Building>,
): string | null {
  if (!store.complete || store.ruined || store.def.storage <= 0 ||
      person.carrying >= person.carryCapacity) return null;
  let best: string | null = null;
  let nutrition = 0;
  for (const [id, count] of store.store.entries()) {
    const value = ITEMS[id]?.nutrition ?? 0;
    if (count <= 0 || value <= nutrition || knowsPoisonous(person, id)) continue;
    if (isHerd(store.def) && id === 'meat' &&
        availableDraftHeads(store, peopleById, buildingsById) <= 0) continue;
    if (carry && !canTake(person, carry, id, 1)) continue;
    best = id; nutrition = value;
  }
  return best;
}
