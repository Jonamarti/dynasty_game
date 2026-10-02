/**
 * M15 phase 38a: the feast, `brewing`'s second half. See `social/Feast.ts`.
 *
 * What is asserted is what the plan asks of it: a store's surplus spent on
 * whoever gathers, the host's household gaining renown and the guests'
 * regard through the deed, and both ways it can fail saying why.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Household } from '../entities/Household.ts';
import type { Person } from '../entities/Person.ts';
import { FEAST_INTERVAL_DAYS, FEAST_MIN_FOOD, dishFor, feastVenue, portions, servable } from '../social/Feast.ts';
import { Inventory } from '../entities/Item.ts';

const SMALL = {
  seed: 'feast-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: {
    bands: 1, peoplePerBand: 6,
    startingTech: ['pottery', 'farming', 'brewing'],
  },
};

function aDayIn(sim: Simulation): void {
  for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
}

function settle(person: Person): void {
  person.needs.thirst = 0;
  person.needs.hunger = 0;
  person.needs.cold = 0;
  person.needs.fatigue = 0;
  for (const [itemId, count] of person.inventory.entries()) person.inventory.remove(itemId, count);
}

/** A household for `host` with a finished hut at their feet, stocked as asked. */
function homeFor(sim: Simulation, host: Person, stock: Record<string, number>): { home: Building; household: Household } {
  const household = new Household('Feastgiver', host.id, host.bandId, sim.time.tick);
  household.add(host.id);
  host.householdId = household.id;
  const home = new Building(BUILDINGS.mud_hut!, Math.max(2, Math.floor(host.x) - 1),
    Math.max(2, Math.floor(host.y) - 1), host.bandId);
  home.complete = true;
  for (const [itemId, count] of Object.entries(stock)) home.store.add(itemId, count);
  household.homeBuildingId = home.id;
  sim.households.push(household);
  sim.householdsById.set(household.id, household);
  sim.buildings.push(home);
  sim.buildingsById.set(home.id, home);
  host.x = home.centerX;
  host.y = home.centerY;
  return { home, household };
}

describe('what a feast serves', () => {
  it('never sets raw meat before a guest', () => {
    expect(servable('meat')).toBe(false);
    expect(servable('bread')).toBe(true);
    expect(servable('beer')).toBe(true);
    expect(servable('wood')).toBe(false);
  });

  it('pours the lonely a cup and feeds the hungry', () => {
    const sim = new Simulation(SMALL);
    const guest = sim.livingPeople()[0]!;
    const store = new Inventory();
    store.add('beer', 2);
    store.add('bread', 2);
    store.add('meat', 9);
    guest.needs.company = 70;
    guest.needs.hunger = 10;
    expect(dishFor(guest, store)).toBe('beer');
    guest.needs.company = 0;
    guest.needs.hunger = 70;
    expect(dishFor(guest, store)).toBe('bread');
    expect(portions(store)).toBe(4);
  });
});

describe('where a feast can be held', () => {
  it('needs a full table and a few days since the last, and no cup', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const host = sim.livingPeople()[0]!;
    settle(host);
    const { home, household } = homeFor(sim, host, { bread: FEAST_MIN_FOOD });
    const venue = () => feastVenue(host, household, false, sim.buildings, sim.buildingsById, sim.time.day);

    expect(venue(), 'a feast without beer is still a feast').toBe(home);
    household.lastFeastDay = sim.time.day - FEAST_INTERVAL_DAYS + 1;
    expect(venue(), 'feasted too lately').toBeNull();
    household.lastFeastDay = -Infinity;
    home.store.remove('bread', 2);
    expect(venue(), 'not a full table').toBeNull();
  });
});

describe('a feast', () => {
  it('refuses with nothing to give, and says why', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const host = sim.livingPeople()[0]!;
    settle(host);

    expect(sim.order(host, 'feast')).toBe(true);
    for (let i = 0; i < 50 && host.order !== null; i++) sim.step();
    expect(sim.interruptions.some(stop => stop.reason === 'no_feast_to_give')).toBe(true);
  });

  it('spends the store on the guests, and the host is better thought of for it', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const people = sim.livingPeople();
    const host = people[0]!;
    settle(host);
    const { home, household } = homeFor(sim, host, { bread: 10, berries: 10, beer: 4 });
    const guests = people.slice(1).filter(p => !p.isChild);
    for (const guest of guests) {
      settle(guest);
      guest.x = host.x + 1;
      guest.y = host.y;
      guest.needs.hunger = 60;
      guest.needs.company = 50;
    }
    const opinionBefore = guests.map(g => sim.relationships.opinion(g.id, host.id));
    const renownBefore = household.renown;
    const stockBefore = home.store.total;

    expect(sim.order(host, 'feast', { buildingId: home.id })).toBe(true);
    for (let i = 0; i < 400 && host.order !== null; i++) {
      // Keep the guests at the table: the test is about the host's evening,
      // not whether the scorer would have walked them over.
      for (const guest of guests) { guest.x = host.x + 1; guest.y = host.y; }
      sim.step();
    }

    expect(home.store.total).toBeLessThan(stockBefore);
    expect(household.renown).toBeGreaterThan(renownBefore);
    expect(household.lastFeastDay).toBe(sim.time.day);
    const fed = guests.filter(g => g.needs.hunger < 60);
    expect(fed.length).toBeGreaterThanOrEqual(2);
    const warmer = guests.filter((g, i) => sim.relationships.opinion(g.id, host.id) > opinionBefore[i]!);
    expect(warmer.length).toBeGreaterThanOrEqual(2);
    expect(host.chronicle.some(line => line.text.includes('feast'))).toBe(true);
  });

  it('says nobody came when nobody did', () => {
    const sim = new Simulation(SMALL);
    aDayIn(sim);
    const people = sim.livingPeople();
    const host = people[0]!;
    settle(host);
    const { home } = homeFor(sim, host, { bread: 20, beer: 2 });
    // Everybody else far off, and kept there.
    const away = people.slice(1);
    const park = () => { for (const other of away) { other.x = 2; other.y = 2; } };
    park();
    host.x = home.centerX;
    host.y = home.centerY;
    expect(sim.order(host, 'feast', { buildingId: home.id })).toBe(true);
    for (let i = 0; i < 400 && host.order !== null; i++) { park(); sim.step(); }
    expect(sim.interruptions.some(stop => stop.reason === 'nobody_came')).toBe(true);
    expect(home.store.count('bread')).toBe(20);
  });
});
