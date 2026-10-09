import { describe, expect, it } from 'vitest';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { journeyTransport, comarcaRoute } from '../world/Transport.ts';

function traveller(): Person { return new Person('Traveller', 0, 0, 0, new RNG('journey transport')); }
function options(person: Person, patch: Partial<Parameters<typeof journeyTransport>[0]> = {}) {
  return { person, from: { cx: 4, cy: 4 }, to: { cx: 5, cy: 4 }, mapWidth: 20, mapHeight: 10, seaCells: 0, snow: false, ...patch };
}

describe('comarca journey transport', () => {
  it('requires wheel knowledge and cart possession for faster land travel', () => {
    const person = traveller();
    person.inventory.add('cart', 1); person.equipment.left = { item: 'cart', count: 1 };
    expect(journeyTransport(options(person))?.days).toBe(1);
    person.knownTech.add('the_wheel');
    expect(journeyTransport(options(person))?.mode).toBe('cart');
    expect(journeyTransport(options(person))?.days).toBe(0.5);
    expect(journeyTransport(options(person, { to: { cx: 6, cy: 4 } }))).toBeNull();
  });

  it('requires a researched, equipped sledge and adjusts travel speed for snow', () => {
    const person = traveller();
    person.inventory.add('sledge', 1); person.equipment.left = { item: 'sledge', count: 1 };
    expect(journeyTransport(options(person))?.mode).toBe('foot');
    person.knownTech.add('sledge');
    expect(journeyTransport(options(person))?.mode).toBe('sledge');
    expect(journeyTransport(options(person))?.days).toBe(1.25);
    expect(journeyTransport(options(person, { snow: true }))?.days).toBe(0.8);
  });

  it('requires both logboat locks for one coastal comarca and refuses a longer sea crossing', () => {
    const person = traveller();
    expect(journeyTransport(options(person, { seaCells: 1 }))).toBeNull();
    person.inventory.add('logboat', 1); person.knownTech.add('logboat');
    expect(journeyTransport(options(person, { seaCells: 1 }))?.mode).toBe('boat');
    expect(journeyTransport(options(person, { to: { cx: 6, cy: 4 }, seaCells: 2 }))).toBeNull();
  });

  it('chooses a deterministic short wrapped route', () => {
    expect(comarcaRoute({ cx: 0, cy: 2 }, { cx: 19, cy: 3 }, 20)).toEqual([
      { cx: 0, cy: 2 }, { cx: 19, cy: 2 }, { cx: 19, cy: 3 },
    ]);
  });
});