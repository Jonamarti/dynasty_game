# M15 12f — nights, 2026-10-10

`npm.cmd run sim:check -- --scenario nights` runs 150 ticks in hard winter,
two bands with firemaking and hafting prerequisites. The fixture supplies two
matched hand-axe orders and one real fat-torch ignition beside a completed
hearth. It never assigns a burning hand or fabricated work progress.

Three mechanism checks pass on the current readers:

- `darkness-hides`: one controlled observer, identical positions, real theft
  emission at midnight and noon: 0 versus 1 witnesses. The victim's automatic
  knowledge is not a witness. The spatial index is temporarily restricted to
  the paired participants and restored immediately, so wandering unrelated
  people cannot make a disabled sight reader pass.
- `torches-are-carried`: 40 winter-night samples with an owned, usable burning
  torch after the real ignition action.
- `light-lets-work`: positive, banked hand-axe progress per active night tick,
  1.000 beside the hearth versus 0.545 in the dark. Completion resets are
  excluded; both workers start with identical skill and recipe inputs.

Negative verification is part of the unit tests: disabling the light readers
fails darkness and work, while removing the supplied torch before ignition
fails the torch check. The first observer fixture incorrectly passed the
disabled-reader mutant because additional people walked into range by noon;
it was corrected before shipping, without changing a check threshold.

Typecheck passes. The focused unit run passes 14/14 in three files; the
single-seed scenario passes 3/3, none n/a. Logs: `artifacts/m15-nights-unit.log`,
`artifacts/m15-nights-typecheck.log`, `artifacts/m15-nights-sim.log`.
This is tooling only; game behaviour, version and UI are unchanged.

## Remaining evidence

These ordered opportunities do not measure autonomous torch uptake, organic
robbery fractions, the violence cohort or survival cost. Before/after robbery,
`inBandKillRate` and the declared <=3-point cost remain deferred under the
owner's fast-layer-only M15 instruction. Phase 12f is partially delivered;
the whole phase is not declared closed. The latest full unit snapshot was
version .33 (9 failures; two synthesis regressions subsequently fixed in .34,
without another full-suite result). This focused run does not clear that debt.
