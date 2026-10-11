# Garment condition ownership — design note

Status: ownership foundation delivered on 2026-10-11; wear and mending are not
active. `Inventory` now holds one condition row per garment count and exposes
`takeGarmentUnit` / `putGarmentUnit` so an explicit caller can move a garment
without resetting condition. `setGarmentUnitCondition` bounds condition and
banked repair progress. New and legacy garments start pristine, and explicit
inventory transfer records validate and preserve these rows.

The 2026-10-11 pile-transfer slice also gives each worn slot an exact unit
reference and preserves garment rows through drop, pickup, and carry overflow.
When inventories merge, colliding inventory-local IDs are re-keyed; condition
and repair progress remain attached to the same transferred row.

The 2026-10-11 store-transfer slice preserves rows for direct and autonomous
person/store deposits and withdrawals, including partial quantities. Building
acceptance uses the same transfer API, and its validated inventory snapshot
retains unit ID, condition, and banked repair progress. A record whose garment
counts do not match its physical rows is rejected. Household home-store merges
use an atomic whole-inventory transfer, with rollback if an insertion fails.
The 2026-10-11 estate-transfer slice uses the same atomic whole-inventory path
for inheritance to a living heir or the household home. Estates with neither
destination drop physical garment rows into the ground pile. Inconsistent
garment counts are rejected before any heir/home transfer or ground drop.
The 2026-10-12 handover slice preserves garment rows for direct player gifts
and timed NPC gifts of non-food goods. Garment stack transfer now rolls back
both inventories if insertion fails partway. Other internal building
transfers remain pending.
The 2026-10-12 theft slice also transfers the selected garment units through
the same rollback-safe API and reconciles both owners' worn layers and pocket
capacity after success. Invalid garment ownership is rejected before either
inventory changes. Amends use a multi-stack inventory transaction, preserving
garments offered as compensation and rolling back earlier goods if a later
stack cannot move; the payer's worn references are reconciled after payment.
The 2026-10-12 tribute delivery path preserves garments when withdrawing a
named item from a household store to a bearer; the existing store deposit leg
then carries that same unit to the overlord. Autonomous tribute selection still
uses `mostOf`, which admits servable food only, and territory access demands
use `bestFood`. The local building-store audit found no other direct store to
store mover: household home-store consolidation is the sole seam and uses
`Inventory.transferAllTo`. Other store trips have a person as the carrier.
The Comarca escrow graph also retains garment rows through `take`, food
consumption, validated JSON, and `restore`; partial failures during multi-source
extraction or restore roll back the inventories. Traveller ownership through
world traffic is covered below; quantity-only caravan manifests remain a
separate restriction on garment barter.

The 2026-10-12 phase 35 traveller route now carries garments inside each
traveller's validated `Inventory` checkpoint from staging through save/load,
arrival, and return. Person graph hydration validates physical row/count
agreement and unique unit identity, so missing or duplicated traveller rows
reject the enclosing world save before it can become an owner. Caravan manifests
remain quantity-only: garment offers are rejected and garments are excluded
from camp barter/return manifests, keeping their physical rows on the named
traveller. The focused test covers a worn unit with banked repair progress over
the full out-and-back trip. See the
[phase 35 contract](m15_phase35_journeys.md).

The 2026-10-12 consumer audit closes both garment-input routes: the `toggles`
prototype sample and the `toggled_coat` recipe. `Inventory.consumeItems`
prevalidates and removes a complete material set transactionally; its callback
reconciles the worn-unit reference before the inventory transaction commits.
Failure restores the inventory and the action restores equipment. Tests cover
successful consumption of a worn, damaged `fur_coat` and rollback when a later
material removal fails. Other count-only removal sites are food/nutrition,
non-garment technology or inscription materials, tool/container displacement,
or explicit destruction; current recipes and technology prototypes have no
other garment inputs. Quantity-only caravan manifests reject garments.
Ownership and current garment-consumer coverage now have no identified
count-only laundering route. Wear and mending remain inactive pending their
own implementation and verification.

This is still an ownership foundation, not wear or mending behavior. Generic
`remove` treats a garment as consumed and destroys its row; it is never a
transfer operation. A garment ingredient must go through the transactional
`consumeItems` path so the worn reference is cleared with the consumption or
restored together with the inventory on failure.

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

The current unit identity is local to its Inventory; merges re-key collisions,
and worn equipment points to the exact owned unit. `add(itemId, count)` creates pristine units, and
the explicit transfer APIs preserve the unit row. Generic `remove(itemId,
count)` is destruction and must not be used to move a condition-bearing
garment. The focused foundation test covers the APIs and transfer-record
validation, not the gameplay routes below.

## Existing ownership paths to convert

`Inventory` is reused by people, buildings, piles, and off-map escrow. Its
`transferSnapshot()` validates `version`, `stacks`, `spoilage`, and physical
`garmentUnits` rows, including exact count agreement and unique unit identity.
Legacy transfer snapshots without garment rows synthesize pristine units;
present-but-incomplete or malformed rows are rejected. Here
`InventoryTransferState.version` is the inventory/cache generation, not a schema version. The enclosing
`ComarcaInventoryTransferRecord.version` is the v1 record schema version. The
graph-based entity checkpoint captures `Inventory` fields, but the explicit
transfer record validates its inventory state separately.

The main movement seams found in the current tree are:

| Route | Existing seam | Condition requirement |
| --- | --- | --- |
| Put on, take off, replace clothing | `ToolEquipment.changeGarment` | Equipment references a specific owned unit; swapping keeps the displaced unit in inventory. |
| Give, trade, steal, amends, tribute, demand, ransom | `Simulation.handOver`, `doGive`, `doTrade`, `doSteal`, `doMakeAmends`, `ransomCaptive`, `doThreaten`, tribute path | **Delivered for direct handover, timed non-food gifts, theft, amends, named-item tribute, threats, and ransom.** Physical transfer preserves garment rows and wear references; ransom releases only after complete atomic payment. `doTrade` and autonomous tribute selectors are food-only. |
| Store and withdraw | `Building.accept`, `Simulation.storeItem` / `takeItem`, `ActionSystem.doStore` / `doTake` / `doRender` / `doHaul`, `Simulation.mergeHouseholdsImpl` | **Delivered for person↔building store**, household home-store merges, store-to-bearer tribute, and construction haul: `Inventory.transferTo` preserves garment rows if selected; whole-inventory merge is validated and rolls back both sides on failure, including colliding local IDs. Current construction material definitions do not include garments. |
| Drop, pickup, carry overflow | `Simulation.drop`, `Simulation.takeFromPile`, `Simulation.dropAt`, `Carry.reconcileCarry` | **Delivered:** worn slot references an exact unit; drop, pickup and carry overflow move unit rows and preserve condition/progress. Generic `dropAt` still creates pristine garments for produced goods. |
| Death and inheritance | `LifeSystem.settleEstate`, called from `Simulation` death handling | **Delivered:** whole estate moves atomically to heir/home, or garment rows drop intact at the deceased's feet. |
| Comarca staging and restore | `ComarcaInventoryTransfer.take`, `consume`, `restore`, `toRecord` | **Delivered for escrow records:** validated graphs preserve unit ID, wear, and repair progress through JSON and food consumption; malformed or incomplete present rows and duplicate identities are rejected, and multi-source take/restore roll back on later failure. Consuming a garment itself is explicit destruction. |
| World traffic / traveller cargo | `WorldTrafficCoordinator` plus `WorldState` cargo staging and return | **Delivered for traveller inventories:** exact rows survive staging, checkpoint save/load, arrival and return; checkpoint hydration rejects missing/duplicate rows. Quantity-only caravan manifests reject garments and camp barter/return selection leaves garment stacks on the traveller. |
| Crafting and explicit consumption | `ActionSystem.doCraft`, `doPrototype`, food/ingredient consumers | New garment outputs are pristine. The `toggled_coat` recipe and `TECH.toggles.prototype.fur_coat` prototype sample intentionally destroy garment inputs through the atomic `Inventory.consumeItems` path, reconciling the worn reference and rolling back inventory/equipment on failure. Current food, inscription, and other material consumers do not select garments. |

Other `remove`/`add` pairs exist for food, tools, earth, and materials. They
need not all become per-unit APIs, but every route capable of moving a garment
must use one shared transfer helper. Keeping route-specific copies would leave
the common drop, store, or inheritance path as a laundering loophole.

## Persistence and compatibility

The ordinary checkpoint path serializes the object graph and retains class
prototypes. Validate `Inventory` condition state during graph hydration; do not
derive it from the worn equipment slot during restore. The separate
`ComarcaInventoryTransfer` record uses the allow-listed graph codec and
validates hydrated inventory state before it can be restored. Its record
version remains v1: the graph already carries the added Inventory field, while
legacy count-only transfer snapshots still receive pristine garment rows.

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
