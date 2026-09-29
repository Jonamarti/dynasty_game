/**
 * M15 phase 11a. What a body can hold, before anything is worn.
 *
 * Five slots exist from this commit: two hands, the back, the belt and one
 * shoulder. The clothing slots (`hips`, `torso`, `legs`, `feet`, `head`,
 * `cloak`) are named in the phase 11 plan but have no reader until phase 14
 * gives them one, so they are not declared here — an unread slot is exactly
 * the kind of inert content this project's house style avoids.
 *
 * This file is inert on its own: nothing yet writes to `Person.equipment` or
 * reads it to change what a person can carry. `Config.carry.legacyPack`
 * keeps `Person.carryCapacity` on today's formula until phase 11c switches
 * it off and the container ladder (bundle, hide bag, basket, sledge, cart)
 * exists to take over that job.
 */

export const SLOTS = ['left', 'right', 'back', 'belt', 'shoulder'] as const;
export type Slot = (typeof SLOTS)[number];

export interface EquippedItem {
  item: string;
  count: number;
  /** Phase 14: wear on a worn garment. Unread until then. */
  wear?: number;
  /** Phase 12: ticks of fuel left on a lit torch. Unread until then. */
  lit?: number;
}

export type Equipment = Partial<Record<Slot, EquippedItem>>;
