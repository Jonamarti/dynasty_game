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
 * someone `forager` does not teach them to forage, it only makes them want to
 * a little more. That is also why there is no `farmer` or `smith` job here
 * yet, even though both skills exist on `Person` — there is no `farm` or
 * `smith` action for a job to lean anyone toward until M8 gives them one, and
 * a job with nothing in `actions` would be exactly the declared-but-inert
 * content `techs-have-effects` exists to catch for technologies.
 */
import type { Skill } from './Person.ts';

export const JOB_IDS = ['forager', 'hunter', 'builder', 'crafter'] as const;
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
};
