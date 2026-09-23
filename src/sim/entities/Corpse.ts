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
  readonly x: number;
  readonly y: number;
  readonly diedTick: number;
  /**
   * Whether the body bears wounds anybody would see: a death by violence, or
   * one that came soon after a beating. Not *who* — see the header.
   */
  readonly wounded: boolean;

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
 * How recently a beating has to have landed for the body to still show it,
 * in ticks: two days. A person who died of their wounds a day after a fight
 * died of violence, whatever the cause line says.
 */
export const WOUNDS_SHOW_FOR = 480;
