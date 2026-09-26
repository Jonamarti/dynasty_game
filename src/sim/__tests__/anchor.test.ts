import { describe, expect, it } from 'vitest';
import { anchorOf, carerOf, childRadius, reachOf } from '../ai/Anchor.ts';
import { DEFAULT_CONFIG, makeConfig } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import { World } from '../core/World.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Household } from '../entities/Household.ts';
import { Person, resetPersonIds } from '../entities/Person.ts';

describe('home anchors', () => {
  it('can turn off the home reach filter for an ablation', () => {
    const actor = new Person('Actor', 10, 10, 0, new RNG('anchor-ablation'));
    const world = new World(DEFAULT_CONFIG.world, new RNG('anchor-ablation-world'));
    const ctx = { world, peopleById: new Map([[actor.id, actor]]), buildingsById: new Map(),
      householdsById: new Map(), homes: new Map([[0, { x: 10, y: 10 }]]),
      motivation: makeConfig({ motivation: { reachFilter: false } }).motivation };
    expect(reachOf(actor, ctx)).toBe(Number.POSITIVE_INFINITY);
  });

  it('prefers the mother, then the father when the mother is not available', () => {
    resetPersonIds();
    const world = new World(DEFAULT_CONFIG.world, new RNG('anchor-world'));
    const x = 64, y = 64;
    const mother = new Person('Mother', x, y, 0, new RNG('mother'));
    const father = new Person('Father', x, y, 0, new RNG('father'));
    const child = new Person('Child', x, y, 0, new RNG('child'));
    mother.age = 30 * 80; father.age = 31 * 80; child.age = 3 * 80;
    child.motherId = mother.id; child.fatherId = father.id;
    const ctx = { world, peopleById: new Map([[mother.id, mother], [father.id, father], [child.id, child]]),
      buildingsById: new Map(), householdsById: new Map(), homes: new Map([[0, { x, y }]]), motivation: makeConfig().motivation };
    expect(carerOf(child, ctx)?.id).toBe(mother.id);
    mother.alive = false;
    expect(carerOf(child, ctx)?.id).toBe(father.id);
    expect(anchorOf(child, ctx)?.kind).toBe('carer');
  });

  it('gives children gradually wider radii and keeps a parent near a young child', () => {
    resetPersonIds();
    const ctxConfig = makeConfig({ motivation: { parentReach: 16 } });
    const world = new World(DEFAULT_CONFIG.world, new RNG('anchor-radii'));
    const parent = new Person('Parent', 64, 64, 0, new RNG('parent'));
    const child = new Person('Child', 64, 64, 0, new RNG('young-child'));
    parent.age = 30 * 80; child.age = 2 * 80;
    child.motherId = parent.id;
    const household = new Household('House', parent.id, 0, 0);
    household.memberIds.push(parent.id, child.id);
    parent.householdId = child.householdId = household.id;
    parent.childIds.push(child.id);
    const ctx = { world, peopleById: new Map([[parent.id, parent], [child.id, child]]), buildingsById: new Map(),
      householdsById: new Map([[household.id, household]]), homes: new Map([[0, { x: 64, y: 64 }]]), motivation: ctxConfig.motivation };
    expect(childRadius(child, ctxConfig.motivation)).toBe(3);
    expect(reachOf(parent, ctx)).toBeLessThanOrEqual(16);
    child.age = 5 * 80;
    expect(childRadius(child, ctxConfig.motivation)).toBe(6);
  });

  it('anchors an adult at a complete, unruined same-band home', () => {
    const world = new World(DEFAULT_CONFIG.world, new RNG('anchor-house'));
    const adult = new Person('Adult', 64, 64, 0, new RNG('adult'));
    adult.age = 20 * 80;
    const household = new Household('House', adult.id, 0, 0);
    adult.householdId = household.id;
    const home = new Building(BUILDINGS.mud_hut!, 64, 64, 0);
    home.complete = true;
    household.homeBuildingId = home.id;
    const ctx = { world, peopleById: new Map([[adult.id, adult]]), buildingsById: new Map([[home.id, home]]),
      householdsById: new Map([[household.id, household]]), homes: new Map([[0, { x: 10, y: 10 }]]), motivation: makeConfig().motivation };
    expect(anchorOf(adult, ctx)).toMatchObject({ kind: 'home', x: home.centerX, y: home.centerY });
    home.durability = 0;
    expect(anchorOf(adult, ctx)?.kind).toBe('camp');
  });
});
