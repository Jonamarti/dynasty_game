import { percentile } from './profile-stats.ts';

type ProfileMode = 'unprofiled' | 'profiled' | 'counted';

interface MethodTiming {
  calls: number;
  totalMs: number;
}

interface ProfileReport {
  requestedHumans: number;
  mode: ProfileMode;
  completedSteps: number;
  meanStepMs: number;
  timings: Record<string, MethodTiming>;
}

export interface ProfileBundle {
  steps: number;
  reports: ProfileReport[];
  comparisons: {
    humans: number;
    sameStartingState: boolean;
    sameEndingState: boolean;
    countedSameStartingState: boolean;
    countedSameEndingState: boolean;
  }[];
}

export interface PopulationPerfMedian {
  humans: number;
  overallMeanMsPerStep: number;
  /** Inclusive method timings overlap and must not be summed. */
  methods: { name: string; msPerStep: number }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate completeness and state-equivalence evidence in one profile run. */
export function validateProfileBundle(value: unknown, expectedSteps: number): asserts value is ProfileBundle {
  if (!isRecord(value)) throw new Error('Profile report must be an object');
  if (value.steps !== expectedSteps) throw new Error(`Profile report has ${String(value.steps)} steps; expected ${expectedSteps}`);
  if (!Array.isArray(value.reports)) throw new Error('Profile report is missing its reports array');
  if (!Array.isArray(value.comparisons)) throw new Error('Profile report is missing its comparisons array');

  for (const humans of [30, 300]) {
    const comparison = value.comparisons.find(row => isRecord(row) && row.humans === humans);
    if (!isRecord(comparison) || !comparison.sameStartingState || !comparison.sameEndingState ||
      !comparison.countedSameStartingState || !comparison.countedSameEndingState) {
      throw new Error(`Profile equivalence failed or is missing for ${humans} people`);
    }
    for (const mode of ['unprofiled', 'profiled', 'counted'] as const) {
      const matches = value.reports.filter(row => isRecord(row) && row.requestedHumans === humans && row.mode === mode);
      if (matches.length !== 1) throw new Error(`Expected one ${mode} profile for ${humans} people; found ${matches.length}`);
      const report = matches[0]!;
      if (!isRecord(report) || report.completedSteps !== expectedSteps || !Number.isFinite(report.meanStepMs)) {
        throw new Error(`Incomplete ${mode} profile for ${humans} people`);
      }
      if (!isRecord(report.timings)) throw new Error(`Missing timings for ${mode} profile of ${humans} people`);
      for (const [name, timing] of Object.entries(report.timings)) {
        if (!isRecord(timing) || !Number.isFinite(timing.calls) || !Number.isFinite(timing.totalMs)) {
          throw new Error(`Invalid timing row ${name} for ${mode} profile of ${humans} people`);
        }
      }
    }
  }
}

function medianOfThree(values: readonly number[]): number {
  if (values.length !== 3 || values.some(value => !Number.isFinite(value))) {
    throw new Error('A performance median requires exactly three finite measurements');
  }
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

/** Summarize three validated runs without adding overlapping method timings. */
export function summarizePerfRuns(values: readonly unknown[], expectedSteps: number): PopulationPerfMedian[] {
  if (values.length !== 3) throw new Error(`Expected exactly three profile runs; found ${values.length}`);
  for (const value of values) validateProfileBundle(value, expectedSteps);
  const bundles = values as readonly ProfileBundle[];

  return [30, 300].map(humans => {
    const reportFor = (bundle: ProfileBundle, mode: ProfileMode): ProfileReport =>
      bundle.reports.find(report => report.requestedHumans === humans && report.mode === mode)!;
    const profiled = bundles.map(bundle => reportFor(bundle, 'profiled'));
    const methodNames = Object.keys(profiled[0]!.timings).sort();
    for (const report of profiled.slice(1)) {
      const names = Object.keys(report.timings).sort();
      if (names.length !== methodNames.length || names.some((name, index) => name !== methodNames[index])) {
        throw new Error(`Profiled method set changed between repeats for ${humans} people`);
      }
    }
    return {
      humans,
      overallMeanMsPerStep: medianOfThree(bundles.map(bundle => reportFor(bundle, 'unprofiled').meanStepMs)),
      methods: methodNames.map(name => ({
        name,
        // `totalMs` aggregates all calls to this method; divide by completed
        // simulation steps to report its inclusive average per game step.
        msPerStep: medianOfThree(profiled.map(report => report.timings[name]!.totalMs / report.completedSteps)),
      })),
    };
  });
}
