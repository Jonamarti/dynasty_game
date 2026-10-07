import { describe, expect, it } from 'vitest';
import { PeopleSim, TechSet, closeUnderRequires, emptyCohorts, type People, type PeopleCohorts, type SeasonMechanism } from '../world/PeopleSim.ts';
import {
  ALL_MATERIALS, KnowledgeLedger, PARTIAL_START, insightGain, type PartialLearning, KREMER_KAPPA, LEARN_MU_BOUND, LEARN_MU_START, MEAN_TRANSMISSIBILITY, climateSimilarity, learnRate, traitsOf, transmissibility, feasibleIn, inventionChance, knowledge, learningChance,
  regionMaterials, type KnowledgeEvent, type KnowledgeRegion,
} from '../world/PeopleKnowledge.ts';
import { TECHS, TECH, type Tech } from '../knowledge/Tech.ts';

const CLOCK = { ticksPerDay: 24, daysPerSeason: 10 };
const SEASON = CLOCK.ticksPerDay * CLOCK.daysPerSeason;
const FULL: KnowledgeRegion = { materials: regionMaterials(), climate: { temperature: 0.5, wetness: 0.5 } };
const adults = (n: number): PeopleCohorts => {
  const c = emptyCohorts();
  const per = Math.max(0, Math.floor(n / 16));
  for (let b = 3; b <= 10; b++) { c.male[b] = per; c.female[b] = per; }
  return c;
};

interface Run { sim: PeopleSim; people: People[]; events: KnowledgeEvent[] }
/** One world of `specs.length` peoples, related as `contact` says, run `seasons` seasons. */
function world(seed: string, specs: { n: number; techs?: readonly Tech[]; region?: KnowledgeRegion; comarcas?: number }[],
  opts: { kappa?: number; mu?: number; partial?: PartialLearning; ledger?: KnowledgeLedger; contact?: number; seasons: number; extra?: SeasonMechanism[]; startStep?: number }): Run {
  const events: KnowledgeEvent[] = [];
  const regions = new Map<number, KnowledgeRegion>();
  const sim = new PeopleSim(seed, CLOCK, [
    knowledge({ regionOf: p => regions.get(p.id)!, kappa: opts.kappa, mu: opts.mu ?? 0, partial: opts.partial ?? PARTIAL_START, ledger: opts.ledger }, e => events.push(e)),
    ...(opts.extra ?? []),
  ]);
  if (opts.startStep) sim.advanceTo(opts.startStep);
  const people = specs.map(s => {
    const p = sim.found({ cohorts: adults(s.n), comarcas: s.comarcas ?? 1, techs: closeUnderRequires(s.techs ?? []) });
    regions.set(p.id, s.region ?? FULL);
    return p;
  });
  if (specs.length > 1 && opts.contact !== undefined) for (let i = 1; i < people.length; i++) sim.relation(people[0]!.id, people[i]!.id).contact = opts.contact;
  sim.advanceTo((opts.startStep ?? 0) + opts.seasons * SEASON);
  return { sim, people, events };
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Season index (relative to founding) of the first acquisition of `tech`, or `cap` when none. */
function firstSeason(events: KnowledgeEvent[], tech: Tech, from: number, cap: number): number {
  const e = events.find(x => x.tech === tech);
  return e ? e.season - from : cap;
}

describe('invention (Kremer)', () => {
  it('uses the technique\'s own difficulty and the effective population, and nothing else', () => {
    for (const a of TECHS) for (const b of TECHS) {
      if (TECH[a].difficulty === TECH[b].difficulty) expect(inventionChance(a, 40, 1e-3)).toBe(inventionChance(b, 40, 1e-3));
    }
    expect(inventionChance('firemaking', 80, 1e-3)).toBeGreaterThan(inventionChance('firemaking', 40, 1e-3));
    expect(inventionChance('firemaking', 0, 1e-3)).toBe(0);
    const easy = TECHS.find(t => TECH[t].difficulty < 0.3)!, hard = TECHS.find(t => TECH[t].difficulty > 0.6)!;
    expect(inventionChance(easy, 40, 1e-3)).toBeGreaterThan(inventionChance(hard, 40, 1e-3));
  });

  it('only ever acquires a technique whose requires it already held, and not in the season they arrive', () => {
    const { events, people } = world('prereq', [{ n: 48 }], { kappa: 0.02, seasons: 40 });
    expect(events.length).toBeGreaterThan(10);
    for (const t of people[0]!.techs.list()) expect(people[0]!.techs.prerequisitesHeld(t)).toBe(true);
    const when = new Map(events.map(e => [e.tech, e.season]));
    for (const e of events) for (const r of TECH[e.tech].requires) expect(when.get(r) ?? -1).toBeLessThan(e.season);
  });

  it('is faster for a bigger people, in proportion (Kremer), and a contact counts as population', () => {
    const run = (n: number, neighbour?: number) => {
      const times: number[] = [];
      for (let k = 0; k < 300; k++) {
        const specs = neighbour ? [{ n }, { n: neighbour }] : [{ n }];
        const r = world(`kremer-${k}`, specs, { kappa: 5e-4, contact: 1, seasons: 80 });
        times.push(firstSeason(r.events.filter(e => e.peopleId === r.people[0]!.id), 'firemaking', 0, 80));
      }
      return mean(times);
    };
    const small = run(32), big = run(128), pooled = run(32, 32);
    expect(small / big).toBeGreaterThan(2.8); expect(small / big).toBeLessThan(5.5); // expected 4
    expect(pooled).toBeLessThan(small * 0.7);                                      // a neighbour of the same size: about half
    // A neighbour you do not touch is no help.
    const times: number[] = [];
    for (let k = 0; k < 300; k++) {
      const r = world(`kremer-${k}`, [{ n: 32 }, { n: 32 }], { kappa: 5e-4, contact: 0, seasons: 80 });
      times.push(firstSeason(r.events.filter(e => e.peopleId === r.people[0]!.id), 'firemaking', 0, 80));
    }
    expect(mean(times)).toBeGreaterThan(small * 0.8);
  });

  it('needs what the first prototype is made of: no wild grain, no farming invented; the same people with grain does', () => {
    const farming = TECHS.find(t => t === 'farming')!;
    expect(Object.keys(TECH[farming].prototype)).toContain('grain');
    expect(feasibleIn(farming, { ...FULL, materials: regionMaterials(['grain']) })).toBe(false);
    const have = closeUnderRequires(TECH[farming].requires);
    let withGrain = 0, withoutGrain = 0;
    for (let k = 0; k < 40; k++) {
      withGrain += world(`g-${k}`, [{ n: 64, techs: have }], { kappa: 0.05, seasons: 30 }).people[0]!.techs.has(farming) ? 1 : 0;
      withoutGrain += world(`g-${k}`, [{ n: 64, techs: have, region: { ...FULL, materials: regionMaterials(['grain']) } }], { kappa: 0.05, seasons: 30 }).people[0]!.techs.has(farming) ? 1 : 0;
    }
    expect(withGrain).toBeGreaterThan(30);
    expect(withoutGrain).toBe(0);
  });
});

describe('learning from neighbours', () => {
  const have = closeUnderRequires(TECH.farming.requires);
  const learner = (contact: number, neighbourClimate: KnowledgeRegion['climate'], seasons = 40, mu = 0.2) => {
    const noGrain = { materials: regionMaterials(['grain']), climate: { temperature: 0, wetness: 0 } };
    const r = world('learn', [{ n: 40, techs: have, region: noGrain }, { n: 40, techs: closeUnderRequires(['farming']), region: { ...FULL, climate: neighbourClimate } }],
      { kappa: 0, mu, contact, seasons });
    return r.people[0]!.techs.has('farming');
  };

  it('is how a people without wild grain gets farming; with no contact, or an opposite climate, it does not', () => {
    const same = { temperature: 0, wetness: 0 }, opposite = { temperature: 1, wetness: 1 };
    expect(learner(1, same)).toBe(true);
    expect(learner(0, same)).toBe(false);
    expect(learner(1, { temperature: 0.5, wetness: 0.5 }, 200)).toBe(true); // a half-similar climate still learns, slower
    expect(climateSimilarity(same, opposite)).toBe(0);
    expect(learner(1, opposite, 400)).toBe(false);                          // completely opposite climates share nothing
    expect(climateSimilarity(same, same)).toBe(1);
    expect(climateSimilarity(same, { temperature: 0.2, wetness: 0 })).toBeGreaterThan(climateSimilarity(same, { temperature: 0.9, wetness: 0 }));
  });

  it('learns a chain one rung a season: it cannot take a technique whose requires it lacks, however much contact it has', () => {
    const chain = closeUnderRequires(['farming']);
    expect(chain.length).toBeGreaterThan(2);
    const r = world('lack', [{ n: 40 }, { n: 40, techs: chain }], { kappa: 0, mu: 50, contact: 1, seasons: 1 });
    const got = r.people[0]!.techs.list();
    expect(got.length).toBeGreaterThan(0);
    for (const t of got) { expect(TECH[t].requires).toEqual([]); expect(chain).toContain(t); }
    expect(got).not.toContain('farming');
    // And given the seasons, it climbs the whole chain to farming without ever skipping a rung.
    const later = world('lack', [{ n: 40 }, { n: 40, techs: chain }], { kappa: 0, mu: 50, contact: 1, seasons: chain.length + 1 });
    expect(later.people[0]!.techs.has('farming')).toBe(true);
    const when = new Map(later.events.filter(e => e.peopleId === later.people[0]!.id).map(e => [e.tech, e.season]));
    for (const [t, season] of when) for (const q of TECH[t].requires) expect(when.get(q) ?? -1).toBeLessThan(season);
  });

  it('is monotone in contact: more contact, more learning', () => {
    const learned = (contact: number) => { let n = 0; for (let k = 0; k < 100; k++) n += world(`m-${k}`, [{ n: 30 }, { n: 30, techs: ['firemaking', 'plant_lore', 'tracking'] }], { kappa: 0, mu: 0.05, contact, seasons: 6 }).people[0]!.techs.size; return n; };
    expect(learned(1)).toBeGreaterThan(learned(0.3));
    expect(learned(0.3)).toBeGreaterThan(learned(0));
    expect(learned(0)).toBe(0);
    expect(learningChance(2, 0.02)).toBeGreaterThan(learningChance(1, 0.02));
  });
});

describe('transmissibility per technique (owner decision 2026-10-06)', () => {
  it('is read from the technique own traits: same traits, same value; a visible practice and a craft travel more than a lesson-only device', () => {
    const key = (t: Tech) => JSON.stringify(traitsOf(t));
    for (const a of TECHS) for (const b of TECHS) if (key(a) === key(b)) expect(transmissibility(a)).toBe(transmissibility(b));
    const lessonOnly = TECHS.filter(t => !traitsOf(t).seenInUse && !traitsOf(t).craft);
    const seen = TECHS.filter(t => traitsOf(t).seenInUse), craft = TECHS.filter(t => traitsOf(t).craft);
    expect(lessonOnly.length).toBeGreaterThan(5); expect(seen.length).toBeGreaterThan(5); expect(craft.length).toBeGreaterThan(1);
    for (const t of lessonOnly) for (const s of seen) expect(transmissibility(s)).toBeGreaterThan(transmissibility(t));
    for (const t of TECHS) expect(transmissibility(t)).toBeGreaterThan(0); // no node is untransmittable
  });

  it('starts from an aggregate strictly below the measured ceiling, which the per-technique rates average to', () => {
    expect(LEARN_MU_START).toBeGreaterThan(0);
    expect(LEARN_MU_START).toBeLessThan(LEARN_MU_BOUND);
    expect(mean(TECHS.map(t => learnRate(t, LEARN_MU_START)))).toBeCloseTo(LEARN_MU_START, 12);
    expect(MEAN_TRANSMISSIBILITY).toBeGreaterThan(1);
    // The one technique the detailed game measured as not crossing (a lesson-only device, 0 of 85) stays under its own bound.
    const device = TECHS.find(t => TECH[t].kind === 'device' && !traitsOf(t).seenInUse && !traitsOf(t).craft && TECH[t].requires.length === 0)!;
    expect(learnRate(device, LEARN_MU_START)).toBeLessThan(LEARN_MU_BOUND);
  });

  it('shows in the world: a visible practice crosses to a neighbour far oftener than a lesson-only device with the same open candidacy', () => {
    const seen = TECHS.find(t => traitsOf(t).seenInUse && TECH[t].requires.length === 0)!;
    const lesson = TECHS.find(t => !traitsOf(t).seenInUse && !traitsOf(t).craft && TECH[t].requires.length === 0)!;
    const rate = (tech: Tech) => { let n = 0; for (let k = 0; k < 400; k++) n += world(`tr-${k}`, [{ n: 30 }, { n: 30, techs: [tech] }], { kappa: 0, mu: 0.2, contact: 1, seasons: 4 }).people[0]!.techs.has(tech) ? 1 : 0; return n; };
    expect(rate(seen)).toBeGreaterThan(rate(lesson) * 2);
  });

  it('control: a flat build (every technique equally contagious) fails the ordering the traits promise', () => {
    const flat = () => 1;
    const seen = TECHS.find(t => traitsOf(t).seenInUse)!, lesson = TECHS.find(t => !traitsOf(t).seenInUse && !traitsOf(t).craft)!;
    expect(flat()).toBe(flat());
    expect(transmissibility(seen)).not.toBe(flat());
    expect(transmissibility(seen)).toBeGreaterThan(transmissibility(lesson));
  });
});

describe('stream discipline', () => {
  it('draws two numbers per technique per update, whatever the people holds', () => {
    const a = world('draws', [{ n: 40 }], { kappa: 1e-4, seasons: 1 });
    const b = world('draws', [{ n: 40, techs: ['firemaking', 'plant_lore', 'cordage', 'tracking'] }], { kappa: 1e-4, seasons: 1 });
    expect(b.people[0]!.rng.getState()).toEqual(a.people[0]!.rng.getState());
  });
});

// ---------------------------------------------------------------------------------------------
// Nothing by script
// ---------------------------------------------------------------------------------------------

/** The cheats the audit must catch: each is a real mechanism plus a script. */
type Build = { name: string; extra: SeasonMechanism[] };
const grant = (people: People, ...techs: Tech[]) => { for (const t of closeUnderRequires(techs)) if (!people.techs.has(t)) people.techs.add(t); };
const HONEST: Build = { name: 'honest', extra: [] };
const BY_DATE: Build = { name: 'by date', extra: [ctx => { if (ctx.season === 6) grant(ctx.people, 'cooking'); }] };
const BY_NAME: Build = { name: 'by name', extra: [ctx => { if (ctx.people.techs.has('plant_lore') && ctx.people.techs.has('cordage')) grant(ctx.people, 'basketry'); }] };
const BY_REGION: Build = { name: 'by region', extra: [ctx => { if (ctx.people.comarcas === 3) grant(ctx.people, 'farming'); }] };
const BY_IDENTITY: Build = { name: 'by identity', extra: [ctx => { if (ctx.people.id === 2) grant(ctx.people, 'pottery'); }] };

/**
 * What an audit must find true of an honest mechanism and false of any scripted one. Returns the names of the
 * invariants a build violates. Each compares like with like: nothing here reads a coefficient.
 */
function audit(build: Build): string[] {
  const broken: string[] = [];
  const rich = closeUnderRequires(['cordage', 'plant_lore', 'tracking']);

  // A1 nobody to think, nobody to learn from: nothing is gained, whatever is held and however long it waits.
  const empty = world(`audit-${build.name}`, [{ n: 0, techs: rich }, { n: 0, techs: rich }], { kappa: 0.05, mu: 1, contact: 1, seasons: 40, extra: build.extra });
  if (empty.people.some(p => p.techs.size !== rich.length)) broken.push('gains without anyone');

  // A2 the region's materials bind invention, whatever the number of comarcas or the id: without any material
  // only techniques with an empty prototype can be invented.
  const none: KnowledgeRegion = { materials: new Set(), climate: FULL.climate };
  for (const comarcas of [1, 2, 3, 4]) {
    const r = world(`audit-${build.name}-${comarcas}`, [{ n: 60, region: none, comarcas }, { n: 60, region: none, comarcas }, { n: 60, region: none, comarcas }], { kappa: 0.05, seasons: 40, extra: build.extra });
    for (const p of r.people) for (const t of p.techs.list()) if (Object.keys(TECH[t].prototype).length > 0) broken.push(`${t} invented without its materials (comarcas ${comarcas}, people ${p.id})`);
  }

  // A3 a neighbour at zero contact changes nothing (same seeds, same draws).
  const alone = world('audit-contact', [{ n: 40 }], { kappa: 5e-3, seasons: 30, extra: build.extra });
  const neighbour = world('audit-contact', [{ n: 40 }, { n: 40, techs: ['farming'] }], { kappa: 5e-3, mu: 1, contact: 0, seasons: 30, extra: build.extra });
  if (alone.people[0]!.techs.list().join() !== neighbour.people[0]!.techs.list().join()) broken.push('a zero-contact neighbour changed a people');

  // A4 the calendar is not an input: the same people founded 40 seasons later finds its first techniques at the
  // same relative pace, and not in the same season in every run.
  const sample = (startStep: number) => {
    const firsts: number[] = [];
    for (let k = 0; k < 120; k++) {
      const r = world(`audit-date-${k}`, [{ n: 40 }], { kappa: 5e-4, seasons: 70, extra: build.extra, startStep });
      const first = r.events.length > 0 ? Math.min(...r.events.map(e => e.season)) - Math.floor(startStep / SEASON) : 70;
      firsts.push(first);
    }
    return firsts;
  };
  const early = sample(0), late = sample(40 * SEASON);
  if (new Set(early).size === 1 || new Set(late).size === 1) broken.push('the first technique arrives in the same season in every run');
  if (Math.abs(mean(early) - mean(late)) > 0.25 * Math.max(mean(early), mean(late))) broken.push('the calendar changes the pace');

  // A5 identity: two identical peoples (ids 1 and 2, same everything) are alike on average.
  const a: number[] = [], b: number[] = [];
  for (let k = 0; k < 150; k++) {
    const r = world(`audit-id-${k}`, [{ n: 40 }, { n: 40 }], { kappa: 5e-4, seasons: 70, extra: build.extra });
    a.push(r.people[0]!.techs.size); b.push(r.people[1]!.techs.size);
  }
  if (Math.abs(mean(a) - mean(b)) > 0.2 * Math.max(mean(a), mean(b), 1)) broken.push('peoples are not alike: identity matters');
  return broken;
}

describe('nothing by script: no technique is granted by date, name, region or identity', () => {
  it('the honest mechanism passes every invariant of the audit', () => {
    expect(audit(HONEST)).toEqual([]);
  });

  it('the audit is not vacuous: with no materials the honest mechanism still invents the techniques that need none', () => {
    const none: KnowledgeRegion = { materials: new Set(), climate: FULL.climate };
    const r = world('vacuous', [{ n: 60, region: none }], { kappa: 0.05, seasons: 40 });
    const got = r.people[0]!.techs.list();
    expect(got.length).toBeGreaterThan(5);
    expect(got.every(t => Object.keys(TECH[t].prototype).length === 0)).toBe(true);
    expect(TECHS.some(t => Object.keys(TECH[t].prototype).length > 0 && !got.includes(t))).toBe(true);
  });

  it('control: the audit fails a build that grants by date', () => {
    expect(audit(BY_DATE).length).toBeGreaterThan(0);
  });
  it('control: the audit fails a build that grants by name (a fixed tree step, whatever the people)', () => {
    expect(audit(BY_NAME)).toContain('gains without anyone');
  });
  it('control: the audit fails a build that grants by a particular region', () => {
    expect(audit(BY_REGION).some(m => m.includes('without its materials'))).toBe(true);
  });
  it('control: the audit fails a build that grants to one people by identity', () => {
    expect(audit(BY_IDENTITY).some(m => m.includes('identity') || m.includes('without anyone'))).toBe(true);
  });

  it('the measured rates are real numbers, and no technique appears in the source of the mechanism by name', async () => {
    expect(KREMER_KAPPA).toBeGreaterThan(0);
    expect(LEARN_MU_BOUND).toBeGreaterThan(0);
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../world/PeopleKnowledge.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const tech of TECHS) expect(src.includes(`'${tech}'`) || src.includes(`"${tech}"`)).toBe(false);
    expect(ALL_MATERIALS.length).toBeGreaterThan(5);
  });
});

void TechSet;

// ---------------------------------------------------------------------------------------------
// Partial learning: hints, insight, exposure events, and the gap that persists
// ---------------------------------------------------------------------------------------------

describe('partial learning (insight and hints)', () => {
  const SMALL: PartialLearning = { rate: 0.004, hintGain: 4, sufferedWeapon: 3 };
  const fire = 'firemaking' as Tech;

  it('contact leaves insight behind without granting the technique', () => {
    const ledger = new KnowledgeLedger();
    const r = world('insight', [{ n: 30 }, { n: 30, techs: [fire] }], { kappa: 0, mu: 0, contact: 1, seasons: 5, partial: SMALL, ledger });
    expect(r.people[0]!.techs.has(fire)).toBe(false);
    const i = ledger.insight(r.people[0]!.id, fire);
    expect(i).toBeGreaterThan(0); expect(i).toBeLessThan(1);
    expect(i).toBeCloseTo(5 * insightGain(fire, 'witnessed', SMALL), 10);   // contact 1, same climate, five seasons
    expect(ledger.hinted(r.people[0]!.id)).toContain(fire);
    // No contact, no insight.
    const none = new KnowledgeLedger();
    world('insight', [{ n: 30 }, { n: 30, techs: [fire] }], { kappa: 0, mu: 0, contact: 0, seasons: 5, partial: SMALL, ledger: none });
    expect(none.hinted(1)).toEqual([]);
  });

  it('a hint makes the people find the technique itself sooner (and a hintless build does not)', () => {
    const invented = (hintGain: number) => {
      let n = 0;
      for (let k = 0; k < 250; k++) {
        const r = world(`hint-${k}`, [{ n: 24 }, { n: 24, techs: [fire] }], { kappa: 5e-4, mu: 0, contact: 1, seasons: 30, partial: { ...SMALL, rate: 0.01, hintGain } });
        n += r.events.filter(e => e.peopleId === r.people[0]!.id && e.tech === fire && e.how === 'invented').length;
      }
      return n;
    };
    const none = invented(0), hinted = invented(40);
    expect(hinted).toBeGreaterThan(none * 1.15);
  });

  it('completes at insight 1, and never ahead of the requires', () => {
    const lib = 'library' as Tech;
    expect(TECH[lib].requires.length).toBeGreaterThan(0);
    const r = world('complete', [{ n: 30 }, { n: 30, techs: [lib] }], { kappa: 0, mu: 0, contact: 1, seasons: 400, partial: { rate: 0.5, hintGain: 0, sufferedWeapon: 1 } });
    expect(r.people[0]!.techs.has(lib)).toBe(true);
    const when = new Map(r.events.filter(e => e.peopleId === r.people[0]!.id).map(e => [e.tech, e.season]));
    expect(r.events.some(e => e.how === 'completed')).toBe(true);
    for (const [t, season] of when) for (const q of TECH[t].requires) expect(when.get(q) ?? -1).toBeLessThan(season);
  });

  it('a weapon suffered is taken in faster than the same technique seen, a non-weapon is not boosted, and a transaction counts once', () => {
    const weapon = TECHS.find(t => traitsOf(t).weapon && TECH[t].requires.length === 0) ?? TECHS.find(t => traitsOf(t).weapon)!;
    const plain = TECHS.find(t => !traitsOf(t).weapon && transmissibility(t) === transmissibility(weapon))!;
    expect(insightGain(weapon, 'suffered', SMALL)).toBeCloseTo(3 * insightGain(weapon, 'witnessed', SMALL), 12);
    expect(insightGain(plain, 'suffered', SMALL)).toBe(insightGain(plain, 'witnessed', SMALL));

    const ledger = new KnowledgeLedger();
    const regions = new Map<number, KnowledgeRegion>();
    const sim = new PeopleSim('raid', CLOCK, [knowledge({ regionOf: p => regions.get(p.id)!, kappa: 0, mu: 0, partial: SMALL, ledger })]);
    const victim = sim.found({ cohorts: adults(30), comarcas: 1 }); regions.set(victim.id, FULL);
    const raid = { id: 'raid-1', peopleId: victim.id, tech: weapon, how: 'suffered' as const, intensity: 1 };
    expect(ledger.post(raid)).toBe(true);
    expect(ledger.post(raid)).toBe(false);               // the same transaction reported again
    expect(() => ledger.post({ ...raid, id: 'bad', intensity: 2 })).toThrow();
    sim.advanceTo(SEASON);
    expect(ledger.insight(victim.id, weapon)).toBeCloseTo(insightGain(weapon, 'suffered', SMALL), 12);
    expect(victim.techs.has(weapon)).toBe(false);
    sim.advanceTo(2 * SEASON);                           // taken in once, not each season
    expect(ledger.insight(victim.id, weapon)).toBeCloseTo(insightGain(weapon, 'suffered', SMALL), 12);
    // A held technique takes no insight.
    const ledger2 = new KnowledgeLedger();
    const sim2 = new PeopleSim('raid', CLOCK, [knowledge({ regionOf: () => FULL, kappa: 0, mu: 0, partial: SMALL, ledger: ledger2 })]);
    const holder = sim2.found({ cohorts: adults(30), comarcas: 1, techs: [fire] });
    ledger2.post({ id: 'x', peopleId: holder.id, tech: fire, how: 'suffered', intensity: 1 });
    sim2.advanceTo(SEASON);
    expect(ledger2.insight(holder.id, fire)).toBe(0);
  });

  it('draws the same two numbers per technique per update with or without partial learning (the stream does not move)', () => {
    const a = world('draws2', [{ n: 40 }, { n: 40, techs: [fire] }], { kappa: 1e-4, mu: 0.02, contact: 1, seasons: 1, partial: { rate: 0, hintGain: 0, sufferedWeapon: 1 } });
    const b = world('draws2', [{ n: 40 }, { n: 40, techs: [fire] }], { kappa: 1e-4, mu: 0.02, contact: 1, seasons: 1, partial: PARTIAL_START });
    expect(b.people[0]!.rng.getState()).toEqual(a.people[0]!.rng.getState());
  });
});

describe('a technological gap persists (owner decision 2026-10-06: diffusion must be small)', () => {
  const A = closeUnderRequires(['bow', 'atlatl', 'sling']), B = closeUnderRequires(['plant_lore', 'cooking', 'basketry', 'fishing']);
  /** Techniques held by exactly one of the two peoples, averaged over streams, as a share of what it was at founding. */
  const dispersion = (contact: number, mu: number, partial: PartialLearning, seasons: number, streams = 30): number => {
    let sum = 0, initial = 0;
    for (let k = 0; k < streams; k++) {
      const r = world(`gap-${k}`, [{ n: 40, techs: A }, { n: 40, techs: B }], { mu, partial, contact, seasons });
      const diff = () => { let n = 0; for (const t of new Set([...r.people[0]!.techs.list(), ...r.people[1]!.techs.list()])) if (r.people[0]!.techs.has(t) !== r.people[1]!.techs.has(t)) n++; return n; };
      initial = new Set([...A, ...B]).size - A.filter(t => B.includes(t)).length * 2;
      sum += diff();
    }
    return sum / streams / initial;
  };
  const SEASONS_10Y = 40;

  it('with realistic contact the dispersion over ten game years does not collapse to zero (nor does it need to grow)', () => {
    expect(dispersion(0.3, LEARN_MU_START, PARTIAL_START, SEASONS_10Y)).toBeGreaterThan(0.9);
    expect(dispersion(0.1, LEARN_MU_START, PARTIAL_START, SEASONS_10Y)).toBeGreaterThan(0.9);
  });

  it('control: a high-diffusion build collapses it, so the test above could have failed', () => {
    const hot = { rate: 5, hintGain: 4, sufferedWeapon: 3 };
    expect(dispersion(1, 50, hot, SEASONS_10Y)).toBeLessThan(0.1);
    expect(dispersion(0.3, 50, hot, SEASONS_10Y)).toBeLessThan(0.15);
  });

  it('the model is honest that sustained full contact does homogenise, over generations', () => {
    // 0.3 until M15 phase 37, when it measured 0.21; the ten metal nodes made it
    // 0.33. The cause is measured, not guessed: leaving those ten out of the
    // count gives 0.12, so what remains different after thirty years of full
    // contact is the deep chain (smelting under kiln under pottery...) that a
    // people picks up slowly, and a longer table has more of it. The world is
    // not wrong and the claim stands - this is still a third of the ten-year
    // figure the test above holds above 0.9 and well clear of the hot build's
    // 0.1 - so the bound moves with the table and says why.
    expect(dispersion(1, LEARN_MU_START, PARTIAL_START, 120, 20)).toBeLessThan(0.4);
  });
});

// ---------------------------------------------------------------------------------------------
// The audit, extended to transmissibility, insight, hints and exposure
// ---------------------------------------------------------------------------------------------

/** A cheat aimed at the partial-learning mechanism itself: it gets the ledger, which the honest build only writes through `knowledge`. */
type PartialBuild = { name: string; cheat: (ledger: KnowledgeLedger) => SeasonMechanism[] };
const HONEST_PARTIAL: PartialBuild = { name: 'honest', cheat: () => [] };
const HINT_BY_NAME: PartialBuild = { name: 'hint by name', cheat: l => [ctx => { if (!ctx.people.techs.has('sling')) l.addInsight(ctx.people.id, 'sling', 0.3); }] };
const HINT_BY_DATE: PartialBuild = { name: 'hint by date', cheat: l => [ctx => { if (ctx.season === 2) for (const t of TECHS) if (!ctx.people.techs.has(t)) l.addInsight(ctx.people.id, t, 0.2); }] };
const HINT_BY_REGION: PartialBuild = { name: 'hint by region', cheat: l => [ctx => { if (ctx.people.comarcas === 3) l.addInsight(ctx.people.id, 'bow', 0.2); }] };
const HINT_BY_IDENTITY: PartialBuild = { name: 'hint by identity', cheat: l => [ctx => { if (ctx.people.id === 1) l.addInsight(ctx.people.id, 'pottery', 0.2); }] };
const GRANT_ON_HINT: PartialBuild = { name: 'grant on first hint', cheat: l => [ctx => { for (const t of l.hinted(ctx.people.id)) if (TECH[t].requires.every(r => ctx.people.techs.has(r))) ctx.people.techs.add(t); }] };

/** Invariants the partial-learning mechanism keeps when honest; each returns a name when broken. */
function auditPartial(build: PartialBuild): string[] {
  const broken: string[] = [];
  const SMALL: PartialLearning = { rate: 0.004, hintGain: 4, sufferedWeapon: 3 };
  const all = closeUnderRequires(TECHS);
  const run = (seed: string, contact: number, comarcas: number, startStep?: number) => {
    const ledger = new KnowledgeLedger();
    const r = world(seed, [{ n: 30, comarcas }, { n: 30, techs: all, comarcas }], { kappa: 0, mu: 0, contact, seasons: 3, partial: SMALL, ledger, extra: build.cheat(ledger), startStep });
    return { r, ledger };
  };
  // P1 contact alone never grants a technique at a small rate: insight is a hint, not a copy.
  const near = run('audit-partial', 1, 1);
  if (near.r.people[0]!.techs.size > 0) broken.push('a hint granted a technique');
  // P2 with no contact there is nothing to take in, whatever the region or the id.
  for (const comarcas of [1, 3]) {
    const far = run(`audit-partial-${comarcas}`, 0, comarcas);
    for (const p of far.r.people) if (far.ledger.hinted(p.id).length > 0 && p.id === far.r.people[0]!.id) broken.push(`insight without contact (comarcas ${comarcas}, people ${p.id})`);
  }
  // P3 insight is exactly what the technique's own traits and the contact say: no technique by name gets more, and the
  // calendar does not matter (same people founded 40 seasons later).
  for (const startStep of [0, 40 * SEASON]) {
    const { r, ledger } = run('audit-insight', 1, 1, startStep);
    for (const t of TECHS) {
      if (r.people[0]!.techs.has(t)) continue;
      const want = 3 * insightGain(t, 'witnessed', SMALL);
      if (Math.abs(ledger.insight(r.people[0]!.id, t) - want) > 1e-9) { broken.push(`insight into ${t} is not what its traits say (start ${startStep})`); break; }
    }
  }
  // P4 two techniques with the same traits and difficulty take in the same insight.
  const { r: tw, ledger: tl } = run('audit-twins', 1, 1);
  const twins = TECHS.filter(t => !tw.people[0]!.techs.has(t)), key = (t: Tech) => JSON.stringify(traitsOf(t));
  for (const a of twins) for (const b of twins) if (a < b && key(a) === key(b) && Math.abs(tl.insight(tw.people[0]!.id, a) - tl.insight(tw.people[0]!.id, b)) > 1e-9) broken.push(`${a} and ${b} have the same traits and different insight`);
  return broken;
}

describe('nothing by script, extended: transmissibility, insight, hints and exposure', () => {
  it('the honest partial-learning mechanism passes every invariant', () => {
    expect(auditPartial(HONEST_PARTIAL)).toEqual([]);
  });
  it('the audit is not vacuous: the honest mechanism does leave insight behind for every technique the neighbour holds', () => {
    const ledger = new KnowledgeLedger();
    const r = world('vac', [{ n: 30 }, { n: 30, techs: closeUnderRequires(TECHS) }], { kappa: 0, mu: 0, contact: 1, seasons: 3, partial: { rate: 0.004, hintGain: 4, sufferedWeapon: 3 }, ledger });
    expect(ledger.hinted(r.people[0]!.id).length).toBeGreaterThan(20);
  });
  it('control: it fails a hint handed to one technique by name', () => { expect(auditPartial(HINT_BY_NAME).some(m => m.includes('not what its traits say'))).toBe(true); });
  it('control: it fails a hint handed out by date', () => { expect(auditPartial(HINT_BY_DATE).length).toBeGreaterThan(0); });
  it('control: it fails a hint handed out by region', () => { expect(auditPartial(HINT_BY_REGION).some(m => m.includes('without contact'))).toBe(true); });
  it('control: it fails a hint handed to one people by identity', () => { expect(auditPartial(HINT_BY_IDENTITY).length).toBeGreaterThan(0); });
  it('control: it fails a build where a hint grants the whole technique', () => { expect(auditPartial(GRANT_ON_HINT)).toContain('a hint granted a technique'); });

  it('the source of the mechanism reads no technique name, no region, no identity and no calendar', async () => {
    const fs = await import('node:fs');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const src = strip(fs.readFileSync(new URL('../world/PeopleKnowledge.ts', import.meta.url), 'utf8'));
    const forbidden = [/\.comarcas\b/, /\.id\s*[!=]==/, /\bseason\s*[<>=!]/, /\bseasonOfYear\s*[<>=!]/, /\bstep\s*[<>=!]/];
    for (const f of forbidden) expect(f.test(src)).toBe(false);
    // The scan is not blind: doctored sources are caught.
    expect(forbidden.some(f => f.test(src + ' if (people.comarcas === 3) {}'))).toBe(true);
    expect(forbidden.some(f => f.test(src + ' if (people.id === 2) {}'))).toBe(true);
    expect(forbidden.some(f => f.test(src + ' if (season > 6) {}'))).toBe(true);
    for (const tech of TECHS) expect(src.includes(`'${tech}'`) || src.includes(`"${tech}"`)).toBe(false);
  });
});
