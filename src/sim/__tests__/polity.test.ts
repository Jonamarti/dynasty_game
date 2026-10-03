/**
 * M15 block IX: the State, as the band builds it. See `social/Polity.ts`.
 * One `describe` per node, in the order the nodes were added.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import type { Person } from '../entities/Person.ts';
import {
  CONTRIBUTION_RENOWN, SOLDIER_UPKEEP, civilisationLacks, TAX_RATES, heirOf, mayKeepSoldier, reignsForLife, TEMPLE_PULL, dueFrom, keepsAccounts, npcTaxRate, recordContribution, taxResentment,
  templeOf, templePull,
} from '../social/Polity.ts';
import { Household } from '../entities/Household.ts';
import { DEBT_DAYS, incur, pruneDebts } from '../social/Amends.ts';
import { FEAST_MIN_FOOD, feastVenue, mayHostFeast } from '../social/Feast.ts';
import { warParty } from '../social/Factions.ts';
import { answerWeight, judgeOwn, judgesByLaw, verdictGrudge } from '../social/Justice.ts';

const SMALL = {
  seed: 'polity-test',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6, startingTech: ['pottery', 'division_of_labour', 'chiefdom'] },
};

function granaryFor(sim: Simulation, bandId: number, x: number, y: number, def = BUILDINGS.granary!): Building {
  const building = new Building(def, x, y, bandId);
  building.complete = true;
  sim.buildings.push(building);
  sim.buildingsById.set(building.id, building);
  return building;
}

function learn(person: Person, tech: string): void {
  person.knownTech.add(tech as never);
}

describe('redistribution: the temple', () => {
  it('is the chief\'s granary only once the chief understands redistribution', () => {
    const sim = new Simulation(SMALL);
    const chief = sim.livingPeople()[0]!;
    const granary = granaryFor(sim, chief.bandId, 4, 4);
    granaryFor(sim, chief.bandId, 30, 30, BUILDINGS.storage_pit!);

    expect(templeOf(chief, chief.bandId, sim.buildings)).toBeNull();
    learn(chief, 'redistribution');
    expect(templeOf(chief, chief.bandId, sim.buildings)).toBe(granary);
    // Somebody else's band, or nobody: no temple.
    expect(templeOf(chief, chief.bandId + 1, sim.buildings)).toBeNull();
    expect(templeOf(null, chief.bandId, sim.buildings)).toBeNull();
  });

  it('is not a ruin or a building site', () => {
    const sim = new Simulation(SMALL);
    const chief = sim.livingPeople()[0]!;
    learn(chief, 'redistribution');
    const granary = granaryFor(sim, chief.bandId, 4, 4);
    granary.complete = false;
    expect(templeOf(chief, chief.bandId, sim.buildings)).toBeNull();
  });

  it('draws the loyal harder than the disaffected', () => {
    const sim = new Simulation(SMALL);
    const [chief, loyal, sour] = sim.livingPeople();
    learn(chief!, 'redistribution');
    loyal!.traits.loyalty = 0.9;
    sour!.traits.loyalty = 0.1;
    expect(templePull(loyal!, chief!)).toBeGreaterThan(templePull(sour!, chief!));
    expect(templePull(loyal!, chief!)).toBeLessThanOrEqual(TEMPLE_PULL * 1.25);
  });

  it('lets a chief who has worked it out feast the band from the temple, beer or no beer', () => {
    const sim = new Simulation(SMALL);
    const [chief, other] = sim.livingPeople();
    const temple = granaryFor(sim, chief!.bandId, 4, 4);
    temple.store.add('bread', FEAST_MIN_FOOD);

    expect(mayHostFeast(chief!, true, temple)).toBe(false);
    learn(chief!, 'redistribution');
    expect(mayHostFeast(chief!, true, temple)).toBe(true);
    expect(feastVenue(chief!, null, true, sim.buildings, sim.buildingsById, sim.time.day, temple)).toBe(temple);
    // The office, not the knowledge: a non-chief who knows it has no temple to give from.
    learn(other!, 'redistribution');
    expect(mayHostFeast(other!, false, temple)).toBe(false);
  });
});

describe('accounting: the ledger', () => {
  it('credits a gift to the temple only when the chief keeps accounts', () => {
    const sim = new Simulation(SMALL);
    const [chief, giver] = sim.livingPeople();
    const household = new Household('Giver', giver!.id, giver!.bandId, 0);

    expect(recordContribution(household, 12, chief)).toBe(false);
    expect(household.contributed).toBe(0);
    expect(keepsAccounts(chief)).toBe(false);

    learn(chief!, 'accounting');
    expect(keepsAccounts(chief)).toBe(true);
    expect(recordContribution(household, 12, chief)).toBe(true);
    expect(household.contributed).toBe(12);
    expect(household.renown).toBeCloseTo(12 * CONTRIBUTION_RENOWN);
  });

  it('keeps a written debt past the year, and forgets an unwritten one', () => {
    const sim = new Simulation(SMALL);
    const [thief, written, unwritten] = sim.livingPeople();
    incur(thief!, written!, 'theft', 3, 0);
    incur(thief!, unwritten!, 'theft', 3, 0);
    thief!.debts.find(d => d.toId === written!.id)!.recorded = true;
    written!.grievances.find(g => g.againstId === thief!.id)!.recorded = true;

    const later = (DEBT_DAYS + 1) * 240;
    pruneDebts(thief!, later, 240, () => true);
    pruneDebts(written!, later, 240, () => true);
    pruneDebts(unwritten!, later, 240, () => true);
    expect(thief!.debts.map(d => d.toId)).toEqual([written!.id]);
    expect(written!.grievances).toHaveLength(1);
    expect(unwritten!.grievances).toHaveLength(0);
    // Still owed to the living only.
    pruneDebts(thief!, later, 240, () => false);
    expect(thief!.debts).toHaveLength(0);
  });
});

describe('taxation: the levy', () => {
  it('owes a share of what is at home, less what was given freely when it is written down', () => {
    expect(dueFrom(40, 0.1, 0, false)).toBe(4);
    expect(dueFrom(40, 0, 0, false)).toBe(0);
    // Given three since the last levy: credited only if the chief keeps accounts.
    expect(dueFrom(40, 0.1, 3, true)).toBe(1);
    expect(dueFrom(40, 0.1, 3, false)).toBe(4);
    expect(dueFrom(40, 0.1, 30, true)).toBe(0);
  });

  it('is set by a chief from their own greed, on the steps a custom can name', () => {
    const sim = new Simulation(SMALL);
    const chief = sim.livingPeople()[0]!;
    chief.traits.greed = 0;
    expect(npcTaxRate(chief)).toBe(0);
    chief.traits.greed = 1;
    expect(npcTaxRate(chief)).toBe(TAX_RATES[TAX_RATES.length - 1]);
    chief.traits.greed = 0.5;
    expect(TAX_RATES).toContain(npcTaxRate(chief));
  });

  it('is resented more the heavier it is, and more by the greedy', () => {
    const sim = new Simulation(SMALL);
    const [a, b] = sim.livingPeople();
    a!.traits.greed = 0.9;
    b!.traits.greed = 0.1;
    expect(taxResentment(0.3, a!)).toBeGreaterThan(taxResentment(0.05, a!));
    expect(taxResentment(0.3, a!)).toBeGreaterThan(taxResentment(0.3, b!));
    expect(taxResentment(0, a!)).toBe(0);
  });

  it('can be set by the player only as chief and only by one who knows how', () => {
    const sim = new Simulation({ ...SMALL, population: { ...SMALL.population, startingTech: [...SMALL.population.startingTech] } });
    for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
    const band = sim.bands.find(b => !b.outcast)!;
    const chief = sim.peopleById.get(band.chiefId!)!;
    const other = sim.livingPeople().find(p => p.id !== chief.id && p.bandId === band.id)!;

    expect(sim.setTaxRate(chief, 0.1)).toBe(false);
    expect(sim.lastRefusal).toMatch(/knows how to levy/);
    learn(chief, 'taxation');
    expect(sim.setTaxRate(other, 0.1)).toBe(false);
    expect(sim.lastRefusal).toMatch(/only the chief/);
    expect(sim.setTaxRate(chief, 0.1)).toBe(true);
    expect(band.taxRate).toBe(0.1);
    expect(sim.setTaxRate(chief, 0.15)).toBe(false);
    expect(sim.setTaxRate(chief, 0)).toBe(true);
    expect(band.taxRate).toBe(0);
  });
});

describe('law_code: the same wrong, the same verdict', () => {
  it('stops a chief dismissing a case against a favourite', () => {
    const sim = new Simulation(SMALL);
    const [chief, plaintiff, favourite] = sim.livingPeople();
    // Somebody the chief thinks the world of, against somebody they cannot stand.
    for (let i = 0; i < 10; i++) {
      sim.relationships.addDeed(chief!.id, favourite!.id, 20, 0);
      sim.relationships.addDeed(chief!.id, plaintiff!.id, -20, 0);
    }
    expect(judgeOwn(chief!, plaintiff!, favourite!, sim.relationships, true)).toBe('dismiss');
    learn(chief!, 'law_code');
    expect(judgesByLaw(chief!)).toBe(true);
    expect(judgeOwn(chief!, plaintiff!, favourite!, sim.relationships, true)).toBe('order');
    expect(judgeOwn(chief!, plaintiff!, favourite!, sim.relationships, false)).toBe('shame');
  });

  it('stops a chief shielding their own from another people\'s just demand', () => {
    const sim = new Simulation(SMALL);
    const [chief, accused] = sim.livingPeople();
    for (let i = 0; i < 10; i++) sim.relationships.addDeed(chief!.id, accused!.id, 20, 0);
    const before = answerWeight(chief!, accused!, 0.5, 0, sim.relationships);
    learn(chief!, 'law_code');
    expect(answerWeight(chief!, accused!, 0.5, 0, sim.relationships)).toBeGreaterThan(before);
  });

  it('leaves less of a grudge for a verdict that was the law\'s', () => {
    const sim = new Simulation(SMALL);
    const chief = sim.livingPeople()[0]!;
    const without = verdictGrudge(chief);
    learn(chief, 'law_code');
    expect(verdictGrudge(chief)).toBeLessThan(without);
    expect(verdictGrudge(chief)).toBeGreaterThan(0);
  });
});

describe('standing_army: the soldier', () => {
  it('is kept only by a chief who knows how, and only as many as the temple feeds', () => {
    const sim = new Simulation(SMALL);
    const chief = sim.livingPeople()[0]!;
    expect(mayKeepSoldier(chief, 100, 0, 12)).toBe(false);
    learn(chief, 'standing_army');
    expect(mayKeepSoldier(chief, 100, 0, 12)).toBe(true);
    // One in six members at most.
    expect(mayKeepSoldier(chief, 100, 2, 12)).toBe(false);
    // And the temple has to hold their bread.
    expect(mayKeepSoldier(chief, SOLDIER_UPKEEP - 1, 0, 12)).toBe(false);
  });

  it('goes to war without the nerve or the friendship a volunteer needs', () => {
    const sim = new Simulation(SMALL);
    const [leader, soldier, farmer] = sim.livingPeople();
    leader!.traits.aggression = 0.9;
    leader!.skills.fight = 100;
    for (const p of [soldier!, farmer!]) {
      p.traits.aggression = 0.1;
      p.skills.fight = 0;
    }
    soldier!.job = 'soldier';
    const party = warParty(leader!, sim.livingPeople(), sim.relationships, 4);
    expect(party.map(p => p.id)).toContain(soldier!.id);
    expect(party.map(p => p.id)).not.toContain(farmer!.id);
    expect(party[0]!.id).toBe(soldier!.id);
  });

  it('cannot be made by a leader who has never had the idea, and says so', () => {
    const sim = new Simulation(SMALL);
    const [leader, other] = sim.livingPeople();
    learn(leader!, 'division_of_labour');
    expect(sim.assignJob(leader!, other!, 'soldier')).toBe(false);
    expect(sim.lastRefusal).toMatch(/never had the idea of keeping men whose work is fighting/);
    learn(leader!, 'standing_army');
    expect(sim.assignJob(leader!, other!, 'soldier')).toBe(false);
    expect(sim.lastRefusal).toMatch(/no temple/);
  });
});

describe('kingship: the crown', () => {
  it('passes to the head of the late king\'s house, or else the eldest child', () => {
    const sim = new Simulation(SMALL);
    const [king, head, elder, younger] = sim.livingPeople();
    for (const p of [head!, elder!, younger!]) p.bandId = king!.bandId;
    const household = new Household('Royal', king!.id, king!.bandId, 0);
    const households = new Map([[household.id, household]]);
    king!.householdId = household.id;
    king!.childIds = [elder!.id, younger!.id];
    // Grown, both, so neither is passed over for a child.
    for (const p of [head!, elder!, younger!]) p.age = Math.max(p.age, 4000);
    elder!.age = younger!.age + 100;
    const members = sim.livingPeople();

    // Still headed by the king: the eldest child.
    expect(heirOf(king!, members, households)?.id).toBe(elder!.id);
    // Somebody else heads the house now: them.
    household.headId = head!.id;
    expect(heirOf(king!, members, households)?.id).toBe(head!.id);
  });

  it('keeps the office past the term, and hands it on at the king\'s death', () => {
    const sim = new Simulation(SMALL);
    for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
    const band = sim.bands.find(b => !b.outcast)!;
    const king = sim.peopleById.get(band.chiefId!)!;
    learn(king, 'kingship');
    expect(reignsForLife(king)).toBe(true);
    const heir = heirOf(king, sim.livingPeople().filter(p => p.bandId === band.id), sim.householdsById);
    // Far past any ordinary term, still king.
    band.chiefSince = sim.time.day - 200;
    for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
    expect(band.chiefId).toBe(king.id);

    king.die('test');
    for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
    if (heir) {
      expect(band.chiefId).toBe(heir.id);
      expect(heir.chronicle.some(line => line.text.includes('inherited the rule'))).toBe(true);
    } else {
      expect(band.chiefId).not.toBe(king.id);
    }
  });
});

describe('civilisation: derived, never stored', () => {
  it('is the six things held between the adults, and a king', () => {
    const sim = new Simulation(SMALL);
    const [chief, scribe] = sim.livingPeople();
    expect(civilisationLacks([chief!, scribe!], chief)).toEqual(
      expect.arrayContaining(['farming', 'writing', 'taxation', 'standing_army', 'kingship']));
    for (const tech of ['farming', 'division_of_labour', 'taxation', 'standing_army']) learn(chief!, tech);
    learn(scribe!, 'writing');
    // Everything but the crown, and the crown has to be on the chief's head.
    learn(scribe!, 'kingship');
    expect(civilisationLacks([chief!, scribe!], chief)).toEqual(['kingship']);
    learn(chief!, 'kingship');
    expect(civilisationLacks([chief!, scribe!], chief)).toEqual([]);
    // And it lapses with the knowledge: the scribe gone, nobody writes.
    expect(civilisationLacks([chief!], chief)).toEqual(['writing']);
  });
});

describe('war and peace: only a government declares them', () => {
  const TWO = { ...SMALL, population: { bands: 2, peoplePerBand: 5, startingTech: ['pottery', 'division_of_labour', 'chiefdom'] } };

  function twoChiefs(sim: Simulation): [Person, Person] {
    for (let i = 0; i <= sim.config.time.ticksPerDay; i++) sim.step();
    const [a, b] = sim.bands.filter(band => !band.outcast);
    return [sim.peopleById.get(a!.chiefId!)!, sim.peopleById.get(b!.chiefId!)!];
  }

  it('is refused to a chief without a law or a crown, and to anybody but the chief', () => {
    const sim = new Simulation(TWO);
    const [ours, theirs] = twoChiefs(sim);
    expect(sim.declare(ours, theirs.bandId, 'war')).toBe(false);
    expect(sim.lastRefusal).toMatch(/law or a crown/);
    const follower = sim.livingPeople().find(p => p.bandId === ours.bandId && p.id !== ours.id)!;
    learn(follower, 'law_code');
    expect(sim.declare(follower, theirs.bandId, 'war')).toBe(false);
    expect(sim.lastRefusal).toMatch(/only the chief/);
  });

  it('is declared, refused by a warlike government, and kept', () => {
    const sim = new Simulation(TWO);
    const [ours, theirs] = twoChiefs(sim);
    learn(ours, 'law_code');
    expect(sim.declare(ours, theirs.bandId, 'war')).toBe(true);
    expect(sim.bandRelations.stance(ours.bandId, theirs.bandId)).toBe('war');
    // A government that wants the war goes on with it while the grudge is fresh.
    learn(theirs, 'kingship');
    theirs.traits.aggression = 0.9;
    sim.bandRelations.add(ours.bandId, theirs.bandId, -60);
    expect(sim.declare(ours, theirs.bandId, 'peace')).toBe(false);
    expect(sim.lastRefusal).toMatch(/will not hear of peace/);
    theirs.traits.aggression = 0.2;
    expect(sim.declare(ours, theirs.bandId, 'peace')).toBe(true);
    expect(sim.bandRelations.stance(ours.bandId, theirs.bandId)).toBe('peace');
  });

  it('is broken by a wrong done across it, and those who saw it blame the breaker\'s chief', () => {
    const sim = new Simulation(TWO);
    const [ours, theirs] = twoChiefs(sim);
    learn(ours, 'law_code');
    learn(theirs, 'law_code');
    expect(sim.declare(ours, theirs.bandId, 'peace')).toBe(true);
    const culprit = sim.livingPeople().find(p => p.bandId === ours.bandId && p.id !== ours.id)!;
    const victim = sim.livingPeople().find(p => p.bandId === theirs.bandId && p.id !== theirs.id)!;
    const witness = sim.livingPeople().find(p => p.bandId === theirs.bandId && p.id !== victim.id)!;
    for (const p of [culprit, victim, witness]) { p.x = 20; p.y = 20; }
    sim.peopleHash.rebuild(sim.people);
    const before = sim.relationships.opinion(witness.id, ours.id);
    const standing = sim.bandRelations.standing(ours.bandId, theirs.bandId);

    sim.social.emit('assault', culprit, victim, 0.5, sim.time.tick, sim.peopleHash, sim.config.sightRadius);

    expect(sim.bandRelations.stance(ours.bandId, theirs.bandId)).toBeNull();
    expect(sim.bandRelations.standing(ours.bandId, theirs.bandId)).toBeLessThan(standing);
    expect(sim.relationships.opinion(witness.id, ours.id)).toBeLessThan(before);
  });

  it('remembers who pays whom', () => {
    const sim = new Simulation(TWO);
    sim.bandRelations.setStance(3, 7, 'tributary', 0, 7);
    expect(sim.bandRelations.overlordOf(3)).toBe(7);
    expect(sim.bandRelations.overlordOf(7)).toBeNull();
    expect(sim.bandRelations.tributariesOf(7)).toEqual([3]);
    expect(sim.bandRelations.touching(3)).toEqual([7]);
  });
});
