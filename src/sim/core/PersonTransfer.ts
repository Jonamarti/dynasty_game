import type { Person } from '../entities/Person.ts';
import type { CarryConfig } from './Config.ts';
import { capacityFor, itemCapacityFor } from './Carry.ts';
import { isTorchItem } from './Torch.ts';

export type PersonTransferPolicy = 'reserve-lit-torch' | 'preserve-lit-torch';

export type PersonTransferFailure =
  | 'burning_torch'
  | 'recipient_no_free_hand'
  | 'recipient_full'
  | 'recipient_torch_capacity';

/**
 * Move goods between people without separating a live flame from its owner.
 * Player handovers reserve it (M15's established rule); an accepted social
 * payment may carry it into a free hand with the same remaining fuel.
 */
export function transferBetweenPeople(
  giver: Person,
  receiver: Person,
  items: readonly (readonly [string, number])[],
  config: CarryConfig,
  policy: PersonTransferPolicy = 'reserve-lit-torch',
): { moved: number; failure: PersonTransferFailure | null } {
  if (giver === receiver || items.length === 0) return { moved: 0, failure: null };
  const counts = new Map<string, number>();
  for (const [item, count] of items) counts.set(item, (counts.get(item) ?? 0) + count);
  const burning = (person: Person) => (['left', 'right'] as const).flatMap(slot => {
    const held = person.equipment[slot];
    return held && isTorchItem(held.item) && (held.lit ?? 0) > 0 && held.count > 0 &&
      person.inventory.count(held.item) > 0 ? [{ slot, item: held.item, held }] : [];
  });
  const sourceFlames = burning(giver);
  const sourceByItem = new Map<string, number>();
  for (const torch of sourceFlames) sourceByItem.set(torch.item, (sourceByItem.get(torch.item) ?? 0) + 1);
  const movedBurning = new Map<string, number>();
  for (const [item, count] of counts) {
    const litCount = sourceByItem.get(item) ?? 0;
    const freeCount = Math.max(0, giver.inventory.count(item) - litCount);
    if (count > freeCount) movedBurning.set(item, count - freeCount);
    if (count > giver.inventory.count(item) || (policy === 'reserve-lit-torch' && count > freeCount)) {
      return { moved: 0, failure: litCount > 0 ? 'burning_torch' : null };
    }
  }

  const litToMove = [...movedBurning.entries()].flatMap(([item, count]) =>
    sourceFlames.filter(torch => torch.item === item).slice(0, count));
  let receiverSlots: ('left' | 'right')[] = [];
  if (litToMove.length > 0) {
    const transferCount = [...counts.values()].reduce((sum, count) => sum + count, 0);
    if (receiver.carrying + transferCount > capacityFor(receiver, config)) {
      return { moved: 0, failure: 'recipient_full' };
    }
    const incomingByItem = new Map<string, number>();
    for (const torch of litToMove) incomingByItem.set(torch.item, (incomingByItem.get(torch.item) ?? 0) + 1);
    const receiverFlames = burning(receiver);
    for (const [item, incoming] of incomingByItem) {
      const alreadyLit = receiverFlames.filter(torch => torch.item === item).length;
      // Total carrying room can exist while a weak elder's per-item hand room
      // is zero; reconciliation would drop the new torch and lose its flame.
      // Count live torches only here: ordinary spare copies may still drop.
      if (alreadyLit + incoming > itemCapacityFor(receiver, config, item)) {
        return { moved: 0, failure: 'recipient_torch_capacity' };
      }
    }
    const freeHands = (['left', 'right'] as const).filter(slot =>
      !(slot === 'left' && receiver.armsTaken > 0) && receiver.armsTaken < 2 && !receiver.equipment[slot]);
    if (freeHands.length < litToMove.length) return { moved: 0, failure: 'recipient_no_free_hand' };
    receiverSlots = freeHands.slice(0, litToMove.length);
  }

  const moved = giver.inventory.transferItemsTo(receiver.inventory, items);
  for (let i = 0; i < litToMove.length; i++) {
    const torch = litToMove[i]!;
    delete giver.equipment[torch.slot];
    receiver.equipment[receiverSlots[i]!] = { ...torch.held };
  }
  return { moved, failure: null };
}
