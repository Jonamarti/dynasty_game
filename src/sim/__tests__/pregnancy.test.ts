import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { makeConfig } from '../core/Config.ts';
import { itemCapacityFor, capacityFor } from '../core/Carry.ts';
import { Person } from '../entities/Person.ts';
import {
  HEAVY_ACTIONS, complicationChance, gestationDays, handfulsOnly, midwifeQuality, miscarriageRisk,
  pregnancyPace, showing, tooHeavyForHer, trimesterOf,
} from '../entities/Pregnancy.ts';
import { wound } from '../entities/Body.ts';
import { LifeSystem, type LifeContext, type PregnancyCare } from '../systems/LifeSystem.ts';
import { RNG } from '../core/RNG.ts';
import { availableActions, type CatalogContext } from '../ai/ActionCatalog.ts';
import { stopReasonLabel } from '../../render/Floaters.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { knowledgeOfPerson, pregnancyLine } from '../social/Knowledge.ts';

/** A woman `along` of the way through a pregnancy (0 to 1). */
function expecting(along: number): Person {
  const woman = new Person('Mother', 0, 0, 0, new RNG('pregnancy-test'));
  woman.pregnant = true;
  woman.gestationLeft = gestationDays(woman) * (1 - along);
  return woman;
}

/** M15 phase 19a: the three thirds of a pregnancy and what each costs. */
describe('M15 phase 19a: the thirds of a pregnancy', () => {
  it('reads the third off how much of the span is spent', () => {
    expect(trimesterOf(new Person('Not', 0, 0, 0, new RNG('x')))).toBe(0);
    expect(trimesterOf(expecting(0))).toBe(1);
    expect(trimesterOf(expecting(0.32))).toBe(1);
    expect(trimesterOf(expecting(0.34))).toBe(2);
    expect(trimesterOf(expecting(0.66))).toBe(2);
    expect(trimesterOf(expecting(0.68))).toBe(3);
    expect(trimesterOf(expecting(0.99))).toBe(3);
  });

  it('survives a pregnancy set by hand outside the span', () => {
    const odd = expecting(0);
    odd.gestationLeft = 1e6;
    expect(trimesterOf(odd)).toBe(1);
    odd.gestationLeft = -3;
    expect(trimesterOf(odd)).toBe(3);
  });

  it('slows her 0.85 in the second third and 0.7 in the last, and not at all in the first', () => {
    expect(pregnancyPace(expecting(0.1))).toBe(1);
    expect(pregnancyPace(expecting(0.5))).toBe(0.85);
    expect(pregnancyPace(expecting(0.9))).toBe(0.7);
    expect(pregnancyPace(new Person('Not', 0, 0, 0, new RNG('x')))).toBe(1);
  });

  it('applies the pace to the one speed every walk shares', () => {
    const sim = new Simulation({ seed: 'pregnancy-pace', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 6 } });
    const woman = sim.people.find(p => p.sex === 'female' && !p.isChild)!;
    const speedOf = (p: Person) => (sim as unknown as { movementSystem: { speedOf(p: Person): number } })
      .movementSystem.speedOf(p);
    const free = speedOf(woman);
    woman.pregnant = true;
    woman.gestationLeft = gestationDays(woman) * 0.5;
    expect(speedOf(woman)).toBeCloseTo(free * 0.85, 10);
    woman.gestationLeft = gestationDays(woman) * 0.1;
    expect(speedOf(woman)).toBeCloseTo(free * 0.7, 10);
  });

  it('names the heavy work in one list, and leaves the gentle work out of it', () => {
    for (const heavy of ['hunt', 'chop', 'build', 'attack', 'spar', 'sabotage', 'restrain', 'drag']) {
      expect(HEAVY_ACTIONS.has(heavy)).toBe(true);
    }
    for (const gentle of ['forage', 'gather', 'pick', 'craft', 'talk', 'teach', 'sow', 'reap']) {
      expect(HEAVY_ACTIONS.has(gentle)).toBe(false);
    }
  });

  it('vetoes the heavy work only in the last third', () => {
    expect(tooHeavyForHer(expecting(0.1), 'hunt')).toBe(false);
    expect(tooHeavyForHer(expecting(0.5), 'hunt')).toBe(false);
    expect(tooHeavyForHer(expecting(0.9), 'hunt')).toBe(true);
    expect(tooHeavyForHer(expecting(0.9), 'forage')).toBe(false);
    expect(tooHeavyForHer(new Person('Not', 0, 0, 0, new RNG('x')), 'hunt')).toBe(false);
  });

  it('shows to a stranger only in the last third', () => {
    expect(showing(expecting(0.5))).toBe(false);
    expect(showing(expecting(0.9))).toBe(true);
    expect(handfulsOnly(expecting(0.9))).toBe(true);
  });

  it('carries handfuls only in the last third: no armful, nothing on the shoulder', () => {
    const carry = makeConfig().carry;
    const free = new Person('Free', 0, 0, 0, new RNG('carry-free'));
    const heavy = expecting(0.9);
    // Timber needs both arms or the shoulder; berries are a handful or an armful.
    expect(itemCapacityFor(free, carry, 'wood')).toBeGreaterThan(0);
    expect(itemCapacityFor(heavy, carry, 'wood')).toBe(0);
    expect(itemCapacityFor(heavy, carry, 'meat')).toBeLessThan(itemCapacityFor(free, carry, 'meat'));
    expect(capacityFor(heavy, carry)).toBeLessThan(capacityFor(free, carry));
    // The first two thirds change nothing.
    expect(itemCapacityFor(expecting(0.5), carry, 'wood')).toBe(itemCapacityFor(free, carry, 'wood'));
  });
});

/** Women held in their last third for a few days: what do they start doing? */
describe('M15 phase 19a: the scorer spares them', () => {
  function startedHeavy(spare: boolean): { starts: number; heavy: string[] } {
    const sim = new Simulation({ seed: 'pregnancy-brain', world: { width: 64, height: 64 },
      population: { bands: 1, peoplePerBand: 12 } });
    const women = sim.people.filter(p => p.sex === 'female' && !p.isChild);
    const was = new Map<number, string>();
    const heavy: string[] = [];
    let starts = 0;
    for (let tick = 0; tick < 900; tick++) {
      if (spare) {
        for (const w of women) {
          w.pregnant = true;
          w.pregnantBy = null;
          w.gestationLeft = gestationDays(w) * 0.1;
        }
      }
      sim.step();
      for (const w of women) {
        if (w.action !== was.get(w.id)) {
          starts++;
          if (spare && HEAVY_ACTIONS.has(w.action)) heavy.push(w.action);
        }
        was.set(w.id, w.action);
      }
    }
    return { starts, heavy };
  }

  it('starts no heavy task in her last third', () => {
    const run = startedHeavy(true);
    expect(run.starts).toBeGreaterThan(20);
    expect(run.heavy).toEqual([]);
  });
});

/** 19b: refused with a reason, in the order, in the menu and in the middle of the work. */
describe('M15 phase 19b: heavy work is refused with a reason', () => {
  function world(seed: string) {
    const sim = new Simulation({ seed, world: { width: 64, height: 64 },
      population: { bands: 1, peoplePerBand: 8 } });
    const woman = sim.people.find(p => p.sex === 'female' && !p.isChild)!;
    const tree = sim.trees.find(candidate => candidate.standing && candidate.isMature &&
      sim.world.sameRegion(woman.x, woman.y, candidate.x, candidate.y))!;
    expect(tree).toBeDefined();
    woman.x = tree.x; woman.y = tree.y;
    woman.needs.hunger = 0; woman.needs.thirst = 0;
    return { sim, woman, tree };
  }
  const along = (w: Person, share: number) => {
    w.pregnant = true;
    w.gestationLeft = gestationDays(w) * (1 - share);
  };

  it('takes the order in her second third and refuses it in her last, with the sentence', () => {
    const { sim, woman, tree } = world('pregnancy-order');
    along(woman, 0.5);
    expect(sim.order(woman, 'chop', { treeId: tree.id })).toBe(true);
    along(woman, 0.9);
    sim.lastRefusal = null;
    expect(sim.order(woman, 'chop', { treeId: tree.id })).toBe(false);
    expect(sim.lastRefusal).toBe('she is too heavy with child for that');
    setLanguage('es');
    try {
      sim.lastRefusal = null;
      sim.order(woman, 'chop', { treeId: tree.id });
      expect(sim.lastRefusal).toBe('está demasiado avanzada en el embarazo para eso');
    } finally { setLanguage('en'); }
  });

  it('refuses a hunt the same way, and the gentle work still goes through', () => {
    const { sim, woman, tree } = world('pregnancy-command');
    along(woman, 0.9);
    sim.lastRefusal = null;
    expect(sim.order(woman, 'hunt', { animalId: 1 })).toBe(false);
    expect(sim.lastRefusal).toContain('too heavy');
    sim.lastRefusal = null;
    expect(sim.order(woman, 'goto', { x: Math.round(tree.x), y: Math.round(tree.y) })).toBe(true);
  });

  it('stops the work she was in the middle of when her last third begins, and says why', () => {
    const { sim, woman, tree } = world('pregnancy-midway');
    along(woman, 0.5);
    expect(sim.order(woman, 'chop', { treeId: tree.id })).toBe(true);
    for (let i = 0; i < 6; i++) sim.step();
    expect(woman.action).toBe('chop');
    along(woman, 0.9);
    sim.interruptions.length = 0;
    sim.step();
    expect(woman.action).not.toBe('chop');
    expect(sim.interruptions.some(n => n.personId === woman.id && n.reason === 'too_heavy_with_child')).toBe(true);
  });

  it('greys the heavy verbs in the menu with the reason, and leaves them lit before the last third', () => {
    const { sim, woman, tree } = world('pregnancy-menu');
    const ask = () => availableActions(woman, { kind: 'tree', x: tree.x, y: tree.y, tree }, {
      world: sim.world, nearWater: false, childhood: sim.config.childhood, peopleById: sim.peopleById,
    } as CatalogContext).flatMap(o => [o, ...(o.children ?? [])]).find(o => o.id === 'chop')!;
    along(woman, 0.5);
    expect(ask().enabled).toBe(true);
    along(woman, 0.9);
    const chop = ask();
    expect(chop.enabled).toBe(false);
    expect(chop.reason).toBe('Too heavy with child for that');
  });

  it('has words for the stop, in both languages', () => {
    expect(stopReasonLabel('too_heavy_with_child')).toBe('she is too heavy with child for that');
    setLanguage('es');
    try {
      expect(stopReasonLabel('too_heavy_with_child')).toBe('está demasiado avanzada en el embarazo para eso');
    } finally { setLanguage('en'); }
  });
});

/** 19c: who can tell. The line goes through Knowledge, never straight off `pregnant`. */
describe('M15 phase 19c: she is visible to those who may know', () => {
  const stranger = { level: 'stranger', displayName: 'a woman', knowsName: false, knowsCondition: false,
    knowsCharacter: false, knowsTies: false, because: '' } as const;
  const friend = { ...stranger, level: 'close', knowsName: true, knowsCondition: true } as const;

  it('tells those who know her the third, in words', () => {
    expect(pregnancyLine(expecting(0.1), friend)).toBe('pregnant (first trimester)');
    expect(pregnancyLine(expecting(0.5), friend)).toBe('pregnant (second trimester)');
    expect(pregnancyLine(expecting(0.9), friend)).toBe('pregnant (third trimester)');
  });

  it('tells a stranger only when the belly shows', () => {
    expect(pregnancyLine(expecting(0.1), stranger)).toBeNull();
    expect(pregnancyLine(expecting(0.5), stranger)).toBeNull();
    expect(pregnancyLine(expecting(0.9), stranger)).toBe('pregnant (third trimester)');
  });

  it('says nothing of a woman who is not with child', () => {
    expect(pregnancyLine(new Person('Not', 0, 0, 0, new RNG('x')), friend)).toBeNull();
  });

  it('is told to the player about herself, and in Spanish', () => {
    const sim = new Simulation({ seed: 'pregnancy-self', world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 4 } });
    const me = sim.people[0]!;
    const known = knowledgeOfPerson(me, me, sim.relationships);
    me.pregnant = true;
    me.gestationLeft = gestationDays(me) * 0.5;
    setLanguage('es');
    try {
      expect(pregnancyLine(me, known)).toBe('embarazada (segundo trimestre)');
    } finally { setLanguage('en'); }
  });
});

/** 19d: the risks, rolled from `healthRng` only when there is one. */
describe('M15 phase 19d: miscarriage and a hard birth', () => {
  /** A stand-in for `healthRng` that counts its draws and answers what it is told. */
  function dice(answer: number) {
    const rolls = { n: 0 };
    return { rolls, rng: { next: () => { rolls.n++; return answer; } } as unknown as RNG };
  }
  function couple(seed: string) {
    const sim = new Simulation({ seed, world: { width: 48, height: 48 },
      population: { bands: 1, peoplePerBand: 6 } });
    const mother = sim.people.find(p => p.sex === 'female' && !p.isChild)!;
    const father = sim.people.find(p => p.sex === 'male' && !p.isChild)!;
    mother.needs.hunger = 0; mother.health = 100;
    return { sim, mother, father };
  }
  function ctxFor(sim: Simulation, care: PregnancyCare | undefined, day = 100): LifeContext {
    return {
      rng: new RNG('life-rolls'), population: sim.config.population, tick: 0, day,
      peopleById: sim.peopleById, householdsById: sim.householdsById, roofTonight: new Map(),
      makeChild: (m, r) => new Person('Baby', m.x, m.y, m.bandId, r),
      onBirth: () => {}, onDeath: () => {}, pregnancyCare: care,
    };
  }
  const noOne = () => null;

  it('finds no risk in a healthy woman, and one for each of the three causes', () => {
    const { mother } = couple('risk-terms');
    expect(miscarriageRisk(mother)).toBeNull();
    mother.needs.hunger = 90;
    expect(miscarriageRisk(mother)?.cause).toBe('hunger');
    mother.needs.hunger = 0;
    mother.conditions.push({ kind: 'fever', severity: 'moderate', days: 4, part: 'torso' });
    expect(miscarriageRisk(mother)?.cause).toBe('fever');
    mother.conditions.length = 0;
    wound(mother.body, 'torso', 0.4);
    expect(miscarriageRisk(mother)?.cause).toBe('blow');
    // A graze is not a blow.
    mother.body.torso.damage = 0.05;
    expect(miscarriageRisk(mother)).toBeNull();
  });

  it('draws nothing from healthRng while nothing endangers her', () => {
    const { sim, mother, father } = couple('risk-quiet');
    mother.pregnant = true; mother.pregnantBy = father.id;
    mother.gestationLeft = 6;
    const { rng, rolls } = dice(0);
    const life = new LifeSystem();
    for (let i = 0; i < 4; i++) life.daily([mother], ctxFor(sim, { rng, midwifeFor: noOne,
      onMiscarriage: () => { throw new Error('no miscarriage expected'); }, onComplicatedBirth: () => {} }));
    expect(rolls.n).toBe(0);
    expect(mother.pregnant).toBe(true);
  });

  it('loses the child when the dice say so, with the cause, and waits half the usual spacing', () => {
    const { sim, mother, father } = couple('risk-loss');
    mother.pregnant = true; mother.pregnantBy = father.id;
    mother.gestationLeft = 6;
    mother.needs.hunger = 95;
    const lost: string[] = [];
    const { rng, rolls } = dice(0);
    new LifeSystem().daily([mother], ctxFor(sim, { rng, midwifeFor: noOne,
      onMiscarriage: (_m, f, cause) => { lost.push(cause); expect(f?.id).toBe(father.id); },
      onComplicatedBirth: () => {} }, 100));
    expect(lost).toEqual(['hunger']);
    expect(rolls.n).toBe(1);
    expect(mother.pregnant).toBe(false);
    expect(mother.pregnantBy).toBeNull();
    expect(mother.health).toBe(92);
    expect(mother.lastBirthDay).toBe(100 - mother.daysPerYear / 4);
  });

  it('keeps the child when the dice say so', () => {
    const { sim, mother, father } = couple('risk-kept');
    mother.pregnant = true; mother.pregnantBy = father.id; mother.gestationLeft = 6;
    mother.needs.hunger = 95;
    const { rng, rolls } = dice(0.99);
    new LifeSystem().daily([mother], ctxFor(sim, { rng, midwifeFor: noOne,
      onMiscarriage: () => { throw new Error('kept'); }, onComplicatedBirth: () => {} }));
    expect(rolls.n).toBe(1);
    expect(mother.pregnant).toBe(true);
  });

  it('does not roll a miscarriage on the day she is due, and rolls the birth', () => {
    const { sim, mother, father } = couple('risk-due');
    mother.pregnant = true; mother.pregnantBy = father.id; mother.gestationLeft = 1;
    mother.needs.hunger = 95;
    const { rng, rolls } = dice(0.99);
    let born = 0;
    const ctx = { ...ctxFor(sim, { rng, midwifeFor: noOne, onMiscarriage: () => { throw new Error('due'); },
      onComplicatedBirth: () => { throw new Error('no complication at 0.99'); } }), onBirth: () => { born++; } };
    new LifeSystem().daily([mother], ctx);
    expect(born).toBe(1);
    expect(rolls.n).toBe(1);
  });

  it('complicates a birth on a low roll, and a midwife changes how often', () => {
    const { sim, mother, father } = couple('birth-hard');
    mother.pregnant = true; mother.pregnantBy = father.id; mother.gestationLeft = 1;
    const helper = sim.people.find(p => p !== mother && !p.isChild)!;
    let hard = 0; let seen: unknown = 'unset';
    new LifeSystem().daily([mother], ctxFor(sim, { rng: dice(0).rng, midwifeFor: () => helper,
      onMiscarriage: () => {}, onComplicatedBirth: (_m, w) => { hard++; seen = w; } }));
    expect(hard).toBe(1);
    expect(seen).toBe(helper);
    // The chance itself: help only helps if the helper knows herbalism.
    expect(midwifeQuality(helper)).toBe(0);
    helper.knownTech.add('herbalism');
    helper.techLevel.set('herbalism', 0);
    helper.skills.heal = 50;
    expect(midwifeQuality(helper)).toBe(1);
    expect(complicationChance(1)).toBeLessThan(complicationChance(0.5));
    expect(complicationChance(0.5)).toBeLessThan(complicationChance(0));
  });

  it('leaves the compact model alone: no care, no rolls, an ordinary birth', () => {
    const { sim, mother, father } = couple('birth-compact');
    mother.pregnant = true; mother.pregnantBy = father.id; mother.gestationLeft = 1;
    mother.needs.hunger = 99;
    let born = 0;
    new LifeSystem().daily([mother], { ...ctxFor(sim, undefined), onBirth: () => { born++; } });
    expect(born).toBe(1);
  });

  it('writes the loss into both chronicles, in words, and the hard birth into hers and the midwife own', () => {
    const { sim, mother, father } = couple('chronicle');
    (sim as unknown as { registerMiscarriage(m: Person, f: Person, c: string): void })
      .registerMiscarriage(mother, father, 'fever');
    expect(mother.chronicle.at(-1)!.text).toBe('lost the child she was carrying: the fever was too much');
    expect(father.chronicle.at(-1)!.text).toBe(`${mother.name} lost the child she was carrying`);

    const helper = sim.people.find(p => p !== mother && p !== father && !p.isChild)!;
    const hard = (sim as unknown as { registerComplicatedBirth(m: Person, w: Person | null): void });
    hard.registerComplicatedBirth(mother, helper);
    expect(mother.body.torso.damage).toBeCloseTo(0.35, 5);
    expect(mother.body.torso.wound).toBe('tended');
    expect(mother.chronicle.at(-1)!.text).toBe(`the birth went hard, and ${helper.name} saw her through`);
    expect(helper.chronicle.at(-1)!.text).toBe(`saw ${mother.name} through a hard birth`);
    const alone = couple('chronicle-alone');
    (alone.sim as unknown as { registerComplicatedBirth(m: Person, w: null): void })
      .registerComplicatedBirth(alone.mother, null);
    expect(alone.mother.body.torso.wound).toBe('fresh');
    expect(alone.mother.health).toBe(75);
  });
});
