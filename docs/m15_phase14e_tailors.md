# M15 phase 14e — tailors instrument

`tools/simcheck.ts` now has the short `tailors` scenario: one hard-winter band
starts with the `clothing`, `cordage`, `bone_working` and `tailoring` path, and
each adult founder is supplied a fur hat. The scenario tests whether cold adults
put on an owned garment and whether the active NeedsSystem cold reader responds
to it. It does not claim improved survival or food economy.

`clothes-are-worn` measures adult person-ticks during winter when cold is positive;
43.2% (4,350 of 10,073) had an owned garment equipped in the authorized
2,400-step run. The check requires at least half of the supplied adult
founders to wear a garment during a winter cold sample; the percentage is
reported as context, not used as a population outcome target.

`the-clothed-are-warmer` uses a paired probe for each such wearer. Two detached
copies of the same person share the same tick, starting cold (20, below the
100 cap), action and dry camp tile. The actual `NeedsSystem` updates one with
the garment and the other without it, with buildings omitted on both sides so
a hut or hearth cannot explain the difference. Telemetry is disabled around
these diagnostic updates so NeedsSystem's health counters remain measurements
of the live world. Only copied need/equipment/action/location fields are
mutable; the live world, RNG streams and entity IDs are untouched. The run
measured 0.02387 less cold per probe tick on average (4,350 pairs, no pairs
without benefit). A negative fixture temporarily sets the supplied hat's
warmth to zero, runs the real observer and NeedsSystem pair, then restores the
item definition; the warmer check fails. This is a controlled
mechanism measurement, not a comparison between differently selected residents
or a measure of survival.

`garments-wear-and-mend` is intentionally not included: wear and repair remain
pending. The initial `sim:check -- --scenario tailors` baseline could not run
because the scenario did not yet exist. No seed cohort or matrix was run.

Validation: typecheck passes, 5 focused tests pass and the 2 scenario checks
pass. Logs: `artifacts/m15-tailors-{typecheck,tests,health}-20261010.log`.
The full unit/browser regression will be recorded with the garment delivery.
