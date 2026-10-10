/**
 * M15 phase 11a and 14a. What a person carries or wears.
 *
 * The original five carrying slots are joined by six garment slots in phase
 * 14a. Unlike the carry slots, a garment slot refers to an item that remains
 * in inventory; it records which owned item is currently worn.
 *
 * Carry slots are read by `Carry.ts`; garment slots are read by
 * `Tech.warmthFrom` and written through `ToolEquipment.changeGarment`.
 * `Config.carry.legacyPack` preserves the old capacity formula only for the
 * scenarios that still explicitly request it.
 */

export const GARMENT_SLOTS = ['hips', 'torso', 'legs', 'feet', 'head', 'cloak'] as const;
export type GarmentSlot = (typeof GARMENT_SLOTS)[number];
export const CARRY_SLOTS = ['left', 'right', 'back', 'belt', 'shoulder'] as const;
export const SLOTS = [...CARRY_SLOTS, ...GARMENT_SLOTS] as const;
export type Slot = (typeof SLOTS)[number];

export interface EquippedItem {
  item: string;
  count: number;
  /** Phase 14: wear on a worn garment. Unread until then. */
  wear?: number;
  /** Phase 12d: ticks of fuel left on a lit torch; reaches zero before the stack is consumed. */
  lit?: number;
}

export type Equipment = Partial<Record<Slot, EquippedItem>>;
