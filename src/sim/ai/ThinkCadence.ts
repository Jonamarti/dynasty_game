/**
 * How often somebody re-decides what to do (M15 step 0, C; owner, 2026-10-08,
 * `docs/m15_simulation_lod.md` §0.1).
 *
 * The player's band thinks as it always has. Every other band on the map keeps
 * the same rules, the same scorer and the same state, and takes its turn to
 * *re-plan* less often (`config.otherBandThinkInterval` ticks against
 * `config.thinkInterval`). Nothing about a person changes with their band's
 * distance from the camera or the player: the focus is the player's body, which
 * is a fact of the simulation and not of the screen, so a headless run and a
 * watched one agree.
 *
 * **What is slowed is the polling, not the reaction.** A person thinks for two
 * reasons: it is their turn in the cycle (`thinkInterval`, staggered by id), or
 * they have nothing to do (`action === 'idle'`, which is what every ended
 * action leaves them in). Measured on 300 people in a camp, four thinks in five
 * are the first kind, somebody already walking or working being asked again
 * whether they still want to, and one in five the second. Only the first is
 * slowed. The second is an event (the last thing finished, or was stopped) and
 * stays immediate, which is also how every interruption reaches a person at
 * once: `ActionSystem.interruption` and `abandon` both end in `finish`, which
 * leaves them idle, so an interrupted forager of a slow band re-decides the next
 * tick. The first variant tried made idle people wait for their turn too, and
 * `sim:check` showed what it costs: idle samples doubled (3,567 to 7,627),
 * storing fell from 1,197 to 167 and the stores stayed empty until day 16.
 *
 * What is not an ended action but cannot wait for a turn either is being set
 * upon, and `wakesNow` lets a person who is attacked or has just been hurt
 * re-decide at once, mid-walk, so that a slow band flees as fast as a quick one.
 */
import type { Person } from '../entities/Person.ts';

export interface CadenceConfig {
  thinkInterval: number;
  otherBandThinkInterval: number;
}

/** The ticks between two turns of `person` to re-plan, given whose band the player is in. */
export function thinkIntervalOf(
  person: Pick<Person, 'bandId' | 'isPlayer'>, focusBandId: number | null, config: CadenceConfig,
): number {
  // No focus (a headless run that never took a body) means no band is privileged,
  // so nobody is slowed: the old behaviour, exactly.
  if (focusBandId === null || person.isPlayer || person.bandId === focusBandId) return config.thinkInterval;
  return Math.max(config.thinkInterval, config.otherBandThinkInterval);
}

/**
 * Whether something has happened to `person`, between turns, that a person
 * walking or working must answer now: being attacked, or having just been hurt
 * (by a blow or a bite; both write `lastHarmedTick`).
 */
export function wakesNow(person: Pick<Person, 'lastHarmedTick'>, tick: number, underAttack: boolean): boolean {
  return underAttack || tick - person.lastHarmedTick <= 1;
}
