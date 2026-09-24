/**
 * Why a band does not fall on its own — the owner's note of 2026-09-24.
 *
 * Before `Restraint.ts`, `century` aimed 534 of 1018 chosen blows at a child
 * and 277 at the attacker's own band. These pin the three mechanisms that
 * ended it: how bystanders judge their own, the tail of the temperament curve,
 * and a child being corrected rather than made an enemy of.
 */
import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../core/SpatialHash.ts';
import { RNG } from '../core/RNG.ts';
import { Person } from '../entities/Person.ts';
import { RelationshipGraph } from '../social/Relationships.ts';
import { SocialSystem } from '../social/SocialSystem.ts';
import { BandRelations } from '../social/BandRelations.ts';
import {
  tailLicence, ownPeopleLicence, conscienceBrake, mischiefChild, IN_GROUP_TAIL, CORRECTION_STEP,
  strangerBrake,
} from '../social/Restraint.ts';
import { DEFAULT_NORMS, type Norms } from '../social/Events.ts';

const SIGHT = 12;

function world(list: Person[]) {
  const relationships = new RelationshipGraph();
  const social = new SocialSystem(relationships, new Map(), new BandRelations());
  const hash = new SpatialHash<Person>(8);
  hash.rebuild(list);
  return { social, hash, relationships };
}

function person(name: string, x: number, band: number, years = 30): Person {
  const p = new Person(name, x, 50, band, new RNG('r-' + name));
  p.age = years * p.daysPerYear;
  return p;
}

describe('judging one of our own', () => {
  it('weighs a bandmate robbing a stranger far less than a stranger robbing a bandmate', () => {
    const ours = person('Ann', 50, 0);
    const theirs = person('Bo', 51, 1);
    const watcher = person('Cai', 53, 0);
    const { social, hash, relationships } = world([ours, theirs, watcher]);
    social.emit('theft', ours, theirs, 1, 1000, hash, SIGHT);
    const ofOurs = relationships.peek(watcher.id, ours.id)!.deeds;

    const ours2 = person('Dan', 50, 0);
    const theirs2 = person('Eve', 51, 1);
    const watcher2 = person('Fyn', 53, 0);
    const w2 = world([ours2, theirs2, watcher2]);
    w2.social.emit('theft', theirs2, ours2, 1, 1000, w2.hash, SIGHT);
    const ofTheirs = w2.relationships.peek(watcher2.id, theirs2.id)!.deeds;

    expect(ofOurs).toBeLessThan(0);
    expect(Math.abs(ofOurs)).toBeLessThan(Math.abs(ofTheirs) * 0.3);
  });

  it('does not hold it against a bandmate at all when the stranger had it coming', () => {
    const ours = person('Ann', 50, 0);
    const thief = person('Bo', 51, 1);
    const watcher = person('Cai', 53, 0);
    const { social, hash, relationships } = world([ours, thief, watcher]);
    // The stranger robs one of us, in sight of the watcher...
    social.emit('theft', thief, ours, 1, 1000, hash, SIGHT);
    const before = relationships.peek(watcher.id, ours.id)?.deeds ?? 0;
    // ...and is struck for it.
    social.emit('assault', ours, thief, 1, 1010, hash, SIGHT);
    expect(relationships.peek(watcher.id, ours.id)?.deeds ?? 0).toBe(before);
  });

  it('barely holds a child’s mischief against them, and marks it for correcting', () => {
    const child = person('Ann', 50, 0, 8);
    const victim = person('Bo', 51, 0);
    const watcher = person('Cai', 53, 0);
    const { social, hash, relationships } = world([child, victim, watcher]);
    social.emit('theft', child, victim, 1, 1000, hash, SIGHT);
    expect(relationships.opinion(watcher.id, child.id)).toBeGreaterThan(-5);
    expect(mischiefChild(watcher, 1001)).toBe(child.id);
    expect(mischiefChild(victim, 1001)).toBe(child.id);
  });

  it('never marks a child of another people for correcting', () => {
    const child = person('Ann', 50, 1, 8);
    const watcher = person('Cai', 53, 0);
    const victim = person('Bo', 51, 0);
    const { social, hash } = world([child, victim, watcher]);
    social.emit('theft', child, victim, 1, 1000, hash, SIGHT);
    expect(mischiefChild(watcher, 1001)).toBeNull();
  });
});

describe('the tail of the curve', () => {
  it('gives nobody below the tail any licence against their own, and a whole one well into it', () => {
    expect(tailLicence(0.5)).toBe(0);
    expect(tailLicence(IN_GROUP_TAIL)).toBe(0);
    expect(tailLicence(0.97)).toBe(1);
  });

  it('lets desperation override temperament, and upbringing brake both', () => {
    const p = person('Ann', 50, 0);
    p.traits.greed = 0.5;
    expect(ownPeopleLicence(p, p.traits.greed, 0.4)).toBe(0);
    expect(ownPeopleLicence(p, p.traits.greed, 1)).toBe(1);
    p.conscience = CORRECTION_STEP * 2;
    expect(ownPeopleLicence(p, p.traits.greed, 1)).toBeCloseTo(conscienceBrake(p));
    expect(conscienceBrake(p)).toBeLessThan(0.1);
  });
});

describe('what a people teaches its children about strangers — M12 phase 2d', () => {
  function cultured(regard: number, norms: Norms = { ...DEFAULT_NORMS }, list: Person[] = []) {
    const relationships = new RelationshipGraph();
    const social = new SocialSystem(relationships, new Map([[0, norms], [1, norms]]), new BandRelations(),
      new Map([[0, regard], [1, 0.5]]));
    const hash = new SpatialHash<Person>(8);
    hash.rebuild(list);
    return { social, hash, relationships };
  }

  function scene(regard: number, tradition = 0.5) {
    const child = person('Ann', 50, 0, 8);
    const stranger = person('Bo', 51, 1);
    const watcher = person('Cai', 53, 0);
    watcher.traits.tradition = tradition;
    const w = cultured(regard, undefined, [child, stranger, watcher]);
    return { child, stranger, watcher, ...w };
  }

  it('is corrected for robbing a stranger among a people that minds it', () => {
    const { child, stranger, watcher, social, hash } = scene(0.75);
    social.emit('theft', child, stranger, 1, 1000, hash, SIGHT);
    expect(mischiefChild(watcher, 1001)).toBe(child.id);
    expect(watcher.mischiefAbroad).toBe(true);
  });

  it('is let be for it among a people that thinks a stranger fair game', () => {
    const { child, stranger, watcher, social, hash } = scene(0.2);
    social.emit('theft', child, stranger, 1, 1000, hash, SIGHT);
    expect(mischiefChild(watcher, 1001)).toBeNull();
  });

  it('is corrected for it even there by the most traditional', () => {
    const { child, stranger, watcher, social, hash } = scene(0.35, 1);
    social.emit('theft', child, stranger, 1, 1000, hash, SIGHT);
    expect(mischiefChild(watcher, 1001)).toBe(child.id);
  });

  it('is always corrected for robbing one of their own, however the people think', () => {
    const child = person('Ann', 50, 0, 8);
    const victim = person('Bo', 51, 0);
    const watcher = person('Cai', 53, 0);
    watcher.traits.tradition = 0;
    const lax: Norms = { ...DEFAULT_NORMS, theft: 0.3 };
    const { social, hash } = cultured(0.05, lax, [child, victim, watcher]);
    social.emit('theft', child, victim, 1, 1000, hash, SIGHT);
    expect(mischiefChild(watcher, 1001)).toBe(child.id);
    expect(watcher.mischiefAbroad).toBe(false);
  });

  it('judges a grown bandmate for wronging a stranger as its regard says', () => {
    const judged = (regard: number) => {
      const ours = person('Ann', 50, 0);
      const theirs = person('Bo', 51, 1);
      const watcher = person('Cai', 53, 0);
      const { social, hash, relationships } = cultured(regard, undefined, [ours, theirs, watcher]);
      social.emit('theft', ours, theirs, 1, 1000, hash, SIGHT);
      return relationships.peek(watcher.id, ours.id)!.deeds;
    };
    expect(judged(0.8)).toBeLessThan(judged(0.2));
  });

  it('raises adults who prey less on strangers, and a child who holds back from anybody', () => {
    const raised = person('Ann', 50, 0);
    expect(strangerBrake(raised)).toBe(1);
    raised.conscienceAbroad = 1;
    expect(strangerBrake(raised)).toBeCloseTo(0.4);
    // The child's brake against strangers is the whole one.
    expect(conscienceBrake(raised, true)).toBeLessThan(0.1);
    // And their own people's is untouched by it: that is the other conscience.
    expect(conscienceBrake(raised)).toBe(1);
  });
});
