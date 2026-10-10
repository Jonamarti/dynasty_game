# M15 phase 14c — Fibre skirt

`fibre_skirt` is a craft node in the Clothes web. It requires `clothing` and
`cordage`, and its recipe consumes three thatch in the ordinary banked craft
executor without a retained tool. The resulting hips garment adds 0.03 warmth
only while worn; its inventory copy remains the ownership record. It replaces
the default hip layer and can be removed through the existing garment action.

The generated art has a distinct fibre skirt in front, side and back views,
with the base hip layer unchanged when the slot is empty. `art/src/props/items.ts`
also supplies its inventory icon. The Spanish item name is `Falda de fibra`.

Focused regressions cover the recipe gate and material cost, equipped warmth,
checkpoint restoration, taking the garment off, and distinct generated layer
identity. The existing health baseline before this work had failures in
`cravings-steer-the-diet` and `perf-budget`; this garment has no food-economy
reader. Full regression and browser results are recorded by the integrating
change.

## Verification, 2026-10-10

Version `0.15.48-alpha`. Four focused files pass 36/36 tests (garment,
hip-layer identity, generated-art consistency and translation coverage).
TypeScript passes after correcting the browser test's dynamic import paths.
The browser craft/equip/remove case passes 1/1 in Spanish; the Kit combination
and version cases pass 3/3. The original pre-optimisation comparison passes
all 360 body/pose/facing hashes, with no reference updates.

Final capture, inspected without overwriting the previous attempt:
`artifacts/screenshots/m15-phase14c-fibre-skirt-2026-10-10T-02/T-01-fibre-skirt-es.png`.
Both dated capture directories are retained. The contact sheet includes all
three skirt facings. `art:build` regenerates people and props from source;
`art:sheet` was inspected.

The short single-seed health run retains the two pre-change failures
`cravings-steer-the-diet` and `perf-budget`. Logs:
`artifacts/m15-fibre-skirt-health-20261010.log`,
`artifacts/m15-fibre-skirt-typecheck-final-20261010.log`,
`artifacts/m15-fibre-skirt-parity-20261010.log`.
The full unit regression has its own log:
`artifacts/m15-fibre-skirt-full-unit-20261010.log`.

That full run started while the final test/translation review was still in
progress: 281 files, 2,029 tests passed, eight failed and one skipped in
618.26 seconds. Seven failures match the previous recorded incidences:
compact correspondence, food-observation activity, diggers, diffusion,
tribute, conspiracy and thirst deaths. The eighth caught two newly duplicated
Spanish keys (`Fibre skirt` and its description) loaded before their removal
from the tech table. The final translation table keeps both in data only.
After the correction, the four final focused files pass 36/36, including
the original duplicate-key assertion, in
`artifacts/m15-fibre-skirt-final-focused-20261010.log`.
The full suite was not rerun after that correction and is not reported green.

The initial garment catalogue is implemented, but pockets, wear/repair,
hide dressing, warmth beliefs and removing clothes in heat remain open.
There is no `wearPerDay` reader yet, so hide dressing cannot ship as an
isolated metadata addition. Phase 14c/14e and M15 remain open. Cohorts and
the heavy matrix are deferred under the owner's M15 instruction; this
delivery makes no claim about survival or economic improvement.
