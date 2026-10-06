/**
 * Needs drift upward every tick; critical needs cost health; a body with no
 * health dies. This is the clock that everything else races against — without
 * it there is no reason to forage, trade, steal or move camp.
 */
import type { NeedsConfig } from '../core/Config.ts';
import type { TimeManager } from '../core/TimeManager.ts';
import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import type { World } from '../core/World.ts';
import { bleeding, feverDrain, mendBody, poisonDrain, poisonHunger, poisonThirst } from '../entities/Body.ts';
import { LETHAL_NEEDS } from '../entities/Person.ts';
import { telemetry } from '../core/Telemetry.ts';

/** Exposure wears health down gradually before cold becomes immediately dangerous. */
const COLD_HEALTH_START = 75;
const COLD_HEALTH_PER_POINT = 0.001;
import { warmthFrom } from '../knowledge/Tech.ts';
import { malnutrition, MALNUTRITION_HEALTH_CEILING_DROP, MALNUTRITION_RECOVERY_PENALTY } from '../core/Macros.ts';

/**
 * How hard each action works somebody, as a multiplier on thirst.
 *
 * Swinging an axe and lying in a hut are not the same amount of work, and until
 * this existed the simulation said they were. The spread is deliberately modest:
 * these multiply a rate that is already the fastest-climbing need in the game,
 * and a heavy hand here starves people by keeping them at the water.
 *
 * Anything not named sits at 1. That is the honest default — an action nobody
 * has thought about is ordinary effort, not free — and it means a verb added
 * later cannot silently get a discount by being forgotten.
 */
const EXERTION: Record<string, number> = {
  // Hard physical work.
  chop: 1.5,
  build: 1.4,
  hunt: 1.4,
  haul: 1.35,
  attack: 1.5,
  flee: 1.5,
  // Steady work with the hands.
  craft: 1.1,
  prototype: 1.1,
  inscribe: 1.1,
  forage: 1.1,
  gather: 1.1,
  pick: 1.05,
  // Being somewhere, or thinking about something.
  walk: 1.05,
  goto: 1.05,
  go_home: 1.05,
  bring_food: 1.05,
  wander: 1.0,
  talk: 0.75,
  romp: 1.05,
  play_with_baby: 1.0,
  court: 0.75,
  teach: 0.75,
  nurse: 1.25,
  discuss: 0.75,
  ponder: 0.65,
  read: 0.65,
  // At rest. A sleeper still gets thirsty, just slowly.
  shelter: 0.55,
  rest: 0.5,
  sleep: 0.4,
};

/**
 * The multiplier for an action, defaulting to ordinary effort.
 *
 * Exported for `core/Macros.ts` (M11 phase 8c), which folds the same reading
 * into a person's macro target instead of writing a second table that would
 * inevitably drift from this one.
 */
export function exertionOf(action: string): number {
  return EXERTION[action] ?? 1;
}

/**
 * What thirst rises by in one tick for somebody doing `action` at `temperature`.
 * One definition for the needs clock, for `RateWatch` (which measures relief against
 * this drift) and for the compact intake (which applies relief in proportion to it):
 * three copies of the arithmetic would drift apart and bias the ratio between them.
 * The expression is the one `update` always had, operation for operation.
 */
export function thirstDriftPerTick(cfg: NeedsConfig, action: string, temperature: number): number {
  const heat = Math.max(0, temperature);
  return cfg.thirstRate * exertionOf(action) * (1 + heat * (cfg.heatThirst - 1));
}

/**
 * Per-person readings the needs clock cannot make for itself, because they
 * depend on who else is alive (M15 phase 20). Optional so a test that drives
 * `update` by hand keeps the plain rates.
 */
export interface NeedsHooks {
  /** A multiplier on the hunger rate: 1.5 for a woman with milk. */
  hungerFactor?: (person: Person) => number;
  /** A baby that cannot walk yet: never tired, lonely only when put down. */
  babyInArms?: (person: Person) => boolean;
}

export class NeedsSystem {
  constructor(private readonly config: NeedsConfig, private readonly world?: World) {}

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
      // M11 phase 11b: a ruin keeps neither wind nor cold out. `ruined` is
      // false for anything `Building.durability` was never set on, so an
      // ordinary hut with no sabotage in its history is unaffected.
      if (!building.complete || building.ruined || building.def.shelter <= best) continue;
      // Warmth spills past the walls; see Building.SHELTER_MARGIN.
      if (building.contains(person.x, person.y, 1.5)) best = building.def.shelter;
    }
    return best;
  }

  update(
    people: Person[],
    time: TimeManager,
    buildings: Building[] = [],
    buildingHash?: SpatialHash<Building>,
    hooks: NeedsHooks = {}
  ): void {
    const cfg = this.config;
    // Cold bites at night and in winter; in high summer people warm back up.
    const chill = Math.max(0, -time.temperature);
    const warming = Math.max(0, time.temperature) * 0.5;
    // The same reading with the sign the other way — what makes you cold in
    // February is what makes you thirsty in July — is `thirstDriftPerTick`.

    for (const person of people) {
      if (!person.alive) continue;

      const hungerFactor = hooks.hungerFactor?.(person) ?? 1;
      person.needs.hunger = Math.min(100, person.needs.hunger + cfg.hungerRate * hungerFactor);
      const baby = hooks.babyInArms?.(person) ?? false;
      // Water is physically taxing regardless of what the person was doing
      // when they entered it. Key this from position so a routed forage or a
      // stationary swimmer cannot bypass the drowning clock by keeping a
      // different action label.
      const swimming = this.world?.isSwimTile(person.x, person.y) ?? false;

      // Thirst is the one need that answers to what you are *doing*.
      //
      // It used to be a flat rate: a person asleep in a hut in February drank at
      // exactly the rate of one felling a tree in July, and the owner reported
      // the consequence — people forever breaking off to go to the water. A flat
      // rate cannot be tuned out of that, because the only lever it offers moves
      // the sleeper and the woodcutter together.
      //
      // Hunger is deliberately left flat. This world's food economy is its most
      // fragile part and only drinking was reported; giving hunger the same
      // treatment would have put a second, larger change in the same measurement.
      const exertion = exertionOf(person.action);
      const thirstRate = thirstDriftPerTick(cfg, person.action, time.temperature);
      person.needs.thirst = Math.min(100, person.needs.thirst + thirstRate);

      // M11 phase 8c: the same reading, folded into today's ledger for
      // `decayMacroTarget` to average — see `core/Macros.ts`.
      person.exertionToday.total += exertion;
      person.exertionToday.ticks++;

      // Resting and sleeping are handled by the action system, which restores
      // fatigue directly; everything else tires you.
      // M15 phase 20: a baby does not get tired (owner, 2026-09-30). It
      // sleeps where it is laid or held, and a fatigue it can do nothing
      // about only ever showed up as a baby in a black mood.
      if (baby) {
        person.needs.fatigue = 0;
      } else if (swimming || (person.action !== 'rest' && person.action !== 'sleep')) {
        person.needs.fatigue = Math.min(100, person.needs.fatigue + cfg.fatigueRate * (swimming ? 3 : 1));
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
      const coldBefore = person.needs.cold;
      const shelter = Math.max(carried, this.shelterAt(person, buildings));
      let hearth = 0;
      if (buildingHash) {
        for (const fire of buildingHash.queryRadius(person.x, person.y, 3, [])) {
          if (fire.complete && !fire.ruined && fire.def.id === 'hearth' &&
              Math.hypot(fire.x + 0.5 - person.x, fire.y + 0.5 - person.y) <= 3) {
            hearth = 0.35;
            telemetry.count('hearth_warm_samples');
            if (person.needs.cold > 0 &&
                (person.action === 'shelter' || person.action === 'rest' || person.action === 'sleep')) {
              person.beliefs.learn('warm:hearth', 0.35, 0.25, 'own', time.tick);
              telemetry.count('hearth_warm_learned');
            }
            break;
          }
        }
      }
      // Wading leaves a body wet for a while after leaving the water. It adds
      // chill until dry, while a nearby hearth shortens the wet spell fourfold.
      // Staying in the shallows refreshes the timer each tick.
      if (this.world?.isWadeTile(person.x, person.y)) {
        person.wet = Math.max(person.wet ?? 0, this.world.wetTicks);
      } else if ((person.wet ?? 0) > 0) {
        person.wet = Math.max(0, person.wet - (hearth > 0 ? 4 : 1));
      }
      const effectiveShelter = Math.max(shelter, hearth);
      const wetChill = person.wet > 0 ? 1 : 0;
      const effectiveChill = (chill * (swimming ? 3 : 1) + wetChill) * (1 - effectiveShelter);
      const effectiveWarming = warming + effectiveShelter * 0.8;
      person.needs.cold = Math.max(
        0,
        Math.min(
          100,
          person.needs.cold + effectiveChill * cfg.coldRate - effectiveWarming * cfg.coldRate
        )
      );
      if (hearth > 0 && coldBefore > 0) {
        telemetry.count('hearth_cold_samples');
        if (person.needs.cold < coldBefore) telemetry.count('hearth_cold_relieved');
      }

      // Loneliness only climbs while nobody is being talked to; conversation
      // itself is what brings it down, in SocialSystem.converse.
      //
      // M15 phase 20: a baby is lonely only when it is put down — on the
      // ground, in a hut — and nobody is holding it (owner, 2026-09-30). In
      // arms, being held is its company. Play (`romp`) answers the rest.
      if (baby && person.carriedBy !== null) {
        person.needs.company = Math.max(0, person.needs.company - cfg.companyRate);
      } else {
        person.needs.company = Math.min(100, person.needs.company + cfg.companyRate);
      }

      // M15 phase 21b: a deep torso wound nobody has dressed bleeds, whatever
      // else is going on. It is time-limited — the wound mends below — and a
      // bleeding person does not recover, so it cannot be waited out for free.
      const bleed = bleeding(person.body);
      if (bleed > 0) {
        person.health -= bleed;
        telemetry.count('bleeding_ticks');
        if (person.health <= 0) {
          person.die('bleeding');
          telemetry.count('death_bleeding');
          continue;
        }
      }

      // M15 phase 21c: a fever from an infected wound burns health by grade
      // and, like a bleed, stops recovery. It ends when the wound turns or is
      // tended (`Body.woundsDaily`, `Body.dress`), so it cannot go on for ever.
      const fever = person.conditions.length > 0 ? feverDrain(person.conditions) : 0;
      if (fever > 0) {
        person.health -= fever;
        telemetry.count('fever_ticks');
        if (person.health <= 0) {
          person.die('infection');
          telemetry.count('death_infection');
          continue;
        }
      }

      // Phase 22: a bad meal empties the body faster than it can be filled, and
      // a severe one costs health besides. Both end when its days run out
      // (`Body.poisonDaily`), so neither can go on for ever.
      if (person.conditions.length > 0) {
        person.needs.thirst = Math.min(100, person.needs.thirst + poisonThirst(person.conditions));
        person.needs.hunger = Math.min(100, person.needs.hunger + poisonHunger(person.conditions));
        const drain = poisonDrain(person.conditions);
        if (drain > 0) {
          person.health -= drain;
          telemetry.count('poison_ticks');
          if (person.health <= 0) {
            person.die('poisoning');
            telemetry.count('death_poisoning');
            continue;
          }
        }
      }

      // Hunger and thirst still deal their sharp critical damage. Exposure is
      // deliberately a slower slope: it starts at 75, leaving time to seek a
      // roof, fire, or clothing instead of losing health only at the lethal
      // need threshold.
      const coldDamage = Math.max(0, person.needs.cold - COLD_HEALTH_START) * COLD_HEALTH_PER_POINT;
      if (coldDamage > 0) {
        person.health -= coldDamage;
        telemetry.count('cold_damage_ticks');
        telemetry.count('cold_damage_sum', coldDamage);
        if (person.health <= 0) {
          person.die('exposure');
          telemetry.count('death_exposure');
          continue;
        }
      }

      let criticalCount = 0;
      for (const need of LETHAL_NEEDS) {
        if (need !== 'cold' && person.needs[need] >= cfg.criticalThreshold) criticalCount++;
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
      } else {
        // M11 phase 8d. Malnutrition is degradation, not a fourth lethal
        // need — it never drags health down on its own, only caps how high
        // recovery can climb and slows the climb getting there. Someone
        // already above the ceiling (imbalance arrived after good health, not
        // before it) is left alone rather than pulled down, on the same
        // principle: this is a ceiling, not a drain.
        mendBody(person.body);
        const severity = malnutrition(person);
        const ceiling = 100 - severity * MALNUTRITION_HEALTH_CEILING_DROP;
        if (person.health < ceiling && bleed === 0 && fever === 0) {
          const recovery = cfg.recoveryRate * (1 - severity * MALNUTRITION_RECOVERY_PENALTY);
          person.health = Math.min(ceiling, person.health + recovery);
        }
        telemetry.count('malnutrition_sum', severity);
        telemetry.count('malnutrition_samples');
      }
    }
  }
}
