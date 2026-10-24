# M16 baseline (stage 2 close)

Frozen on 2026-10-24 for the stage-2 gate (phase 2.G), at commit `7f45fb44`
(`0.16.19-alpha`). Machine: `NoPE`, Windows, AMD64 (AMD processor family 23,
model 8), all long runs serial with no concurrent load. Evidence directory:
[`artifacts/verification/m16-2.G-gate-2026-10-24/`](../../artifacts/verification/m16-2.G-gate-2026-10-24/).

## Verification

| Command | Result |
|---|---|
| `npm.cmd run typecheck` | Pass |
| `npm.cmd test -- --maxWorkers=1 --testTimeout=15000` | Pass: 358 files, 2,474 tests passed, 1 expected fail (E5's own test, still open) and 1 skipped (2476 total). Part of the 51.6-min `check:full`. |
| `npm.cmd run sim:check:all -- --slow --json` | 49 scenarios; 1,885 passing checks, 139 failing, 2,330 not-applicable. Exits 1 because it includes the inherited baseline failures (R21), not a new regression. Full log: `matrix.log`, matrix data: `matrix.json`. |
| `baseline:diff` against [the 0.1 matrix](../../artifacts/verification/m16-baseline/matrix.json) | Exit 1: real transitions found. 74 needed a cause line (39 pass→fail, 32 pass→na, 3 never-before-applicable→fail); 66 recoveries (39 na→pass, 21 fail→pass) and 6 fail→na need none. See the matrix-diff section below. Log: `diff.log`, per-transition record: `transitions.csv`, per-check causes: `causes.txt`. |
| `npm.cmd run e2e` | First run inside `check:full`: 191 passed, 11 failed — all 11 were stale fixture premises (stations placed in `sim.place` in worlds without territory, refused since 2.22/D-16), fixed in commit `7f45fb44` without any game change. After the fix: those ten spec files 19/19 focused, the torch/hearth-light specs that share the helpers 4/4, `check:fast` 46/46. The full E2E layer was not re-run after the fix; both states are recorded in `check-full.log` and the fix evidence is in `docs/changelog.md` for 2.G. |
| Seed cohorts | `band` and `century`, 20 seeds each, serial (R27). See below. |

Per-step timing for the gate chain (`steps.json`): matrix 1,222.2 s, diff 0.8 s,
`band` cohort 99.9 s, `century` cohort 1,880.4 s.

## Seed cohorts

Same shape as the 0.1 baseline. Throughput is derived from total steps divided
by elapsed time; this time both cohorts ran isolated, so both figures below are
genuine performance measures, unlike the 0.1 `century` row which overlapped the
unit suite.

| Scenario | Mean survival | Collapsed below 25% | Elapsed | Derived throughput |
|---|---:|---:|---:|---:|
| `band` | 98.2% | 0/20 | 99.9 s | ~601 steps/s |
| `century` | 48.7% | 4/20 | 1,880.4 s | ~426 steps/s |

Phase-4 gate context inside the `century` cohort: firemaking known 9/20 seeds
(45.0%, gate 50%); cohort births 92; adoption median 9 days, not reached 12;
recovered 0/36 drawdowns (censored 36).

Against the 0.1 baseline (`band` 97.9% and 0/20; `century` 53.5% and 2/20):
`band` moved +0.3 points and kept the same collapse count — and even its
throughput is identical (601 steps/s), a strong signal the machine comparison
is clean. `century` moved −4.8 points and 2 seeds; that is under the ~10-point
threshold where seed chaos (R20) stops separating mechanism from noise, and the
`AGENTS.md` warning that `century` is chaotic applies on its own. Neither
cohort is claimed as an improvement or a regression; both are recorded.

## Matrix diffusion against the 0.1 baseline

Total transitions: 140 across 26 scenarios
(39 pass→fail, 32 pass→na, 21 fail→pass, 39 na→pass, 6 fail→na, 3 na→fail).
The matrix also grew from 43 to 49 scenarios since 0.1 (new scenarios from M16
phases), which is why the totals differ before any diff: 1,885 passing / 139
failing / 2,330 n/a now against 1,810 passing / 118 failing / 2,268 n/a at 0.1.

Twelve checks flip in *both* directions between scenarios — a worsening
transition in one scenario and a recovery in another
(`moods-move-choices`, `people-survive`, `the-wise-avoid-baneberries`,
`gossip-is-aimed`, `projects-find-backers`, `needs-not-pinned`,
`walkers-do-not-grind`, `generations-turn-over`, `population-persists`,
`discovery-is-situated`, `techs-are-refined`, `spatial-hash-spreads`).
Scenario-to-scenario seed dependence of that size is the documented R20/`century`
chaos in action; where a check sits on both sides, this diff does not claim a
mechanism for it. Everything below records each transition with its measured
evidence line from the same scenario's verbose replay
(`verbose-<scenario>.log`). Causes are grouped where they share one shape; each
group still lists every scenario individually, so every one of the 74 required
cause lines is covered.

### pass→fail (39) — with cause

| Check | Scenarios | Evidence (per-scenario verbose line) | Reading |
|---|---|---|---|
| `people-act-on-what-they-know` (6) | century, craft, hearths, hunters, polity, stewards | absolute gate of 100% now misses a sliver: 20/8,524 (century), 1/4,193 (craft), 12/3,075 (hearths), 1/2,356 (hunters), 4/6,222 (polity), 17/6,412 (stewards) targets chosen while neither visible nor remembered | 0.02–0.3% of decisions aim at unremembered ground. An absolute gate decides on a handful of slips either way; recorded as margin noise, not a rule change |
| `moods-move-choices` (4) | smiths, band, stewards, lean | talk share in the low-belonging tercile falls *below* the high tercile by 0.3–0.9 points: 5.9 vs 6.2% (5,314 samples), 2.5 vs 3.2% (950), 5.1 vs 5.6% (5,487), 3.6 vs 4.5% (2,666) | the ordering the check wants has inverted slightly in these worlds. The same check recovers (fail→pass) in herders, culture and diggers, so it flips seed-dependent; recorded, mechanism not attributed |
| `projects-find-backers` (4) | emptied, coast, herders, diggers | 2/3, 2/3, 2/3 and 2/4 completed AI-planned projects had a backer, all just under the 70% gate | one completed project decides these worlds; denominators of 3–4 put the gate in a coin-flip band. Same check recovers in polity; recorded |
| `generations-turn-over` (2) | millers, polity | over 3 years: 4 courtships, 5 marriages, 2 conceptions, 0 births (millers); over 2 years: 0 courtships, 9 marriages, 0 conceptions, 0 births (polity) | courtship/conception/birth funnel nearly empty in these short scenarios. Same check and its sibling recover in feasts/conquest. Recorded as the strongest consistent candidate for a real demographic shift since 0.1; flagged for the next block, not attributed here |
| `population-persists` (2) | millers, polity | 7 alive after 4 years (peaked 16, 0 born); 14 alive after 3 years (peaked 28, 0 born) — the gate needs at least one birth | same funnel as above: no birth in the window at these population sizes. Recorded with the same flag |
| `gossip-is-aimed` (2) | hearths, polity | 0 slanders and 0 praises over 398 (hearths) and 461 (polity) conversations | no slanders in hundreds of conversations. In `smiths` the related line shows 312 warm / 0 hostile relationships — the valence distribution these checks feed on has flattened. The same check recovers in wilds/orchard; flagged next to the mood row above |
| `the-wise-avoid-baneberries` (2) | scribes, wilds | 14 baneberry meals by people without plant lore (11 fell ill), 4 by people who had it (scribes); 102/64 ill vs 1 (wilds) | large unlettered exposure took ill before knowing plant lore. Same check recovers in millers/polity; the exposure scale is the deciding variable, not a per-person rule. Recorded |
| `discovery-is-situated` (2) | hunters, feasts | absolute gate: 2/19 (hunters) and 4/29 (feasts) ideas not into the technologies the "cold" signal suggests | handful of ideas decide an absolute gate; recovery in `labour`. Recorded |
| `needs-not-pinned` (2) | culture, diggers | final avgCold 81.6 (culture) and 57.7 (diggers) with avgHunger 53.4/31.4 | these two worlds end deep in winter need; recovery in harsh-winter. Recorded; cold economics conserved open |
| `shelter-answers-cold` (1) | culture | 33,357 sheltering ticks yet final avgCold 81.6 | sheltering happens, the cold does not drain — consistent with the `needs-not-pinned` row above; recorded |
| `spatial-hash-spreads` (1) | culture | largest bucket holds 10 of 19 items across 3 cells | 19 items spread over 3 cells — the scenario population is too small for the spread the check wants; a degenerate-sample fail, recovery in orchard. Recorded |
| `peoples-drift-apart` (1) | craft | 19.5 tiles before half the 74 incidents, 18.2 after | the drift metric moved 1.3 tiles the other way; recorded |
| `walkers-do-not-grind` (1) | coast | 148 of 27,813 walking ticks made no real progress (5.3 per 1,000; wanted under 5) | 0.3 per 1,000 over the gate; recovery in herders. Recorded |
| `taxes-reach-the-temple` (2) | polity, conquest | 0 levies ordered (0 obeyed, 0 refused, 99/49 owing nothing), 0 units carried in | nobody owes anything in these worlds, so the levy route never engages. The economy changed shape since 0.1 rather than the tax code; recorded, flagged with the demographic group |
| `techs-are-refined` (1) | stewards | 0 improvements to proven designs, 0 carried as far as they go | nothing reached an improvable state in this window; recovery in herders. Recorded |
| `research-is-social` (1) | diggers | 15 breakthroughs alone, 0 by arguing it out | absolute gate; every arguable breakthrough went solo this seed. Recorded |
| `ideas-become-tech` (1) | conquest | 32 conceived, 0 built, 0 proven, 0 failed their trial | the window ends before any design matures; recovery in conquest's sibling rows (population, records). Recorded |
| `knowledge-is-found` (1) | conquest | nobody worked anything out | same window as above; recorded |
| `hills-see-farther` (1) | harsh-winter | 0 of 65 sightings were from further off than the bare radius of 12 tiles | not one sighting happened on high ground. Suspicious enough to flag beside `smiths` below; recorded |
| `ore-becomes-metal` (1) | smiths | 4 loads of copper ore mined, 0 furnace runs | ore is mined but the smelting step never engages in the window. **Flagged as the one new failure that deserves an open bug entry**: candidate links are the 2.22/D-16 station-territory rule interacting with the young scenario band, or fuel/charcoal ordering. Not attributed here; see `docs/bugs.md` |
| `people-survive` (1) | orchard | 7/12 alive at step 9,600 (need 9 over 40 days) | two deaths over the floor in a 12-person world; recoveries in smiths/wilds. Recorded |

### pass→na (32) — with cause (all are sample-size skips in short windows)

| Check | Scenarios | Skip evidence |
|---|---|---|
| `the-pregnant-are-spared` (7) | culture, emptied, fishers, hearths, polity, scribes, stewards | tasks begun by third-trimester women: 4, 9, 9, 7, 0, 0, 4 — all under the need of 10 |
| `kin-outrank-strangers` (3) | century, farmers, harsh-winter | outsider ties absent (n/a in all three); household/band pairs present but the three-tie threshold not met |
| `trials-accumulate` (3) | conquest, craft, hunters | nothing was proven, so nothing was tried twice |
| `hills-see-farther` (1) | band | 2 sightings of strangers, too few to say |
| `raw-meat-sickens` (1) | band | 32 raw meals, need 40 for the ~10% risk to show |
| `the-wise-avoid-baneberries` (3) | band, diggers, fishers | 2, 0, 0 unlettered baneberry meals, need 3 |
| `bodies-are-found` (2) | wilds, feasts | only 3 deaths, too few to say |
| `conception-needs-a-roof` (2) | century, farmers | 4 conceptions, need 5 |
| `hunts-succeed-and-fail` (2) | herders, traps | 3 kills/3 misses and 1 kill/3 misses, too few strikes |
| `children-are-taught` (1) | hunters | 4 taught, 4 to a child, too few lessons |
| `jobs-bias-work` (1) | hunters | 0 ticks with a job assigned to compare |
| `sleep-restores` (1) | hunters | nobody had a roof to sleep under in this run |
| `the-hurt-are-tended` (2) | farmers, polity | nobody here knows a herb from a weed |
| `the-watched-intervene` (1) | scribes | only 2 property deeds seen by their owners |
| `metal-is-cast` (1) | smiths | no copper was smelted in this run (consequence of the furnace chain above) |

### na→fail (3) — first time applicable, with cause

| Check | Scenario | Evidence | Reading |
|---|---|---|---|
| `kills-are-butchered-for-bone` | hunters | 1 kill gave 0 bone and sinew, worked into 0 tools and 0 coats | the check became applicable on a single kill; one bad sample decides it. Pending D-16/2.G is not a fit — recorded as sample-size, not a rule change |
| `hills-see-farther` | polity | 0 of 63 sightings from beyond the bare radius of 12 tiles | same reading as the harsh-winter pass→fail row above; both share the flag |
| `bands-take-sides` | stewards | 1 pair of comparable bands, friendliest 0.0 vs hostile −2.9 (spread 2.9) | one band pair decides an absolute gate; the same check went fail→na in `millers`, `farmers`, `herders`. Recorded |

### Recoveries (no cause required, listed for the record)

21 fail→pass and 39 na→pass transitions; 6 fail→na (checks that stopped being
applicable in newer worlds). Full per-row record in `transitions.csv`.

## Interpreting this diff

The dominant shape is **sample-size sensitivity**, not a code direction: 32 of
39 pass→na rows are literally "the window produced fewer events than the
check's minimum", and several pass→fail rows are absolute gates that a question
of 1–5 events (one project, one sighting, one kill, one idea) decides. The
second shape is the **courtship→conception→birth funnel** being thin or empty in
some 2–3-year scenarios (`generations-turn-over`, `population-persists`,
`conception-needs-a-roof`, `the-pregnant-are-spared`, `taxes-reach-the-temple`
"owing nothing") — the one group with a candidate mechanism consistent across
checks, flagged for the next block rather than attributed to any single change
here. A third shape is **mood/valence ordering** (`moods-move-choices`, `gossip-is-aimed`)
flipping in both directions. Two flagged exceptions deserve investigation on
their own: `ore-becomes-metal` (see `docs/bugs.md`) and `hills-see-farther`
(sighting geometry never extended by hills in these two worlds; no bug entry
yet — the mechanism is unconfirmed and the scenarios may simply lack high
ground on sighting paths).

## Open A entries of `docs/m16_bugs.md` at the close of stage 2

Every open A entry, with the reason it is still open as the stage-3 card asks:

| Entry | Short summary | State | Why still open |
|---|---|---|---|
| A6 / N7 | roofed and roofless building art misaligned | 2.6 | R0: the card did not match the code at execution time; phase recorded in `doubts.md`, left to the owner |
| A13 | M15 equipment: 15 new failures and 12 applicability losses without an established cause | 0.1 → folded into 10.2, block 10 | not a per-fix defect; consumed by the verification of block 10 where the 2.G gate states the aggregate matrix is what classifies them |
| A14 | nobody defends a predator-bitten companion (M15 23e/f) | 2.14 | skipped under R0 (animal-assailant contract gap, see `doubts.md`); the phase card and this gate do not repair behaviour |
| N20 | pickup with bundle and bag equipped: object leaves the world and does not report | verified without change in 2.4 | not reproduced; `m16-pickup-conserves-items` guards the route; unknown cause remains |
| N44 | river-basin water-search death loop and phantom freshwater shores at map edge | open, 2.17 | the R0 record stands (visible NPC notice undefined); reproduction needs a river map touching the west edge |
| E2 / E3 | `go_home` outscoring hunger; long walk to known water still fatal | 2.17 lane | hypotheses pending the same 2.17 reproduction as N44 |
| E5 | the loader does not restore shared object identity; one shared object becomes two after save/load | 2.24 | the gate's unit run still shows its expected-fail test, so it is live and not yet fixed |
| E13 | `perf-budget` 508–591 steps/s vs the 1,678 floor in `band` | H baseline, open | measured separately from the matrix; not a phase fix |
| E16 | intermittent `.newgame-option` selector history | recorded | not reproduced with `--repeat-each=50`; kept as historical |
| E21 / E22 | "coastal origin" promise and comarca hydrology forecast | D-19 | owner decisions pending |
| Conservation ("Conserves") | salters 0/3 winter meals stored although stock is in the pack | 15c off | cause of the non-selection open; spoilage still disabled |
| 14-10 / 16-10 C rows | torch adoption not exercised in `lean`; agricultural chain not exercised in `farmers` | 10.2 | gates open, no rate adjusted; both are exercise/coverage concerns, not defect fixes |

Everything else in `m16_bugs.md` is closed at the time of this document.

## Raw outputs

All raw outputs are under
[`artifacts/verification/m16-2.G-gate-2026-10-24/`](../../artifacts/verification/m16-2.G-gate-2026-10-24/):
`check-full.log` and `check-full-result.txt` (the four layers), `matrix.log`
and `matrix.json`, `diff.log`, `transitions.csv`, `causes.txt` (74 cause lines
matched against the verbose replays), `verbose-<scenario>.log` for 26
scenarios, `cohort-band.log`, `cohort-century.log`, `steps.json`,
`chain-progress.txt`, and the runner scripts (`run-gate-chain.ps1`,
`run-verbose-captures.ps1`, `run-verbose-gap-captures.ps1`).

## Screenshots

No game change this gate (doc/tooling only), so the stage tour is recorded as
a NEW dated directory, per the same convention as previous gates:
`artifacts/screenshots/m16-2026-10-24-stage2/` via `npm run shots` — 19/19
passed, exit 0, captured after two stale-tour-premise fixes that touch no game
code (commit `dcbc9b59`, see the changelog): the follow camera had put the
tour's tree below the fold or under the bottom help strip, where the
right-click died on the strip and the radial never opened (the tour now snaps
the camera two tiles north of the tree and freezes it, as every other spec
does, and restores the follow camera after the tree frames); and the tour had
run against the config's 60-second test-timeout line since 1.2 — on this date
it died there on its last frames on two serial runs even after the framing
fix, so the tour, being a capture harness rather than an assertion suite, got
its own 240-second timeout. The historical screenshots that the gate's E2E
layer rewrote were restored from `HEAD` afterwards, matching the established
convention; the backup/residue incident is recorded in
[`doubts.md`](m16/doubts.md), not silently claimed away.
