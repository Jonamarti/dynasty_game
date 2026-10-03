import type { Person } from '../entities/Person.ts';
import { t } from '../../i18n/i18n.ts';
import type { AnchorContext } from './Anchor.ts';
import { anchorOf, childRadius } from './Anchor.ts';
import { sensitivity } from './Temperament.ts';
import type { MotivationConfig, NeedsConfig } from '../core/Config.ts';
import { perceivedFatigue } from '../core/Circadian.ts';
import { cravings } from '../core/Macros.ts';
import { fearOf } from '../social/Fear.ts';

export type DriveId = 'hunger' | 'thirst' | 'rest' | 'warmth' | 'company' | 'home' | 'variety' | 'safety';
export interface DriveDef {
  id: DriveId;
  /** English label for the inspector; translated at the UI boundary. */
  label: string;
  /** Brain action rows that read this pressure, maintained by hand. */
  readers: readonly string[];
}
export const DRIVES: Record<DriveId, DriveDef> = {
  hunger: { id: 'hunger', label: t('Hunger drive'), readers: ['eat', 'forage', 'pick', 'explore', 'steal', 'threaten', 'reap', 'take', 'hunt'] },
  thirst: { id: 'thirst', label: t('Thirst drive'), readers: ['drink', 'eat', 'ask_water', 'explore'] },
  rest: { id: 'rest', label: t('Rest drive'), readers: ['sleep', 'rest'] },
  warmth: { id: 'warmth', label: t('Warmth drive'), readers: ['shelter'] },
  company: { id: 'company', label: t('Company drive'), readers: ['talk'] },
  home: { id: 'home', label: t('Home drive'), readers: ['go_home', 'wander', 'forage', 'hunt'] },
  variety: { id: 'variety', label: t('Variety drive'), readers: ['eat', 'hunt', 'forage', 'pick'] },
  safety: { id: 'safety', label: t('Safety drive'), readers: ['flee', 'go_home'] },
};
export type DrivePressures = Record<DriveId, number>;

/** The original urgency curve, kept bit-for-bit so this extraction cannot retune the AI. */
export function urgencyCurve(value: number): number {
  const u = value / 100;
  return u * u;
}

/** Current physical need pressures, before personality sensitivities are added in phase 2. */
export function drivePressures(person: Person, ctx?: AnchorContext & {
  time: { daylight: number; dayFraction?: number }; motivation: MotivationConfig;
  needs?: Pick<NeedsConfig, 'circadianAmplitude'>;
}): DrivePressures {
  let home = 0;
  const craving = cravings(person, ctx?.motivation.cravings ?? true);
  const variety = urgencyCurve(100 * Math.max(craving.fat, craving.protein, craving.carb));
  const safety = Math.max(fearOf(person), Math.max(0, Math.min(1, -person.mood.security / 100)));
  if (ctx?.motivation.homePressure) {
    const anchor = anchorOf(person, ctx);
    if (anchor) {
      const d = Math.hypot(person.x - anchor.x, person.y - anchor.y);
      const attachment = sensitivity(person, 'home');
      const radius = person.isChild ? childRadius(person, ctx.motivation) : ctx.motivation.comfortAdult / attachment;
      const night = Math.max(0, Math.min(1, 1 - ctx.time.daylight / 0.35));
      const nightRadius = person.isChild ? Math.max(2, childRadius(person, ctx.motivation) / 2) : ctx.motivation.nightRadius;
      const away = Math.max(Math.max(0, Math.min(1, (d - radius) / ctx.motivation.span)),
        Math.max(0, Math.min(1, (d - nightRadius) / ctx.motivation.spanNight)) * night);
      // Home is a basic safety need, but it must not drown out another urgent
      // basic need. As hunger, thirst, fatigue or cold rises, reduce the pull
      // to return so survival work can win the scorer; keep a safety floor so
      // the home drive never disappears completely. This is a competition
      // between needs, not permission to abandon home at the first sign of hunger.
      const basicNeedUrgency = Math.max(
        urgencyCurve(person.needs.hunger),
        urgencyCurve(person.needs.thirst),
        urgencyCurve(person.needs.fatigue),
        urgencyCurve(person.needs.cold),
      );
      const homePriority = 1 - 0.65 * basicNeedUrgency;
      home = urgencyCurve(100 * away) * attachment * homePriority + safety;
    }
  }
  return {
    hunger: urgencyCurve(person.needs.hunger),
    thirst: urgencyCurve(person.needs.thirst),
    // The scorer and waking use the same pressure. The old darkness floor
    // repeatedly sent a rested person back to sleep just after waking them.
    rest: urgencyCurve(ctx?.motivation.nightSleep && ctx.time.dayFraction !== undefined
      ? perceivedFatigue(person.needs.fatigue, ctx.time.dayFraction, ctx.needs?.circadianAmplitude ?? 0)
      : person.needs.fatigue),
    warmth: urgencyCurve(person.needs.cold),
    company: urgencyCurve(person.needs.company),
    home,
    variety,
    safety,
  };
}
