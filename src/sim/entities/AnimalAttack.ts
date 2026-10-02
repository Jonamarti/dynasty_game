/**
 * A beast's blow landing on a person — M15 phase 23f (M14 phase 9f).
 *
 * Three callers, one wound. The hungry wolf closing on somebody alone, the
 * bear that was walked in on, and the stag or boar that turns on a hunter who
 * missed all end here, so the same armour, the same body part and the same
 * knock-out apply to a fang as to a fist (`doAttack` is the other half of the
 * idea). Drawing from `healthRng`, exactly one draw per blow, for the part.
 */
import type { Animal } from './Animal.ts';
import type { Person } from './Person.ts';
import type { RNG } from '../core/RNG.ts';
import { KNOCKOUT_AT, strikePart, wound } from './Body.ts';
import { protectionOf } from '../knowledge/Tech.ts';
import { telemetry } from '../core/Telemetry.ts';

const KNOCKOUT_TICKS = 15;

/** What a blow did, for whoever has to tell the player. */
export interface BlowResult {
  damage: number;
  killed: boolean;
}

export function animalBlow(
  animal: Animal, person: Person, tick: number, healthRng: RNG, rng: RNG
): BlowResult {
  const part = strikePart(healthRng);
  const turned = protectionOf(person, part);
  const bare = animal.def.blow * rng.range(0.7, 1.3);
  const damage = bare * (1 - turned);
  if (turned > 0) telemetry.count('blow_armoured');

  person.health -= damage;
  wound(person.body, part, damage / 100);
  if (part === 'head' && person.body.head.damage >= KNOCKOUT_AT && person.health > 0) {
    if (person.body.head.damage >= 1) {
      person.die('a blow to the head');
    } else {
      person.knockedOutUntil = tick + KNOCKOUT_TICKS;
      person.forgetPlans();
      person.action = 'idle';
    }
  }
  // Whatever they were doing, they are not doing it now.
  if (person.alive) {
    person.forgetPlans();
    if (person.action !== 'idle') person.action = 'idle';
  }
  person.lastHarmedTick = tick;
  person.mood.add('security', -Math.min(30, 8 + damage), 'animal_attack', tick);
  telemetry.count('animal_blow_' + animal.species);

  let killed = false;
  if (person.health <= 0 && person.alive) {
    person.die('killed by a ' + animal.def.label.toLowerCase());
    telemetry.count('death_animal');
    killed = true;
  }
  return { damage, killed };
}
