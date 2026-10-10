# M15 phase15b: drying food on a rack

Preserving is appended to TECHS, requires cooking/cordage and unlocks a real
outside drying rack (wood2/rope2,120 work ticks). It has discoverable sparks,
a prototype, teaching/refinement and Spanish labels. It stays in main until
another effective preservation node can open a populated sub-web.

At a completed, unruined rack, two raw meat or fish become two dried units.
Their nutrition/macros are unchanged; spoilTicks is ten times the raw value.
They are edible through ordinary food readers and persist in normal inventory.
Station selection, menu availability and final work reject ruined stations.
All crafting retains existing interruption and banked-progress machinery.

Autonomous drying requires a positive spoils:<raw> belief and carried inputs,
plus a reachable usable rack; default rate0 never teaches dry estimates.
Manual crafting remains available to someone who knows the design. The band
planner can raise the station through its existing table-driven station reader.
No new RNG stream or resource spawn is added. No seasonal preservation bonus.

## Verification

Four mechanism tests: actual meat/fish crafting and JSON, real tenfold spoilage
reader, learned demand/station gates, visible interruption before a ruined rack
consumes food. With tech/i18n/art:78/78 passed; typecheck passed. Single-seed
report retains cravings-steer-the-diet/perf-budget. No cohort or economic gain
claim;15c default activation remains deferred by the owner's M15 instruction.

Browser case reported ok15.2s; captures physical station and both foods in Kit:
artifacts/screenshots/m15-phase15b-drying-2026-10-10/01-secadero-y-comida-seca.png.
The fixture orders crafts through Simulation; it does not claim a radial-menu
click test. Vite teardown was interrupted after hanging, not a clean E2E exit.

Smoking, pemmican and the populated Preservation sub-web subsequently shipped
(m15_phase15b_smoking.md and m15_phase15b_pemmican.md). Indoor placement,
saltmaking/salting and15d scenario/checks remain open. The era's netting gate remains unchanged
until spoilage activation is measured; no promise of survival improvement.
