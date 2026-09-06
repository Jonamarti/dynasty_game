/**
 * Discovery, teaching, watching, and forgetting.
 *
 * Knowledge spreads three ways, and they are deliberately very different in
 * cost and reliability:
 *
 *  - **Discovery** is rare, solitary and driven by pressure. A cold winter
 *    invents fire; a hungry one invents farming. It needs curiosity, the right
 *    skill and everything the idea rests on already understood.
 *  - **Teaching** is fast, deliberate and needs both parties present and
 *    willing. It is what the `teach` skill has been waiting for since M0.
 *  - **Watching** is slow, passive and free. Stand near someone using a thing
 *    for long enough and you may work out the trick of it.
 *
 * There is no fourth way, and in particular there is no global unlock. If
 * everybody who knows how to fire clay dies in one winter, the world does not
 * know how to fire clay any more, and the granary stops being buildable until
 * somebody works it out again.
 */
import type { Person } from '../entities/Person.ts';
import type { RNG } from '../core/RNG.ts';
import type { SpatialHash } from '../core/SpatialHash.ts';
import { TECH, TECHS, reachableFrom, type Tech } from '../knowledge/Tech.ts';
import { telemetry } from '../core/Telemetry.ts';

/** Base daily chance an idle, curious adult arrives at something new. */
const DISCOVERY_BASE = 0.0055;

/** Daily chance of picking something up merely from being near a knower. */
const OBSERVATION_CHANCE = 0.02;

/** How far you have to be to learn by watching. */
const WATCHING_RANGE = 5;

export interface KnowledgeContext {
  rng: RNG;
  tick: number;
  peopleHash: SpatialHash<Person>;
}

export class KnowledgeSystem {
  /** Runs discovery and observation. Teaching is an action, not a daily roll. */
  daily(people: Person[], ctx: KnowledgeContext): void {
    for (const person of people) {
      if (!person.alive || person.isChild) continue;
      this.tryDiscover(person, ctx);
      this.tryObserve(person, ctx);
    }
  }

  /**
   * Working something out for yourself.
   *
   * Three multipliers, and the third is the interesting one. Need pressure
   * means a discovery arrives when it is wanted: nobody works out how to make
   * fire in a warm summer, and a band that has never been cold never will.
   */
  private tryDiscover(person: Person, ctx: KnowledgeContext): void {
    const options = reachableFrom(person.knownTech);
    if (options.length === 0) return;

    const tech = options[ctx.rng.int(0, options.length - 1)]!;
    const def = TECH[tech];

    // Curiosity is whether you look; intelligence is whether you see it when
    // you do. Both, because either alone produces a caricature.
    const curiosity = 0.3 + person.traits.curiosity * 1.7;
    const wit = 0.6 + person.traits.intelligence * 0.8;
    const competence = 0.2 + person.skills[def.skill] / 60;
    const pressure = def.pressure === null
      ? 0.5
      : 0.25 + (person.needs[def.pressure] / 100) * 1.75;

    const chance =
      (DISCOVERY_BASE / def.difficulty) * curiosity * wit * competence * pressure;
    if (!ctx.rng.chance(chance)) return;

    person.knownTech.add(tech);
    telemetry.count('discovered_' + tech);
    person.chronicle.push({
      tick: ctx.tick,
      ageDays: person.age,
      text: 'worked out ' + def.label.toLowerCase(),
      kind: 'milestone',
    });
  }

  /**
   * Picking something up by being around someone who knows it.
   *
   * Slow and unreliable, but it is what stops a band from depending entirely on
   * whether the one person who knows a thing can be bothered to teach it.
   */
  private tryObserve(person: Person, ctx: KnowledgeContext): void {
    if (!ctx.rng.chance(OBSERVATION_CHANCE)) return;

    const neighbours = ctx.peopleHash.queryRadius(person.x, person.y, WATCHING_RANGE);
    for (const other of neighbours) {
      if (!other.alive || other.id === person.id) continue;
      for (const tech of other.knownTech) {
        if (person.knownTech.has(tech)) continue;
        if (!TECH[tech as Tech]) continue;
        // You can only pick up what you are equipped to understand.
        if (!TECH[tech as Tech].requires.every(r => person.knownTech.has(r))) continue;

        person.knownTech.add(tech);
        telemetry.count('observed_' + tech);
        return;
      }
    }
  }

  /**
   * One person deliberately teaching another. Called by the action system.
   *
   * Returns what was taught, or null if there was nothing to pass on. Success
   * depends on the teacher's skill and the pupil's regard for them — you do not
   * learn much from somebody you have no time for.
   */
  teach(teacher: Person, pupil: Person, regard: number, tick: number, rng: RNG): Tech | null {
    const teachable: Tech[] = [];
    for (const tech of teacher.knownTech) {
      if (pupil.knownTech.has(tech)) continue;
      const def = TECH[tech as Tech];
      if (!def) continue;
      if (!def.requires.every(r => pupil.knownTech.has(r))) continue;
      teachable.push(tech as Tech);
    }
    if (teachable.length === 0) return null;

    const tech = teachable[rng.int(0, teachable.length - 1)]!;
    // The pupil's wits count as much as the teacher's skill here: an
    // explanation only lands if somebody on the other end can follow it.
    const chance = Math.min(0.95,
      0.25 + teacher.skillFactor('teach') * 0.5 + Math.max(0, regard) * 0.3
      + (pupil.traits.intelligence - 0.5) * 0.3);
    if (!rng.chance(chance)) {
      telemetry.count('teaching_failed');
      return null;
    }

    pupil.knownTech.add(tech);
    teacher.practice('teach', 2.5);
    telemetry.count('taught_' + tech);
    const text = teacher.name + ' taught ' + pupil.name + ' ' + TECH[tech].label.toLowerCase();
    teacher.chronicle.push({ tick, ageDays: teacher.age, text, kind: 'did' });
    pupil.chronicle.push({ tick, ageDays: pupil.age, text, kind: 'milestone' });
    return tech;
  }
}

/** How many living people know each thing. The census an era is read from. */
export function countHolders(people: Person[]): Map<Tech, number> {
  const counts = new Map<Tech, number>();
  for (const tech of TECHS) counts.set(tech, 0);
  for (const person of people) {
    if (!person.alive) continue;
    for (const tech of person.knownTech) {
      const known = tech as Tech;
      if (counts.has(known)) counts.set(known, counts.get(known)! + 1);
    }
  }
  return counts;
}
