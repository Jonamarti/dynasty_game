# M15 phase15b: coastal salt pans and salting

Saltmaking requires preserving/pottery and opens an actual two-by-two coastal
station (flint2/pottery2,140 work). At a completed pan beside salt water and
within three tiles of an unruined hearth, sticks2 and a retained pottery vessel
produce salt2. Work takes160 banked/interrupted ticks. Ordinary menus, orders,
the scorer and ongoing work share the source-footprint predicate. Removing or
freshening the source stops work visibly before inputs are consumed.

Geographic worlds require explicit salt water; rivers/lakes do not yield salt.
Classic islands retain their historical potable sea for drinking, but that
same maritime water supplies coastal salt work. No new resource spawning,
random stream or resource-plan entry. Salt's value25 is read by normal trade,
and it is a real ingredient, not edible food or a generic money token.

Salting requires saltmaking. Two raw meat/fish and one salt become two salted
food units, without a station or fire. Nutrition/macros stay equal to raw;
duration240000/160000 exceeds dried, smoked and pemmican food. Autonomous
salting retains the spoils:<raw> belief gate. These initial values are not a
measured economy improvement. Both technologies have two discovery routes,
prototypes, refinement and Spanish text; all new icons/station art are generated.

## Verification

Five mechanism tests plus existing preservation/tech/synthesis/i18n/art:
107/107 passed; typecheck passed. The same five tests against the preceding
readers with new tables/source helper supplied fail the two saltwater guards,
while three actual-output/classic-sea cases pass. Single-seed:2/147 failures,
the named cravings-steer-the-diet/perf-budget baseline.

Browser salt-production/salting case and expanding Preservation case pass
with clean exit (2 passed,8.8s). Inspected captures under
artifacts/screenshots/m15-phase15b-salt-2026-10-10/:
01-salina-en-la-costa.png and02-alimentos-salados.png.
They use actual Simulation crafting orders, not radial-menu clicks.

Indoor racks and15d remain open. Default spoilage activation15c and cohorts
remain deferred by the owner's M15 fast-verification instruction.
