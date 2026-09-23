/**
 * A body. M11 phase 16a (owner's note 1).
 *
 * Until this, a death took the person out of the world on the same tick:
 * `cleanupDead` dropped them from `people` and nothing was left where they
 * fell. A killing nobody saw was a perfect crime by construction — there was
 * nothing to find — and an old man who died alone in his hut was simply gone.
 * Every death now leaves one of these where it happened.
 *
 * Modelled on `ItemPile`: a small entity with an id, a place, and a hash of
 * its own (`Simulation.corpseHash`) rebuilt only when one is added or taken
 * away, never every tick. The `Person` stays out of `people` as before, so no
 * loop anywhere in the simulation has to learn to skip the dead; the body
 * keeps a reference to them, which is what lets `Knowledge.ts` name it only
 * for somebody who knew them.
 *
 * **What the body shows is what anybody could see.** Whether it bears wounds
 * is on it, plainly; who made them is not, and nothing here records that — a
 * finder learns it from a witness, a motive or somebody bloodied, which is
 * phase 16d's business.
 */
import type { Person } from './Person.ts';

let nextCorpseId = 1;

export function resetCorpseIds(): void {
  nextCorpseId = 1;
}

export class Corpse {
  readonly id: number;
  /** Who this was. Dead; kept for their name, their kin and their band. */
  readonly person: Person;
  /** Where it lies. Moves only while somebody drags it (16b). */
  x: number;
  y: number;
  readonly diedTick: number;
  /**
   * Whether the body bears wounds anybody would see: a death by violence, or
   * one that came soon after a beating. Not *who* — see the header.
   */
  readonly wounded: boolean;

  /**
   * Work put into cutting it up, banked here rather than on whoever is doing
   * it — `AGENTS.md`'s rule for any job longer than one uninterrupted pull.
   * Somebody called away for a drink comes back to where they left off, and
   * so does anybody else who finds it half done. See `DISMEMBER_WORK`.
   */
  dismemberWork = 0;
  /** Cut up past knowing: nobody can say whose it was. */
  dismembered = false;
  /**
   * M11 phase 16c. Who has found this body, so each finds it once, and the
   * one `body_found` event every finding of it shares — see
   * `SocialSystem.findBody`.
   */
  readonly foundBy = new Set<number>();
  foundEventId: number | null = null;

  constructor(person: Person, tick: number, wounded: boolean) {
    this.id = nextCorpseId++;
    this.person = person;
    this.x = person.x;
    this.y = person.y;
    this.diedTick = tick;
    this.wounded = wounded;
  }
}

/**
 * What time has done to a body, M11 phase 16b. **Fresh** for `FRESH_DAYS`,
 * recognisable to anybody who knew them; **gone over** until `BONES_AFTER`,
 * recognisable only to those who knew them well; then **bones**, which say
 * somebody died here and nothing about who. `GONE_AFTER` is when the bones
 * are scattered and the body leaves the world — kept, so that a century of
 * deaths is not a century of skeletons on the map.
 *
 * Nothing eats a body yet (`next-steps.md` §8: no carnivore eats anything),
 * so leaving one to the animals is, for now, only this. **No scavenger is
 * declared until one exists.**
 */
export type CorpseStage = 'fresh' | 'decayed' | 'bones';
export const FRESH_DAYS = 3;
export const BONES_AFTER = 12;
export const GONE_AFTER = 120;

export function stageOf(corpse: Corpse, tick: number, ticksPerDay: number): CorpseStage {
  const days = (tick - corpse.diedTick) / ticksPerDay;
  return days < FRESH_DAYS ? 'fresh' : days < BONES_AFTER ? 'decayed' : 'bones';
}

/**
 * Work to cut a body up past knowing, in units of `skillFactor('hunt')` a
 * tick: about two hundred and forty ticks for an ordinary hunter, three times
 * that for a novice. Far past the one-pull ceiling, which is why it banks on
 * the body.
 */
export const DISMEMBER_WORK = 240;

/**
 * How recently a beating has to have landed for the body to still show it,
 * in ticks: two days. A person who died of their wounds a day after a fight
 * died of violence, whatever the cause line says.
 */
export const WOUNDS_SHOW_FOR = 480;
