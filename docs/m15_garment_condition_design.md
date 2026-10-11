# Garment condition ownership — design note

Status: ownership foundation delivered on 2026-10-11; wear and mending are not
active. `Inventory` now holds one condition row per garment count and exposes
`takeGarmentUnit` / `putGarmentUnit` so an explicit caller can move a garment
without resetting condition. `setGarmentUnitCondition` bounds condition and
banked repair progress. New and legacy garments start pristine, and explicit
inventory transfer records validate and preserve these rows.

This is a foundation only: the existing gameplay transfer seams listed below
still use generic count-based `add`/`remove` in places. Wear/remending must not
be activated until those routes move garment rows too. Generic `remove` treats
a garment as consumed and destroys its row; it is never a transfer operation.

## The invariant

Condition belongs to one physical garment for its entire lifetime. Taking it
off, replacing it, dropping it, storing it, gifting it, stealing it, inheriting
it, or moving it between local and off-map inventories must preserve both its
identity and condition. A newly crafted garment starts at its defined full
condition. Destroying or consuming that garment removes its condition record.

`Equipment` currently points to a garment by item id, while `Inventory` stores
only `item id → count`. Neither identifies which copy in a stack is worn. A
per-item wear value on `Equipment` alone therefore cannot survive takeoff or
replacement, and cannot distinguish two copies of the same garment. The
ownership model needs a stable unit identity (or an equivalent ordered cohort
identity) that exists independently of a worn slot.

The current Inventory boundary makes unit movement explicit:

```ts
type GarmentUnit = { unitId: string; itemId: string; wear: number; repairProgress: number };

inventory.takeGarmentUnit(itemId): GarmentUnit | null;
inventory.putGarmentUnit(unit): void;
inventory.garmentUnitsOf(itemId?): readonly GarmentUnit[];
inventory.setGarmentUnitCondition(unitId, wear, repairProgress): boolean;
```

The current unit identity is local to its Inventory; collision handling across
inventories and equipment references are still required before gameplay uses
it to identify a worn copy. `add(itemId, count)` creates pristine units, and
the explicit transfer APIs preserve the unit row. Generic `remove(itemId,
count)` is destruction and must not be used to move a condition-bearing
garment. The focused foundation test covers the APIs and transfer-record
validation, not the gameplay routes below.

## Existing ownership paths to convert

`Inventory` is reused by people, buildings, piles, and off-map escrow. Its
current `transferSnapshot()` validates an exact three-field shape (`version`,
`stacks`, `spoilage`); condition data must be added to that state and its
validation before escrow can carry worn garments. Here `InventoryTransferState.version`
is the inventory/cache generation, not a schema version. The enclosing
`ComarcaInventoryTransferRecord.version` is the v1 record schema version. The
graph-based entity checkpoint captures `Inventory` fields, but the explicit
transfer record validates its inventory state separately.

The main movement seams found in the current tree are:

| Route | Existing seam | Condition requirement |
| --- | --- | --- |
| Put on, take off, replace clothing | `ToolEquipment.changeGarment` | Equipment references a specific owned unit; swapping keeps the displaced unit in inventory. |
| Give, trade, steal, amends, tribute | `Simulation.handOver`, `doGive`, `doTrade`, `doSteal`, `doMakeAmends`, `Simulation` tribute path | Move selected garment units with condition; never recreate them with plain `add`. |
| Store and withdraw | `Building.accept`, `Simulation.storeItem` / `takeItem`, `ActionSystem.doStore` / `doTake` | Preserve condition across person/store inventories and partial quantities. |
| Drop, pickup, carry overflow | `Simulation.dropAt`, `ItemPile.contents`, `ActionSystem.doPickup`, `Carry.reconcileCarry` | Move each dropped garment unit into the pile and back unchanged. |
| Death and inheritance | `LifeSystem.settleEstate`, called from `Simulation` death handling | Preserve units to heir or home store; only a genuinely lost unit may be discarded. |
| Comarca staging and restore | `ComarcaInventoryTransfer.take`, `consume`, `restore`, `toRecord` | Include condition in validated escrow graphs and restore it atomically with stacks/spoilage. |
| World traffic / traveller cargo | `WorldTrafficCoordinator` plus `WorldState` cargo staging and return | Preserve condition through transit inventory and both directions of travel. |
| Crafting and explicit consumption | `ActionSystem.doCraft` and other `inventory.remove` consumers | New garment outputs are pristine; a garment used as an ingredient is explicitly destroyed, not silently detached from its condition. |

Other `remove`/`add` pairs exist for food, tools, earth, and materials. They
need not all become per-unit APIs, but every route capable of moving a garment
must use one shared transfer helper. Keeping route-specific copies would leave
the common drop, store, or inheritance path as a laundering loophole.

## Persistence and compatibility

The ordinary checkpoint path serializes the object graph and retains class
prototypes. Add condition state to `Inventory` and validate it during graph
hydration; do not derive it from the worn equipment slot during restore. The
separate `ComarcaInventoryTransfer` record is stricter: `Inventory` currently
rejects unknown fields and its record version is v1, so a condition-bearing
version must explicitly validate, serialize, and restore the additional rows.

Legacy checkpoints have no condition records. Hydration should assign full
condition to every garment unit represented by legacy counts and equipment,
without consuming RNG or changing IDs, stream forks, or stack order. Malformed
condition rows, duplicate unit identity, ownership by two inventories, or an
equipment reference to a missing unit should fail validation rather than
repairing state heuristically.

No new random draws are needed: initial and crafted garments can start at full
condition deterministically. Do not change cold rates, baseline climate, or
dry-weather behavior as part of the ownership work.

## Related knowledge boundary

The wearer may read their own garment condition. Player-facing details about
another person must pass through `social/Knowledge.ts`. Simulation observation
must validate current visibility and actual worn ownership before treating
an outfit as evidence. Wear, repair progress, private cold exposure, and
another person's `warm:<item>` belief are not public outfit descriptions.
Any future condition display must preserve the existing knowledge boundary.

## Separate future behavior

Mending is a later action built on this ownership model. It should bank work on
the garment unit, so another worker can resume it, and run the shared
interruption/refusal path. Tailoring with the appropriate needle/thread should
restore full condition; the rough cordage method should restore only part.
Material consumption, work thresholds, tool requirements, and exact refusal
texts remain for that feature's design and tests.
