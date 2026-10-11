import { describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { BUILDINGS } from '../entities/Building.ts';
import { TECH, TECH_EFFECTS, TECHS, techsOfWeb, webOf } from '../knowledge/Tech.ts';

function simWithFarming(): Simulation {
  const sim = new Simulation({
    seed: 'irrigation-gates',
    world: { width: 48, height: 48, berryBushes: 30, flintOutcrops: 8, deadwood: 15, gameHerds: 3 },
    population: { bands: 1, peoplePerBand: 4, startingTech: ['farming'] },
  });
  sim.knownTech.add('farming');
  return sim;
}

describe('irrigation and terrace technology gates (M15 phase 26e)', () => {
  it('adds effective nodes to the field web with declared physical readers', () => {
    expect(TECHS).toContain('irrigation');
    expect(TECHS).toContain('terracing');
    expect(webOf('irrigation')).toBe('field');
    expect(webOf('terracing')).toBe('field');
    expect(techsOfWeb('field')).toEqual(expect.arrayContaining(['irrigation', 'terracing']));
    expect(TECH.irrigation.requires).toContain('farming');
    expect(TECH.terracing.requires).toContain('farming');
    expect(TECH_EFFECTS.irrigation.site).toContain('BUILDINGS.canal');
    expect(TECH_EFFECTS.terracing.site).toContain('BUILDINGS.terrace');
  });

  it('keeps canals and terraces unavailable until their own useful knowledge exists', () => {
    const sim = simWithFarming();
    const designs = () => sim.availableDesigns().map(def => def.id);
    const locked = () => sim.lockedDesigns().map(def => def.id);

    expect(BUILDINGS.canal?.requiresTech).toBe('irrigation');
    expect(BUILDINGS.terrace?.requiresTech).toBe('terracing');
    expect(designs()).not.toContain('canal');
    expect(designs()).not.toContain('terrace');
    expect(locked()).toContain('canal');
    expect(locked()).toContain('terrace');
    expect(locked()).not.toContain('canal_ns');
    expect(locked()).not.toContain('terrace_ns');

    sim.knownTech.add('irrigation');
    expect(designs()).toContain('canal');
    expect(designs()).not.toContain('terrace');
    sim.knownTech.add('terracing');
    expect(designs()).toContain('terrace');
  });
});
