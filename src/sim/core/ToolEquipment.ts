/** M15 phase 11d: move the tool an action needs into the hands doing it. */
import type { Person } from '../entities/Person.ts';
import { ITEMS } from '../entities/Item.ts';
import { axeItemOf, weaponItemOf } from '../knowledge/Tech.ts';
import type { CarryConfig } from './Config.ts';
import { reconcileCarry } from './Carry.ts';

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
    targets.push(!person.equipment.right ? 'right' : !person.equipment.left ? 'left' : 'right');
  } else if (person.equipment.left?.item === desired && person.equipment.right?.item === desired) {
    const changed = displaced.size > 0;
    dropItems(person, displaced, config, dropAt);
    return { changed, reason: null };
  } else if (desiredHands === 2) {
    targets.push('left', 'right');
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
