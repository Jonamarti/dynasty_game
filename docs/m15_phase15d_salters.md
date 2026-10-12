# M15 phase15d: comparative diagnostic, not a passing economy gate

`npm.cmd run sim:check -- --scenario salters` runs one supplied two-band coastal
world for2400ticks. Only one band knows Preservation; both have equal per-adult
raw stock, containers and cooking skill. The knowledgeable band has real coastal
stations and one explicit first drying batch. Later production/meals are autonomous.
Two-day seasons exercise winter; spoilRate1 is confined to this fixture.
No change to default rate0 or RNG forks. No survival cohort or≤4-point cost claim.

The harness counts actual `eatenToday` increments by band during winter,
including picked food, accounting for the daily ledger reset. It does not infer
meals from disappearing stock. The spoilage sweep attributes exact nutrition
to carriers or building-owner bands; unowned public piles remain outside that
comparison. These counters are observational and disabled in ordinary play.

## What the measurement found

Single-seed final report (earlier run): **FAIL preserved-food-lasts:0/8 winter meals** in the
knowledgeable band were preserved. One real drying batch completes and its
two food units are eaten during the run, outside winter. The check remains
failed, not skipped. The instrument tests being green do not make this world
health report green. This is an unresolved15d outcome, recorded in bugs/M16.

The shared food selector now resolves an exact appeal tie in favour of the
less durable food, so raw meat is spent before equally appealing dried meat
regardless of inventory insertion order. A focused selector test proves this
mechanism; it does not explain or resolve the 0/8 winter result, and no winter
consumption or survival gain is claimed.

Attributed spoiled nutrition was764 versus1381, but the old
`spoilage-is-answered` comparison also passed after deleting every
preservation-food recipe. It measured a fixture/trajectory difference, so it
remains deleted. A focused negative-control test now resolves preservation
outputs from the live recipe catalog, consumes a real preserved meal through
`Simulation.eatItem` during winter, and verifies the observer counts it; with
all preservation recipes removed, the same winter meal is still counted as a
meal but no longer as preserved. This validates the instrument without
pretending the autonomous scenario succeeds. Loss values remain diagnostic
text, never a claimed economy improvement. Starting in winter instead also
gave0/12 meals; the original autumn-to-winter fixture remains without
coefficient tuning.

## Verification

Typecheck passed. The focused `salters-checks.test.ts` passes 2/2, including the
positive winter meal and recipe-removal negative control. The actual
single-seed report still has1/1 check failed. No E2E/UI change in this
instrument commit. Logs: artifacts/m15-salters-first.log,
m15-salters-winter.log and m15-salters-final.log.

2026-10-12 rerun after the observer change: `npm.cmd run sim:check --
--scenario salters` still fails `preserved-food-lasts`, now 0/3; attributed
spoiled nutrition was 716 (knowing) versus 1151 (other). These are trajectory
diagnostics, not a preservation comparison or economy claim.

15d is partially delivered: scenario, meal monitor, focused recipe negative
control and attributed losses exist. The autonomous winter food outcome
remains open.15c default activation remains deferred until economy evidence
supports it.
