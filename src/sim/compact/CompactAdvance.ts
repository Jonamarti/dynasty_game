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
 * - **No intake.** Nobody eats, drinks, warms at a fire or sleeps while compact.
 *   Hunger and thirst only climb; an unattended compact person dies of thirst in a
 *   few days. Intake and production need rates measured against the detailed
 *   model (docs/m15_phase32b_compact.md §3); inventing them here would hand
 *   out survival or take it away, which §2 forbids.
 * - **No progress on orders.** The action and its banked work are held, not
 *   advanced (the tick count they would have had is the production model's job).
 *
 * Time moves forward only. Advancing twice over the same ticks is refused, and a
 * slice boundary changes nothing: advancing 0→300 equals 0→100→300 (tested), which
 * is what stops a change of selection from renewing reserves or dodging a death.
 */
import type { NeedsConfig, TimeConfig } from '../core/Config.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { NeedsSystem, type NeedsHooks } from '../systems/NeedsSystem.ts';
import type { Building } from '../entities/Building.ts';
import type { World } from '../core/World.ts';
import { COMPACT_PHASE, type CompactEvent } from './CompactScheduler.ts';
import type { CompactPerson } from './CompactPerson.ts';

export interface CompactBodyEnv {
  readonly needs: NeedsConfig;
  readonly time: TimeConfig;
  readonly world?: World;
  /** The buildings that can shelter this person; the caller filters by place. */
  readonly buildings?: readonly Building[];
  readonly hooks?: NeedsHooks;
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
      this.system.update(people, this.clock, buildings, undefined, this.env.hooks);
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
