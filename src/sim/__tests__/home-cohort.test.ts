import { describe, expect, it } from 'vitest';
import { formatHomeCohort, homeCohortObservations } from '../../../tools/homeCohort.ts';

describe('phase 16 cohort observations', () => {
  it('formats zero denominators as n/a rather than implying a zero rate', () => {
    const observation = homeCohortObservations({}, 0, 0);
    const formatted = formatHomeCohort('empty', observation);
    expect(formatted).toContain('households=0/0 (n/a)');
    expect(formatted).toContain('outdoors=0(n/a)');
    expect(formatted).toContain('comfortΔ=n/a securityΔ=n/a mood-quality physical/effective=n/a/n/a');
    expect(formatted).toContain('recovery quality samples=0 physical/effective=n/a/n/a');
    expect(formatted).toContain('NPC furniture crafted: none; placed: none');
  });

  it('reports per-seed physical observations and NPC furniture counts', () => {
    const observation = homeCohortObservations({
      homes_night_surface_bed: 3,
      homes_night_surface_outdoors: 1,
      sleep_mood_samples: 4,
      homes_sleep_comfort_delta_sum: -2,
      homes_sleep_security_delta_sum: 1,
      sleep_mood_quality_sum: 4.2,
      homes_sleep_quality_effective_sum: 4.2,
      homes_sleep_recovery_quality_samples: 10,
      homes_sleep_recovery_physical_quality_sum: 11,
      homes_sleep_recovery_effective_quality_sum: 11,
      homes_furniture_crafted_bedding: 2,
      homes_furniture_placed_bed: 1,
    }, 1, 2);
    const formatted = formatHomeCohort('alpha', observation);
    expect(formatted).toContain('households=1/2 (50.0%)');
    expect(formatted).toContain('bed=3(75.0%)');
    expect(formatted).toContain('comfortΔ=-0.50 securityΔ=0.25');
    expect(formatted).toContain('mood-quality physical/effective=1.05/1.05');
    expect(formatted).toContain('recovery quality samples=10 physical/effective=1.10/1.10');
    expect(formatted).toContain('crafted: bedding=2; placed: bed=1');
  });
});
