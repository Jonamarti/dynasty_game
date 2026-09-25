import type { Person } from '../entities/Person.ts';
import { t } from '../../i18n/i18n.ts';
import type { AnchorContext } from './Anchor.ts';
import { anchorOf, childRadius } from './Anchor.ts';
import { sensitivity } from './Temperament.ts';
import type { MotivationConfig } from '../core/Config.ts';
import { cravings } from '../core/Macros.ts';

export type DriveId = 'hunger' | 'thirst' | 'rest' | 'warmth' | 'company' | 'home' | 'variety';
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
  home: { id: 'home', label: t('Home drive'), readers: ['go_home', 'wander', 'forage', 'hunt'] },
  variety: { id: 'variety', label: t('Variety drive'), readers: ['eat', 'hunt', 'forage', 'pick'] },
};
export type DrivePressures = Record<DriveId, number>;

/** The original urgency curve, kept bit-for-bit so this extraction cannot retune the AI. */
export function urgencyCurve(value: number): number {
  const u = value / 100;
  return u * u;
}

/** Current physical need pressures, before personality sensitivities are added in phase 2. */
export function drivePressures(person: Person, ctx?: AnchorContext & { time: { daylight: number }; motivation: MotivationConfig }): DrivePressures {
  let home = 0;
  const craving = cravings(person);
  const variety = urgencyCurve(100 * Math.max(craving.fat, craving.protein, craving.carb));
  if (ctx) {
    const anchor = anchorOf(person, ctx);
    if (anchor) {
      const d = Math.hypot(person.x - anchor.x, person.y - anchor.y);
      const attachment = sensitivity(person, 'home');
      const radius = person.isChild ? childRadius(person, ctx.motivation) : ctx.motivation.comfortAdult / attachment;
      const night = Math.max(0, Math.min(1, 1 - ctx.time.daylight / 0.35));
      const nightRadius = person.isChild ? Math.max(2, childRadius(person, ctx.motivation) / 2) : ctx.motivation.nightRadius;
      const away = Math.max(Math.max(0, Math.min(1, (d - radius) / ctx.motivation.span)),
        Math.max(0, Math.min(1, (d - nightRadius) / ctx.motivation.spanNight)) * night);
      home = urgencyCurve(100 * away) * attachment;
    }
  }
  return {
    hunger: urgencyCurve(person.needs.hunger),
    thirst: urgencyCurve(person.needs.thirst),
    // Darkness makes people sleepy without changing the other needs. Only the
    // sleep/rest scorers read this pressure, so the floor cannot steal food or
    // water decisions from the survival drives.
    rest: ctx ? Math.max(urgencyCurve(person.needs.fatigue),
      0.3 * Math.max(0, Math.min(1, (0.25 - ctx.time.daylight) / 0.25))) : urgencyCurve(person.needs.fatigue),
    warmth: urgencyCurve(person.needs.cold),
    company: urgencyCurve(person.needs.company),
    home,
    variety,
  };
}
