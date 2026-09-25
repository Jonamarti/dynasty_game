import type { Person } from '../entities/Person.ts';
import type { DriveId } from './Drives.ts';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Derived pull sensitivity; keeping this out of TRAITS preserves founder RNG draws. */
export function sensitivity(person: Person, drive: DriveId): number {
  if (drive !== 'home') return 1;
  const attachment = clamp(1 + (person.traits.loyalty - 0.5) * 0.8 - (person.traits.curiosity - 0.5) * 0.6, 0.4, 1.6);
  return person.isChild ? Math.max(1, attachment) : attachment;
}
