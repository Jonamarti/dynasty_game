# M15 phase 14a–14b: garments that are actually worn

This slice makes the existing hide armour and fur coat wearable, and makes
their effects follow the equipped body slot. It intentionally does not add
pockets, condition, wear, or repair fields: each belongs in the same change as
its first real reader.

## State and readers

- `ItemDef.garment` currently contains only `slot` and `warmth`.
- `Person.equipment[slot]` says what is worn. The garment remains in inventory
  as its single ownership record while it is fitted.
- `warmthFrom` in `src/sim/knowledge/Tech.ts` reads only owned garments in
  their declared body slots. Carried coats and clothing knowledge add no warmth.
- `protectionOf` in the same module keeps existing inventory-based protection
  for non-garment armour, but a garment contributes only while its owned item
  occupies its declared slot.
- `wornGarmentsOf` in `src/render/Renderer.ts` validates the torso slot and
  ownership before exposing the visible coat or hide-armour layer.
- `reconcileCarry` removes stale garment references when a transfer or drop
  removes the final owned copy. This also makes warmth, protection, and the
  rendered layer disappear together.
- Kit actions go through `Simulation.order`; wear and take-off both use the
  configured three-tick equipment timer and revalidate before changing state.
  Garments are refused by hand/back equipment actions.
- `Brain` can choose a carried coat for cold without a player order. There is
  no autonomous heat-removal behaviour in this slice because the model has no
  garment heat or overheating need to answer.

## Evidence

`src/sim/__tests__/clothing.test.ts` covers inventory conservation, timer
completion, Kit verbs, autonomous wear, packed-versus-worn warmth and armour,
manual-slot refusals, visible-layer ownership, and dropping the final copy.
`e2e/clothing.spec.ts` exercises wearing a coat through the Kit and saves a UI
capture under `artifacts/screenshots/m15-phase14-ab-2026-10-10/`.

The art contract for the two torso variants is in `docs/m15_art_contract.md`.
New garment fields must not be added without implementing their owning reader
in the same change.
