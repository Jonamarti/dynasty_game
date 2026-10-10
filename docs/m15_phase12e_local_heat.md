# M15 phase 12e: heat comes from physical sources

Knowing firemaking no longer contributes 0.45 warmth everywhere. Unlit charcoal
also loses its former 0.12 pack bonus: no burning container exists to justify
it. Charcoal remains an actual furnace fuel; its unsupported warmth motive is
removed. Worn garments and an owned burning torch retain diminishing returns.
A completed, unruined hearth retains the existing radius-three 0.35 warmth
reader in NeedsSystem. A roof still insulates but does not count as wildlife
firelight. CompactBody builds one spatial index per advance and passes it to
the same NeedsSystem, so nearby hearth exposure is no longer omitted there.

## Evidence and limits

Three new mechanism tests fail on the preceding staged build: phantom warmth
0.516, a roof counted as fire, and equal compact cold beside a hearth or far
away. They pass with this change. Four focal files: 141/141 passed, including
tech, metal and predator checks. The metal armour premise now equips its hide
armour explicitly, matching phase14b rather than treating packed armour as worn.
Typecheck passes. Single-seed report: 2/147 failures (cravings-steer-the-diet,
perf-budget), matching the initial names. No new screen or controls are added.

The plan's four-point survival-cost bound is not measured. Cohorts are deferred
by the owner's M15 fast-verification rule; no claim of improved winter survival
is made. The nights scenario/checks of12f and general calibration remain open.
