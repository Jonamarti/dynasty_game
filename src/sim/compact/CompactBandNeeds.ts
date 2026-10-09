/** Shared family predicates keep off-map babies and nursing mothers on the detailed needs scale. */
import type { ChildhoodConfig, NeedsConfig, TimeConfig } from '../core/Config.ts';
import type { Person } from '../entities/Person.ts';
import { isBabyInArms, isLactating, isNursling } from '../entities/LifeStage.ts';
import { nurslingHungerFactor } from '../ai/Nursing.ts';
import type { NeedsHooks } from '../systems/NeedsSystem.ts';

export function compactBandNeedsHooks(
  people: ReadonlyMap<number, Person>, childhood: ChildhoodConfig,
  time: TimeConfig, needs: NeedsConfig,
): NeedsHooks {
  // Zero drift is used by isolated life/field tests. Dividing its nursing factor by zero would turn 0 × Infinity
  // into NaN, rather than keeping the intentionally closed hunger clock at zero.
  const nurslingFactor = needs.hungerRate === 0 ? 1 :
    nurslingHungerFactor(childhood.feedsPerDay, time.ticksPerDay, needs.hungerRate);
  return {
    hungerFactor: person => isLactating(person, people, childhood) ? 1 + childhood.lactationHunger :
      isNursling(person, childhood) ? nurslingFactor : 1,
    babyInArms: person => isBabyInArms(person, childhood),
  };
}
