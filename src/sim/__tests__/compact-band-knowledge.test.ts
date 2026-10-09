import { describe, expect, it } from 'vitest';
import { RNG } from '../core/RNG.ts';
import { Person, TRAITS } from '../entities/Person.ts';
import { TECH, type Tech } from '../knowledge/Tech.ts';
import { DEFAULT_NORMS } from '../social/Events.ts';
import { TechSet, closeUnderRequires, emptyCohorts, type People } from '../world/PeopleSim.ts';
import { regionMaterials, PARTIAL_START, type KnowledgeRegion } from '../world/PeopleKnowledge.ts';
import {
  advanceCompactBandKnowledge, createCompactBandKnowledgeState,
  fromCompactBandKnowledgeRecord, toCompactBandKnowledgeRecord,
  type CompactBandKnowledgeInput,
} from '../compact/CompactBandKnowledge.ts';

const REGION: KnowledgeRegion = { materials: regionMaterials(), climate: { temperature: 0.5, wetness: 0.5 } };
const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
const DAYS_PER_YEAR = 360;
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function member(name: string, bandId: number, initial: readonly Tech[] = []): Person {
  const person = new Person(name, 0, 0, bandId, new RNG(`compact-knowledge-member|${name}`), DAYS_PER_YEAR);
  person.age = 25 * DAYS_PER_YEAR;
  person.knownTech = new Set(closeUnderRequires(initial));
  return person;
}

function externalPeople(id: number, techs: readonly Tech[], population = 32): People {
  const cohorts = emptyCohorts();
  cohorts.male[5] = population;
  return {
    id, comarcas: 1, cohorts, techs: new TechSet(closeUnderRequires(techs)),
    culture: {
      norms: { ...DEFAULT_NORMS }, strangerRegard: 0.5,
      traitMeans: Object.fromEntries(TRAITS.map(trait => [trait, 0])) as People['culture']['traitMeans'],
    },
    surplus: 0, drawn: 0, away: 0, rng: new RNG(`external|${id}`), nextDue: 0,
  };
}

function callInput(season: number, members: readonly Person[], overrides: Partial<CompactBandKnowledgeInput> = {}): CompactBandKnowledgeInput {
  return {
    season, seasonOfYear: SEASONS[season % 4]!, members, region: REGION,
    mu: 0, partial: PARTIAL_START, kappa: 0,
    ...overrides,
  };
}

describe('compact band knowledge adapter', () => {
  it('assigns every new technique to one canonical living practitioner, never to the whole band', () => {
    const bandId = 71;
    const first = member('first', bandId), second = member('second', bandId);
    const result = advanceCompactBandKnowledge(createCompactBandKnowledgeState('compact-knowledge', bandId),
      callInput(0, [second, first], { kappa: 1_000_000 }));

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every(event => event.personId === first.id)).toBe(true);
    expect(result.events.every(event => first.knownTech.has(event.tech))).toBe(true);
    expect(second.knownTech.size).toBe(0);
    expect(result.events.every(event => TECH[event.tech].requires.every(required => first.knownTech.has(required)))).toBe(true);
  });

  it('reuses PeopleKnowledge prerequisites and cannot climb a technology chain in one season', () => {
    const bandId = 72;
    const practitioner = member('chain', bandId);
    let state = createCompactBandKnowledgeState('compact-chain', bandId);
    const events: ReturnType<typeof advanceCompactBandKnowledge>['events'][number][] = [];
    for (let season = 0; season < 40 && !practitioner.knownTech.has('farming'); season++) {
      const result = advanceCompactBandKnowledge(state, callInput(season, [practitioner], { kappa: 1_000_000 }));
      state = result.state;
      events.push(...result.events);
    }
    expect(practitioner.knownTech.has('farming')).toBe(true);
    const learnedAt = new Map(events.map(event => [event.tech, event.season]));
    for (const event of events) for (const required of TECH[event.tech].requires) {
      expect(learnedAt.get(required) ?? -1).toBeLessThan(event.season);
    }
    expect(events.every(event => event.personId === practitioner.id)).toBe(true);
  });

  it('refuses an existing individual technology record that skips its prerequisites', () => {
    const bandId = 721;
    const person = member('invalid-holder', bandId);
    person.knownTech.add('farming');
    expect(() => advanceCompactBandKnowledge(createCompactBandKnowledgeState('bad-member-tech', bandId),
      callInput(0, [person], { kappa: 0 }))).toThrow(/individual prerequisites/);
  });
  it('rejects a repeated or backward seasonal update without changing the member or state', () => {
    const bandId = 73;
    const person = member('once', bandId);
    const first = advanceCompactBandKnowledge(createCompactBandKnowledgeState('season-once', bandId),
      callInput(4, [person], { kappa: 1_000_000 }));
    const before = wire({ knownTech: [...person.knownTech], state: toCompactBandKnowledgeRecord(first.state) });
    expect(() => advanceCompactBandKnowledge(first.state, callInput(4, [person], { kappa: 1_000_000 }))).toThrow(/already processed/);
    expect(() => advanceCompactBandKnowledge(first.state, callInput(3, [person], { kappa: 1_000_000 }))).toThrow(/already processed/);
    expect(wire({ knownTech: [...person.knownTech], state: toCompactBandKnowledgeRecord(first.state) })).toEqual(before);
  });

  it('learns only from explicitly supplied contacts and still awards the result to one practitioner', () => {
    const bandId = 74;
    const first = member('learner-a', bandId), second = member('learner-b', bandId);
    const source = externalPeople(9001, ['firemaking']);
    const noContact = advanceCompactBandKnowledge(createCompactBandKnowledgeState('no-hidden-neighbours', bandId),
      callInput(0, [first, second], { mu: 100, partial: { ...PARTIAL_START, rate: 0 }, kappa: 0 }));
    expect(noContact.events).toEqual([]);

    const withContact = advanceCompactBandKnowledge(createCompactBandKnowledgeState('explicit-neighbour', bandId),
      callInput(0, [first, second], {
        mu: 100, partial: { ...PARTIAL_START, rate: 0 }, kappa: 0,
        contacts: [{ contact: 1, people: source, region: REGION }],
      }));
    expect(withContact.events.some(event => event.tech === 'firemaking' && event.how === 'learned')).toBe(true);
    expect(withContact.events.filter(event => event.tech === 'firemaking')).toHaveLength(1);
    const awarded = withContact.events.find(event => event.tech === 'firemaking')!;
    expect([first.id, second.id]).toContain(awarded.personId);
    expect([first, second].find(person => person.id === awarded.personId)!.knownTech.has('firemaking')).toBe(true);
  });

  it('does not grant a technique when its prerequisites exist only across the band union', () => {
    let split: { target: Tech; a: Tech[]; b: Tech[] } | undefined;
    for (const target of Object.keys(TECH) as Tech[]) {
      const required = TECH[target].requires;
      if (required.length < 2) continue;
      for (let mask = 1; mask < (1 << required.length) - 1 && !split; mask++) {
        const leftRoots = required.filter((_, index) => (mask & (1 << index)) !== 0);
        const rightRoots = required.filter((_, index) => (mask & (1 << index)) === 0);
        const a = closeUnderRequires(leftRoots), b = closeUnderRequires(rightRoots);
        const all = new Set([...a, ...b]);
        if (required.every(tech => all.has(tech)) && !required.every(tech => a.includes(tech)) &&
            !required.every(tech => b.includes(tech))) split = { target, a, b };
      }
      if (split) break;
    }
    expect(split).toBeDefined();
    const bandId = 770;
    const first = member('split-a', bandId, split!.a);
    const second = member('split-b', bandId, split!.b);
    const source = externalPeople(9003, [split!.target]);
    const result = advanceCompactBandKnowledge(createCompactBandKnowledgeState('split-prerequisites', bandId),
      callInput(0, [first, second], {
        mu: 1_000_000, partial: { ...PARTIAL_START, rate: 0 }, kappa: 0,
        contacts: [{ contact: 1, people: source, region: REGION }],
      }));
    expect(result.events.some(event => event.tech === split!.target)).toBe(false);
    expect(first.knownTech.has(split!.target)).toBe(false);
    expect(second.knownTech.has(split!.target)).toBe(false);
  });
  it('does not keep a dead member\'s technique in the band union', () => {
    const bandId = 75;
    const deadHolder = member('dead-holder', bandId, ['firemaking']);
    deadHolder.alive = false;
    const living = member('living', bandId);
    const result = advanceCompactBandKnowledge(createCompactBandKnowledgeState('last-holder', bandId),
      callInput(0, [deadHolder, living], { mu: 0, kappa: 0 }));
    expect(result.events).toEqual([]);
    expect(living.knownTech.has('firemaking')).toBe(false);
  });

  it('preserves its derived stream and pending partial-learning ledger through strict JSON records', () => {
    const bandId = 76;
    const person = member('ledger-person', bandId);
    const source = externalPeople(9002, ['firemaking']);
    const first = advanceCompactBandKnowledge(createCompactBandKnowledgeState('ledger-seed', bandId), callInput(0, [person], {
      mu: 0, kappa: 0, partial: { rate: 0.1, hintGain: 4, sufferedWeapon: 3 },
      contacts: [{ contact: 1, people: source, region: REGION }],
    }));
    expect(first.state.ledger.insights.length).toBeGreaterThan(0);
    const restored = fromCompactBandKnowledgeRecord(wire(toCompactBandKnowledgeRecord(first.state)));
    const a = advanceCompactBandKnowledge(first.state, callInput(1, [person], {
      mu: 0.2, kappa: 0, partial: PARTIAL_START,
      contacts: [{ contact: 1, people: source, region: REGION }],
    }));
    const b = advanceCompactBandKnowledge(restored, callInput(1, [person], {
      mu: 0.2, kappa: 0, partial: PARTIAL_START,
      contacts: [{ contact: 1, people: source, region: REGION }],
    }));
    expect(wire(toCompactBandKnowledgeRecord(b.state))).toEqual(wire(toCompactBandKnowledgeRecord(a.state)));
    expect(wire(b.events)).toEqual(wire(a.events));

    const record = toCompactBandKnowledgeRecord(first.state);
    expect(() => fromCompactBandKnowledgeRecord({ ...record, unknown: true })).toThrow();
    expect(() => fromCompactBandKnowledgeRecord({ ...record, version: 2 })).toThrow();
    expect(() => fromCompactBandKnowledgeRecord({ ...record, bandId: -1 })).toThrow();
  });
});



