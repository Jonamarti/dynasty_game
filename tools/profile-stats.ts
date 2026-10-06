/** Pure statistics for `profile-systems.ts` (M15 32a).
 *
 * The browser page only collects raw numbers (one duration per step, integer
 * counters, replay-block timings); everything that interprets them lives here
 * so a unit test can feed it known data, including a negative control that
 * must NOT look like the real thing. Nothing here touches the simulation.
 */

export interface DurationSummary {
  steps: number; totalMs: number; meanMs: number; p50Ms: number; p95Ms: number; maxMs: number;
  /** p95 / p50: how long the tail is relative to the typical step. 0 when p50 is 0. */
  tailRatio: number;
  /** The slowest steps, so the daily passes show up as the long interval. */
  slowest: { step: number; ms: number }[];
}

/** Nearest-rank percentile on an ascending array. Empty input gives 0. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank]!;
}

export function summarizeDurations(values: readonly number[], keep = 5): DurationSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const totalMs = values.reduce((sum, v) => sum + v, 0);
  const p50Ms = percentile(sorted, 0.5);
  const p95Ms = percentile(sorted, 0.95);
  const slowest = values.map((ms, step) => ({ step, ms })).sort((a, b) => b.ms - a.ms || a.step - b.step).slice(0, keep);
  return {
    steps: values.length, totalMs, meanMs: values.length ? totalMs / values.length : 0,
    p50Ms, p95Ms, maxMs: sorted.at(-1) ?? 0, tailRatio: p50Ms > 0 ? p95Ms / p50Ms : 0, slowest,
  };
}

export interface BandCount { band: string; within: number; outside: number }

/** Share of individuals outside the effective vision, per band and overall. */
export function bandDistribution(counts: readonly BandCount[]) {
  const rows = counts.map(c => ({ ...c, total: c.within + c.outside,
    outsideShare: c.within + c.outside ? c.outside / (c.within + c.outside) : 0 }))
    .sort((a, b) => b.total - a.total || a.band.localeCompare(b.band));
  const within = rows.reduce((s, r) => s + r.within, 0);
  const outside = rows.reduce((s, r) => s + r.outside, 0);
  return { bands: rows, within, outside, total: within + outside,
    outsideShare: within + outside ? outside / (within + outside) : 0 };
}

export interface PerceptionKind { calls: number; unitMs: number }

/** Perception cost = counted calls x replayed unit cost, as a share of the step.
 * It is an estimate with a known bias (see docs/m15_profile_systems.md), never a
 * measured sum: it must not be added to the wrapper timings. */
export function perceptionEstimate(kinds: Record<string, PerceptionKind>, steps: number, meanStepMs: number) {
  const perKind = Object.fromEntries(Object.entries(kinds).map(([name, k]) => [name, {
    calls: k.calls, callsPerStep: steps ? k.calls / steps : 0, unitMs: k.unitMs,
    estimatedMsPerStep: steps ? k.calls * k.unitMs / steps : 0 }]));
  const msPerStep = Object.values(perKind).reduce((s, k) => s + k.estimatedMsPerStep, 0);
  return { perKind, msPerStep, shareOfStep: meanStepMs > 0 ? msPerStep / meanStepMs : 0 };
}

/** Median of replay blocks divided by queries per block: one timer pair per block. */
export function unitCostFromBlocks(blockMs: readonly number[], queriesPerBlock: number): number {
  if (!blockMs.length || queriesPerBlock <= 0) return 0;
  return percentile([...blockMs].sort((a, b) => a - b), 0.5) / queriesPerBlock;
}
