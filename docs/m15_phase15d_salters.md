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

An ephemeral fixture probe corrected an earlier, mistaken reading of the
batch timeline. In two exact reruns, the real first batch enters Narak's
inventory at tick 140 and both units are still there at tick 480 (day 6,
winter); neither has spoiled. They are later consumed outside winter: Ungok
takes one at tick 1604 and Narak eats the other at tick 1947. Thus the batch
survives into winter but does not contribute a preserved meal there. With an
adult in the knowing band artificially set to hunger 80 on winter arrival and
the two produced units retained until then, the fixture records 9 winter
meals, 1 preserved.
Adding one `dried_meat` directly to that adult's inventory at winter arrival
records 8 meals, 1 preserved. The same injected-stock setup with all seven
preservation recipes removed records 12 meals, 0 preserved. This is a useful
recipe-sensitive positive/negative control for the observer and consumption
path, but it injects both timing and need: it does not show that autonomous
NPCs save the batch, or establish an economic benefit. No production, AI,
activation or balance rules were changed.

A second exact trace of the first winter (ticks 480–959) narrows the mismatch:
Narak keeps both units, with hunger 11.3→37.7; neither Narak nor Ungok eats
`dried_meat`. The band's three counted winter meals instead come from apples
(Rhara, ticks 760–761) and meat (Velur, tick 821). Ungok's hunger reaches
52.7 before other foraged food appears. The later observer aggregates stock
availability, hunger and selector results across every carrier, and finds the
stocked carrier itself remains below hunger 40 while another food outranks the
preserve. The trigger is therefore low need plus the current food ranking in
this fixture, not inaccessible stock; this still does not justify a global
urgency or food-value change.

15d is partially delivered: scenario, meal monitor, focused recipe negative
control, attributed losses and a winter chooser/need diagnostic now exist. The
autonomous winter food outcome remains open. 15c default activation remains
deferred until economy evidence supports it.

## 2026-10-12 selector and need diagnosis

The winter observer now records person-ticks with preserved food physically in
the knowledgeable band's inventory, the units carried, hunger bands, the
selector's top food, and whether the carrier is executing `eat`. This is
fixture-only telemetry; it does not affect scoring or RNG. In the current
single-seed run the batch is accessible for 480 person-ticks (960 unit-ticks),
the carrier's mean hunger is 24.5 and hunger never reaches 40, while the
selector chooses another food on all 480 ticks. No preserved food is ranked
first and the carrier does not execute `eat` during this window. The 3 winter
meals belong to other band members without preserved stock.

This narrows the current result to low need on the carrier plus higher-appeal
alternatives, rather than inaccessible stock. It does not establish which
systemic policy should change: neither weakening the nutrition chooser nor
raising global eat urgency is justified by this fixture. The existing
`preserved-food-lasts` check still fails visibly; this diagnostic makes its
failure mode actionable without claiming the autonomous behavior is fixed.
