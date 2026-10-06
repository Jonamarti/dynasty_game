/**
 * Advancing a compact person's body to a date, M15 phase 32b.
 *
 * This is the **closed-body** half of the compact model: needs, exposure,
 * bleeding, fever, poison and the death they cause. It runs the very same
 * `NeedsSystem.update` the detailed level runs, one tick at a time on a lone
 * person, against a private clock — not a second implementation of the rates, so
 * the two levels cannot drift apart (house rule: share the helper). What it costs
 * is the part of the step that is *not* the scorer, pathfinding or perception, which is
 * the part level 1 is allowed to skip.
 *
 * What it deliberately does **not** do, and why it is not wired into `Simulation`:
 *
 * - **Intake only when an `IntakeModel` is supplied** (CompactIntake.ts, rates measured
 *   in the detailed model). Without one nobody eats, drinks, warms at a fire or sleeps
 *   while compact: hunger and thirst only climb and an unattended person dies of thirst
 *   in a few days. Warmth and sleep are still not modelled either way.
 * - **No progress on orders.** The action and its banked work are held, not
 *   advanced (the tick count they would have had is the production model's job).
 *
 * Time moves forward only. Advancing twice over the same ticks is refused, and a
 * slice boundary changes nothing: advancing 0→300 equals 0→100→300 (tested), which
 * is what stops a change of selection from renewing reserves or dodging a death.
 */
import type { ChildhoodConfig, NeedsConfig, TimeConfig } from '../core/Config.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { NeedsSystem, thirstDriftPerTick, type NeedsHooks } from '../systems/NeedsSystem.ts';
import type { Building } from '../entities/Building.ts';
import type { World } from '../core/World.ts';
import { COMPACT_PHASE, type CompactEvent } from './CompactScheduler.ts';
import type { CompactPerson } from './CompactPerson.ts';
import { groupOf } from './CompactCalibration.ts';
import type { BandScale, IntakeModel } from './CompactIntake.ts';

export interface CompactBodyEnv {
  readonly needs: NeedsConfig;
  readonly time: TimeConfig;
  readonly world?: World;
  /** The buildings that can shelter this person; the caller filters by place. */
  readonly buildings?: readonly Building[];
  readonly hooks?: NeedsHooks;
  /**
   * Eating and drinking from measured rates (CompactIntake.ts). Without it the body
   * is the closed one of the first commit: needs only climb. `scale` is the band's
   * aggregate capacity for this person, read by the caller from the band's recent
   * days (`IntakeModel.scaleFrom`); `childhood` is needed to tell a nursling from a child.
   */
  readonly intake?: {
    readonly model: IntakeModel;
    readonly scale: (person: CompactPerson['person']) => BandScale;
    readonly childhood: ChildhoodConfig;
  };
  /** Allocates the id of an event this advance produces (the caller's `IdSpace`). */
  readonly nextEventId: () => number;
}

/** One private clock and system per env, so a compact advance never touches the world's. */
export class CompactBody {
  private readonly clock: TimeManager;
  private readonly system: NeedsSystem;
  constructor(private readonly env: CompactBodyEnv) {
    this.clock = new TimeManager(env.time);
    this.system = new NeedsSystem(env.needs, env.world);
  }

  /**
   * Bring `compact` forward to `toTick`. Returns the dated events it produced
   * (today only `death`, at the tick it happened). A dead person is not advanced
   * further and nothing resurrects them.
   */
  advance(compact: CompactPerson, toTick: number): CompactEvent[] {
    if (!Number.isSafeInteger(toTick) || toTick < compact.lastAdvancedTick) {
      throw new RangeError(`compact advance goes backwards: ${compact.lastAdvancedTick} -> ${toTick}`);
    }
    const person = compact.person;
    const events: CompactEvent[] = [];
    const people = [person];
    const buildings = (this.env.buildings ?? []) as Building[];
    for (let tick = compact.lastAdvancedTick + 1; tick <= toTick; tick++) {
      if (!person.alive) break;
      this.clock.tick = tick;
      const intake = this.env.intake;
      if (intake) {
        const tpd = this.env.time.ticksPerDay;
        const day = Math.floor((tick - 1) / tpd);
        // A new calendar day (or the first tick this person is advanced at all): draw its
        // plan from the need the person starts it with, using the person's own stream.
        if (compact.intake?.day !== day) {
          compact.intake = intake.model.plan(this.clock.season, groupOf(person, intake.childhood),
            person.needs.hunger, person.needs.thirst, intake.scale(person), compact.rng, day);
        }
      }
      this.system.update(people, this.clock, buildings, undefined, this.env.hooks);
      if (intake && person.alive && compact.intake) {
        // Relief in proportion to this tick's nominal drift (not the observed change: a need
        // pinned at 100 does not rise, and must still be able to come back down).
        const hungerDrift = this.env.needs.hungerRate * (this.env.hooks?.hungerFactor?.(person) ?? 1);
        const thirstDrift = thirstDriftPerTick(this.env.needs, person.action, this.clock.temperature);
        person.needs.hunger = Math.max(0, person.needs.hunger - compact.intake.hunger * hungerDrift);
        person.needs.thirst = Math.max(0, person.needs.thirst - compact.intake.thirst * thirstDrift);
      }
      if (!person.alive) {
        events.push({
          id: this.env.nextEventId(), tick, phase: COMPACT_PHASE.demography, subjectId: person.id,
          kind: 'death', data: { cause: person.causeOfDeath },
        });
      }
    }
    compact.lastAdvancedTick = toTick;
    return events;
  }
}
