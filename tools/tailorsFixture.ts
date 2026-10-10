import type { Simulation } from '../src/sim/core/Simulation.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { NeedsSystem } from '../src/sim/systems/NeedsSystem.ts';
import { GARMENT_SLOTS } from '../src/sim/entities/Equipment.ts';
import type { Person } from '../src/sim/entities/Person.ts';
import { ITEMS } from '../src/sim/entities/Item.ts';

const observedWearers = new WeakMap<Simulation, Set<number>>();
const suppliedAdults = new WeakMap<Simulation, Set<number>>();

/** Supplied winter opportunity: founders know the clothing path and own one wearable hat. */
export function setupTailors(sim: Simulation): void {
  const adults = sim.livingPeople().filter(person => !person.isChild);
  if (adults.length < 2) throw new Error('tailors needs at least two adult founders');
  for (const person of adults) person.inventory.add('fur_hat', 1);
  observedWearers.set(sim, new Set());
  suppliedAdults.set(sim, new Set(adults.map(person => person.id)));
  telemetry.count('tailors_adult_founders', adults.length);
}

function detached(person: Person): Person {
  // NeedsSystem is the real cold reader. These clones share only read-only
  // identity/inventory/social data with the live person; fields it may change
  // are copied so the paired probe cannot alter the running world.
  return Object.assign(Object.create(Object.getPrototypeOf(person)), person, {
    needs: { ...person.needs },
    exertionToday: { ...person.exertionToday },
    equipment: { ...person.equipment },
    body: Object.fromEntries(Object.entries(person.body).map(([part, state]) => [part, { ...state }])),
    conditions: [...person.conditions],
  }) as Person;
}

/** Observe winter exposure and a controlled same-person cold update with/without clothing. */
export function observeTailors(sim: Simulation): void {
  if (sim.time.season !== 'winter' || sim.time.temperature >= 0) return;
  const needs = new NeedsSystem(sim.config.needs, sim.world);
  const adultIds = suppliedAdults.get(sim);
  const wearerIds = observedWearers.get(sim);
  if (!adultIds || !wearerIds) throw new Error('tailors fixture was not set up');
  for (const person of sim.livingPeople()) {
    if (!adultIds.has(person.id) || person.needs.cold <= 0) continue;
    telemetry.count('tailors_cold_samples');
    const worn = GARMENT_SLOTS.some(slot => {
      const equipped = person.equipment[slot];
      const garment = equipped ? ITEMS[equipped.item]?.garment : undefined;
      return !!equipped && garment?.slot === slot && person.inventory.count(equipped.item) > 0;
    });
    if (!worn) continue;
    telemetry.count('tailors_cold_worn_samples');
    if (!wearerIds.has(person.id)) {
      wearerIds.add(person.id);
      telemetry.count('tailors_people_wore');
    }

    const clothed = detached(person);
    const bare = detached(person);
    // Put both probes on the same dry camp tile. Omitting buildings and the
    // building hash removes shelter and hearth from both sides of the pair.
    const band = sim.bands.find(candidate => candidate.id === person.bandId);
    if (!band) continue;
    let x = band.homeX, y = band.homeY;
    if (!sim.world.isWalkable(x, y) || sim.world.isWadeTile(x, y)) {
      const ground = sim.world.findWalkableNear(Math.round(x), Math.round(y));
      if (!ground) continue;
      x = ground.x; y = ground.y;
    }
    for (const probe of [clothed, bare]) {
      probe.x = x; probe.y = y;
      probe.targetX = x; probe.targetY = y;
      probe.action = 'rest';
      probe.wet = 0;
      // Start both below the cap so a genuinely warmer garment cannot be
      // hidden by cold already saturated at 100.
      probe.needs.cold = 20;
    }
    for (const slot of GARMENT_SLOTS) delete bare.equipment[slot];

    // NeedsSystem emits unrelated world-health counters as it updates. Keep
    // this diagnostic pair out of the world's telemetry histogram.
    const telemetryWasEnabled = telemetry.isEnabled();
    telemetry.disable();
    let avoided: number;
    try {
      needs.update([clothed], sim.time, []);
      needs.update([bare], sim.time, []);
      avoided = bare.needs.cold - clothed.needs.cold;
    } finally {
      if (telemetryWasEnabled) telemetry.enable();
    }
    telemetry.count('tailors_paired_probes');
    telemetry.count('tailors_paired_cold_benefit', avoided);
    if (avoided <= 0) telemetry.count('tailors_paired_no_benefit');
  }
}

/** Evaluate only the instrument's supplied-opportunity and paired-reader claims. */
export function tailorsChecks(tel: Record<string, number>): Array<{ id: string; ok: boolean; detail: string }> {
  const coldSamples = tel.tailors_cold_samples ?? 0;
  const wornSamples = tel.tailors_cold_worn_samples ?? 0;
  const adultFounders = tel.tailors_adult_founders ?? 0;
  const peopleWhoWore = tel.tailors_people_wore ?? 0;
  const wearFraction = coldSamples > 0 ? wornSamples / coldSamples : 0;
  const probes = tel.tailors_paired_probes ?? 0;
  const benefit = tel.tailors_paired_cold_benefit ?? 0;
  const withoutBenefit = tel.tailors_paired_no_benefit ?? 0;
  return [
    {
      id: 'clothes-are-worn',
      ok: coldSamples > 0 && peopleWhoWore >= Math.ceil(adultFounders / 2),
      detail: peopleWhoWore + '/' + adultFounders + ' supplied adult founders wore a garment during a winter cold sample; ' +
        wornSamples + '/' + coldSamples + ' cold person-ticks (' + (100 * wearFraction).toFixed(1) + '%)',
    },
    {
      id: 'the-clothed-are-warmer',
      ok: probes > 0 && benefit > 0 && withoutBenefit === 0,
      detail: probes + ' same-person winter cold probes; mean one-tick cold avoided with the worn garment=' +
        (probes > 0 ? (benefit / probes).toFixed(5) : 'n/a') +
        '; no-benefit pairs=' + withoutBenefit + ' (isolated NeedsSystem pairs, outdoor with no hearth or shelter)',
    },
  ];
}
