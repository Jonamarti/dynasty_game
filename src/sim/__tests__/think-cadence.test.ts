/**
 * The player's band thinks at full pace; every other band re-plans less often
 * (M15 step 0, C; `ai/ThinkCadence.ts`). The rules below are the owner's: the
 * slowing is by band, it follows the player when the player changes body,
 * the turns are staggered, and nothing that used to reach a person at once is
 * made to wait.
 */
import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { thinkIntervalOf, wakesNow } from '../ai/ThinkCadence.ts';
import type { Person } from '../entities/Person.ts';

const CADENCE = { thinkInterval: 5, otherBandThinkInterval: 15 };
const who = (bandId: number, isPlayer = false) => ({ bandId, isPlayer });

describe('thinkIntervalOf', () => {
  it('gives the focus band, and the player wherever they are, the full pace', () => {
    expect(thinkIntervalOf(who(0), 0, CADENCE)).toBe(5);
    expect(thinkIntervalOf(who(1, true), 0, CADENCE)).toBe(5);
  });
  it('slows every other band', () => {
    expect(thinkIntervalOf(who(1), 0, CADENCE)).toBe(15);
    expect(thinkIntervalOf(who(7), 0, CADENCE)).toBe(15);
  });
  it('slows nobody when there is no focus, and never speeds anybody up', () => {
    expect(thinkIntervalOf(who(1), null, CADENCE)).toBe(5);
    expect(thinkIntervalOf(who(1), 0, { thinkInterval: 5, otherBandThinkInterval: 2 })).toBe(5);
    expect(thinkIntervalOf(who(1), 0, { thinkInterval: 5, otherBandThinkInterval: 5 })).toBe(5);
  });
});

describe('wakesNow', () => {
  const hurtAt = (lastHarmedTick: number) => ({ lastHarmedTick });
  it('wakes somebody under attack or hurt this tick or the last, and nobody else', () => {
    expect(wakesNow(hurtAt(-9999), 100, true)).toBe(true);
    expect(wakesNow(hurtAt(100), 100, false)).toBe(true);
    expect(wakesNow(hurtAt(99), 100, false)).toBe(true);
    expect(wakesNow(hurtAt(98), 100, false)).toBe(false);
    expect(wakesNow(hurtAt(-9999), 100, false)).toBe(false);
  });
});

function world(otherBandThinkInterval: number): Simulation {
  return new Simulation({
    seed: 'cadence',
    world: { width: 64, height: 64, berryBushes: 60, flintOutcrops: 12, deadwood: 30, gameHerds: 4 },
    population: { bands: 2, peoplePerBand: 12 },
    otherBandThinkInterval,
  } as any);
}

/** Counts, per band and per tick, the re-plans of people already walking or working (the polling). */
function watch(sim: Simulation) {
  const brain = (sim as any).brain;
  const original = brain.think;
  const perBand = new Map<number, number>();
  const perTick = new Map<string, number>();
  const log: { tick: number; id: number; band: number; was: string }[] = [];
  brain.think = function(person: Person, ...rest: unknown[]) {
    log.push({ tick: sim.time.tick, id: person.id, band: person.bandId, was: person.action });
    if (person.action !== 'idle') {
      perBand.set(person.bandId, (perBand.get(person.bandId) ?? 0) + 1);
      const key = `${person.bandId}@${sim.time.tick}`;
      perTick.set(key, (perTick.get(key) ?? 0) + 1);
    }
    return original.call(this, person, ...rest);
  };
  return { perBand, perTick, log };
}

describe('the cadence in a running world', () => {
  it('re-plans the other band about a third as often as the player band, and not at all more slowly with the switch off', () => {
    const rates = (interval: number) => {
      const sim = world(interval);
      sim.possessFirst();
      const focus = sim.player!.bandId;
      const seen = watch(sim);
      for (let i = 0; i < 600; i++) sim.step();
      const other = [...new Set(sim.livingPeople().map(p => p.bandId))].find(b => b !== focus)!;
      const size = (band: number) => sim.livingPeople().filter(p => p.bandId === band).length;
      return {
        focus: (seen.perBand.get(focus) ?? 0) / size(focus),
        other: (seen.perBand.get(other) ?? 0) / size(other),
      };
    };
    const slowed = rates(15);
    const off = rates(5);
    // The negative control: with the switch off the two bands poll alike.
    expect(off.other / off.focus).toBeGreaterThan(0.7);
    expect(off.other / off.focus).toBeLessThan(1.4);
    // And with it on the other band polls well under half as often as the player's.
    expect(slowed.other / slowed.focus).toBeLessThan(0.5);
  });

  it('staggers the slow band: its turns are spread over the cycle, not bunched on one tick', () => {
    const sim = world(15);
    sim.possessFirst();
    const focus = sim.player!.bandId;
    const seen = watch(sim);
    for (let i = 0; i < 300; i++) sim.step();
    const other = sim.livingPeople().find(p => p.bandId !== focus)!.bandId;
    const members = sim.livingPeople().filter(p => p.bandId === other).length;
    let busiest = 0;
    for (const [key, count] of seen.perTick) if (key.startsWith(`${other}@`)) busiest = Math.max(busiest, count);
    // Twelve people on a fifteen-tick cycle: never more than a few in one tick.
    expect(busiest).toBeLessThanOrEqual(Math.ceil(members / 15) + 1);
  });

  it('puts a band at full pace the tick after the player takes one of its bodies', () => {
    const sim = world(15);
    sim.possessFirst();
    const focus = sim.player!.bandId;
    for (let i = 0; i < 200; i++) sim.step();
    const stranger = sim.livingPeople().find(p => p.bandId !== focus)!;
    const newBand = stranger.bandId;
    const seen = watch(sim);
    const before = sim.time.tick;
    sim.possess(stranger);
    expect(sim.thinkFocusBand()).toBe(newBand);
    for (let i = 0; i < 300; i++) sim.step();
    const members = (band: number) => sim.livingPeople().filter(p => p.bandId === band).length;
    const rate = (band: number) => seen.log.filter(r => r.band === band && r.tick > before && r.was !== 'idle').length / members(band);
    // The band the player left is now the slow one.
    expect(rate(newBand) / rate(focus)).toBeGreaterThan(1.8);
  });

  it('lets a person of a slow band answer being hurt at once, between turns', () => {
    const sim = world(60); // a turn only once in sixty ticks, so a tick-by-tick reply cannot be a coincidence
    sim.possessFirst();
    const focus = sim.player!.bandId;
    for (let i = 0; i < 100; i++) sim.step();
    const victim = sim.livingPeople().find(p => p.bandId !== focus && !p.isChild && p.action !== 'idle' &&
      p.actionTimer === 0 && p.order === null && (sim.time.tick + 1 + p.thinkOffset) % 60 !== 0)!;
    expect(victim).toBeDefined();
    const seen = watch(sim);
    victim.lastHarmedTick = sim.time.tick + 1; // harmed during the coming tick
    sim.step();
    expect(seen.log.some(r => r.id === victim.id), 'a hurt person re-decides the tick they are hurt').toBe(true);
  });
});
