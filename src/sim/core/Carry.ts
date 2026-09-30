/** M15 phase 11: hands and the containers that turn hands into carrying. */
import { ITEMS, type ItemClass } from '../entities/Item.ts';
import type { Person } from '../entities/Person.ts';
import type { CarryConfig } from './Config.ts';
import { carryFactor } from '../knowledge/Tech.ts';
import { telemetry } from './Telemetry.ts';

const BARE_HANDS = 10;

/** Arms not holding a baby. */
function freeArms(person: Person): number {
  return Math.max(0, 2 - person.armsTaken);
}

function equippedCapacity(person: Person, itemClass?: ItemClass): number {
  let capacity = 0;
  for (const slot of ['left', 'right', 'back', 'belt', 'shoulder'] as const) {
    const item = person.equipment[slot];
    if (!item) continue;
    const def = ITEMS[item.item];
    if (!def?.container) continue;
    if (!itemClass || def.container.accepts.includes(itemClass)) capacity += def.container.capacity;
  }
  return capacity;
}

/** Total carrying room, in units, from hands and containers actually equipped. */
export function capacityFor(person: Person, config: CarryConfig): number {
  if (config.legacyPack) return Math.round(40 * person.vigour * carryFactor(person));
  return Math.max(1, Math.floor(BARE_HANDS * person.vigour * freeArms(person) / 2 + equippedCapacity(person)));
}

/** Maximum amount of one item the hands, shoulder and fitted containers can hold. */
export function itemCapacityFor(person: Person, config: CarryConfig, itemId: string): number {
  if (config.legacyPack) return capacityFor(person, config);
  const def = ITEMS[itemId];
  if (!def) return 0;
  // Both arms hold an armful; one arm, with a baby in the other, holds a
  // handful; a baby in each holds nothing but what is worn.
  const arms = freeArms(person);
  const handCapacity = Math.max(0, Math.floor(
    (arms === 2 ? def.hand.perArms : arms === 1 ? def.hand.perHand : 0) * person.vigour));
  const shoulderCapacity = (!person.equipment.shoulder || person.equipment.shoulder.item === itemId)
    ? Math.floor((def.hand.shoulder ?? 0) * person.vigour)
    : 0;
  return Math.max(def.container ? 1 : 0,
    handCapacity + shoulderCapacity + equippedCapacity(person, def.class));
}

/** Whether `n` more of `itemId` fits both the overall load and its own limits. */
export function canTake(person: Person, config: CarryConfig, itemId: string, n: number): boolean {
  if (n <= 0) return true;
  if (config.legacyPack) return person.carrying + n <= capacityFor(person, config);
  return person.carrying + n <= capacityFor(person, config) &&
    person.inventory.count(itemId) + n <= itemCapacityFor(person, config, itemId);
}

/** Place one container in its intended slot when it is crafted or picked up. */
export function equipContainer(person: Person, itemId: string, count = 1): boolean {
  const container = ITEMS[itemId]?.container;
  if (!container || person.equipment[container.slot]) return false;
  person.equipment[container.slot] = { item: itemId, count };
  person.carryContainerCapacity += container.capacity;
  return true;
}

/** Add only what fits and return the amount accepted. */
export function stow(person: Person, config: CarryConfig, itemId: string, n: number): number {
  if (n <= 0) return 0;
  if (config.legacyPack) {
    const accepted = Math.min(n, Math.max(0, person.carryCapacity - person.carrying));
    if (accepted) person.inventory.add(itemId, accepted);
    return accepted;
  }
  equipContainer(person, itemId);
  let accepted = 0;
  while (accepted < n && canTake(person, config, itemId, 1)) accepted++;
  if (accepted) person.inventory.add(itemId, accepted);
  return accepted;
}

/** Sledges extend a load but slow the carrier by their configured drag factor. */
export function carrySpeedFactor(person: Person, sledgeSpeed = 0.8): number {
  return person.equipment.left?.item === 'sledge' ? sledgeSpeed : 1;
}

/** Drop excess at the person's feet after transfers, keeping every item in the world. */
export function reconcileCarry(
  person: Person,
  config: CarryConfig,
  dropAt: (x: number, y: number, itemId: string, count: number) => void,
): number {
  let dropped = 0;
  for (const slot of ['left', 'right', 'back', 'belt', 'shoulder'] as const) {
    const equipped = person.equipment[slot];
    if (equipped && person.inventory.count(equipped.item) === 0) {
      person.carryContainerCapacity -= ITEMS[equipped.item]?.container?.capacity ?? 0;
      delete person.equipment[slot];
    }
  }
  while (true) {
    const totalExcess = Math.max(0, person.carrying - capacityFor(person, config));
    let chosen: [string, number, number] | undefined;
    const equippedContainers = new Set(Object.values(person.equipment).filter(Boolean).map(item => item!.item));
    const entries = person.inventory.entries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const [itemId, count] = entries[i]!;
      const overItem = count - itemCapacityFor(person, config, itemId);
      if (overItem > 0) {
        chosen = [itemId, count, overItem];
        break;
      }
      if (totalExcess > 0 && !equippedContainers.has(itemId)) {
        chosen = [itemId, count, totalExcess];
        break;
      }
    }
    if (!chosen) break;
    const [itemId, count, amount] = chosen;
    const removed = person.inventory.remove(itemId, Math.min(count, amount));
    if (removed <= 0) break;
    for (const slot of ['left', 'right', 'back', 'belt', 'shoulder'] as const) {
      if (person.equipment[slot]?.item === itemId && person.inventory.count(itemId) === 0) {
        person.carryContainerCapacity -= ITEMS[itemId]?.container?.capacity ?? 0;
        delete person.equipment[slot];
      }
    }
    dropAt(person.x, person.y, itemId, removed);
    dropped += removed;
    telemetry.count('carry_overflow_dropped', removed);
  }
  if (person.carrying > capacityFor(person, config)) telemetry.count('carry_over_capacity_samples');
  return dropped;
}
