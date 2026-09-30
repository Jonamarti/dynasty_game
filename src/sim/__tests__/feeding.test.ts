import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { feederRole, CHILD_FEED_AT, STARVING_AT, starvingInCare } from '../ai/Feeding.ts';
import { KIN_SPOUSE } from '../social/SocialSystem.ts';
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

/**
 * M15 phase 20, the owner's second rule of 2026-09-30: somebody on good terms
 * who sees a person dying of hunger gives them food they carry, or goes and
 * fetches some.
 */
describe('feeding the starving', () => {
  function couple(seed: string) {
    const { sim, parent: wife, neighbour: husband, other: stranger } = camp(seed);
    wife.sex = 'female';
    husband.sex = 'male';
    wife.spouseId = husband.id;
    husband.spouseId = wife.id;
    sim.relationships.setKinship(husband.id, wife.id, KIN_SPOUSE);
    sim.relationships.setKinship(wife.id, husband.id, KIN_SPOUSE);
    for (const p of sim.people) { p.needs.thirst = 0; p.needs.fatigue = 0; p.needs.cold = 0; p.order = null; }
    return { sim, wife, husband, stranger };
  }

  it('cares for a spouse, kin or a friend, not for a stranger', () => {
    const { sim, wife, husband, stranger } = couple('starving-who');
    // The founders are families; make this one a stranger to her.
    const rel = sim.relationships.peek(stranger.id, wife.id);
    if (rel) Object.assign(rel, { bias: 0, kinship: 0, deeds: 0, familiarity: 0, romance: 0 });
    wife.needs.hunger = STARVING_AT + 5;
    expect(starvingInCare(husband, wife, sim.relationships, sim.config.childhood)).toBe(true);
    expect(starvingInCare(stranger, wife, sim.relationships, sim.config.childhood)).toBe(false);
    wife.needs.hunger = STARVING_AT - 5;
    expect(starvingInCare(husband, wife, sim.relationships, sim.config.childhood)).toBe(false);
  });

  it('a husband with food feeds his starving wife, and it is a meal', () => {
    const { sim, wife, husband } = couple('starving-feed');
    wife.needs.hunger = 80;
    husband.needs.hunger = 40;
    husband.inventory.add('berries', 6);
    wife.x = husband.x + 1;
    wife.y = husband.y;
    for (let i = 0; i < 80 && wife.needs.hunger >= 75; i++) {
      sim.step();
      wife.needs.hunger = Math.max(wife.needs.hunger, 75);
      if (husband.action === 'give' && husband.actionTimer === 1) { sim.step(); break; }
    }
    expect(wife.needs.hunger).toBeLessThan(75);
    expect(husband.inventory.count('berries')).toBeLessThan(6);
  });

  it('remembers her starving when he has nothing, and forages for her', () => {
    const { sim, wife, husband } = couple('starving-fetch');
    wife.needs.hunger = 80;
    husband.needs.hunger = 10;
    wife.x = husband.x + 2;
    wife.y = husband.y;
    for (let i = 0; i < 6; i++) { sim.step(); wife.needs.hunger = 80; }
    expect(husband.starvingSeen?.id).toBe(wife.id);
    const rows = lastScores.get(husband.id) ?? [];
    const forage = rows.find(r => r.id === 'forage' || r.id === 'pick')?.score ?? 0;
    expect(forage).toBeGreaterThan(0);
  });

  it('once fed, forgets her', () => {
    const { sim, wife, husband } = couple('starving-forget');
    wife.needs.hunger = 80;
    wife.x = husband.x + 2;
    wife.y = husband.y;
    for (let i = 0; i < 6; i++) { sim.step(); wife.needs.hunger = 80; }
    expect(husband.starvingSeen?.id).toBe(wife.id);
    wife.needs.hunger = 10;
    // He sees she has eaten the next time he looks up from what he is doing.
    for (let i = 0; i < 200 && husband.starvingSeen !== null; i++) sim.step();
    expect(husband.starvingSeen).toBeNull();
  });

  it('walks back with food to where he saw her starving', () => {
    const { sim, wife, husband } = couple('starving-bring');
    husband.needs.hunger = 10;
    husband.inventory.add('berries', 4);
    const far = sim.config.sightRadius + 6;
    husband.starvingSeen = { id: wife.id, x: husband.x + far, y: husband.y, hunger: 80, tick: sim.time.tick };
    wife.x = husband.x + far;
    wife.y = husband.y;
    wife.needs.hunger = 80;
    const start = husband.x;
    let chose = false;
    for (let i = 0; i < 40; i++) {
      sim.step();
      wife.needs.hunger = 80;
      if (husband.action === 'bring_food') chose = true;
    }
    expect(chose).toBe(true);
    expect(husband.x).toBeGreaterThan(start + 2);
  });
});
