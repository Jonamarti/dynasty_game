import type { Person } from '../entities/Person.ts';
import { t } from '../../i18n/i18n.ts';

export type DriveId = 'hunger' | 'thirst' | 'rest' | 'warmth' | 'company';
export interface DriveDef {
  id: DriveId;
  /** English label for the inspector; translated at the UI boundary. */
  label: string;
  /** Brain action rows that read this pressure, maintained by hand. */
  readers: readonly string[];
}
export const DRIVES: Record<DriveId, DriveDef> = {
  hunger: { id: 'hunger', label: t('Hunger drive'), readers: ['eat', 'forage', 'pick', 'steal', 'threaten', 'reap', 'take', 'hunt'] },
  thirst: { id: 'thirst', label: t('Thirst drive'), readers: ['drink'] },
  rest: { id: 'rest', label: t('Rest drive'), readers: ['sleep', 'rest'] },
  warmth: { id: 'warmth', label: t('Warmth drive'), readers: ['shelter'] },
  company: { id: 'company', label: t('Company drive'), readers: ['talk'] },
};
export type DrivePressures = Record<DriveId, number>;

/** The original urgency curve, kept bit-for-bit so this extraction cannot retune the AI. */
export function urgencyCurve(value: number): number {
  const u = value / 100;
  return u * u;
}

/** Current physical need pressures, before personality sensitivities are added in phase 2. */
export function drivePressures(person: Person): DrivePressures {
  return {
    hunger: urgencyCurve(person.needs.hunger),
    thirst: urgencyCurve(person.needs.thirst),
    rest: urgencyCurve(person.needs.fatigue),
    warmth: urgencyCurve(person.needs.cold),
    company: urgencyCurve(person.needs.company),
  };
}
