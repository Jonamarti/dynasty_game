# M15 14c — Foot wraps, 2026-10-10

Version `0.15.38-alpha`. Individual `foot_wraps` knowledge requires clothing
and cordage; two cold/winter discovery routes, a hide-and-rope prototype and
an actual recipe ship together. Fabrication costs one hide and one rope,
70 banked work ticks through normal craft/interruption readers.

The garment occupies `feet` and supplies warmth 0.08 only while worn. The
existing warmth composition, NPC garment demand and manual wear/take-off
actions read its data. A tunic and foot wraps combine independently; extra
inventory copies or a stale equipment reference supply neither warmth nor
appearance. Checkpoint JSON retains the slot and knowledge.

Art: generated `props/item/foot_wraps`, and the existing `feet/wraps` person
layer, selected only by an owned equipped garment. No PNG edited by hand.
The Spanish label, discovery stories, description and effect are translated.
No precise historical first date is asserted.

Verification: typecheck; 62/62 focused unit tests in six files (garment,
crafting, knowledge/synthesis, i18n and generated art); single-seed default
health still fails `cravings-steer-the-diet` and `perf-budget` (2/147, known
baseline); focused browser passes 1/1, clean exit. Prop build and contact
sheet generated. Reviewed daytime capture:
`artifacts/screenshots/m15-phase14c-foot-wraps-2026-10-10/02-envolturas-de-pies-diurnas.png`.

This completes this catalogue entry, not phase 14c. Other garments, the
clothing sub-web, warmth belief demand, hot-weather removal, pockets and
wear/repair remain pending. No survival improvement is inferred from this
single seed; cohorts remain deferred by the M15 verification instruction.
