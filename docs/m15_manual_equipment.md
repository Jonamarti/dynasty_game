# M15 phase 11d: manual equipment from the kit

The player's own Kit tab offers `Left hand`, `Right hand`, and `Back slot`
orders for each carried stack that fits those kinds of slot. These buttons
only issue `Simulation.order`; they do not write equipment or inventory from
the UI. NPCs do not receive manual equipment orders.

An order checks that the actor is alive and can walk, the actor owns the item,
the requested slot matches the item, and enough hands remain. A baby occupies
the leftmost available hand and is never moved automatically. Two-handed items
must be fitted from the left-hand control with both hands free and then occupy
both hand references. The back control is offered for an item's declared back
container slot.

The action remains committed for `Config.carry.equipTicks` (three) and runs
`interruption` on every setup tick. The item and slot are checked again when
the timer ends, so an item given away during setup cannot be equipped from a
stale order. Replacing equipment drops one owned copy of each displaced item
at the actor's feet. The fitted item itself remains in inventory as the
ownership record; capacity changes reconcile overflow into piles. Dropping the
last copy of any fitted object removes all of its slot references, including
both references for a two-handed item.

Preflight refusals use `lastRefusal`; failures after setup use the normal stop
reason/floater path. Each reason and slot label has an English and Spanish
string.

## Verification

`tool-equipment.test.ts` covers the three-tick order, item conservation,
displacement, back-container capacity and overflow, baby/two-hand refusals,
unowned items, dead actors, timer revalidation, interruption, and clearing a
two-handed item's duplicate slot references. `i18n.test.ts` passes with the new
strings. The focused e2e drives the Kit button and checks the changed equipment
and ground pile. Its dated screenshots are in
`artifacts/screenshots/m15-manual-equipment-2026-10-10/`.

The single-seed baseline was not used to tune survival. It still reports the
existing `cravings-steer-the-diet` and `perf-budget` failures; this feature does
not claim a population-level survival improvement.
