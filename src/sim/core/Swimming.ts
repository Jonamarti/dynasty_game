import type { Person } from '../entities/Person.ts';
import type { World } from './World.ts';
import { ITEMS } from '../entities/Item.ts';
import { t } from '../../i18n/i18n.ts';

export type SwimRefusal = 'hands_not_empty' | 'too_deep' | 'too_cold_to_swim';

/** A back basket is fine; hands, shoulder loads, and a baby in arms are not. */
export function handsEmptyForSwimming(person: Person): boolean {
  if (person.armsTaken !== 0 || person.equipment.left || person.equipment.right || person.equipment.shoulder) return false;
  const back = person.equipment.back;
  if (person.inventory.total === 0) return true;
  if (!back) return false;
  const basket = ITEMS[back.item]?.container;
  if (!basket || basket.slot !== 'back') return false;

  // Inventory stacks do not track which container holds each unit. Check the
  // strongest valid case: every carried unit fits the back basket's accepted
  // classes and its capacity, excluding the basket itself.
  let stowed = 0;
  for (const [itemId, count] of person.inventory.entries()) {
    const equippedCount = itemId === back.item ? back.count : 0;
    const loose = Math.max(0, count - equippedCount);
    if (loose === 0) continue;
    const item = ITEMS[itemId];
    if (!item || !basket.accepts.includes(item.class)) return false;
    stowed += loose;
    if (stowed > basket.capacity) return false;
  }
  return true;
}

/** Shared order/menu gate so a disabled option and an issued order agree. */
export function swimRefusal(
  person: Person,
  world: World,
  x: number,
  y: number,
  drownAt: number
): SwimRefusal | null {
  if (!world.isSwimTile(x, y)) return 'too_deep';
  return swimRouteRefusal(person, drownAt);
}

/** Gate a journey that crosses swim tiles but ends on ordinary dry land. */
export function swimRouteRefusal(
  person: Person,
  drownAt: number
): SwimRefusal | null {
  if (!handsEmptyForSwimming(person)) return 'hands_not_empty';
  if (person.needs.cold >= drownAt || person.needs.fatigue >= drownAt) return 'too_cold_to_swim';
  return null;
}

export function swimRefusalText(reason: SwimRefusal): string {
  switch (reason) {
    case 'hands_not_empty': return t('Put down what you are holding before swimming');
    case 'too_deep': return t('That water is too deep to swim');
    case 'too_cold_to_swim': return t('You are too cold or tired to swim safely');
  }
}
