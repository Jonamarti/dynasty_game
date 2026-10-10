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

Single-seed final report: **FAIL preserved-food-lasts:0/8 winter meals** in the
knowledgeable band were preserved. One real drying batch completes and its
two food units are eaten during the run, outside winter. The check remains
failed, not skipped. The instrument tests being green do not make this world
health report green. This is an unresolved15d outcome, recorded in bugs/M16.

Attributed spoiled nutrition was764 versus1381, but `spoilage-is-answered`
also passed after deleting every preservation-food recipe. It detected a
fixture/trajectory difference rather than preservation, so that check was
deleted under the plan's explicit negative-verification rule. Loss values
remain diagnostic text, never a claimed economy improvement. Starting in
winter instead also gave0/12 meals and the same false-positive comparison;
the original autumn-to-winter fixture was retained without coefficient tuning.

## Verification

Typecheck passed.21/21 tests in five files passed: faithful report/attribution,
failure without working recipes, and existing spoilage/drying/smoking/salting
mechanisms. The actual single-seed report has1/1 check failed. No E2E/UI change
in this instrument commit. Logs: artifacts/m15-salters-first.log,
m15-salters-winter.log and m15-salters-final.log.

15d is partially delivered: scenario, meal monitor and attributed losses exist.
A discriminating loss check and the winter food outcome remain open.15c default
activation and long cohorts remain deferred by the owner's M15 instruction.
