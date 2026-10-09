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
import type { ChildhoodConfig, NeedsConfig, PopulationConfig, TimeConfig } from '../core/Config.ts';
import type { RNG } from '../core/RNG.ts';
import type { Person } from '../entities/Person.ts';
import type { Household } from '../entities/Household.ts';
import { LifeSystem, roofOverSleeper } from '../systems/LifeSystem.ts';
import { TimeManager } from '../core/TimeManager.ts';
import { NeedsSystem, thirstDriftPerTick, type NeedsHooks } from '../systems/NeedsSystem.ts';
import type { Building } from '../entities/Building.ts';
import type { World } from '../core/World.ts';
import { COMPACT_PHASE, type CompactEvent } from './CompactScheduler.ts';
import type { CompactPerson } from './CompactPerson.ts';
import { groupOf } from './CompactCalibration.ts';
import type { BandCapacity, IntakeModel } from './CompactIntake.ts';

export interface CompactBodyEnv {
  readonly needs: NeedsConfig;
  readonly time: TimeConfig;
  readonly world?: World;
  /** The buildings that can shelter this person; the caller filters by place. */
  readonly buildings?: readonly Building[];
  readonly hooks?: NeedsHooks;
  /**
   * Optional finite-band intake. The measured plan's relief is only a request; this callback returns what
   * the band can actually supply. Without it, the existing CompactIntake path remains unchanged.
   */
  readonly ration?: (compact: CompactPerson, tick: number, requestedHungerRelief: number, requestedThirstRelief: number) => {
    readonly hunger: number;
    readonly thirst: number;
  };
  /**
   * Eating and drinking from measured rates (CompactIntake.ts). Without it the body
   * is the closed one of the first commit: needs only climb. `capacity` is the band's
   * aggregate capacity for this person (how often a hungry day brings nothing), read by
   * the caller from the band's days (`IntakeModel.capacityFrom`); undefined uses the table's own; `childhood` is needed to tell a nursling from a child.
   */
  readonly intake?: {
    readonly model: IntakeModel;
    readonly capacity: (person: CompactPerson['person']) => BandCapacity | undefined;
    readonly childhood: ChildhoodConfig;
  };
  /**
   * Ageing, conception, birth and death of old age, by the very `LifeSystem.daily` the
   * detailed level runs once a day (CompactLife in docs/m15_phase32b_compact.md §6), with
   * the person's own stream standing in for the world's birth stream. Whoever integrates
   * this owns what a birth *means* (register the child, link kin, give it a compact record):
   * `makeChild` builds the newborn and `onBirth` receives it; a `birth` event is dated too.
   * The father is read from `peopleById`: if he is himself compact and not yet advanced to
   * this tick his `alive` may be stale (a limit, see bugs.md).
   */
  readonly life?: {
    readonly population: PopulationConfig;
    readonly peopleById: Map<number, Person>;
    readonly householdsById: Map<number, Household>;
    readonly makeChild: (mother: Person, rng: RNG) => Person;
    readonly onBirth: (child: Person, mother: Person, father: Person | null) => void;
  };
  /** Allocates the id of an event this advance produces (the caller's `IdSpace`). */
  readonly nextEventId: () => number;
}

/** One private clock and system per env, so a compact advance never touches the world's. */
export class CompactBody {
  private readonly clock: TimeManager;
  private readonly system: NeedsSystem;
  private readonly lifeSystem = new LifeSystem();
  constructor(private readonly env: CompactBodyEnv) {
    this.clock = new TimeManager(env.time);
    this.system = new NeedsSystem(env.needs, env.world);
  }

  /**
   * Bring `compact` forward to `toTick`. Returns the dated events it produced
   * (`death` and, with `env.life`, `birth`, at the tick they happened). A dead person is not advanced
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
    const buildingsById = new Map(buildings.map(building => [building.id, building]));
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
            person.needs.hunger, person.needs.thirst, intake.capacity(person), compact.rng, day);
        }
      }
      this.system.update(people, this.clock, buildings, undefined, this.env.hooks);
      if (person.alive && this.env.ration) {
        // The measured plan asks for relief; the band's daily ledger decides how much resource exists.
        // With no measured intake configured there is no request, so the callback cannot create food.
        const hungerDrift = this.env.needs.hungerRate * (this.env.hooks?.hungerFactor?.(person) ?? 1);
        const thirstDrift = thirstDriftPerTick(this.env.needs, person.action, this.clock.temperature);
        const requestedHunger = intake && compact.intake ? compact.intake.hunger * hungerDrift : 0;
        const requestedThirst = intake && compact.intake ? compact.intake.thirst * thirstDrift : 0;
        const relief = this.env.ration(compact, tick, requestedHunger, requestedThirst);
        if (!relief || !Number.isFinite(relief.hunger) || relief.hunger < 0 || relief.hunger > requestedHunger ||
            !Number.isFinite(relief.thirst) || relief.thirst < 0 || relief.thirst > requestedThirst) {
          throw new RangeError('compact ration callback returned relief outside its request');
        }
        person.needs.hunger = Math.max(0, person.needs.hunger - relief.hunger);
        person.needs.thirst = Math.max(0, person.needs.thirst - relief.thirst);
      } else if (intake && person.alive && compact.intake) {
        // Keep the phase-32b measured intake path exactly when no finite-band callback is installed.
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
        break;
      }
      const life = this.env.life;
      if (life && tick % this.env.time.ticksPerDay === 0) {
        // M15 phase 18: conception needs the couple under one roof tonight. Only
        // this person and their spouse can matter (`daily` sees one person).
        // The detailed predicate comes first, but a compact person's action is
        // frozen at whatever it was when they left sight, so almost nobody is
        // "asleep" at a compact midnight — with that alone the compact model
        // bore no children at all. The fallback is where they sleep when they
        // do: their household's home, which the detailed midnight sample wrote
        // (`shareTheHearth`). A household with no roof still conceives nothing.
        const roofTonight = new Map<number, number>();
        const spouse = person.spouseId === null ? undefined : life.peopleById.get(person.spouseId);
        for (const sleeper of spouse ? [person, spouse] : [person]) {
          if (!sleeper.alive) continue;
          let roof = roofOverSleeper(sleeper, buildingsById);
          if (!roof && sleeper.householdId !== null) {
            const homeId = life.householdsById.get(sleeper.householdId)?.homeBuildingId;
            const home = homeId === null || homeId === undefined ? undefined : buildingsById.get(homeId);
            if (home && home.complete && home.def.shelter > 0) roof = home;
          }
          if (roof) roofTonight.set(sleeper.id, roof.id);
        }
        // The same moment of the step the detailed daily block runs at: after the needs clock.
        this.lifeSystem.daily(people, {
          rng: compact.rng, population: life.population, tick, day: this.clock.day,
          peopleById: life.peopleById, householdsById: life.householdsById,
          roofTonight,
          makeChild: life.makeChild,
          onBirth: (child, mother, father) => {
            life.onBirth(child, mother, father);
            events.push({
              id: this.env.nextEventId(), tick, phase: COMPACT_PHASE.demography, subjectId: mother.id,
              kind: 'birth', data: { childId: child.id, fatherId: father?.id ?? null },
            });
          },
          onDeath: (dying, cause) => dying.die(cause),
        });
        if (!person.alive) {
          events.push({
            id: this.env.nextEventId(), tick, phase: COMPACT_PHASE.demography, subjectId: person.id,
            kind: 'death', data: { cause: person.causeOfDeath },
          });
        }
      }
    }
    compact.lastAdvancedTick = toTick;
    return events;
  }
}
