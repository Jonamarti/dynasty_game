/**
 * An optional stopwatch hook for `Simulation.step()` (M15 step 0, 2026-10-08).
 *
 * The first systems profile wrapped methods, and more than half of a step ran
 * in blocks that are not methods at all (the per-person loop, the carry
 * reconciliation, the context object built each tick). `step()` therefore calls
 * `stepMark('label')` between blocks; the profiler installs a function that
 * charges the time since the previous mark to that label.
 *
 * It lives in a module of its own, not as a field on `Simulation`, on purpose:
 * the profiler compares SHA-256 hashes of the whole simulation object between
 * profiled and control runs. A `stepProbe` field would be `null` in one and a
 * function (skipped by the encoder) in the other, and the two hashes would
 * differ for a reason that has nothing to do with the game. Module state is
 * not part of any world, any save, or any hash. It never reads the RNG and
 * never writes game state; with no profiler installed it is one null check.
 */
export let stepMark: ((label: string) => void) | null = null;

export function setStepMark(mark: ((label: string) => void) | null): void {
  stepMark = mark;
}
