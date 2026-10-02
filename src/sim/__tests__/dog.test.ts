/**
 * Animal memory and the dog (M15 phase 23g): what a hunted animal keeps of the
 * hunter, and what a tamed wolf is worth to the person it follows.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';
import { companionBonus, grudgeOf, guardedByDog, noticeRadius, rememberHurt } from '../systems/WildlifeSystem.ts';

telemetry.enable();

function steps(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) sim.step();
}

const adult = (sim: Simulation) => sim.people.find(p => p.alive && !p.isChild)!;

describe('animal memory', () => {
  it('a deer that turned on a hunter sees that hunter from further off, and forgets in days', () => {
    const sim = new Simulation({ seed: 'dog-1' });
    const deer = sim.animals.find(a => a.species === 'deer')!;
    const [one, two] = sim.people.filter(p => p.alive && !p.isChild);
    const before = noticeRadius(deer, one!);
    rememberHurt(deer, one!, sim.time.tick);
    expect(noticeRadius(deer, one!)).toBeGreaterThan(before);
    expect(noticeRadius(deer, two!)).toBeCloseTo(noticeRadius({ ...deer, hurtBy: null } as typeof deer, two!));
    expect(grudgeOf(deer, sim.time.tick + 100)).toBe(one!.id);
    expect(grudgeOf(deer, sim.time.tick + 5000)).toBeNull();
    expect(deer.hurtBy).toBeNull();
  });

  it('a wolf that was cornered goes for that person, even when it is fed', { timeout: 60000 }, () => {
    const sim = new Simulation({ seed: 'dog-2' });
    const wolf = sim.animals.find(a => a.species === 'wolf')!;
    const person = adult(sim);
    for (const mate of sim.animals.filter(a => a.herdId === wolf.herdId)) mate.fed = 1;
    const spot = sim.world.findWalkableNear(Math.round(wolf.x) + 4, Math.round(wolf.y)) ?? { x: wolf.x, y: wolf.y };
    person.x = spot.x; person.y = spot.y;
    const before = telemetry.get('animal_grudge_pursuit');
    steps(sim, 20);
    expect(telemetry.get('animal_grudge_pursuit')).toBe(before);
    rememberHurt(wolf, person, sim.time.tick);
    steps(sim, 100);
    expect(telemetry.get('animal_grudge_pursuit')).toBeGreaterThan(before);
  });
});

describe('dog', () => {
  it('is a tamed wolf at the heel of somebody who knows it, and nothing else', () => {
    const sim = new Simulation({ seed: 'dog-3' });
    const wolf = sim.animals.find(a => a.species === 'wolf')!;
    const deer = sim.animals.find(a => a.species === 'deer')!;
    const person = adult(sim);
    wolf.x = person.x + 2; wolf.y = person.y; wolf.tamedBy = person.id;
    sim['rebuildHashes']();
    expect(guardedByDog(person, sim.animalHash)).toBe(false);
    person.knownTech.add('dog');
    expect(guardedByDog(person, sim.animalHash)).toBe(true);
    wolf.tamedBy = null;
    deer.tamedBy = person.id;
    deer.x = person.x + 1; deer.y = person.y;
    sim['rebuildHashes']();
    expect(guardedByDog(person, sim.animalHash)).toBe(false);
  });

  it('hunts better with a wolf at the heel than with a deer', () => {
    const sim = new Simulation({ seed: 'dog-4' });
    const wolf = sim.animals.find(a => a.species === 'wolf')!;
    const person = adult(sim);
    person.knownTech.add('taming');
    wolf.x = person.x + 1; wolf.y = person.y; wolf.tamedBy = person.id;
    const without = companionBonus(person, sim.animals);
    person.knownTech.add('dog');
    expect(companionBonus(person, sim.animals)).toBeGreaterThan(without);
  });

  it('lets its owner see strangers from further off', () => {
    const sim = new Simulation({ seed: 'dog-5', population: { bands: 2, peoplePerBand: 3 } });
    const wolf = sim.animals.find(a => a.species === 'wolf')!;
    const person = adult(sim);
    person.knownTech.add('dog');
    wolf.x = person.x + 1; wolf.y = person.y; wolf.tamedBy = person.id;
    const before = telemetry.get('dog_sight');
    steps(sim, 60);
    expect(telemetry.get('dog_sight')).toBeGreaterThan(before);
  });
});
