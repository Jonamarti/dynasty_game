# M15 phase 29d — world benchmark baseline

`tools/world-bench.ts` loads the committed `earth-12000-bce` atlas and builds a
repeatable level-two-shaped workload. It selects regions that are land and have
a classified Köppen-Geiger class from 1 through 28. Polar classes 29–30 and
unclassified cells (0) are excluded. This is a benchmark filter, not a claim
that those categories define human habitability.

The seed places one to four aggregate records in each selected region, with
1–4 occupied comarcas, population and subsistence/culture fields, a bitset over
the current `TECHS`, organization, relations, trade routes, stores, and a
retained four-word seeded RNG state. A seasonal pass reads the population and
subsistence fields, scans every current technology's actual `requires` list,
walks neighbor relations and trade routes, and advances each record's stream.
It runs four passes per game year. The clock uses `DEFAULT_CONFIG`:
240 ticks/day × 10 days/season × 4 seasons = 9,600 simulation ticks/year.

Each pass visits all records synchronously. The reported per-tick figure is
amortized arithmetic, not a measurement of peak frame/step latency or a
distributed scheduler. `--years 1` is a smoke run even when the cost check says
`passed`; the formal workload evidence uses 200 years. Serialized bytes describe
only these aggregate fixture records, not a complete game save with local
terrain, known identities and history.

This is a synthetic workload fixture, not the missing `PeopleSim`. It does
not change population or grant technologies: demographic arithmetic is consumed
by a checksum, and requirements are scanned without an invention roll. It has
no region-specific resource gates, calibrated social outcomes, saved game
codec, or LOD transitions. Consequently the budget result is provisional and
does not authorize starting later phases as though a real level-two simulation
had been measured. Phase 32c must replace this fixture with actual seasonal
updates and rerun the same 200-year gate.

## Baseline — 2026-10-05

Command:

```powershell
npm.cmd run world:bench -- --years 200 --output artifacts/verification/m15-world-bench-2026-10-05/earth-200y.json
```

The result used seed `m15-world-bench`: 959 selected regions, 2,440 records,
and 3,425,120 starting people across 800 seasonal updates. The full requirement
scan performed 162,016,000 checks; neighbor, trade, and conflict loops performed
11,296,800, 5,702,400, and 11,296,800 checks respectively.

Two consecutive runs took 26,993 ms and 51,290 ms (33.741–64.113 ms/update),
or 14.059–26.714 μs per simulation tick. The second run is the raw JSON linked
below. Both are below the provisional ceiling; the near-2× spread shows that
wall-clock timing is host-load sensitive and should be read as a range. The
comparison uses the existing
`perf-budget` formula and its phase-29 `band` baseline of 31 peak people:
`1,000,000 / (100 + 16 × 31) = 1,678 steps/s`, or 596 μs/step. Ten percent is
59.6 μs, so this synthetic fixture is below the provisional ceiling. This
comparison allocates the entire 10% budget to the level-two workload.

The JSON record graph is 1,460,178 bytes. In the second run, the heap delta while
seeding was −5,766,296 bytes and its process RSS grew 8,732,672 bytes; after the
run, max RSS was 171,312 KiB. Heap and RSS deltas are runtime observations, not retained-size
measurements: garbage collection and the rest of the Node/Vite process affect
them. The serialized graph is the repeatable estimate for the current fixture.

Raw output: [earth-200y.json](../artifacts/verification/m15-world-bench-2026-10-05/earth-200y.json).
