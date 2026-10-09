# M15 phase 34 — detached spoilage clock

**2026-10-09 — physical escrow decay.** `ComarcaInventoryDecay` embeds a v1
`ComarcaInventoryTransferRecord` with the game's day length, current tick,
explicit `lastSweepTick`, spoil rate, and one preservation factor for every
source. The anchor must be the latest midnight at or before the current tick.
At each later midnight the reducer applies exactly one full daily
`Inventory.spoil(ticksPerDay * spoilRate, factor)` pass. A mid-day handoff still
gets a full pass at the next midnight because its physical food already existed
through that elapsed day. Rate zero advances the date without changing stock or
fractional carry.

The reducer clones each escrow Inventory through the existing graph codec and
publishes a new record only after every due sweep and source validates.
Intermediate fractional carry is checked before spoilage because a fully
depleted stack can otherwise erase an overflowing carry. Inventory cache
versions and map order remain owned by `Inventory`; the reducer validates the
resulting transfer record before publishing. There is no resolver, live
Simulation, RNG, or authority lease in this codec.

**Boundary.** Compact food stock remains aggregate rations. This reducer does
not map those rations back to typed items, withdraw stock for consumption, or
age production whose physical arrival tick is unknown. Exact correspondence to
detailed simulation is therefore limited to intervals where no unobserved
physical stock changes occur. A later coordinator must reconcile typed
withdrawals and production before using this as the sole owner of a pantry.

Focused coverage compares repeated daily passes to direct Inventory calls,
split advance and JSON restore, zero-rate carry preservation, source-specific
preservation, invalid clocks, atomic failure, and the non-associativity of
collapsing multiple daily sweeps into one large elapsed interval.
