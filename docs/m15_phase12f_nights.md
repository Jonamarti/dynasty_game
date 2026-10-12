# M15 12f — nights, 2026-10-12

`npm.cmd run sim:check -- --scenario nights` runs 150 ticks in hard winter,
two bands with firemaking and hafting prerequisites. The fixture supplies two
matched hand-axe orders and a fat torch beside a completed hearth. Its carrier
has learned that torches help in darkness, has a real warmth need, and receives
no `light_torch` order: the AI scorer must choose and complete ignition. Home
pressure is disabled only in this controlled fixture so the night-return errand
does not dominate the decision. It never assigns a burning hand or fabricated
work progress.

Three mechanism checks pass on the current readers:

- `darkness-hides`: one controlled observer, identical positions, real theft
  emission at midnight and noon: 0 versus 1 witnesses. The victim's automatic
  knowledge is not a witness. The spatial index is temporarily restricted to
  the paired participants and restored immediately, so wandering unrelated
  people cannot make a disabled sight reader pass.
- `torches-are-carried`: 6 winter-night samples with an owned, usable burning
  torch after autonomous ignition. The negative test removes the supplied
  torch and the check fails.
- `light-lets-work`: positive, banked hand-axe progress per active night tick,
  1.000 beside the hearth versus 0.545 in the dark. Completion resets are
  excluded; both workers start with identical skill and recipe inputs.

Negative verification is part of the unit tests: disabling the light readers
fails darkness and work, while removing the supplied torch before ignition
fails the torch check. The first observer fixture incorrectly passed the
disabled-reader mutant because additional people walked into range by noon;
it was corrected before shipping, without changing a check threshold.

The focused unit run passes 3/3; the single-seed scenario passes 3/3, none n/a.
Typecheck is currently blocked by concurrent garment-condition edits in
`Brain.ts` (`FoundTargets` lacks `garmentMendingItem` and related fields at
4289/5146–48); this is outside this change. The earlier full single-seed
baseline had inherited failures in `cravings-steer-the-diet`, `perf-budget` and
`hills-see-farther`.

## Remaining evidence

Autonomous torch uptake is now exercised by the fixture, but it is one
controlled person and one seed, not a population adoption rate. This still does
not measure organic robbery fractions, the violence cohort or survival cost. Before/after robbery,
`inBandKillRate` and the declared <=3-point cost remain deferred under the
owner's fast-layer-only M15 instruction. Phase 12f is partially delivered;
the whole phase is not declared closed. The latest full unit snapshot was
version .33 (9 failures; two synthesis regressions subsequently fixed in .34,
without another full-suite result). This focused run does not clear that debt.
