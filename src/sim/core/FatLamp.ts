import { t } from '../../i18n/i18n.ts';
import type { Building } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';

/** Two rendered measures of fat provide six in-game days of light. */
export const FAT_LAMP_FUEL_TICKS = 1200;
export const FAT_LAMP_REFILL_FAT = 2;
export const FAT_LAMP_RADIUS = 3;
export const FAT_LAMP_STRENGTH = 0.9;

export type FatLampRefusal = 'not_lamp' | 'not_home' | 'lamp_full' | 'need_fat';

export function fatLampRefusal(
  person: Person, lamp: Building | null, homeId: number | null,
): FatLampRefusal | null {
  if (!lamp || lamp.def.id !== 'fat_lamp' || !lamp.complete || lamp.ruined || lamp.hostId === null) return 'not_lamp';
  if (lamp.hostId !== homeId) return 'not_home';
  if (lamp.fuelRemaining >= FAT_LAMP_FUEL_TICKS) return 'lamp_full';
  if (person.inventory.count('fat') < FAT_LAMP_REFILL_FAT) return 'need_fat';
  return null;
}

export function fatLampRefusalText(reason: FatLampRefusal): string {
  switch (reason) {
    case 'not_lamp': return t('That is not a usable fat lamp');
    case 'not_home': return t('That lamp is not in your household’s home');
    case 'lamp_full': return t('That lamp is already full');
    case 'need_fat': return t('You need 2 fat to refill the lamp');
  }
}

/** Lamp fuel advances with the world clock; no timer runs while paused. */
export function advanceFatLamps(buildings: readonly Building[]): void {
  for (const building of buildings) {
    if (building.def.id === 'fat_lamp' && building.complete && !building.ruined && building.fuelRemaining > 0) {
      building.fuelRemaining--;
    }
  }
}
