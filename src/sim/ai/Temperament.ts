import type { Person } from '../entities/Person.ts';
import type { DriveId } from './Drives.ts';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Derived pull sensitivity; keeping this out of TRAITS preserves founder RNG draws. */
export function sensitivity(person: Person, drive: DriveId | 'belonging' | 'purpose' | 'status' | 'curiosity' | 'possession'): number {
  if (drive === 'safety') return 1.4 - person.traits.aggression * 0.8;
  if (drive === 'belonging') return 0.6 + person.traits.loyalty * 0.8;
  if (drive === 'purpose') return 0.8 + person.traits.industriousness * 0.4;
  if (drive === 'status') return clamp(1 + (person.traits.greed - 0.5) * 0.6 +
    (person.traits.aggression - 0.5) * 0.4 - (person.traits.tradition - 0.5) * 0.3, 0.6, 1.4);
  if (drive === 'curiosity') return 0.5 + person.traits.curiosity;
  if (drive === 'possession') return 0.6 + person.traits.greed * 0.8;
  if (drive !== 'home') return 1;
  const attachment = clamp(1 + (person.traits.loyalty - 0.5) * 0.8 - (person.traits.curiosity - 0.5) * 0.6, 0.4, 1.6);
  return person.isChild ? Math.max(1, attachment) : attachment;
}

/** Novelty pressure builds after a person last learned or tried something new. */
export function curiosityNeed(person: Person): number {
  return Math.min(1, person.curiosityDays / 30) * sensitivity(person, 'curiosity');
}

/** Work appetite from the purpose channel, held to the old narrow 0.8–1.2 band. */
export function purposeAppetite(person: Person): number {
  const pressure = Math.max(-0.5, Math.min(0.5, person.mood.purpose / 30));
  return Math.max(0.8, Math.min(1.2, 1 + pressure * sensitivity(person, 'purpose') * 0.4));
}
