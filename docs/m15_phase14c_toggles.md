# M15 phase 14c: bone toggles

`toggles` is a clothing device requiring both `tailoring` and `bone_working`.
Its recipe consumes one existing `fur_coat` and two `bone` to produce one
`toggled_coat`; crafting takes 110 work ticks. Bone is the fastening, so this
recipe does not consume a needle or use the sewn-recipe tool modifier.

The new garment occupies the torso and supplies 0.48 warmth only while it is
owned and worn. It is drawn as a fur coat with visible bone fasteners. The item
definition is appended after existing item definitions so inventory iteration
order for existing items stays stable. English labels, technology text and
discovery stories have Spanish translations.

Focused simulation coverage exercises prerequisites, exact material cost,
normal crafting, and warmth/appearance while worn. The art test checks the
generated inventory icon and torso layer. The Spanish browser flow and capture
are recorded in `artifacts/screenshots/m15-phase14c-toggled-coat-2026-10-10/`.

Durability and repair are outside this entry; the garment catalog work remains
open under phase 14c.

Version 0.15.42-alpha. Typecheck and 98/98 focused units pass; the single-seed
health report retains cravings-steer-the-diet and perf-budget (2/147).
Cohorts and the heavy matrix are deferred by AGENTS.md.
