import { describe, expect, it } from 'vitest';
import { makeConfig } from '../core/Config.ts';
import { RNG } from '../core/RNG.ts';
import type { TimeManager } from '../core/TimeManager.ts';
import { Person } from '../entities/Person.ts';
import { NeedsSystem } from '../systems/NeedsSystem.ts';

const config = makeConfig({ seed: 'cold-recovery', world: { width: 48, height: 48 } });

/** Only `temperature` is read by the cold term; everything else is inert here. */
const at = (temperature: number) => ({ temperature, tick: 0 }) as unknown as TimeManager;

function coldAfter(temperature: number, start: number, ticks: number): number {
  const p = new Person('cold', 10.5, 10.5, 0, new RNG('cold'));
  p.age = 30 * p.daysPerYear;
  p.needs.cold = start;
  const needs = new NeedsSystem(config.needs);
  for (let i = 0; i < ticks; i++) needs.update([p], at(temperature));
  return p.needs.cold;
}

describe('cold recovery in mild weather', () => {
  it('sheds cold on a mild day at least as fast as a cold night gains it', () => {
    // Owner report: cold rose quickly in winter but did not come back down when
    // the weather turned warm. A +0.25 day must undo a -0.25 night in no more
    // time than the night took to do the damage.
    const gained = coldAfter(-0.25, 20, 200) - 20;
    const shed = 60 - coldAfter(0.25, 60, 200);
    expect(gained).toBeGreaterThan(0);
    expect(shed).toBeGreaterThanOrEqual(gained);
  });
});
