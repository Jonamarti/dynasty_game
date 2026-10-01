/**
 * M15 phase 21d: a berry that looks edible and is not, and a herb that eases
 * what it does. The claim the owner's note makes is about knowledge: whoever
 * has plant lore will not eat the baneberry, whoever lacks it may, and a herb
 * in a healer's hand is spent doing something.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { appealOf, consumeFood, knowsPoisonous } from '../core/Macros.ts';
import { BUSHES, BUSH_SPECIES, WILD_PLANTS, bushPhase } from '../entities/ResourceNode.ts';
import { dress, newBody, soothe, sicken, wound, type Condition } from '../entities/Body.ts';
import { nodeName } from '../../ui/Hud.ts';

const SMALL = {
  seed: 'herbs',
  world: { width: 96, height: 96, berryBushes: 80, flintOutcrops: 10, deadwood: 20, gameHerds: 0 },
  population: { bands: 1, peoplePerBand: 4 },
};

const ordinary = (species: string | null): boolean =>
  species !== null && (BUSH_SPECIES as readonly string[]).includes(species);

describe('the wild plants', () => {
  it('stand beside the ordinary bushes, which are fewer than all the bushes and untouched', () => {
    const sim = new Simulation(SMALL);
    const wild = sim.nodes.filter(n => (WILD_PLANTS as readonly string[]).includes(n.species ?? ''));
    expect(wild.length).toBeGreaterThan(0);
    const bushes = sim.nodes.filter(n => ordinary(n.species));
    expect(bushes.length).toBeGreaterThan(wild.length);
    // Every plant of the new pass has a higher id than every ordinary node of
    // the old ones: it was planted last, from its own stream.
    const lastOrdinary = Math.max(...sim.nodes.filter(n => n.species === null || ordinary(n.species)).map(n => n.id));
    for (const plant of wild) expect(plant.id).toBeGreaterThan(lastOrdinary);
  });

  it('give what their species gives, and the baneberry is appetising to the ignorant', () => {
    const sim = new Simulation(SMALL);
    const bane = sim.nodes.find(n => n.species === 'baneberry')!;
    const yarrow = sim.nodes.find(n => n.species === 'yarrow')!;
    expect(bane.itemId).toBe('toxic_berries');
    expect(yarrow.itemId).toBe('herbs');
    expect(sim.nodes.find(n => n.species === 'bramble')!.itemId).toBe('berries');
    const person = sim.livingPeople()[0]!;
    person.knownTech.delete('plant_lore');
    expect(appealOf(person, 'toxic_berries')).toBeCloseTo(appealOf(person, 'berries'), 0);
    expect(BUSHES.baneberry.fruitColor).not.toBe(BUSHES.bramble.fruitColor);
  });

  it('are planted the same way twice', () => {
    const a = new Simulation(SMALL);
    const b = new Simulation(SMALL);
    expect(a.nodes.map(n => `${n.id}:${n.x},${n.y}:${n.species}`))
      .toEqual(b.nodes.map(n => `${n.id}:${n.x},${n.y}:${n.species}`));
    expect(bushPhase('baneberry', 'winter')).toBe('bare');
  });
});

describe('plant lore', () => {
  it('makes the baneberry worth nothing to those who know, and still food to those who do not', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    person.knownTech.delete('plant_lore');
    expect(knowsPoisonous(person, 'toxic_berries')).toBe(false);
    expect(appealOf(person, 'toxic_berries')).toBeGreaterThan(0);
    person.knownTech.add('plant_lore');
    expect(knowsPoisonous(person, 'toxic_berries')).toBe(true);
    expect(appealOf(person, 'toxic_berries')).toBe(0);
    // It is knowledge of this one plant, not a general suspicion of berries.
    expect(appealOf(person, 'berries')).toBeGreaterThan(0);
  });

  it('shows a berry bush to the unlettered eye and the plant to the lettered', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    const bane = sim.nodes.find(n => n.species === 'baneberry')!;
    person.knownTech.delete('plant_lore');
    expect(nodeName(bane, person)).not.toBe('Baneberry');
    person.knownTech.add('plant_lore');
    expect(nodeName(bane, person)).toBe('Baneberry');
  });

  it('poisons the ignorant over many mouthfuls and counts those who knew (the-wise-avoid-baneberries)', () => {
    const sim = new Simulation(SMALL);
    const unwise = sim.livingPeople()[0]!;
    unwise.knownTech.delete('plant_lore');
    const rng = new RNG('mouthfuls');
    let ill = 0;
    for (let i = 0; i < 20; i++) {
      unwise.conditions.length = 0;
      unwise.inventory.add('toxic_berries', 1);
      consumeFood(unwise, 'toxic_berries', 0, true, rng);
      if (unwise.conditions.length > 0) ill++;
    }
    expect(ill).toBeGreaterThan(5);
  });
});

describe('herbs', () => {
  it('ease a poisoning one grade at a time and then end it', () => {
    const conditions: Condition[] = [];
    sicken(conditions, 'meat', { next: () => 0.0 } as RNG); // severe
    expect(soothe(conditions)).toBe('eased');
    expect(conditions[0]!.severity).toBe('moderate');
    expect(soothe(conditions)).toBe('eased');
    expect(soothe(conditions)).toBe('cured');
    expect(conditions).toHaveLength(0);
    expect(soothe(conditions)).toBeNull();
  });

  it('draw the infection out whatever the fever, where a bandage only eases a grade', () => {
    const make = () => {
      const body = newBody();
      wound(body, 'left_leg', 0.4);
      body.left_leg.wound = 'infected';
      const conditions: Condition[] = [{ kind: 'fever', severity: 'severe', days: 7, part: 'left_leg' }];
      return { body, conditions };
    };
    const plain = make();
    expect(dress(plain.body, plain.conditions)!.result).toBe('eased');
    expect(plain.body.left_leg.wound).toBe('infected');
    const herbal = make();
    const done = dress(herbal.body, herbal.conditions, true)!;
    expect(done.result).toBe('cured');
    expect(done.herbUsed).toBe(true);
    expect(herbal.body.left_leg.wound).toBe('tended');
    expect(herbal.conditions).toHaveLength(0);
  });

  it('are spent by a healer tending the poisoned', () => {
    const sim = new Simulation(SMALL);
    const [healer, patient] = sim.livingPeople();
    healer!.knownTech.add('herbalism');
    healer!.x = patient!.x + 1;
    healer!.y = patient!.y;
    patient!.conditions.push({ kind: 'poisoning', severity: 'moderate', daysLeft: 2, item: 'meat' });
    healer!.inventory.add('herbs', 2);
    expect(sim.order(healer!, 'tend', { personId: patient!.id })).toBe(true);
    for (let i = 0; i < 80 && healer!.inventory.count('herbs') === 2; i++) sim.step();
    expect(healer!.inventory.count('herbs')).toBeLessThan(2);
    expect(patient!.conditions.find(c => c.kind === 'poisoning')?.severity ?? 'mild').not.toBe('moderate');
  });
});
