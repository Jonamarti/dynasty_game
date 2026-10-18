/** M15 phase 11: hands and the containers that turn hands into carrying. */
import { ITEMS, type GarmentUnit, type ItemClass } from '../entities/Item.ts';
import { GARMENT_SLOTS } from '../entities/Equipment.ts';
import type { Person } from '../entities/Person.ts';
import { handfulsOnly } from '../entities/Pregnancy.ts';
import type { CarryConfig } from './Config.ts';
import { carryFactor } from '../knowledge/Tech.ts';
import { telemetry } from './Telemetry.ts';
import { garmentPocketCapacity } from './GarmentPockets.ts';
import { t } from '../../i18n/i18n.ts';

const BARE_HANDS = 10;

/**
 * Arms not holding a baby. M15 phase 19: in her last third a woman with child
 * has the use of one arm's reach at most — the belly is in the way of an
 * armful — so she carries handfuls, never armfuls, whatever her arms hold.
 */
function freeArms(person: Person): number {
  return Math.max(0, Math.min(handfulsOnly(person) ? 1 : 2, 2 - person.armsTaken));
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
  return capacity + garmentPocketCapacity(person, itemClass);
}

/** Total carrying room, in units, from hands and containers actually equipped. */
export function capacityFor(person: Person, config: CarryConfig): number {
  if (config.legacyPack) return Math.round(40 * person.vigour * carryFactor(person)) + person.transportCapacity;
  return Math.max(1, Math.floor(BARE_HANDS * person.vigour * freeArms(person) / 2 + equippedCapacity(person) + person.transportCapacity));
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
  // Nothing on the shoulder in her last third (M15 phase 19): a log across it
  // is the load the plan names first.
  const shoulderCapacity = (!handfulsOnly(person) &&
      (!person.equipment.shoulder || person.equipment.shoulder.item === itemId))
    ? Math.floor((def.hand.shoulder ?? 0) * person.vigour)
    : 0;
  return Math.max(def.container ? 1 : 0,
    handCapacity + shoulderCapacity + equippedCapacity(person, def.class) + person.transportCapacity);
}

/** Whether `n` more of `itemId` fits both the overall load and its own limits. */
export function canTake(person: Person, config: CarryConfig, itemId: string, n: number): boolean {
  if (n <= 0) return true;
  if (config.legacyPack) return person.carrying + n <= capacityFor(person, config);
  return person.carrying + n <= capacityFor(person, config) &&
    person.inventory.count(itemId) + n <= itemCapacityFor(person, config, itemId);
}

export type PickupRefusal = 'pickup_full' | 'bundle_on_shoulder' | 'item_capacity';

/** One answer for the pile menu and the action that carries its order out. */
export function pickupRefusal(
  person: Person, config: CarryConfig, itemId: string,
): PickupRefusal | null {
  if (person.carrying >= person.carryCapacity) return 'pickup_full';
  if (canTake(person, config, itemId, 1)) return null;
  if (itemId === 'bundle' && person.equipment.shoulder?.item === 'bundle') return 'bundle_on_shoulder';
  return 'item_capacity';
}

/** The menu and the stop floater share the same translated refusal wording. */
export function pickupRefusalText(reason: PickupRefusal): string {
  switch (reason) {
    case 'pickup_full': return t('There is no room to carry another item');
    case 'bundle_on_shoulder': return t('A bundle is already on the shoulder');
    case 'item_capacity': return t('This item has reached its carrying limit');
  }
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
  dropAt: (x: number, y: number, itemId: string, count: number, garmentUnits?: readonly GarmentUnit[]) => void,
): number {
  let dropped = 0;
  // Garment slots are references into owned inventory too. A transfer or a
  // direct drop of the final coat must not leave warmth, armour or a visible
  // layer behind after its copy has gone.
  clearUnownedEquipment(person);
  for (const slot of ['left', 'right', 'back', 'belt', 'shoulder'] as const) {
    const equipped = person.equipment[slot];
    if (equipped && person.inventory.count(equipped.item) === 0) {
      person.carryContainerCapacity -= ITEMS[equipped.item]?.container?.capacity ?? 0;
      delete person.equipment[slot];
    }
  }
  while (true) {
    const totalExcess = Math.max(0, person.carrying - capacityFor(person, config));
    let chosen: [string, number, number, ReadonlySet<string>] | undefined;
    const equippedContainers = new Set(Object.values(person.equipment).filter(Boolean).map(item => item!.item));
    const entries = person.inventory.entries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const [itemId, count] = entries[i]!;
      const isGarment = Boolean(ITEMS[itemId]?.garment);
      const protectedIds = isGarment ? wornUnitIds(person, itemId) : new Set<string>();
      const movable = isGarment
        ? person.inventory.garmentUnitsOf(itemId).filter(unit => !protectedIds.has(unit.unitId)).length
        : count;
      if (movable <= 0) continue;
      const overItem = count - itemCapacityFor(person, config, itemId);
      if (overItem > 0) {
        chosen = [itemId, count, Math.min(overItem, movable), protectedIds];
        break;
      }
      if (totalExcess > 0 && !equippedContainers.has(itemId)) {
        chosen = [itemId, count, Math.min(totalExcess, movable), protectedIds];
        break;
      }
    }
    if (!chosen) break;
    const [itemId, count, amount, protectedIds] = chosen;
    let units: GarmentUnit[] | undefined;
    let removed: number;
    if (ITEMS[itemId]?.garment) {
      units = [];
      for (let i = 0; i < Math.min(count, amount); i++) {
        const unit = person.inventory.takeGarmentUnit(itemId, protectedIds);
        if (!unit) break;
        units.push(unit);
      }
      removed = units.length;
    } else removed = person.inventory.remove(itemId, Math.min(count, amount));
    if (removed <= 0) break;
    clearUnownedEquipment(person);
    dropAt(person.x, person.y, itemId, removed, units);
    dropped += removed;
    telemetry.count('carry_overflow_dropped', removed);
  }
  if (person.carrying > capacityFor(person, config)) telemetry.count('carry_over_capacity_samples');
  return dropped;
}

function clearUnownedEquipment(person: Person): void {
  for (const slot of ['left', 'right', 'back', 'belt', 'shoulder'] as const) {
    const equipped = person.equipment[slot];
    if (!equipped || person.inventory.count(equipped.item) > 0) continue;
    person.carryContainerCapacity = Math.max(0,
      person.carryContainerCapacity - (ITEMS[equipped.item]?.container?.capacity ?? 0));
    delete person.equipment[slot];
  }
  reconcileGarmentEquipment(person);
}

/** Clear garment references after a physical unit was consumed or destroyed. */
export function reconcileGarmentEquipment(person: Person): void {
  for (const slot of GARMENT_SLOTS) {
    const equipped = person.equipment[slot];
    if (!equipped || !ITEMS[equipped.item]?.garment) continue;
    const units = person.inventory.garmentUnitsOf(equipped.item);
    if (units.length === 0) {
      delete person.equipment[slot];
      continue;
    }
    if (!equipped.unitId) {
      const alreadyWorn = wornUnitIds(person, equipped.item);
      equipped.unitId = units.find(unit => !alreadyWorn.has(unit.unitId))?.unitId ?? units[0]!.unitId;
    } else if (!units.some(unit => unit.unitId === equipped.unitId)) delete person.equipment[slot];
  }
}

function wornUnitIds(person: Person, itemId: string): Set<string> {
  const ids = new Set<string>();
  for (const slot of GARMENT_SLOTS) {
    const equipped = person.equipment[slot];
    if (equipped?.item === itemId && equipped.unitId) ids.add(equipped.unitId);
  }
  return ids;
}
