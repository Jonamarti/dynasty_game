import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { feederRole, CHILD_FEED_AT } from '../ai/Feeding.ts';
import { lastScores } from '../ai/Brain.ts';
import type { Person } from '../entities/Person.ts';

/**
 * M15 phase 20, the owner's rules of 2026-09-30: parents feed their child
 * first, and the band feeds a small child whose parents are not there.
 */
function camp(seed: string) {
  const sim = new Simulation({ seed, world: { width: 48, height: 48 },
    population: { bands: 1, peoplePerBand: 5 } });
  const [parent, child, neighbour, other] = sim.people as [Person, Person, Person, Person];
  for (const p of sim.people) {
    p.x = parent.x; p.y = parent.y; p.bandId = parent.bandId;
    p.householdId = null; p.childIds = []; p.motherId = null; p.fatherId = null;
    p.age = 25 * p.daysPerYear;
  }
  parent.childIds = [child.id];
  child.motherId = parent.id;
  child.age = 3 * child.daysPerYear;
  return { sim, parent, child, neighbour, other };
}

describe('who feeds a child', () => {
  it('a parent feeds their weaned child whoever is the hungrier', () => {
    const { sim, parent, child } = camp('feed-parent');
    parent.needs.hunger = 90;
    child.needs.hunger = 40;
    expect(feederRole(parent, child, sim.config.childhood, sim.peopleById, sim.config.sightRadius)).toBe('parent');
  });

  it('nobody feeds a nursling by hand', () => {
    const { sim, parent, child } = camp('feed-nursling');
    child.age = 1;
    expect(feederRole(parent, child, sim.config.childhood, sim.peopleById, sim.config.sightRadius)).toBeNull();
  });

  it('a bandmate feeds a small child only when no parent is in sight of it', () => {
    const { sim, parent, child, neighbour } = camp('feed-band');
    const role = () => feederRole(neighbour, child, sim.config.childhood, sim.peopleById, sim.config.sightRadius);
    expect(role()).toBeNull();
    parent.x += sim.config.sightRadius * 2;
    expect(role()).toBe('band');
    child.age = sim.config.childhood.forageYears * child.daysPerYear;
    expect(role()).toBeNull();
  });

  it('two people with no household are not one household', () => {
    const { sim, child, other } = camp('feed-null-household');
    child.age = 8 * child.daysPerYear;
    expect(feederRole(other, child, sim.config.childhood, sim.peopleById, sim.config.sightRadius)).toBeNull();
  });

  it('a hungry parent scores feeding the child above eating themselves', () => {
    const { sim, parent, child } = camp('feed-first');
    parent.needs.hunger = 90;
    parent.needs.thirst = 0;
    parent.needs.fatigue = 0;
    parent.order = null;
    parent.inventory.add('berries', 4);
    child.needs.hunger = CHILD_FEED_AT + 20;
    child.x = parent.x + 1;
    for (let i = 0; i < 6; i++) sim.step();
    const rows = lastScores.get(parent.id) ?? [];
    const feed = rows.find(r => r.id === 'feed')?.score ?? 0;
    const eat = rows.find(r => r.id === 'eat')?.score ?? 0;
    expect(feed).toBeGreaterThan(eat);
  });
});
