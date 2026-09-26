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

## Pooled conflict measures for the matrix diagnosis

The `CONFLICT` line lets phase 1a distinguish the current single-seed
`violence-concentrates` and `peoples-drift-apart` failures from their cohort
behavior. Across the matched 20-seed cohorts, `lean` moves from 4,981 to 2,640
inter-band blows, while the share near either camp changes only from 42% to
44%. The number of seeds whose peoples drift apart rises from 7/20 to 12/20,
and the mean distance change moves from −0.2 to +0.6 tiles. `century` moves
from 4,471 to 2,146 blows and from 46% to 44% near camp; drift-apart seeds rise
from 11/20 to 14/20, while the mean change moves from +1.8 to +1.4 tiles.
In `crowded`, blows fall from 293 to 45, the near-camp share changes from 75%
to 78%, and drift remains negative (−6.3 to −6.0 tiles; 2/16 and 2/18 eligible
seeds).

These cohorts do not support the current matrix's interpretation as a simple
shift in the violence location: near-camp shares are broadly similar and the
separation result is mixed, while the volume of conflict falls in all three
cohorts. The single-run checks remain useful tripwires for those seeds, but
the measured shortfall in `violence-concentrates` is not a cohort-wide change
that can be attributed to M12. The earlier and later builds differ across many
systems, so the conflict-volume change also remains unattributed. This pooled
read closes the measurement part of phase 1a for these two checks; other red
checks need their own pooled counters or mechanism-specific reproductions.

## Scribes cohort

The new `MECHANISMS` section in `sim:seeds` records the numerator and
denominator for selected matrix checks across seeds. In the current 20-seed
`scribes` run, there were 1,184 breakthroughs, 137 from discussion; 19/20
seeds recorded at least one discussion breakthrough. The matrix's 0 discussion
breakthrough result in `scribes` is therefore seed-specific in the current
build, despite the pre-M12 seed having passed that check. There were 12
complaints heard of 35 debts in the cohort, across 2/20 seeds; individual
scribes seeds generally do not reach the check's 40-debt minimum. This is
evidence that the route exists, not that it meets the threshold in every
scenario. The complete output is in
[`artifacts/m14-phase1-scribes-20.txt`](../artifacts/m14-phase1-scribes-20.txt).

## Follow-up cohorts for the remaining red checks

These additional cohorts were run on the current worktree, after later M13
simulation changes. They show whether the mechanisms occur across seeds in this
build; they are descriptive follow-ups and do not replace the matched
pre-M12/M12 cohorts above or support attributing any change to M12.

The 20-seed `farmers`, `stewards` and `feasts` cohorts each ran 24,000 ticks. Among
worlds with a band pair and at least 60 days, `bands-take-sides`'s 20-point
spread was present in 4/8 `farmers`, 5/8 `stewards`, and 5/8 `feasts` worlds.
The remaining 12 in each cohort had no pair to measure. The single-run matrix
failures do not represent every eligible world, but these small eligible
denominators are not strong evidence for a food effect or for automatic
hostility in well-fed worlds. The design decision remains the owner's.

In `stewards`, compost was spread in 11/20 worlds (40 spreads, from 358 loads
matured); 13/16 harvested worlds ended below 98.5% of resting soil. The matrix
seed's zero spreading alongside 99.7% soil confirms that the red checks are
opportunity-sensitive. In `farmers`, 15/15 harvested worlds fell below the
soil threshold and none spread compost, as expected without that technology.

The 20-seed `labour` cohort had 13 stuck ticks in 2,732,456 walking ticks, and
no seed crossed the 5-per-1,000 check floor; the matrix seed is therefore a
single-seed tripwire. The cohort accumulated only 7 debts, below the check's
40-debt minimum, and heard none. The justice counter was corrected during this
pass: `complaint_grievance_heard` now counts only a wronged person who tells
their own chief, and `demand_carried_heard` separately counts a demand brought
home from a parley. The refreshed `century` cohort heard 30/639 victim
complaints in 9/20 seeds and separately delivered 9 carried demands. The
earlier combined count (39) must not be read as 39 victim complaints.
Per-seed files: [`farmers`](../artifacts/m14-phase1-farmers-20.txt),
[`stewards`](../artifacts/m14-phase1-stewards-20.txt),
[`labour`](../artifacts/m14-phase1-labour-20.txt), and
[`century`](../artifacts/m14-phase1-century-20.txt).

The other scenario-specific tripwires also vary across seeds. In `traps`, no
seed knew taming, fed a wild animal, or tamed one; the matrix seed's failure
did not reproduce in this later worktree: its focused check is now n/a because
nobody knows taming. In `feasts`, 62
refinements followed 141 proven designs across 15/20 seeds, so its matrix seed
with zero improvements is likewise a tripwire. In `scribes`, the pooled
near-camp share is 89% (204 blows), versus 46% in the matrix seed; 3/4 eligible
cohort seeds drifted apart by a mean 0.7 tiles, unlike the matrix seed's
decrease. In `labour`, the cohort had only 8 cross-band blows, so the location
check was not eligible there. See [`traps`](../artifacts/m14-phase1-traps-20.txt)
and [`feasts`](../artifacts/m14-phase1-feasts-20.txt).

## Active matrix on the later M13 worktree

`npm run sim:check:all` was also rerun on this later worktree and saved as
[`artifacts/m14-phase1-current-matrix.txt`](../artifacts/m14-phase1-current-matrix.txt).
It is not the same build as the archived 88-check pre-M12 or 93-check M12
matrices, so it cannot identify M12 causes. The previous red checks for
`violence-concentrates`, `research-is-social`, `wrongs-reach-the-chief`, and
`walkers-do-not-grind` are absent from its failure summary. The remaining
`peoples-drift-apart` failure in `crowded` does reproduce in the later
20-seed cohort: none of 10 seeds with enough incidents drifted apart, and the
mean change was −5.0 tiles; the focused matrix seed fell from 59.1 to 56.1
tiles. This points to a scenario-specific failure of the separation mechanism
or its proxy, while `century`'s later cohort drifts apart in 9/11 eligible
seeds (mean +2.8 tiles) despite its matrix seed failing.

The same active matrix has pervasive failures in `cravings-steer-the-diet` and
`nights-are-slept`, plus `children-keep-close` in 14 scenarios. The other
scenario-specific checks are `opinions-diverge` (coast, traps, hunters, fishers,
herders, feasts, culture), `gossip-is-aimed` (traps, feasts, culture),
`animals-are-tamed` (farmers, herders, culture), `bands-take-sides` (farmers,
feasts, stewards, lean), `bands-dont-overbuild` (farmers, feasts),
`the-tree-is-climbed` (herders), `the-hurt-are-tended` (millers), and
`techs-are-refined` (feasts). The artifact has the complete summary; existing
notes on recurring diet, sleep, family distance and one-event checks remain in
`bugs.md`.

The first cohort logs are superseded: initial runs exposed cause grouping and follow-up denominator defects. The code now groups combat deaths by cause and counts a death below the age limit as an observed outcome. The finalized cohorts use a daily census to keep the measurement cost bounded.

## Still open in phase 1

- The three requested matched 20-seed cohorts and seven descriptive follow-up cohorts are complete. Pooled measures classify several single-seed tripwires; matched causal diagnosis for the remaining red checks is still open. `wrongs-reach-the-chief` now uses a victim-only complaint counter, and the refreshed active matrix adds no failure for it. A passing/failing result in one matrix world is not itself a per-seed measurement.
- Every eligible birth with a complete five-year outcome died before five in `century` and `lean`. Keep this severe signal visible, and verify its mechanism and cohort mix in a longer follow-up before calibrating the LOD or setting a mortality limit.
- The owner resolved the design question on 2026-09-25: bands should be able to fight without material scarcity, including over poor relations, old or current grudges, territorial ambition, or domination. The `farmers` and `stewards` cohorts provide 8 eligible worlds each, with 4 and 5 spreads respectively. Diagnose whether the current standing/conflict mechanisms express those causes; keep the check as a behavior tripwire and do not waive it just because a world is well fed. `crowded` has thin forage and does not measure the well-fed case.
