import { expect, it } from 'vitest';
import { summarizePerfRuns, type ProfileBundle } from '../../../tools/perf-report.ts';

const steps = 480;

function bundle(
  overall30: number, overall300: number,
  system30: { simulation: number; needs: number },
  system300: { simulation: number; needs: number },
): ProfileBundle {
  const reports: ProfileBundle['reports'] = [];
  for (const [humans, overall, methods] of [
    [30, overall30, system30], [300, overall300, system300],
  ] as const) {
    for (const mode of ['unprofiled', 'profiled', 'counted'] as const) {
      reports.push({
        requestedHumans: humans,
        mode,
        completedSteps: steps,
        meanStepMs: overall,
        timings: mode === 'profiled' ? {
          'Simulation.step (inclusive total)': { calls: steps, totalMs: methods.simulation * steps },
          'Needs.update': { calls: steps, totalMs: methods.needs * steps },
        } : {},
      });
    }
  }
  return {
    steps,
    reports,
    comparisons: [30, 300].map(humans => ({ humans, sameStartingState: true, sameEndingState: true,
      countedSameStartingState: true, countedSameEndingState: true })),
  };
}

it('takes the three-run median and reports each inclusive system per step without summing them', () => {
  const runs = [
    bundle(0.14, 0.8, { simulation: 4, needs: 1 }, { simulation: 12, needs: 5 }),
    bundle(0.10, 0.7, { simulation: 2, needs: 3 }, { simulation: 8, needs: 7 }),
    bundle(0.12, 0.9, { simulation: 3, needs: 2 }, { simulation: 10, needs: 6 }),
  ];

  const [small, large] = summarizePerfRuns(runs, steps);
  expect(small).toEqual({
    humans: 30,
    overallMeanMsPerStep: 0.12,
    methods: [
      { name: 'Needs.update', msPerStep: 2 },
      { name: 'Simulation.step (inclusive total)', msPerStep: 3 },
    ],
  });
  expect(large).toEqual({
    humans: 300,
    overallMeanMsPerStep: 0.8,
    methods: [
      { name: 'Needs.update', msPerStep: 6 },
      { name: 'Simulation.step (inclusive total)', msPerStep: 10 },
    ],
  });
});

it('rejects an incomplete run and a failed state-equivalence control', () => {
  const good = bundle(1, 2, { simulation: 4, needs: 1 }, { simulation: 8, needs: 2 });
  const incomplete = structuredClone(good);
  incomplete.reports.pop();
  expect(() => summarizePerfRuns([good, incomplete, good], steps)).toThrow(/Expected one counted profile/);

  const inequivalent = structuredClone(good);
  inequivalent.comparisons[1]!.sameEndingState = false;
  expect(() => summarizePerfRuns([good, inequivalent, good], steps)).toThrow(/Profile equivalence failed/);
});

it('requires exactly three repeats for the median', () => {
  const good = bundle(1, 2, { simulation: 4, needs: 1 }, { simulation: 8, needs: 2 });
  expect(() => summarizePerfRuns([good, good], steps)).toThrow(/exactly three profile runs/);
});
