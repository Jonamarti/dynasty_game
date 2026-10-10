/** M15 phase 11d: move the tool an action needs into the hands doing it. */
import type { Person } from '../entities/Person.ts';
import { GARMENT_SLOTS } from '../entities/Equipment.ts';
import { ITEMS } from '../entities/Item.ts';
import { axeItemOf, weaponItemOf } from '../knowledge/Tech.ts';
import type { CarryConfig } from './Config.ts';
import { reconcileCarry } from './Carry.ts';
import { t } from '../../i18n/i18n.ts';

export type ManualEquipmentSlot = 'left' | 'right' | 'back';
export type ManualEquipReason =
  | 'item_not_owned' | 'unknown_item' | 'wrong_slot' | 'hands_full' | 'baby_uses_hand'
  | 'already_equipped';

export function manualEquipSlot(action: string): ManualEquipmentSlot | null {
  if (action === 'equip_left') return 'left';
  if (action === 'equip_right') return 'right';
  if (action === 'equip_back') return 'back';
  return null;
}

export type ManualGarmentVerb = 'wear_garment' | 'take_off_garment';
export type ManualGarmentReason = 'unknown_garment' | 'garment_not_owned'
  | 'garment_already_worn' | 'garment_not_worn' | 'too_young_to_wear';

/** Same preflight for the Kit, Simulation.order and the timer's last tick. */
export function manualGarmentRefusal(
  person: Person, itemId: string, verb: ManualGarmentVerb,
): ManualGarmentReason | null {
  const garment = ITEMS[itemId]?.garment;
  if (!garment) return 'unknown_garment';
  if (person.age < 1) return 'too_young_to_wear';
  if (person.inventory.count(itemId) <= 0) return 'garment_not_owned';
  const worn = person.equipment[garment.slot]?.item === itemId;
  if (verb === 'wear_garment' && worn) return 'garment_already_worn';
  if (verb === 'take_off_garment' && !worn) return 'garment_not_worn';
  return null;
}

export function manualGarmentReasonText(reason: ManualGarmentReason): string {
  switch (reason) {
    case 'unknown_garment': return t('That is not a garment');
    case 'garment_not_owned': return t('You no longer have that garment');
    case 'garment_already_worn': return t('That garment is already being worn');
    case 'garment_not_worn': return t('That garment is not being worn');
    case 'too_young_to_wear': return t('That person is too young to dress themselves');
  }
}

/**
 * Wear or remove an owned garment without changing its inventory count. The
 * garment slots are references into inventory, so changing clothes never
 * creates or destroys a copy and replacing a layer leaves the old one packed.
 */
export function changeGarment(
  person: Person, itemId: string, verb: ManualGarmentVerb,
): ManualGarmentReason | null {
  const refusal = manualGarmentRefusal(person, itemId, verb);
  if (refusal) return refusal;
  const slot = ITEMS[itemId]!.garment!.slot;
  if (verb === 'take_off_garment') {
    delete person.equipment[slot];
    return null;
  }

  // An item has one canonical wearable reference. This also heals malformed
  // old state with the same coat copied into two body slots.
  for (const garmentSlot of GARMENT_SLOTS) {
    if (person.equipment[garmentSlot]?.item === itemId) delete person.equipment[garmentSlot];
  }
  person.equipment[slot] = { item: itemId, count: 1 };
  return null;
}

export type ToolAction = 'chop' | 'hunt' | 'forage';

export interface ToolFitResult {
  changed: boolean;
  /** A reason for the action system to report through its existing refusal path. */
  reason: 'hands_full' | null;
}

/** Best usable tool the person owns for this action, or null for bare hands. */
export function toolForAction(person: Person, action: ToolAction): string | null {
  if (action === 'chop') return axeItemOf(person);
  if (action === 'hunt') return weaponItemOf(person, true, false,
    person.armsTaken === 0 ? 2 : 1);
  return null;
}

/** The same preflight is used when the UI asks and when the timer completes. */
export function manualEquipRefusal(
  person: Person, itemId: string, slot: ManualEquipmentSlot,
): ManualEquipReason | null {
  const def = ITEMS[itemId];
  if (!def) return 'unknown_item';
  if (person.inventory.count(itemId) <= 0) return 'item_not_owned';
  if (def.garment) return 'wrong_slot';
  if (slot === 'back' && def.container?.slot !== 'back') return 'wrong_slot';
  if (slot !== 'back') {
    if (person.armsTaken >= 2 || def.hand.hands > 2 - person.armsTaken) return 'hands_full';
    // Babies take the same left-to-right hand assignment the kit shows. A
    // manual equip never moves one to make room for an object.
    if ((slot === 'left' && person.armsTaken > 0) ||
      (slot === 'right' && person.armsTaken > 1)) return 'baby_uses_hand';
    if (def.hand.hands === 2 && (person.armsTaken > 0 || slot !== 'left')) return 'hands_full';
    // Manual equipment can normally replace a fitted object, but a lit torch
    // is a live fuel record. Dropping its inventory copy would silently erase
    // the flame and reset the visible countdown.
    const targets = def.hand.hands === 2 ? ['left', 'right'] as const : [slot] as const;
    if (targets.some(target => person.equipment[target]?.item !== itemId &&
      (person.equipment[target]?.lit ?? 0) > 0)) return 'hands_full';
  }
  if (person.equipment[slot]?.item === itemId &&
    (slot === 'back' || def.hand.hands === 1 || person.equipment.left?.item === itemId &&
      person.equipment.right?.item === itemId)) return 'already_equipped';
  return null;
}

/** Player-facing sentence for a failed manual equipment order. */
export function manualEquipReasonText(reason: ManualEquipReason): string {
  switch (reason) {
    case 'item_not_owned': return t('You no longer have that item');
    case 'unknown_item': return t('That is not something you can equip');
    case 'wrong_slot': return t('That item does not fit there');
    case 'hands_full': return t('There are not enough free hands for that item');
    case 'baby_uses_hand': return t('A baby is using that hand');
    case 'already_equipped': return t('That item is already equipped there');
  }
}

/**
 * Equip one owned item, dropping displaced objects as real piles. Inventory is
 * the ownership record, so the fitted item remains in its stack; displaced
 * items leave the stack exactly once and any lost container room is reconciled.
 */
export function equipItemInSlot(
  person: Person,
  itemId: string,
  slot: ManualEquipmentSlot,
  config: CarryConfig,
  dropAt: (x: number, y: number, itemId: string, count: number) => void,
): ManualEquipReason | null {
  const refusal = manualEquipRefusal(person, itemId, slot);
  if (refusal) return refusal;

  const desired = ITEMS[itemId]!;
  const wasEquipped = Object.values(person.equipment).some(entry => entry?.item === itemId);
  const prior = Object.values(person.equipment).find(entry => entry?.item === itemId);
  const targets: ManualEquipmentSlot[] = slot === 'back' || desired.hand.hands === 1
    ? [slot] : ['left', 'right'];
  const displaced = new Set<string>();

  // Moving a fitted object is not a second copy. Remove all of its old slot
  // references while retaining its capacity contribution.
  for (const oldSlot of ['left', 'right', 'back', 'belt', 'shoulder'] as const) {
    if (person.equipment[oldSlot]?.item === itemId) delete person.equipment[oldSlot];
  }

  // A two-handed object occupies both hands. A container fitted on the back
  // occupies only that slot and may displace its former contents safely.
  for (const target of targets) {
    const current = person.equipment[target];
    if (current && current.item !== itemId) displaced.add(current.item);
    if (current?.item !== itemId) delete person.equipment[target];
  }
  // Two-handed equipment has a reference in both hands. Replacing just one
  // side must clear the other side too, or the dropped item remains fitted
  // after its only inventory copy has left.
  for (const oldSlot of ['left', 'right', 'back', 'belt', 'shoulder'] as const) {
    const held = person.equipment[oldSlot];
    if (held && displaced.has(held.item)) delete person.equipment[oldSlot];
  }
  for (const displacedId of displaced) {
    const count = person.inventory.remove(displacedId, 1);
    if (count <= 0) continue;
    const container = ITEMS[displacedId]?.container;
    if (container) person.carryContainerCapacity = Math.max(0,
      person.carryContainerCapacity - container.capacity);
    dropAt(person.x, person.y, displacedId, count);
  }
  if (desired.container && !wasEquipped) person.carryContainerCapacity += desired.container.capacity;
  for (const target of targets) person.equipment[target] = prior
    ? { ...prior, count: 1 } : { item: itemId, count: 1 };
  if (displaced.size > 0) reconcileCarry(person, config, dropAt);
  return null;
}

/**
 * Fit a tool for one action. Inventory remains the record of possession;
 * equipment is the separate record of what is in hand. Replacing a fitted
 * object puts it on the ground, and moving a fitted container first reconciles
 * any load that no longer fits so neither the container nor its contents vanish.
 */
export function equipFor(
  person: Person,
  action: ToolAction,
  config: CarryConfig,
  dropAt: (x: number, y: number, itemId: string, count: number) => void,
): ToolFitResult {
  if (person.armsTaken >= 2) return { changed: false, reason: 'hands_full' };
  cleanEmptyHandSlots(person);
  const desired = toolForAction(person, action);
  const desiredHands = desired ? ITEMS[desired]!.hand.hands : 0;
  const targets: ('left' | 'right')[] = [];
  const displaced = new Set<string>();

  if (desiredHands > 2 - person.armsTaken) return { changed: false, reason: 'hands_full' };
  // With a baby occupying the other arm, fitting a tool would discard the
  // only usable hand's burning fuel record. Refuse before changing any slot.
  if (desired && person.armsTaken === 1 &&
    Object.values(person.equipment).some(entry => (entry?.lit ?? 0) > 0)) {
    return { changed: false, reason: 'hands_full' };
  }

  // A two-handed load occupies both hands even though its fitted container is
  // represented in one slot. Clear it before deciding whether a one-handed
  // tool can share the other slot.
  for (const slot of ['left', 'right'] as const) {
    const itemId = person.equipment[slot]?.item;
    if (itemId && itemId !== desired && (ITEMS[itemId]?.hand.hands ?? 1) === 2) {
      displaced.add(itemId);
      delete person.equipment[slot];
      for (const other of ['left', 'right'] as const) {
        if (person.equipment[other]?.item === itemId) delete person.equipment[other];
      }
    }
  }

  if (desired === null) {
    // A baby can make a previously fitted bow unusable with no smaller weapon
    // available. Release the two-handed load before falling back to bare hands.
    if (action !== 'forage') {
      dropItems(person, displaced, config, dropAt);
      return { changed: displaced.size > 0, reason: null };
    }
    let changed = displaced.size > 0;
    for (const slot of ['left', 'right'] as const) {
      const equipped = person.equipment[slot];
      if (!equipped) continue;
      if ((equipped.lit ?? 0) > 0) continue;
      delete person.equipment[slot];
      displaced.add(equipped.item);
      changed = true;
    }
    dropItems(person, displaced, config, dropAt);
    return { changed, reason: null };
  }

  // Bow-like tools need both hands. A one-handed tool can use the right hand
  // even while a shoulder load or another item occupies the left.
  if (desiredHands === 1) {
    if (person.equipment.right?.item === desired || person.equipment.left?.item === desired) {
      releaseBabyHand(person.equipment.right?.item === desired ? 'right' : 'left');
      const changed = displaced.size > 0;
      dropItems(person, displaced, config, dropAt);
      return { changed, reason: null };
    }
    // Prefer an empty hand so swapping one tool does not drop the other. If
    // both are occupied, replace the right hand consistently.
    targets.push(!person.equipment.right ? 'right' : !person.equipment.left ? 'left' :
      (person.equipment.right?.lit ?? 0) > 0 ? 'left' : 'right');
  } else if (person.equipment.left?.item === desired && person.equipment.right?.item === desired) {
    const changed = displaced.size > 0;
    dropItems(person, displaced, config, dropAt);
    return { changed, reason: null };
  } else if (desiredHands === 2) {
    if ((person.equipment.left?.lit ?? 0) > 0 || (person.equipment.right?.lit ?? 0) > 0) {
      return { changed: false, reason: 'hands_full' };
    }
    targets.push('left', 'right');
  }

  // If both hands carry a live flame, an action that needs another tool waits
  // instead of dropping either fuel record behind the person's back.
  if (targets.some(slot => (person.equipment[slot]?.lit ?? 0) > 0)) {
    return { changed: false, reason: 'hands_full' };
  }

  // The baby already owns one arm. Keeping a second fitted object beside a
  // one-handed tool would invent a third hand, even when a slot looks empty.
  if (person.armsTaken === 1 && desiredHands === 1) {
    const toolSlot = targets[0] ??
      (person.equipment.right?.item === desired ? 'right' : 'left');
    releaseBabyHand(toolSlot);
  }

  for (const slot of targets) {
    const current = person.equipment[slot];
    if (current && current.item !== desired) displaced.add(current.item);
    if (current?.item !== desired) delete person.equipment[slot];
  }
  // A tool that was packed on the back or belt is the same owned item once it
  // reaches a hand. Remove the old slot reference before creating the new one.
  for (const slot of ['back', 'belt', 'shoulder'] as const) {
    if (person.equipment[slot]?.item === desired) delete person.equipment[slot];
  }
  for (const slot of targets) person.equipment[slot] = { item: desired, count: 1 };
  dropItems(person, displaced, config, dropAt);
  return { changed: true, reason: null };

  function releaseBabyHand(toolSlot: 'left' | 'right'): void {
    if (person.armsTaken !== 1) return;
    const otherSlot = toolSlot === 'right' ? 'left' : 'right';
    const other = person.equipment[otherSlot];
    if (other) {
      displaced.add(other.item);
      delete person.equipment[otherSlot];
    }
  }
}

/** Old saves and ownership transfers can leave a slot pointing at no item. */
function cleanEmptyHandSlots(person: Person): void {
  for (const slot of ['left', 'right'] as const) {
    const equipped = person.equipment[slot];
    if (equipped && person.inventory.count(equipped.item) <= 0) {
      const capacity = ITEMS[equipped.item]?.container?.capacity ?? 0;
      if (capacity > 0) {
        person.carryContainerCapacity = Math.max(0, person.carryContainerCapacity - capacity);
      }
      delete person.equipment[slot];
    }
  }
}

function dropItems(
  person: Person,
  itemIds: ReadonlySet<string>,
  config: CarryConfig,
  dropAt: (x: number, y: number, itemId: string, count: number) => void,
): void {
  let droppedContainer = false;
  for (const itemId of itemIds) {
    const count = person.inventory.remove(itemId, 1);
    if (count <= 0) continue;
    const container = ITEMS[itemId]?.container;
    if (container) {
      person.carryContainerCapacity = Math.max(0,
        person.carryContainerCapacity - container.capacity);
      droppedContainer = true;
    }
    dropAt(person.x, person.y, itemId, count);
  }
  if (droppedContainer) reconcileCarry(person, config, dropAt);
}
