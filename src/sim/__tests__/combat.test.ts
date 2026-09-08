/**
 * What a weapon is worth, and what armour takes off it.
 *
 * Asserted here rather than in `simcheck` for the reason the comment beside
 * `prototypes-can-fail` sets out: a world check needs the world to produce a
 * sample, and personal crafting does not produce one. A recipe is scored only
 * when its ingredients are already in the pack — nothing sends anyone to fetch
 * materials for something they want for themselves — so the `craft` scenario
 * yields one spear across twenty-four people, and whether an armed blow lands in
 * any given run is chance. A statistical claim over a sample that size is either
 * flaky or permanently n/a.
 *
 * These are the claims phase 5 actually makes. Before it, `doAttack` had no item
 * term at all: a man with a spear hit exactly as hard as a man with his hands.
 */
import { describe, it, expect } from 'vitest';
import { Person } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { ITEMS } from '../entities/Item.ts';
import { weaponOf, armourOf, techPower } from '../knowledge/Tech.ts';

function fighter(name: string): Person {
  const person = new Person(name, 4, 4, 0, new RNG('combat-' + name));
  person.age = 30 * 80;
  return person;
}

describe('weapons', () => {
  it('are worth nothing to somebody who does not know the design', () => {
    // The same rule every other effect goes through: a spear in the hands of
    // someone who has never understood one is a stick. `techPower` is the single
    // seam, so this holds without `weaponOf` knowing anything about prototypes.
    const person = fighter('ignorant');
    person.inventory.add('spear', 1);
    expect(techPower(person, 'spear')).toBe(0);
    expect(weaponOf(person, false)).toBeNull();

    person.knownTech.add('spear');
    person.techLevel.set('spear', 0);
    expect(weaponOf(person, false)).not.toBeNull();
  });

  it('hit harder than bare hands, and a refined design harder still', () => {
    const person = fighter('armed');
    person.inventory.add('spear', 1);
    person.knownTech.add('spear');
    person.techLevel.set('spear', 0);

    const plain = weaponOf(person, false)!;
    expect(plain.damage * plain.power).toBeGreaterThan(0);

    // Refinement lives on the knower, not the object: the same spear is worth
    // more to whoever went on improving the design.
    person.techLevel.set('spear', 2);
    const refined = weaponOf(person, false)!;
    expect(refined.damage * refined.power)
      .toBeGreaterThan(plain.damage * plain.power);
  });

  it('are chosen differently for a fight and for a hunt', () => {
    // A bow is a far better answer to a deer than to a neighbour, and a hand axe
    // is the reverse. That is the whole reason `damage` and `hunt` are separate
    // numbers rather than one measure of how good a weapon is.
    const person = fighter('both');
    person.inventory.add('bow', 1);
    person.inventory.add('handaxe', 1);
    for (const tech of ['bow', 'hafting', 'cordage', 'spear'] as const) {
      person.knownTech.add(tech);
      person.techLevel.set(tech, 0);
    }

    expect(weaponOf(person, true)!.hunt).toBe(ITEMS.bow!.weapon!.hunt);
    expect(weaponOf(person, false)!.damage).toBe(ITEMS.handaxe!.weapon!.damage);
  });

  it('give a spear the reach a fist does not have', () => {
    // How a spear beats a fist without ranged combat existing: `approach`
    // settles for a wider gap, so the spearman lands from a step further back
    // than the other party can reach.
    expect(ITEMS.spear!.weapon!.reach).toBeGreaterThan(ITEMS.handaxe!.weapon!.reach);
    expect(ITEMS.handaxe!.weapon!.reach).toBe(0);
  });
});

describe('armour', () => {
  it('turns aside part of a blow, and only the best piece counts', () => {
    const person = fighter('padded');
    expect(armourOf(person)).toBe(0);

    person.inventory.add('hide_armour', 1);
    expect(armourOf(person)).toBe(ITEMS.hide_armour!.armour);

    // Two of them are not twice the protection: armour is the best thing worn,
    // not the sum of everything carried.
    person.inventory.add('hide_armour', 1);
    expect(armourOf(person)).toBe(ITEMS.hide_armour!.armour);
  });

  it('never turns a blow aside completely', () => {
    // A defender who cannot be hurt is a fight that cannot end, which is the
    // shape of bug that once cost a band fifteen people to a quarrel nobody
    // could win.
    for (const def of Object.values(ITEMS)) {
      if (def.armour === undefined) continue;
      expect(def.armour, def.id + ' makes its wearer invulnerable')
        .toBeLessThan(1);
      expect(def.armour).toBeGreaterThan(0);
    }
  });
});
