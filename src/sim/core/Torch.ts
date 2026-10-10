import type { Person } from '../entities/Person.ts';
import { t } from '../../i18n/i18n.ts';

export const TORCH_ITEMS = ['torch', 'fat_torch'] as const;
export type TorchItem = (typeof TORCH_ITEMS)[number];
export type TorchRefusal = 'unknown_torch' | 'torch_not_owned' | 'no_free_hand' | 'torch_already_lit' | 'no_fire_near';
export const TORCH_IGNITION_TICKS = 3;

export function isTorchItem(item: string): item is TorchItem {
  return (TORCH_ITEMS as readonly string[]).includes(item);
}

/** Lit fuel stays with its hand record; spare unlit copies may still move. */
export function transferableUnits(person: Person, item: string): number {
  const count = person.inventory.count(item);
  if (!isTorchItem(item)) return count;
  const burning = (['left', 'right'] as const).filter(slot =>
    person.equipment[slot]?.item === item && (person.equipment[slot]?.lit ?? 0) > 0).length;
  return Math.max(0, count - burning);
}

export function burningTorchRefusalText(): string {
  return t('A burning torch must stay in its hand until it burns out');
}

/** The hands are the fuel record: carrying an unlit torch does not make light. */
export function torchInHand(person: Person): { slot: 'left' | 'right'; item: TorchItem; fuel: number } | null {
  for (const slot of ['left', 'right'] as const) {
    const held = person.equipment[slot];
    // Equipment is only a reference. Old checkpoints, transfers and manual
    // edits can leave a reference after its inventory copy is gone; it must
    // never become a free, ghost light (or a warmth source).
    const babyUsesThisHand = slot === 'left' && person.armsTaken > 0;
    if (!babyUsesThisHand && person.armsTaken < 2 && held && held.count >= 1 && isTorchItem(held.item) &&
      person.inventory.count(held.item) >= 1 && held.lit !== undefined && held.lit > 0) {
      return { slot, item: held.item, fuel: held.lit };
    }
  }
  return null;
}

/** Burn one tick; at zero the hand and its inventory copy both disappear. */
export function advanceTorchBurn(person: Person): void {
  for (const slot of ['left', 'right'] as const) {
    const held = person.equipment[slot];
    if (!held || !isTorchItem(held.item) || held.lit === undefined || held.lit <= 0) continue;
    if (held.count <= 0 || person.inventory.count(held.item) <= 0) {
      delete person.equipment[slot];
      continue;
    }
    held.lit = Math.max(0, held.lit - 1);
    if (held.lit === 0) {
      person.inventory.remove(held.item, 1);
      delete person.equipment[slot];
    }
  }
}

/** Put a torch in an available hand, or reignite the same torch in place. */
export function torchIgnitionRefusal(person: Person, item: string, nearFire = true): TorchRefusal | null {
  if (!isTorchItem(item)) return 'unknown_torch';
  if (person.inventory.count(item) < 1) return 'torch_not_owned';
  if (!nearFire) return 'no_fire_near';
  const heldSlot = (['left', 'right'] as const).find(slot => person.equipment[slot]?.item === item);
  const allowed = (slot: 'left' | 'right') => !(slot === 'left' && person.armsTaken > 0) &&
    person.armsTaken < 2;
  if (heldSlot && !allowed(heldSlot)) return 'no_free_hand';
  if (!heldSlot && person.armsTaken >= 2) return 'no_free_hand';
  if (heldSlot && (person.equipment[heldSlot]!.lit ?? 0) > 0) return 'torch_already_lit';
  const slot = heldSlot ?? (['left', 'right'] as const).find(hand => allowed(hand) && !person.equipment[hand]);
  if (!slot) return 'no_free_hand';
  return null;
}

export function torchRefusalText(reason: TorchRefusal): string {
  switch (reason) {
    case 'unknown_torch': return t('That is not a torch');
    case 'torch_not_owned': return t('You no longer have that torch');
    case 'no_free_hand': return t('You need a free hand');
    case 'torch_already_lit': return t('That torch is already lit');
    case 'no_fire_near': return t('You need a lit hearth nearby');
  }
}

export function igniteTorch(person: Person, item: string, ticks: number): TorchRefusal | null {
  const refusal = torchIgnitionRefusal(person, item);
  if (refusal) return refusal;
  const slot = (['left', 'right'] as const).find(hand => person.equipment[hand]?.item === item) ??
    (['left', 'right'] as const).find(hand => !(hand === 'left' && person.armsTaken > 0) && !person.equipment[hand])!;
  person.equipment[slot] = { item, count: 1, lit: Math.max(1, Math.floor(ticks)) };
  return null;
}
