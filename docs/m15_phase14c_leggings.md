# M15 14c — Leggings, 2026-10-10

Version `0.15.39-alpha`. Individual leggings knowledge requires tailoring,
with two discovery routes using cold/needle or winter/sinew. The prototype
costs hide and sinew. The actual recipe consumes hide 2 and sinew 1,
requires and retains a needle, and uses 120 banked work ticks with the normal
interruption reader. A novice's elapsed time exceeds the nominal work ticks;
the executor test supplies needs relief to isolate completion, not survival.

The garment occupies `legs`, warmth 0.15. Existing warmth and garment-demand
readers use it while worn, independently of torso, cloak and feet. Renderer
selects the existing `trousers` leg layer only for an owned equipped pair.
Spare inventory copies and stale equipment references do not warm or draw.
Normal take-off retains the item; JSON retains knowledge and equipped legs.

Icon generated from `art/src/props/items.ts`; prop sheets rebuilt and contact
sheet generated. All new player-visible labels, stories and effects have
Spanish. The first historical date is explicitly uncertain.

Verification: typecheck, 66/66 focused units in seven files and browser 1/1
pass. Default single-seed health retains its two known failures,
`cravings-steer-the-diet` and `perf-budget` (2/147). Reviewed capture:
`artifacts/screenshots/m15-phase14c-leggings-2026-10-10/01-polainas.png`.
The full unit run started on the fixed .38 snapshot does not include this
feature; its result is separate. No survival or economy improvement claimed.

This completes the leggings catalogue entry. The remaining garments and the
clothing sub-web, pockets, belief demand and wear/repair still keep 14c open.
