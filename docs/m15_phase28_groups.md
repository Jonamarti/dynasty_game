# M15 phase 28: shared band and herd IDs

Date: 2026-10-03

This follow-up extends the phase 28 identity allocator. It supersedes the
earlier phase 28 note that band/herd IDs were still local to one simulation.

## Identity rules

`IdSpace` v2 adds independent `band` and `herd` group namespaces to the ten
entity/event counters from the identity pass. Groups are claimed without RNG.
`claimGroupId(kind, preferred)` reserves a preferred historical number when it
is free. If another simulation has already claimed it, allocation finds the
lowest free number with a persisted cursor. `claimGroupAtOrAfter('herd', 5000)`
reserves the first available edge-herd number at or above 5000. Occupied IDs
are never released, so checkpoints retain the edge sequence. Simulation keeps
its existing `nextEdgeHerd` as a local preferred start (and advances it to the
claimed ID plus one); the allocator prevents collisions even if that preference
starts at 5000 again after restoring a checkpoint.

An isolated `Simulation` keeps the existing IDs and order: founding bands use
their ordinal `0..n-1`, outcasts prefer `bands.length + 1000`, prey herds use
`h`, predators prefer `1000 + g*10 + {1,3,4}`, and edge herds start at 5000.
When simulations share one `IdSpace`, collisions fall back deterministically
to free IDs. Band and herd IDs use separate namespaces. `startingTechByBand`
continues to use the founding ordinal, never the possibly remapped band ID.

Snapshots are JSON data with `version: 2`, the unchanged ten counters, and
canonical sorted occupied-ID lists plus the lowest-free cursor for both group
namespaces. Version 1 is rejected explicitly because it has no group history;
silently loading it could reissue a band or herd ID. Restore validates every
field before mutation, unions occupied sets and advances monotonically. A
single-simulation checkpoint keeps all legacy IDs; outcast rendering follows
`Band.outcast`, since a remapped group ID cannot encode that status.

The production search found no band-array indexing by `band.id` or arithmetic
that requires group IDs to be contiguous. Founding `startingTechByBand` was
already indexed by the ordinal loop variable and remains so. Renderer colour
classification was updated to receive the band's `outcast` flag explicitly;
the old 1000 threshold is only the historical preferred ID base.

## Focused results

- `npm.cmd test -- --run src/sim/__tests__/group-ids.test.ts src/sim/__tests__/id-space.test.ts`:
  2 files, 11 tests passed. Coverage includes default legacy values, two shared
  simulations, outcast norms/stances, ordinal starting technologies, disjoint
  herd sets, calf membership, real `Simulation.edgeTraffic()` entry and edge
  continuation after JSON snapshot, disjoint-checkpoint merging, invalid
  snapshot rejection/atomicity, and deterministic fallback.
- `npm.cmd run typecheck`: passed.
- Final combined suite: 909/909 tests in 122 files, including the roster
  delivery; browser suite 70/70. The low-ID outcast case observes the actual
  renderer colour and saves `13-low-id-outcast.png`. The colour test fails
  under the former numeric threshold; an inherited occupied field also failed
  the new strict-shape check before requiring own fields.
- Nine hashes of existing mutable state/RNG match the reference at ticks
  0/500/3000 across three seeds. New allocator metadata and functions are
  excluded. Evidence: `artifacts/verification/m15-phase28-groups-20261003-160240/`.
- Tour and visual QA: `artifacts/screenshots/m15-phase28-groups-2026-10-03-161130/`.
- The complete 27-scenario final matrix exits 1, matching the baseline's
  applicable/passed counts and failed-check lists exactly (zero differences,
  104 inherited failure instances). Throughput is excluded from the comparison;
  the matrix remains red. Normalized results and logs are in the same evidence
  directory (`comparison.json` and `comparison.md`).
- The implementation adds no RNG forks or draws. Group claims happen after a
  group's placement succeeds and before its members are created; the old RNG
  calls keep their order. The previous phase 28 state/RNG equivalence run
  covered the entity allocator pass; root is running a fresh matrix/hash check
  for shared group IDs.
- `band` and `herd` are separate group namespaces. This change makes each
  namespace collision-free across shared simulations; it does not make a band
  ID numerically distinct from every herd ID because those values are used in
  different roles.
