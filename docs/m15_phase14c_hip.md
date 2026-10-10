# M15 phase 14c — Hide loincloth

`hide_loincloth` is the first fitted garment in the hips slot. The existing
`clothing` gate unlocks a 45 work-tick recipe: one hide and either a physical
flint flake (`flint`) or handaxe. The recipe uses the ordinary banked craft
executor and retains the selected tool.

The garment adds 0.02 warmth only while equipped. It replaces the default
loincloth appearance, combines with garments in other body slots, and remains
in inventory while worn. A stale equipment reference does not warm or draw it;
the `hips` equipment reference, backed by inventory ownership, survives the
JSON checkpoint path.

The item icon and the front, side and back wearer layers are generated from
`art/src/props/items.ts` and `art/src/people/rig.ts`. `npm run art:build`
regenerates the committed sheets and manifests. English and Spanish item names
are included. This closes the hide loincloth catalogue entry only; the fibre
skirt and the rest of phase 14c remain open.

Verification: typecheck passes; 35 tests in the garment, generated-art and
translation files pass. Browser case passes 1/1 after using approximate
floating-point warmth comparison and refreshing the Kit tab after the
direct test steps. The game uses the unchanged ordinary equip executor.
Capture inspected:
`artifacts/screenshots/m15-phase14c-loincloth-2026-10-10T-03/T-01-hide-loincloth.png`.
`art:sheet` includes the new hips garment in all three baked directions.
The pre-change single-seed health run had 2/147 existing failures:
`cravings-steer-the-diet` and `perf-budget`; the post-change short run retains
those same failures. Logs: `artifacts/m15-loincloth-{tests,health,browser,sheet}-20261010.log`.
Full regression results are recorded separately. Cohorts and the heavy matrix
remain deferred by AGENTS.md.

The full `.46` browser run found an omitted base visual layer. `.47` restores
the `base` variant for empty hips; the original 360-case pixel parity test
passes again, plus Kit/version 3/3. Final capture:
`artifacts/screenshots/m15-hip-base-fix-2026-10-10T-01/T-01-hide-loincloth.png`.
Full results and limits: [verification](m15_phase14_hip_tailors_verification_20261010.md).
