# M15 14c — Linen tunic

The linen tunic follows `weaving` as an individual device. Its sewing recipe
uses two `cloth` and one `thread`, and requires a retained needle. When worn in
the torso slot it contributes 0.20 warmth; a carried copy does not warm its
owner. The ordinary garment slot and ownership reference keep removal and
checkpoint restoration consistent with the other phase 14c clothing.

Tunic pockets remain pending. The item/container model has no garment-attached
capacity or pocket reader, so this phase does not assign the tunic extra carry
capacity.

The item icon is generated from `art/src/props/items.ts`. Spanish labels,
recipe text and discovery wording accompany the item. The e2e capture is saved
under `artifacts/screenshots/m15-phase14c-linen-tunic-2026-10-10/`.

Focused verification passed: typecheck; 98 tests across the linen tunic,
generated-art, i18n, technology, synthesis and garment-recipe specs; and the
Spanish Kit browser flow (1/1). The crafting fixture equips a real hide bag,
so its ingredients fit normal carry limits; it also checks refusal without
knowledge and without a needle before crafting and retaining the needle.
