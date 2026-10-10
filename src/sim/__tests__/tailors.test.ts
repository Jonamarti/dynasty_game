import { afterEach, describe, expect, it } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { telemetry } from '../core/Telemetry.ts';
import { GARMENT_SLOTS } from '../entities/Equipment.ts';
import { ITEMS } from '../entities/Item.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { observeTailors, setupTailors, tailorsChecks } from '../../../tools/tailorsFixture.ts';

function fixture(): Simulation {
  telemetry.reset();
  telemetry.enable();
  const sim = new Simulation({
    seed: 'tailors-instrument-test',
    world: { width: 48, height: 48 },
    time: { daysPerSeason: 6, startDay: 18 },
    needs: { coldRate: 0.16 },
    population: { bands: 1, peoplePerBand: 8 },
  });
  setupTailors(sim);
  const adult = sim.livingPeople().find(person => !person.isChild)!;
  adult.equipment.head = { item: 'fur_hat', count: 1 };
  adult.needs.cold = 1;
  return sim;
}

afterEach(() => {
  telemetry.disable();
  telemetry.reset();
});

describe('M15 phase 14e tailors instrument', () => {
  it('fails the wear gate when the supplied adults never wear clothing', () => {
    const sim = fixture();
    for (const person of sim.livingPeople()) {
      if (person.isChild) continue;
      for (const slot of GARMENT_SLOTS) delete person.equipment[slot];
    }

    observeTailors(sim);

    const checks = tailorsChecks(telemetry.snapshot());
    expect(checks.find(check => check.id === 'clothes-are-worn')?.ok).toBe(false);
  });

  it('fails the warmer gate when the real NeedsSystem reader sees zero garment warmth', () => {
    const sim = fixture();
    const garment = ITEMS.fur_hat!.garment!;
    const originalWarmth = garment.warmth;
    garment.warmth = 0;

    try {
      observeTailors(sim);
      const checks = tailorsChecks(telemetry.snapshot());
      expect(telemetry.get('tailors_paired_probes')).toBeGreaterThan(0);
      expect(telemetry.get('tailors_paired_no_benefit')).toBe(telemetry.get('tailors_paired_probes'));
      expect(checks.find(check => check.id === 'clothes-are-worn')?.ok).toBe(false);
      expect(checks.find(check => check.id === 'the-clothed-are-warmer')?.ok).toBe(false);
    } finally {
      garment.warmth = originalWarmth;
    }
  });

  it('rejects a zero-benefit pair when evaluating measurements directly', () => {
    const checks = tailorsChecks({
      tailors_adult_founders: 6,
      tailors_cold_samples: 100,
      tailors_cold_worn_samples: 100,
      tailors_people_wore: 6,
      tailors_paired_probes: 100,
      tailors_paired_cold_benefit: 0,
      tailors_paired_no_benefit: 100,
    });
    expect(checks.find(check => check.id === 'clothes-are-worn')?.ok).toBe(true);
    expect(checks.find(check => check.id === 'the-clothed-are-warmer')?.ok).toBe(false);
  });

  it('leaves the live checkpoint unchanged and keeps probe telemetry out of world counters', () => {
    const sim = fixture();
    expect(sim.time.season).toBe('winter');
    expect(sim.time.temperature).toBeLessThan(0);
    const before = JSON.stringify(toCheckpointRecord(sim));
    telemetry.reset();
    telemetry.enable();

    observeTailors(sim);

    expect(JSON.stringify(toCheckpointRecord(sim))).toBe(before);
    expect(telemetry.isEnabled()).toBe(true);
    const keys = Object.keys(telemetry.snapshot());
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every(key => key.startsWith('tailors_'))).toBe(true);
    expect(telemetry.get('tailors_paired_probes')).toBeGreaterThan(0);
  });

  it('restores telemetry to disabled after the paired probes', () => {
    const sim = fixture();
    telemetry.reset();
    telemetry.disable();

    observeTailors(sim);

    expect(telemetry.isEnabled()).toBe(false);
    expect(telemetry.snapshot()).toEqual({});
  });
});
