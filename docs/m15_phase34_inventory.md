# M15 phase 34 — typed physical inventory escrow

**2026-10-09 — first transfer contract.** `ComarcaInventoryTransfer` moves only the `Inventory` objects named by its caller. The caller is responsible for choosing the owners and stable source IDs; this module does not scan a whole Simulation or decide who owns property.

## Contract

`take(sources)` validates every source ID, rejects repeated IDs and aliased `Inventory` objects, validates each inventory's exact supported shape, and builds graph snapshots before clearing any source. A source inventory carries its item-ID/count stacks, its fractional spoilage carry (including a carry with no current stack), and its cache version. Extraction compares the prepared snapshot with the live state again before mutation. It also preflights every cache-version increment, so a stale or overflowing later source cannot leave an earlier one extracted.

Escrow retains the complete `Inventory` object graph through the existing allow-listed graph codec. `consume(sourceId, itemId, count)` uses `Inventory.remove`, preserving its existing rule that removal does not scale or clear spoilage carry. Counts remain fractional where the underlying `Inventory` allows them. `nutrition()` and `rations()` are views derived from current escrow item quantities and `ITEMS[*].nutrition`; raw grain and other nutrition-zero items remain typed stock but contribute no current calories. These views must remain finite before extraction and record hydration.

`restore()` is single-use per in-memory packet. It requires every resolved destination to have no stacks and no spoilage carry, validates all destinations and version increments first, then replaces their contents and advances each cache version. A destination that has since received anything is rejected; the caller must decide how to handle that stock rather than silently merge carries. The packet's nutrition/ration view remains an inspectable historical view after restoration, while `consume()` and `toRecord()` reject use after restore.

The versioned JSON codec stores the typed escrow graphs and stable source IDs. `fromRecord` requires a resolver and rejects missing destinations or multiple IDs resolving to one inventory. A JSON clone is detached data, not a global authority token: preventing two independently restored copies from claiming the same external source requires an owner-side persistence/lease mechanism. The single-use guard applies to one live packet object.

## Boundary

This is a physical inventory handoff only. It does not scan resource nodes, infer ownership, advance spoilage time, or connect to `CompactBandRuntime`. That runtime currently stores food as aggregate rations, which cannot reconstruct item types, hydration, or carry after compact consumption. A later bridge must reconcile its aggregate daily use against this typed portfolio before returning materialized stock; this module deliberately supplies no ration-to-item allocation rule or harvest rate.

The focused tests cover conservation through JSON round-trip, carry preservation including orphan carry, source alias and stale-state rejection, occupied destinations, local double restore, source resolution failures, corrupt graphs, cache-version overflow, and finite nutrition validation.