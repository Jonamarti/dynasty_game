import { describe, expect, it } from 'vitest';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { journeyTransport, comarcaRoute } from '../world/Transport.ts';

function traveller(): Person { return new Person('Traveller', 0, 0, 0, new RNG('journey transport')); }
function options(person: Person, patch: Partial<Parameters<typeof journeyTransport>[0]> = {}) {
  return { person, from: { cx: 4, cy: 4 }, to: { cx: 5, cy: 4 }, mapWidth: 20, mapHeight: 10, seaCells: 0, snow: false, ...patch };
}

describe('comarca journey transport', () => {
  it('requires item and technology for wheels, and only shortens comarca travel', () => {
    const person = traveller();
    person.inventory.add('cart', 1); person.equipment.left = { item: 'cart', count: 1 };
    expect(journeyTransport(options(person))?.days).toBe(1);
    person.knownTech.add('the_wheel');
    expect(journeyTransport(options(person))?.days).toBe(0.5);
    expect(journeyTransport(options(person, { to: { cx: 6, cy: 4 } }))).toBeNull();
  });

  it('requires a live animal lease and its matching practice for longer land routes', () => {
    const person = traveller();
    expect(journeyTransport(options(person, { to: { cx: 6, cy: 4 }, animal: { mode: 'pack', capacity: 24, speed: 1 } }))).toBeNull();
    person.knownTech.add('pack_animals');
    const pack = journeyTransport(options(person, { to: { cx: 6, cy: 4 }, animal: { mode: 'pack', capacity: 24, speed: 1 } }));
    expect(pack?.maximumDistance).toBe(2);
    expect(pack?.cargoCapacity).toBe(24);
    expect(journeyTransport(options(person, { to: { cx: 7, cy: 4 }, animal: { mode: 'pack', capacity: 24, speed: 1 } }))).toBeNull();
  });

  it('requires a logboat and its technology for a coastal crossing', () => {
    const person = traveller();
    expect(journeyTransport(options(person, { seaCells: 1 }))).toBeNull();
    person.inventory.add('logboat', 1); person.knownTech.add('logboat');
    expect(journeyTransport(options(person, { seaCells: 1 }))?.mode).toBe('boat');
    expect(journeyTransport(options(person, { to: { cx: 6, cy: 4 }, seaCells: 2 }))).toBeNull();
  });

  it('requires an equipped, researched sledge and changes speed with snow', () => {
    const person = traveller();
    person.inventory.add('sledge', 1); person.equipment.left = { item: 'sledge', count: 1 };
    expect(journeyTransport(options(person))?.mode).toBe('foot');
    person.knownTech.add('sledge');
    const dry = journeyTransport(options(person));
    const snowy = journeyTransport(options(person, { snow: true }));
    expect(dry?.mode).toBe('sledge');
    expect(dry?.days).toBe(1.25);
    expect(snowy?.days).toBe(0.8);
  });

  it('requires both a riding lease and riding practice for longer routes', () => {
    const person = traveller();
    person.knownTech.add('horse_riding');
    expect(journeyTransport(options(person, { to: { cx: 7, cy: 4 } }))).toBeNull();
    const ride = journeyTransport(options(person, { to: { cx: 7, cy: 4 }, animal: { mode: 'riding', capacity: 0, speed: 1.5 } }));
    expect(ride?.mode).toBe('riding');
    expect(ride?.maximumDistance).toBe(3);
    expect(ride?.days).toBe(2);
  });

  it('chooses a deterministic short wrapped route', () => {
    expect(comarcaRoute({ cx: 0, cy: 2 }, { cx: 19, cy: 3 }, 20)).toEqual([
      { cx: 0, cy: 2 }, { cx: 19, cy: 2 }, { cx: 19, cy: 3 },
    ]);
  });
});
