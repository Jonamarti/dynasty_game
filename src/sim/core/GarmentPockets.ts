/** Capacity supplied by pockets sewn or tied to garments that are actually worn. */
import { GARMENT_SLOTS } from '../entities/Equipment.ts';
import { ITEMS, type ItemClass } from '../entities/Item.ts';
import type { Person } from '../entities/Person.ts';

/**
 * Pockets hold small items only. Garments remain ordinary inventory stacks;
 * requiring both the canonical equipment slot and owned inventory avoids
 * stale checkpoint/transfer references granting free capacity.
 */
export function garmentPocketCapacity(person: Person, itemClass?: ItemClass): number {
  if (itemClass && itemClass !== 'small') return 0;
  let capacity = 0;
  for (const slot of GARMENT_SLOTS) {
    const worn = person.equipment[slot];
    if (!worn || person.inventory.count(worn.item) <= 0) continue;
    const garment = ITEMS[worn.item]?.garment;
    if (garment?.slot === slot) capacity += garment.pocket ?? 0;
  }
  return capacity;
}
