/** M15 phase 40e: wrought-iron tools use the existing work readers. */
import { describe, it, expect } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { DIG_TOOLS, digTool } from '../core/Earth.ts';
import { Person, DAYS_PER_YEAR } from '../entities/Person.ts';
import { ITEMS } from '../entities/Item.ts';
import { RECIPES } from '../entities/Recipe.ts';
import { TECH, axeFactor, axeItemOf, buildFactor, reapFactor } from '../knowledge/Tech.ts';

function adult(name: string): Person {
  const person = new Person(name, 4, 4, 0, new RNG('iron-tools-' + name));
  person.age = 30 * DAYS_PER_YEAR;
  return person;
}

function teach(person: Person, ...techs: (typeof TECH extends Record<string, unknown> ? string[] : never)): void {
  for (const tech of techs) person.knownTech.add(tech as never);
}

describe('iron tools', () => {
  it('requires forging and enables the four anvil recipes', () => {
    expect(TECH.iron_tools!.requires).toEqual(['forging']);
    expect(TECH.iron_tools!.domain).toBe('metal');
    expect(RECIPES.iron_axe).toMatchObject({ tech: 'iron_tools', station: 'anvil', ingredients: { wrought_iron: 1 }, output: { iron_axe: 1 } });
    expect(RECIPES.iron_adze).toMatchObject({ tech: 'iron_tools', station: 'anvil', ingredients: { wrought_iron: 1 }, output: { iron_adze: 1 } });
    expect(RECIPES.iron_sickle).toMatchObject({ tech: 'iron_tools', station: 'anvil', ingredients: { wrought_iron: 1 }, output: { iron_sickle: 1 } });
    expect(RECIPES.iron_spade).toMatchObject({ tech: 'iron_tools', station: 'anvil', ingredients: { wrought_iron: 2 }, output: { iron_spade: 1 } });
    for (const id of ['iron_axe', 'iron_adze', 'iron_sickle', 'iron_spade']) expect(ITEMS[id]!.weapon).toBeUndefined();
  });

  it('improves actual felling, building, reaping and digging readers', () => {
    const person = adult('smith');
    teach(person, 'iron_tools', 'bronze_tools', 'ground_stone', 'casting', 'carpentry', 'sickle');

    person.inventory.add('bronze_axe', 1);
    const bronzeAxe = axeFactor(person);
    person.inventory.add('iron_axe', 1);
    expect(axeFactor(person)).toBeLessThan(bronzeAxe);
    expect(axeItemOf(person)).toBe('iron_axe');

    person.inventory.add('bronze_adze', 1);
    const bronzeBuild = buildFactor(person);
    person.inventory.add('iron_adze', 1);
    expect(buildFactor(person)).toBeGreaterThan(bronzeBuild);

    person.inventory.add('bronze_sickle', 1);
    const bronzeReap = reapFactor(person);
    person.inventory.add('iron_sickle', 1);
    expect(reapFactor(person)).toBeLessThan(bronzeReap);

    person.inventory.add('sticks', 1);
    person.inventory.add('bronze_spade', 1);
    const bronzeSpade = digTool(person)!;
    person.inventory.add('iron_spade', 1);
    const ironSpade = digTool(person)!;
    expect(DIG_TOOLS.find(tool => tool.item === 'iron_spade')?.power).toBe(6);
    expect(ironSpade).toMatchObject({ item: 'iron_spade', power: 6 });
    expect(ironSpade.power).toBeGreaterThan(bronzeSpade.power);
  });

  it('does not give carried iron tools free effects without iron_tools knowledge', () => {
    const stranger = adult('stranger');
    for (const id of ['iron_axe', 'iron_adze', 'iron_sickle', 'iron_spade']) stranger.inventory.add(id, 1);
    expect(axeFactor(stranger)).toBe(1);
    expect(buildFactor(stranger)).toBe(buildFactor(adult('bare')));
    expect(reapFactor(stranger)).toBe(1);
    expect(digTool(stranger)).toBeNull();
    stranger.inventory.add('sticks', 1);
    expect(digTool(stranger)).toEqual({ item: 'sticks', power: 1 });
  });

  it('keeps felling, reaping and digging effects positive at maximum refinement', () => {
    const person = adult('refined');
    teach(person, 'iron_tools', 'carpentry');
    person.techLevel.set('iron_tools' as never, TECH.iron_tools!.maxRefinement);
    for (const id of ['iron_axe', 'iron_sickle', 'iron_spade']) person.inventory.add(id, 1);
    expect(axeFactor(person)).toBeGreaterThan(0);
    expect(reapFactor(person)).toBeGreaterThan(0);
    expect(digTool(person)?.power).toBeGreaterThan(0);
  });
});
