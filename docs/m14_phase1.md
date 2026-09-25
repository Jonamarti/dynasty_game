# M14 phase 1 — baseline and demographic measure

> Shipped on 2026-09-25 as "M13 phase 1" (commit `72b1240`). Renumbered the same day, when the owner put the NPC-motivation milestone in front of the world map: see [m13_plan.md](m13_plan.md) and [m14_plan.md](m14_plan.md). The local `artifacts/m13-*.txt` files keep their original names.

Run on 2026-09-25 against `master` at `c10bec5` (`m12 veredictos`). The comparison baseline requested by `m14_plan.md` is `0dd2d9f`, the build just before M12 began. Captured in `artifacts/m13-matrix-before.txt` and `artifacts/m13-matrix-pre-m12.txt`; 20-seed cohorts are in matching `artifacts/m13-{pre,current}-{scenario}.txt` files. These artifacts are local and ignored by Git.

## What the new `DEMOGRAPHY` line measures

`npm run sim:seeds` reports births per distinct woman observed at a fertile age and per fertile woman-year of observed exposure. Exposure is accumulated once per day from living people, including pregnant women. The report gives deaths before ages one and five, mean age at death, and pooled causes. A death before the age limit immediately counts as an observed outcome; living children without enough follow-up are censored. Combat deaths are grouped as `murder`, not by killer name. Counts pool across seeds; percentages are not averaged across differently sized worlds.

Infant and under-five rates include a death below the age limit as soon as it occurs. Living children without one or five years of follow-up are reported as awaiting follow-up. Founding people contribute to deaths but not the birth-cohort mortality denominator. This prevents a child born at the end of a run from being counted as having survived to five. `century` covers four in-game years, so under-five survival is correctly `n/a`. A longer run is needed to calibrate the LOD against a measured five-year rate.

The observer reads existing entity state once per day, owns no RNG, and is not called by the simulation. A regression test runs observed and unobserved worlds with the same seed for 500 steps and compares people, resources, animals, buildings, households and RNG state.

## Matrix and cohort findings

The baseline matrix at `0dd2d9f` has one failing scenario, `farmers`, on `bands-take-sides`. At M12's close, the 19-scenario matrix has 12 failing scenarios; see `artifacts/m13-matrix-before.txt`. Their failures span social measurements, ecology, research and action-use checks. No thresholds were changed during this instrument pass. Compare each named check before classifying a failure as an M12 regression.

In the completed 20-seed `crowded` cohorts, both builds have 100% mean survival and zero collapses. The baseline records 77 births; M12 records 76. The current cohort has 45 inter-band blows, but distance increased after incidents in only 2 of 18 seeds with enough incidents (mean change −6.0 tiles). This scenario does not exercise the 60-day `bands-take-sides` gate, so it cannot answer the owner's pending design question.

The completed 20-seed `lean` cohort has a large cause-of-death shift: mean
survival is 51.2% before M12 and 65.9% after; murders fall from 393 to 146,
while starvation deaths rise from 144 to 319. The one-year death rate is 0.365
(111/304 eligible births) before and 0.226 (72/318) after. For under-five
follow-up, every eligible birth in both cohorts dies before age five: 180/180
before, 127/127 after. Most births are still awaiting the full five years (201
before; 288 after), so this is a rate for the earliest eligible cohort only,
not a claim that the whole population dies by five. The opposite movement in
murder and starvation means survival alone cannot say whether M12 helped the
food economy; resolve the causes and the relevant check mechanisms before
changing food weights.

The 20-seed `century` cohort points in the same direction: mean survival moves
from 79.5% to 95.5%; murders fall from 312 to 132 and starvation deaths rise
from 20 to 60. One-year deaths move from 60/526 eligible births (0.114) to
9/540 (0.017). All births old enough for a five-year outcome died before that
age: 161/161 before M12, 36/36 after. The post-M12 denominator is small, and
471 and 627 additional births respectively are still awaiting full follow-up.
This is a warning that children remain extremely vulnerable, not a stable
estimate that should be tuned against on its own. The independent `lean`
cohort reproduces the direction of the cause shift, which warrants tracing
M12's inter-band violence changes before treating it as food-supply evidence.

The first cohort logs are superseded: initial runs exposed cause grouping and follow-up denominator defects. The code now groups combat deaths by cause and counts a death below the age limit as an observed outcome. The finalized cohorts use a daily census to keep the measurement cost bounded.

## Still open in phase 1

- The three requested 20-seed cohorts are complete. The red matrix checks still need mechanism-level classification against `0dd2d9f`; see `bugs.md`. A passing/failing result in one matrix world is not itself a per-seed measurement.
- Every eligible birth with a complete five-year outcome died before five in `century` and `lean`. Keep this severe signal visible, and verify its mechanism and cohort mix in a longer follow-up before calibrating the LOD or setting a mortality limit.
- The owner's decision on `bands-take-sides` in well-fed worlds remains open. `crowded` has thin forage and does not measure the well-fed case.
