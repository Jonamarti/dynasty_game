/**
 * Needs drift upward every tick; critical needs cost health; a body with no
 * health dies. This is the clock that everything else races against — without
 * it there is no reason to forage, trade, steal or move camp.
 */
import type { NeedsConfig } from '../core/Config.ts';
import type { TimeManager } from '../core/TimeManager.ts';
import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import { LETHAL_NEEDS } from '../entities/Person.ts';
import { telemetry } from '../core/Telemetry.ts';
import { warmthFrom } from '../knowledge/Tech.ts';

export class NeedsSystem {
  constructor(private readonly config: NeedsConfig) {}

  /**
   * Best shelter covering this person, 0-1.
   *
   * A linear scan over buildings rather than a spatial query: a camp has a
   * handful of structures, not thousands, and a scan of five is cheaper than a
   * hash lookup. Revisit if settlements ever grow into towns.
   */
  private shelterAt(person: Person, buildings: Building[]): number {
    let best = 0;
    for (const building of buildings) {
      if (!building.complete || building.def.shelter <= best) continue;
      // Warmth spills past the walls; see Building.SHELTER_MARGIN.
      if (building.contains(person.x, person.y, 1.5)) best = building.def.shelter;
    }
    return best;
  }

  update(people: Person[], time: TimeManager, buildings: Building[] = []): void {
    const cfg = this.config;
    // Cold bites at night and in winter; in high summer people warm back up.
    const chill = Math.max(0, -time.temperature);
    const warming = Math.max(0, time.temperature) * 0.5;

    for (const person of people) {
      if (!person.alive) continue;

      person.needs.hunger = Math.min(100, person.needs.hunger + cfg.hungerRate);
      person.needs.thirst = Math.min(100, person.needs.thirst + cfg.thirstRate);

      // Resting and sleeping are handled by the action system, which restores
      // fatigue directly; everything else tires you.
      if (person.action !== 'rest' && person.action !== 'sleep') {
        person.needs.fatigue = Math.min(100, person.needs.fatigue + cfg.fatigueRate);
      }

      // Shelter is the first real answer to winter. Standing inside a finished
      // building blunts the chill and, in a good hut, reverses it — which is
      // what makes building one the difference between a band that survives a
      // winter and a band that does not.
      // Fire and clothing are warmth you carry with you. Someone who knows how
      // to make fire is never as cold as someone who does not, wherever they
      // are standing — which is why it is the first thing anyone should work
      // out, and why a band that loses it feels the loss immediately. Clothing
      // answers the same problem a second way; `warmthFrom` combines them with
      // diminishing returns rather than by adding them.
      const carried = warmthFrom(person);
      const shelter = Math.max(carried, this.shelterAt(person, buildings));
      const effectiveChill = chill * (1 - shelter);
      const effectiveWarming = warming + shelter * 0.8;
      person.needs.cold = Math.max(
        0,
        Math.min(
          100,
          person.needs.cold + effectiveChill * cfg.coldRate - effectiveWarming * cfg.coldRate
        )
      );

      // Loneliness only climbs while nobody is being talked to; conversation
      // itself is what brings it down, in SocialSystem.converse.
      person.needs.company = Math.min(100, person.needs.company + cfg.companyRate);

      let criticalCount = 0;
      for (const need of LETHAL_NEEDS) {
        if (person.needs[need] >= cfg.criticalThreshold) criticalCount++;
      }

      if (criticalCount > 0) {
        person.health -= cfg.criticalDamage * criticalCount;
        if (person.health <= 0) {
          // Name the cause after the worst *lethal* need, so a corpse is never
          // reported as having died of loneliness.
          let cause = 'starvation';
          let worstValue = -1;
          for (const need of LETHAL_NEEDS) {
            if (person.needs[need] > worstValue) {
              worstValue = person.needs[need];
              cause = need === 'hunger' ? 'starvation'
                : need === 'thirst' ? 'dehydration'
                : 'exposure';
            }
          }
          person.die(cause);
          telemetry.count(`death_${cause}`);
        }
      } else if (person.health < 100) {
        person.health = Math.min(100, person.health + cfg.recoveryRate);
      }
    }
  }
}
