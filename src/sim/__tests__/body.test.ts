/**
 * M15 phase 21a: a body with six parts, written by blows and read by nothing.
 *
 * The claim worth pinning is the "inert" half: choosing a part draws from
 * `healthRng`, a stream of its own, so a blow takes exactly the health it took
 * before and every other stream is where it was.
 */
import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { RNG } from '../core/RNG.ts';
import { BODY_PARTS, newBody, strikePart, wound, worstDamage } from '../entities/Body.ts';

const SMALL = {
  seed: 'body',
  world: { width: 64, height: 64, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 0 },
  population: { bands: 1, peoplePerBand: 4 },
};

describe('a body', () => {
  it('starts whole', () => {
    const body = newBody();
    expect(Object.keys(body).sort()).toEqual([...BODY_PARTS].sort());
    for (const part of BODY_PARTS) expect(body[part]).toEqual({ damage: 0, wound: 'none', peak: 0 });
  });

  it('is wounded by a blow, cumulatively and never past destroyed', () => {
    const body = newBody();
    wound(body, 'left_leg', 0.3);
    expect(body.left_leg).toEqual({ damage: 0.3, wound: 'fresh', peak: 0.3 });
    wound(body, 'left_leg', 0.9);
    expect(body.left_leg.damage).toBe(1);
    expect(worstDamage(body)).toBe(1);
    expect(body.head.wound).toBe('none');
  });

  it('is struck mostly on the torso and arms, in every part sooner or later', () => {
    const rng = new RNG('strikes');
    const hits = Object.fromEntries(BODY_PARTS.map(p => [p, 0])) as Record<string, number>;
    for (let i = 0; i < 4000; i++) hits[strikePart(rng)]!++;
    for (const part of BODY_PARTS) expect(hits[part]).toBeGreaterThan(0);
    expect(hits.torso).toBeGreaterThan(hits.head! * 2);
  });
});

describe('a blow that lands', () => {
  it('leaves a wound on the victim and takes health as ever', () => {
    const sim = new Simulation(SMALL);
    const [attacker, victim] = sim.livingPeople();
    attacker!.x = victim!.x + 1;
    attacker!.y = victim!.y;
    expect(sim.order(attacker!, 'attack', { personId: victim!.id })).toBe(true);
    for (let i = 0; i < 200 && victim!.health >= 100 && victim!.alive; i++) sim.step();

    expect(victim!.health).toBeLessThan(100);
    expect(worstDamage(victim!.body)).toBeGreaterThan(0);
    expect(BODY_PARTS.some(p => victim!.body[p].wound === 'fresh')).toBe(true);
    // Nobody who was not struck carries a mark.
    for (const part of BODY_PARTS) expect(attacker!.body[part].wound).toBe('none');
  });
});

describe('what a wound does (21b)', () => {
  it('slows a leg, and two bad legs cannot run', async () => {
    const { legPace, cannotRun } = await import('../entities/Body.ts');
    const body = newBody();
    expect(legPace(body)).toBe(1);
    wound(body, 'left_leg', 0.6);
    expect(legPace(body)).toBeLessThan(0.85);
    expect(cannotRun(body)).toBe(false);
    wound(body, 'right_leg', 0.6);
    expect(cannotRun(body)).toBe(true);
    expect(legPace(body)).toBeGreaterThanOrEqual(0.3);
  });

  it('weakens an arm, but never to nothing', async () => {
    const { armForce } = await import('../entities/Body.ts');
    const body = newBody();
    wound(body, 'right_arm', 1);
    wound(body, 'left_arm', 1);
    expect(armForce(body)).toBeGreaterThanOrEqual(0.4);
    expect(armForce(body)).toBeLessThan(0.5);
  });

  it('makes a hurt arm fight and work worse, and leaves talking alone', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    const fight = person.skillFactor('fight');
    const persuade = person.skillFactor('persuade');
    wound(person.body, 'left_arm', 0.8);
    expect(person.skillFactor('fight')).toBeLessThan(fight);
    expect(person.skillFactor('persuade')).toBe(persuade);
  });

  it('bleeds from a deep torso wound until it is dressed, and mends otherwise', async () => {
    const { bleeding, mendBody } = await import('../entities/Body.ts');
    const body = newBody();
    wound(body, 'torso', 0.2);
    expect(bleeding(body)).toBe(0);
    wound(body, 'torso', 0.2);
    expect(bleeding(body)).toBeGreaterThan(0);
    body.torso.wound = 'tended';
    expect(bleeding(body)).toBe(0);
    body.torso.wound = 'fresh';
    for (let i = 0; i < 2000; i++) mendBody(body);
    expect(body.torso.wound).toBe('healed');
    expect(body.torso.damage).toBe(0);
    // A deep one leaves a scar.
    wound(body, 'head', 0.7);
    for (let i = 0; i < 2000; i++) mendBody(body);
    expect(body.head.wound).toBe('scarred');
  });

  it('kills somebody who bleeds with no health left, and says so', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    wound(person.body, 'torso', 0.9);
    person.health = 0.05;
    for (let i = 0; i < 40 && person.alive; i++) sim.step();
    expect(person.alive).toBe(false);
    expect(person.causeOfDeath).toBe('bleeding');
  });

  it('knocks out somebody struck hard on the head, who then neither thinks nor acts', () => {
    const sim = new Simulation(SMALL);
    const [attacker, victim] = sim.livingPeople();
    attacker!.x = victim!.x + 1;
    attacker!.y = victim!.y;
    victim!.body.head.damage = 0.39;
    victim!.body.head.wound = 'fresh';
    // Land blows until one falls on the head: a part is drawn per blow.
    for (let i = 0; i < 3000 && victim!.knockedOutUntil < 0 && victim!.alive; i++) {
      victim!.health = 100;
      victim!.x = attacker!.x + 1;
      victim!.y = attacker!.y;
      if (attacker!.order !== 'attack') sim.order(attacker!, 'attack', { personId: victim!.id });
      sim.step();
    }
    expect(victim!.knockedOutUntil).toBeGreaterThan(0);
    expect(victim!.action).toBe('idle');
  });
});

describe('infection and fever (21c)', () => {
  /** Share of wounds that fester over `days` days, by whether they were dressed. */
  async function festerRate(tended: boolean, trials: number): Promise<number> {
    const { woundsDaily } = await import('../entities/Body.ts');
    const rng = new RNG('fester-' + tended);
    let festered = 0;
    for (let i = 0; i < trials; i++) {
      const body = newBody();
      wound(body, 'right_leg', 0.3);
      if (tended) body.right_leg.wound = 'tended';
      const conditions: import('../entities/Body.ts').Condition[] = [];
      for (let day = 0; day < 5 && body.right_leg.wound !== 'infected'; day++) {
        woundsDaily(body, conditions, rng);
      }
      if (body.right_leg.wound === 'infected') festered++;
    }
    return festered / trials;
  }

  it('festers an undressed wound far more often than a dressed one (wounds-fester-untended)', async () => {
    const untended = await festerRate(false, 3000);
    const tended = await festerRate(true, 3000);
    expect(untended).toBeGreaterThan(0.1);
    expect(tended).toBeLessThan(untended * 0.5);
  });

  it('would not tell them apart if dressing changed nothing', async () => {
    // The gate's own control: the same measurement with dressing taken out of
    // the wound state (both arms "fresh") gives the same rate, which is what
    // the check above must be able to tell from the real thing.
    const a = await festerRate(false, 3000);
    const { woundsDaily } = await import('../entities/Body.ts');
    const rng = new RNG('fester-control');
    let festered = 0;
    for (let i = 0; i < 3000; i++) {
      const body = newBody();
      wound(body, 'right_leg', 0.3);
      for (let day = 0; day < 5 && body.right_leg.wound !== 'infected'; day++) {
        woundsDaily(body, [], rng);
      }
      if (body.right_leg.wound === 'infected') festered++;
    }
    expect(Math.abs(festered / 3000 - a)).toBeLessThan(0.04);
  });

  it('gives a fever that worsens by the day, and ends when the wound turns or is tended', async () => {
    const { woundsDaily, dress, feverDrain } = await import('../entities/Body.ts');
    const body = newBody();
    wound(body, 'left_leg', 0.4);
    body.left_leg.wound = 'infected';
    const conditions = [{ kind: 'fever' as const, severity: 'mild' as const, days: 0, part: 'left_leg' as const }];
    const drain0 = feverDrain(conditions);
    // Days pass with no luck: a rng that never turns the infection.
    const never = { next: () => 0.99 } as RNG;
    for (let i = 0; i < 7; i++) woundsDaily(body, conditions, never);
    expect(conditions[0]!.severity).toBe('severe');
    expect(feverDrain(conditions)).toBeGreaterThan(drain0);
    expect(body.left_leg.damage).toBeGreaterThan(0.4);

    expect(dress(body, conditions)).toEqual({ part: 'left_leg', result: 'eased' });
    expect(conditions[0]!.severity).toBe('moderate');
    dress(body, conditions);
    expect(dress(body, conditions)).toEqual({ part: 'left_leg', result: 'cured' });
    expect(conditions).toHaveLength(0);
    expect(body.left_leg.wound).toBe('tended');
    expect(dress(body, conditions)).toBeNull();
  });

  it('kills somebody whose fever outlasts their health, and says so', () => {
    const sim = new Simulation(SMALL);
    const person = sim.livingPeople()[0]!;
    person.body.right_leg.wound = 'infected';
    person.body.right_leg.damage = 0.5;
    person.conditions.push({ kind: 'fever', severity: 'severe', days: 9, part: 'right_leg' });
    person.health = 0.05;
    for (let i = 0; i < 40 && person.alive; i++) sim.step();
    expect(person.alive).toBe(false);
    expect(person.causeOfDeath).toBe('infection');
  });

  it('is tended by a herbalist, who dresses the wound as well as mending health', () => {
    const sim = new Simulation(SMALL);
    const [healer, patient] = sim.livingPeople();
    healer!.knownTech.add('herbalism');
    healer!.techLevel.set('herbalism', 0);
    patient!.x = healer!.x + 1;
    patient!.y = healer!.y;
    patient!.body.torso.damage = 0.3;
    patient!.body.torso.wound = 'fresh';
    patient!.body.torso.peak = 0.3;
    expect(sim.order(healer!, 'tend', { personId: patient!.id })).toBe(true);
    for (let i = 0; i < 60 && patient!.body.torso.wound === 'fresh'; i++) sim.step();
    expect(patient!.body.torso.wound).not.toBe('fresh');
    expect(healer!.chronicle.some(e => /wound of/i.test(e.text))).toBe(true);
  });
});
