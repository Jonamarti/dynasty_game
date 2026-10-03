import { describe, expect, it } from 'vitest';
import { Person } from '../../sim/entities/Person.ts';
import { RNG } from '../../sim/core/RNG.ts';
import { heldItemFor } from '../Sprites.ts';

function worker(): Person {
  return new Person('Tool worker', 4, 4, 0, new RNG('equipped-render'));
}

describe('fitted tool rendering', () => {
  it('reads visible hand slots without inspecting private inventory or techniques', () => {
    const person = worker(); person.action = 'chop';
    person.equipment.left = { item: 'spear', count: 1 };
    person.equipment.right = { item: 'handaxe', count: 1 };
    Object.defineProperty(person, 'knownTech', { get: () => { throw new Error('Private techniques read'); } });
    Object.defineProperty(person, 'inventory', { get: () => { throw new Error('Private inventory read'); } });
    expect(heldItemFor(person, true)).toBe('handaxe');
    person.action = 'hunt';
    person.equipment.right = { item: 'sticks', count: 1 };
    expect(heldItemFor(person, true)).toBe('spear');
    person.equipment = {};
    expect(heldItemFor(person, true)).toBeNull();
  });

  it('shows the axe in hand while a more conspicuous spear stays in the pack', () => {
    const person = worker();
    person.knownTech.add('hafting');
    person.inventory.add('spear', 1);
    person.inventory.add('handaxe', 1);
    person.action = 'chop';

    // The false ablation preserves the historical inventory-priority picture.
    expect(heldItemFor(person, false)).toBe('spear');
    // Auto-fit mode does not pretend that a packed axe is already in hand.
    expect(heldItemFor(person, true)).toBeNull();
    person.equipment.right = { item: 'handaxe', count: 1 };
    expect(heldItemFor(person, true)).toBe('handaxe');
    expect(heldItemFor(person, false)).toBe('spear');
  });

  it('uses the actual fitted hunting weapon, including a two-handed bow', () => {
    const person = worker();
    person.knownTech.add('spear'); person.knownTech.add('bow');
    person.inventory.add('spear', 1); person.inventory.add('bow', 1);
    person.action = 'hunt';
    person.equipment.left = { item: 'bow', count: 1 };
    person.equipment.right = { item: 'bow', count: 1 };
    expect(heldItemFor(person, true)).toBe('bow');
  });

  it('keeps digging selection and gathering empty hands independent of the equipment setting', () => {
    const person = worker();
    person.knownTech.add('hafting');
    person.knownTech.add('carpentry');
    person.inventory.add('spear', 1); person.inventory.add('spade', 1);
    person.action = 'dig';
    expect(heldItemFor(person, true)).toBe('spade');
    person.action = 'forage';
    expect(heldItemFor(person, true)).toBe('spear');
    // The renderer's gathering pose still suppresses this item; the pure
    // selector intentionally remains the same inventory API used elsewhere.
  });

  it('returns to legacy selection after an action interruption clears the action', () => {
    const person = worker();
    person.knownTech.add('hafting');
    person.inventory.add('spear', 1); person.inventory.add('handaxe', 1);
    person.equipment.right = { item: 'handaxe', count: 1 };
    person.action = 'chop';
    expect(heldItemFor(person, true)).toBe('handaxe');
    person.action = 'idle';
    expect(heldItemFor(person, true)).toBe('spear');
  });
});
