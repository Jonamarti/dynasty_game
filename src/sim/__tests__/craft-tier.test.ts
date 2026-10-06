/**
 * The recipe node (M15 phase 13b): `TechDef.tier: 'technique' | 'craft'`.
 *
 * A craft is a recipe or a variant of its gate, so it is hit upon quickly
 * (`Config.knowledge.craftDifficulty` multiplies its difficulty) and it is
 * also passed on across the small-talk rungs of a conversation, where a
 * technique is not. Everything else about it - refining, dying with its
 * holder, being shown to a child at the hearth - is the machinery a technique
 * already uses, and the last block here says so by running a craft through it.
 *
 * No node in `TECH` is a craft yet when this commit lands (the first ones
 * arrive in phase 13d), so these tests mark a real node as a craft for the
 * length of one test and put it back. The mechanism is what is under test.
 */
import { describe, it, expect } from 'vitest';
import { Person, DAYS_PER_YEAR } from '../entities/Person.ts';
import { RNG } from '../core/RNG.ts';
import { KnowledgeSystem, countHolders } from '../systems/KnowledgeSystem.ts';
import { SpatialHash } from '../core/SpatialHash.ts';
import { World } from '../core/World.ts';
import { DEFAULT_CONFIG, makeConfig } from '../core/Config.ts';
import { TECH, TECHS, tierOf, difficultyOf, type Tech } from '../knowledge/Tech.ts';
import type { Idea } from '../knowledge/Synthesis.ts';

const config = makeConfig({ seed: 'craft-tier-test' });

/** Marks `tech` a craft while `body` runs, whatever happens inside it. */
function asCraft<T>(tech: Tech, body: () => T): T {
  const def = TECH[tech];
  const before = def.tier;
  def.tier = 'craft';
  try {
    return body();
  } finally {
    if (before === undefined) delete def.tier;
    else def.tier = before;
  }
}

function adult(name: string): Person {
  const person = new Person(name, 4, 4, 0, new RNG('craft-' + name));
  person.age = 30 * DAYS_PER_YEAR;
  return person;
}

function context(rng: RNG): Parameters<KnowledgeSystem['daily']>[1] {
  return {
    rng,
    tick: 1000,
    peopleHash: new SpatialHash<Person>(8),
    world: new World(config.world, new RNG('craft-world')),
    season: 'summer',
    ticksPerDay: config.time.ticksPerDay,
    knowledge: config.knowledge,
    learning: config.learning,
    pileHash: new SpatialHash(8),
    buildingHash: new SpatialHash(8),
    carry: config.carry,
    onInsight: () => {},
  };
}

/** A generous regard, so a lesson that does not land is the dice and not the opinion. */
const FRIENDLY = () => 1;

/** Counts every draw taken from it; every method of `RNG` ends in `nextUint32`. */
class CountingRng extends RNG {
  draws = 0;
  override nextUint32(): number { this.draws++; return super.nextUint32(); }
}

describe('the tier of a node', () => {
  it('is a technique unless the entry says otherwise', () => {
    // 13b adds the field and the helper and declares no craft: the first
    // recipes arrive in 13d, so nothing is declared and inert.
    for (const tech of TECHS) expect(tierOf(tech)).toBe(TECH[tech].tier ?? 'technique');
    expect(tierOf('firemaking')).toBe('technique');
  });

  it('reads craft from the entry', () => {
    asCraft('cordage', () => expect(tierOf('cordage')).toBe('craft'));
    expect(tierOf('cordage')).toBe('technique');
  });

  it('ships a craft difficulty of 0.4 in the default config', () => {
    expect(DEFAULT_CONFIG.knowledge.craftDifficulty).toBe(0.4);
  });
});

describe('the difficulty of a craft', () => {
  it('is multiplied by craftDifficulty, and a technique is left alone', () => {
    const base = TECH.cordage.difficulty;
    expect(difficultyOf('cordage', config.knowledge)).toBe(base);
    asCraft('cordage', () => {
      expect(difficultyOf('cordage', config.knowledge)).toBeCloseTo(base * 0.4, 12);
      expect(difficultyOf('cordage', { ...config.knowledge, craftDifficulty: 0.5 }))
        .toBeCloseTo(base * 0.5, 12);
    });
  });

  it('is what the conception roll divides by', () => {
    // The only place a node's difficulty is read is `tryConceive`; this proves
    // it goes through the helper by catching the probability it rolls against.
    const knowledge = new KnowledgeSystem();
    const roll = (): number => {
      const person = adult('Reeds');
      person.inventory.add('thatch', 3);
      person.noteDid('gather');
      let seen = -1;
      const rng = new RNG('probe');
      rng.chance = (p: number) => { seen = p; return false; };
      const ctx = context(rng);
      // Cordage is the only idea this person can have, and it has one route
      // open, so the chosen route (and its weight) is the same in both runs.
      (knowledge as unknown as { tryConceive(p: Person, c: typeof ctx): void }).tryConceive(person, ctx);
      return seen;
    };

    const asTechnique = roll();
    const asRecipe = asCraft('cordage', roll);
    expect(asTechnique).toBeGreaterThan(0);
    expect(asRecipe / asTechnique).toBeCloseTo(1 / 0.4, 9);
  });
});

describe('small talk teaches a craft and not a technique', () => {
  function teacherWith(tech: Tech): { teacher: Person; pupil: Person } {
    const teacher = adult('Teacher');
    const pupil = adult('Pupil');
    teacher.knownTech.add(tech);
    teacher.skills.teach = 100;
    return { teacher, pupil };
  }

  /** Talks until something lands or the patience of the test runs out. */
  function talk(
    knowledge: KnowledgeSystem, a: Person, b: Person, mode: 'greet' | 'chat' | 'interests' | 'deep',
    rng: RNG, rounds = 40
  ): Tech[] {
    const taught: Tech[] = [];
    for (let i = 0; i < rounds; i++) {
      taught.push(...knowledge.conversationLesson(a, b, mode, 1000, rng, FRIENDLY));
    }
    return taught;
  }

  it('hands over a craft in a chat', () => {
    asCraft('cordage', () => {
      const knowledge = new KnowledgeSystem();
      const { teacher, pupil } = teacherWith('cordage');
      const taught = talk(knowledge, teacher, pupil, 'chat', new RNG('chat-craft'));
      expect(taught).toEqual(['cordage']);
      expect(pupil.knownTech.has('cordage')).toBe(true);
      // Level zero, like every lesson: the plain design, not the refined one.
      expect(pupil.techLevel.get('cordage')).toBe(0);
    });
  });

  it('passes crafts in both directions in the same conversation', () => {
    asCraft('cordage', () => asCraft('plant_lore', () => {
      const knowledge = new KnowledgeSystem();
      const a = adult('Anna');
      const b = adult('Boris');
      a.knownTech.add('cordage');
      b.knownTech.add('plant_lore');
      a.skills.teach = 100;
      b.skills.teach = 100;
      talk(knowledge, a, b, 'interests', new RNG('both-ways'));
      expect(b.knownTech.has('cordage')).toBe(true);
      expect(a.knownTech.has('plant_lore')).toBe(true);
    }));
  });

  it('does not hand over a technique in a chat', () => {
    const knowledge = new KnowledgeSystem();
    const { teacher, pupil } = teacherWith('cordage');
    const taught = talk(knowledge, teacher, pupil, 'chat', new RNG('chat-technique'));
    expect(taught).toEqual([]);
    expect(pupil.knownTech.size).toBe(0);
  });

  it('says nothing in a greeting, craft or not', () => {
    asCraft('cordage', () => {
      const knowledge = new KnowledgeSystem();
      const { teacher, pupil } = teacherWith('cordage');
      expect(talk(knowledge, teacher, pupil, 'greet', new RNG('greet'))).toEqual([]);
      expect(pupil.knownTech.size).toBe(0);
    });
  });

  it('still needs the groundwork: a craft whose gate the pupil lacks is not shown', () => {
    asCraft('hafting', () => {
      const knowledge = new KnowledgeSystem();
      const { teacher, pupil } = teacherWith('hafting');
      expect(talk(knowledge, teacher, pupil, 'deep', new RNG('no-gate'))).toEqual([]);
      pupil.knownTech.add('cordage');
      expect(talk(knowledge, teacher, pupil, 'deep', new RNG('with-gate'))).toEqual(['hafting']);
    });
  });

  it('draws nothing from the stream when there is no craft to teach', () => {
    // The determinism trap: a draw per conversation, craft or not, would move
    // the stream for every world in which no craft exists yet - all of them,
    // until 13d. A technique-only pair must cost exactly zero draws.
    const knowledge = new KnowledgeSystem();
    const { teacher, pupil } = teacherWith('cordage');
    teacher.knownTech.add('firemaking');
    const rng = new CountingRng('no-draws');
    for (const mode of ['greet', 'chat', 'interests', 'deep'] as const) {
      knowledge.conversationLesson(teacher, pupil, mode, 1000, rng, FRIENDLY);
    }
    expect(rng.draws).toBe(0);
  });

  it('draws only for the craft candidates, at most one pick and one roll per lesson', () => {
    asCraft('cordage', () => {
      const knowledge = new KnowledgeSystem();
      const { teacher, pupil } = teacherWith('cordage');
      // A technique the pupil could also have taken must not add a draw.
      teacher.knownTech.add('firemaking');
      const rng = new CountingRng('count');
      knowledge.conversationLesson(teacher, pupil, 'chat', 1000, rng, FRIENDLY);
      expect(rng.draws).toBeGreaterThan(0);
      expect(rng.draws).toBeLessThanOrEqual(2);
    });
  });
});

describe('a craft travels the machinery a technique already has', () => {
  function proven(person: Person, tech: Tech): Idea {
    const idea: Idea = {
      tech, stage: 'proven', insight: 0, story: 'for the test', conceivedTick: 0,
      effort: 0, discussedWith: [], trials: 3, proof: 1, failedTests: 0, tries: 0,
    };
    person.knownTech.add(tech);
    person.techLevel.set(tech, 0);
    person.ideas.push(idea);
    return idea;
  }

  it('is refined by thinking it round again, up to its own ceiling', () => {
    asCraft('cordage', () => {
      const knowledge = new KnowledgeSystem();
      const person = adult('Refiner');
      const idea = proven(person, 'cordage');
      knowledge.advance(person, idea, 1, 1000);
      expect(person.techLevel.get('cordage')).toBe(1);
      knowledge.advance(person, idea, 1, 1000);
      expect(person.techLevel.get('cordage')).toBe(TECH.cordage.maxRefinement);
      // At the ceiling the idea retires, as it does for a technique.
      expect(person.ideas.includes(idea)).toBe(false);
    });
  });

  it('is held only by the living, so it goes with its last holder', () => {
    asCraft('cordage', () => {
      const holder = adult('Holder');
      holder.knownTech.add('cordage');
      expect(countHolders([holder]).get('cordage')).toBe(1);
      holder.alive = false;
      expect(countHolders([holder]).get('cordage')).toBe(0);
    });
  });

  it('is shown to a child at the hearth by the same lesson', () => {
    asCraft('cordage', () => {
      const knowledge = new KnowledgeSystem();
      const teacher = adult('Elder');
      teacher.knownTech.add('cordage');
      teacher.skills.teach = 100;
      const child = new Person('Kid', 4, 4, 0, new RNG('craft-kid'));
      child.age = 6 * DAYS_PER_YEAR;
      expect(child.isChild).toBe(true);
      const rng = new RNG('hearth');
      for (let night = 0; night < 400 && !child.knownTech.has('cordage'); night++) {
        knowledge.hearthLesson([teacher, child], rng, 1000, () => {});
      }
      expect(child.knownTech.has('cordage')).toBe(true);
      expect(child.techLevel.get('cordage')).toBe(0);
    });
  });
});
