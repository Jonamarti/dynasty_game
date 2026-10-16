# M16 baseline (phase 0.1)

Frozen on 2026-10-16 from M15 close commit `0c2214e` (`0.15.160-alpha`). The
checked-out commit `0946fa7` adds only the M16 plan documents; the game code and
version are unchanged. Machine: `NoPE`, Windows, AMD64 (AMD processor family
23, model 8).

## Verification

| Command | Result |
|---|---|
| `npm.cmd run typecheck` | Pass |
| `npm.cmd test -- --maxWorkers=1 --testTimeout=15000` | Pass: 320 files, 2,339 tests passed, 1 skipped; 945.04 s |
| `npm.cmd run sim:check` | 1/147 checks failed: `perf-budget`, 622 steps/s at 31 people (floor 1,678) |
| `npm.cmd run sim:check:all -- --verbose` | 43 scenarios; 17 clean, 26 with failures; 1,810/1,928 applicable checks pass and 118 fail. See [scenario results](../../artifacts/verification/m16-baseline/scenario-failures.csv). |
| `npm.cmd run e2e` | 186/186 cases passed in 21.1 min; process exited 1 during runner teardown, with no spec failures. |
| `npm.cmd run profile:systems` | 30 people: 0.1853 ms/step; 300 people: 4.1546 ms/step. The reports compare identical starting and ending checkpoints. |

The seed cohorts used 20 seeds each: `band` ran 3,000 steps per seed and
`century` ran 40,000. The tool reports total elapsed time; throughput below is
derived from total steps divided by that time.

| Scenario | Mean survival | Collapsed below 25% | Elapsed | Derived throughput |
|---|---:|---:|---:|---:|
| `band` | 97.9% | 0/20 | 99.8 s | ~601 steps/s |
| `century` | 53.5% | 2/20 | 2,268.9 s | ~353 steps/s* |

\* The `century` run overlapped the unit suite for part of its duration, so its
elapsed time and derived throughput are not an isolated performance measure.
Neither cohort is a before/after balance comparison.

## M15 open gates accepted as the M16 starting point

| Gate | Last measured evidence at closeout |
|---|---|
| `lean` survival | 4.9% mean survival; 20/20 worlds collapsed below 25% (20 × 24,000 steps) |
| Population recovery | `generations`: 0/57 recoveries; all 57 episodes censored |
| `answered` | `generations`: 81.8% (36/44), below 90% |
| Firemaking | `century`: 9/20 seeds (45%), below the 50% gate |
| Compact correspondence | `lean/delta`: sed 16.9046 against tolerance 15; annual correspondence and off-map farming/crafting remain open |
| Peoples, phase 32c | `uneven` passed 20/20; `farming-spreads` and `states-arise` passed 0/20; `peoples-match-bands` was not run |
| Spoilage, phase 15c | Still disabled; no discriminating paired economic result |

These gates are accepted as baseline, not passed or closed. M15 remains open.

## M15 deliveries used by M16

| M15 delivery | Shipped | M16 dependency |
|---|---|---|
| Phase 12, light and night (12a–12f) | Yes | 5.2 gathering at dusk |
| Phase 14, layered clothing | Yes | 4.2 cold remedies |
| Phase 15, preservation | Yes; 15c spoilage remains off | 4.5 provisioning has no decay cost while 15c is off |
| Phase 16, interiors, walls and bedding | Yes | Block 14, 2.20 and 2.22 |
| Phase 26e, deep ditches and irrigation | Yes | 6.6 |
| Phase 32 LOD (no compacts inside the map) | Yes | 4.4 agenda needs no compact form |
| Phase 33, save/load | Yes | R11 and R24 |
| Phases 34–36, comarcas, travel and news | Yes | 2.19, 2.25, 5.8 and 7.2 |
| Night behaviour (`motivation.nightExposure`, 2026-10-15) | Yes | Block 14 shelter use at night |
| N9 player sites retained; “work on” gathers materials (2026-10-15) | Yes | 2.2 and 2.15 |

## Raw outputs

All raw outputs are under [`artifacts/verification/m16-baseline`](../../artifacts/verification/m16-baseline/):
identity and version, typecheck, unit tests, single-world check, full matrix,
system profile, both seed cohorts and the E2E run. The matrix CSV records each
scenario's applicable count and failed check names. E2E rewrote 127 tracked
historical screenshots; they were restored after the run because this phase
did not change the UI.
