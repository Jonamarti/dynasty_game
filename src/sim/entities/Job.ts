/**
 * A steady occupation, held until somebody changes it.
 *
 * Deliberately small and deliberately weak. `Brain.score` leans a job-holder
 * toward their own job's actions and damps the rest of `WORK_ACTIONS` a
 * little — a soft preference layered on top of the ordinary utility scorer,
 * not a replacement for it, because the scorer's coefficients are calibrated
 * against each other and a strong job bias would be exactly the kind of
 * change `ai-uses-many-actions` exists to catch.
 *
 * A job names a set of verbs, not a technology or a building: assigning
 * someone `forager` does not teach them to farm, it only makes them want to a
 * little more. That is why there was no `farmer` here until M8.2: a job with
 * nothing in `actions` would be exactly the declared-but-inert content
 * `techs-have-effects` exists to catch for technologies, and until `sow` and
 * `reap` existed there was nothing for one to name. **`smith` is still in that
 * position** and stays out of this table until M8.3 gives it a verb.
 *
 * The farmer is also the first job whose work a band can simply not have: a
 * band with no field has nothing for one to do. `BandSystem.assignJobs` is
 * where that is handled — it hands out the job only where there is ground to
 * work — because a job nobody can act on is a quiet way to make a third of a
 * band idle.
 */
import type { Skill } from './Person.ts';

/**
 * The verbs that count as working.
 *
 * Here rather than in `Brain`, where it was written and where this file's own
 * header already described it as living, because it now has a second reader:
 * `SocialSystem.workingAlongside` needs to know what working looks like, and a
 * second list of the same verbs would drift from this one the first time a verb
 * was added. `industriousness` pulls toward these and away from
 * `IDLE_ACTIONS`; social verbs are in neither, for the reason `Brain` records.
 */
export const WORK_ACTIONS = new Set([
  'forage', 'gather', 'gather_for_site', 'pick', 'chop', 'hunt',
  'build', 'haul', 'store', 'craft', 'prototype',
  // M8.2. Both belong here for the second reason this set exists as well as the
  // first: `SocialSystem.workingAlongside` is what lets two people sowing the
  // same field learn from each other and come to like each other, and a verb
  // missing from this list is a verb people do side by side in silence.
  'sow', 'reap',
]);

export const JOB_IDS = ['forager', 'hunter', 'builder', 'crafter', 'farmer'] as const;
export type JobId = (typeof JOB_IDS)[number];

export interface JobDef {
  id: JobId;
  label: string;
  icon: string;
  /** The verbs this job leans somebody toward. */
  actions: string[];
  /** The skill the job's work chiefly practises, for the panel. */
  skill: Skill;
}

export const JOBS: Record<JobId, JobDef> = {
  forager: {
    id: 'forager',
    label: 'Forager',
    icon: '\u{1F33F}',
    actions: ['forage', 'pick', 'gather', 'gather_for_site'],
    skill: 'forage',
  },
  hunter: {
    id: 'hunter',
    label: 'Hunter',
    icon: '\u{1F3F9}',
    actions: ['hunt'],
    skill: 'hunt',
  },
  builder: {
    id: 'builder',
    label: 'Builder',
    icon: '\u{1F528}',
    actions: ['build', 'haul', 'chop'],
    skill: 'build',
  },
  crafter: {
    id: 'crafter',
    label: 'Crafter',
    icon: '\u{1FA93}',
    actions: ['craft', 'prototype'],
    skill: 'knap',
  },
  // M8.2, and the first job in this table that finally practises a skill the
  // character sheet has carried since M6b phase 6 without any way to improve at
  // it. `haul` is deliberately not here: a farmer who leans toward hauling is a
  // builder, and the plot needs no materials.
  farmer: {
    id: 'farmer',
    label: 'Farmer',
    icon: '\u{1F33E}',
    actions: ['sow', 'reap'],
    skill: 'farm',
  },
};
