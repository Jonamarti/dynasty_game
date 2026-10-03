# M15 phase 28: identity allocation

Date: 2026-10-03

## Contract

Each `Simulation` owns an `IdSpace`; the optional second constructor argument
lets multiple simulations that form one shared world use the same allocator.
Without it, each simulation starts at 1 independently. The allocator covers
people, households, trees, resource nodes, buildings, animals, corpses,
inscriptions, item piles and social events. IDs remain positive safe integers
and retain the previous creation order and per-kind numbering.

`IdSpace.snapshot()` now returns JSON v2 with `next` for all ten namespaces
and separate occupied-ID sets/cursors for bands and herds. v1 counter-only
checkpoints are explicitly rejected, because their missing group history cannot
be recovered safely. `IdSpace.fromSnapshot(unknown)` validates the version, exact
shape, namespace set and positive safe-integer counters. `restore(unknown)` is
monotonic: restoring an earlier snapshot cannot make an already-issued ID
available again. `Simulation.idSnapshot()` and `restoreIdSnapshot()` expose
this state without adding allocator data to `EntityRecords`.

Direct entity construction and standalone `SocialSystem` instances retain
their legacy module counters for tests and tools. Simulation factories pass
their allocator explicitly through births, founding, forest growth, wildlife,
actions and systems. Newborn creation is supplied through `LifeContext`, so a
different simulation cannot replace a process-wide callback.

Band and herd IDs now participate in shared-world allocation, preserving their
historical preferences in isolated simulations and reserving free identities
on collision. Their independent namespaces permit zero and retain sparse
occupied sets rather than positive entity counters. Details and continuation
rules: [m15_phase28_groups.md](m15_phase28_groups.md).

## Focused results

- `npm.cmd test -- --maxWorkers=1 --testTimeout=15000 src/sim/__tests__/id-space.test.ts`: 1 file, 5 tests
  passed. Covers two live interleaved simulations, intentional shared
  allocation, JSON continuation, monotonic restore and malformed snapshots.
  Includes continuation of all ten namespaces, defensive snapshots, atomic
  rejection, unknown kinds, exhaustion and rejection of a missing checkpoint.
  The harness fixture check failed with 6 unique IDs for 8 registered buildings
  before the two manually inserted granaries used `sim.ids`; it passes after
  fixing both `polity` and `conquest` setups.
- `npm.cmd run typecheck`: passed after the implementation and focused test.
- The negative control against the pre-change source is recorded by the root
  agent at `artifacts/verification/m15-phase28-old`: constructing a second
  same-config simulation between two `dropAt` calls caused the first world to
  issue pile ID 1 twice. With per-simulation allocation, each world has its
  own sequence; intentionally shared worlds continue one sequence.
- The existing `sim:check` baseline had `cravings-steer-the-diet` and
  `perf-budget` failing before this work, as reported by the root agent.
- The initial full run's only failure was the new birth fixture, corrected to
  run at the configured daily boundary; the next full run passed 897 tests in
  119 files. Missing-checkpoint validation and harness identity received focused
  checks/typecheck afterwards; the final suite is recorded in the changelog.
- Final full suite: 119 files, 898/898 tests passed. The full 27-scenario matrix
  was compared with the pre-change baseline; only the two harness granary
  fixtures diverged. After fixing those fixtures, targeted rechecks of `polity`
  and `conquest` match their original applicable checks/failures. Other 25 rows
  already match. The matrix remains red for the documented baseline mechanisms;
  the full pre-fixture-fix log and separate corrected rechecks are retained.
- Before/after SHA-256 of existing mutable simulation state, including world
  arrays, entities, relationships and RNG: identical across seeds `phase28-a/b/c`
  at ticks 0, 500 and 3000. Functions and new allocator metadata are omitted;
  this is a refactor equivalence check, not a mixed-tier fidelity claim.
  Script and hashes: `artifacts/verification/m15-phase28-reference*`.
- Screenshot tour passed (1/1), with visual QA:
  `artifacts/screenshots/m15-phase28-identity-2026-10-03-153933/`.
  The interface is unchanged.
