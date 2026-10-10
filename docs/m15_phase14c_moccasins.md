# M15 14c — Moccasins, 2026-10-10

Version `0.15.40-alpha`. Individual knowledge requires tailoring and foot
wraps. Two discovery routes, hide/sinew prototype and a real recipe ship
together: hide 1 + sinew 1, retained needle, 90 banked work ticks through
the shared craft executor and interruption checks.

The item occupies `feet`, warmth 0.12. Wearing it replaces foot wraps in
that slot; the old wraps remain in inventory and do not stack warmth. Torso,
legs and cloak remain independent. Only an owned worn moccasin selects the
existing `feet/boots` person layer. Inventory copies and stale references
do not warm or draw. JSON retains the equipped feet and individual knowledge.

Generated icon: `art/src/props/items.ts`, rebuilt prop sheets/contact sheet.
Spanish covers labels, sparks, description and effect. Historical first date
is explicitly uncertain; the art reuses the existing closed-footwear layer.

Verification: typecheck; 71/71 focused units in eight files; browser 1/1,
clean exit; default single-seed health still 2/147 known failures
(`cravings-steer-the-diet`, `perf-budget`). Reviewed capture:
`artifacts/screenshots/m15-phase14c-moccasins-2026-10-10/01-mocasines.png`.
The full unit run on .38 is separate and does not include moccasins.

No population/economy improvement inferred. Other garments, the complete
clothing sub-web, belief demand, hot-weather removal, pockets and wear/repair
remain pending; this entry does not close 14c.
