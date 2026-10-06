import { Simulation, worldFrameOf, type GeographicStart } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import type { DeepPartial, SimConfig } from '../core/Config.ts';
import type { WorldGeography } from './WorldGeography.ts';
import { legacyIslandGeography } from './WorldGeography.ts';

export interface WorldStateGeographicStart {
  geography: WorldGeography;
  start: { x: number; y: number };
  comarcasWide?: number;
  comarcasHigh?: number;
}

function retainStart(geography: WorldGeography, input: WorldStateGeographicStart | null) {
  if (!input) return null;
  return Object.freeze({
    geography,
    start: Object.freeze({ x: input.start.x, y: input.start.y }),
    comarcasWide: input.comarcasWide ?? 1,
    comarcasHigh: input.comarcasHigh ?? 1,
  });
}

/**
 * The browser's world root. The optional macro-map start builds a terrain and
 * resource world with explicit local water provenance. The default remains
 * the classic island; geographic selection in the browser comes later.
 */
export class WorldState {
  readonly geography: WorldGeography;
  readonly ids = new IdSpace();
  readonly current: Simulation;
  /** Original placement, kept by the root even though Simulation consumes it only during construction. */
  readonly initialGeographicStart: (WorldStateGeographicStart & { comarcasWide: number; comarcasHigh: number }) | null;

  constructor(config: DeepPartial<SimConfig> = {}, geographicStart?: WorldStateGeographicStart) {
    this.geography = geographicStart?.geography ?? legacyIslandGeography();
    this.initialGeographicStart = retainStart(this.geography, geographicStart ?? null);
    // Optional geography is generation input only. No global RNG stream or
    // allocator is advanced until Simulation validates the requested start.
    const simulationStart: GeographicStart | undefined = geographicStart ? {
      geography: geographicStart.geography,
      ...geographicStart.start,
      comarcasWide: geographicStart.comarcasWide,
      comarcasHigh: geographicStart.comarcasHigh,
    } : undefined;
    this.current = new Simulation(config, this.ids, simulationStart);
  }

  /** Join an independently restored Simulation checkpoint to its world root. */
  static fromRestored(current: Simulation, geography: WorldGeography,
    geographicStart: WorldStateGeographicStart | null): WorldState {
    // The JSON reader is not the only caller of this public assembly path.
    // A classic checkpoint cannot acquire a salt coast merely by attaching
    // macro metadata. Geographic water provenance must come from its terrain.
    if (geography.kind !== 'legacyIsland' &&
        !current.world.waterKind &&
        (current.config.population.bands !== 0 || current.people.length > 0 || current.bands.length > 0)) {
      throw new RangeError('Geographic starts cannot restore a populated simulation before freshwater support');
    }
    if ((geography.kind === 'legacyIsland') !== (geographicStart === null) ||
        (geographicStart && geographicStart.geography !== geography)) {
      throw new RangeError('Restored geography must match its starting placement');
    }
    // The restored motor never saw its geography (construction input only), so
    // the root hands back the one fact it needs to keep writing `WorldKnowledge`.
    if (geographicStart) {
      current.worldFrame = worldFrameOf({ geography, ...geographicStart.start,
        comarcasWide: geographicStart.comarcasWide, comarcasHigh: geographicStart.comarcasHigh });
    }
    const state = Object.create(WorldState.prototype) as WorldState;
    Object.defineProperties(state, {
      geography: { value: geography, enumerable: true },
      ids: { value: current.ids, enumerable: true },
      current: { value: current, enumerable: true },
      initialGeographicStart: { value: retainStart(geography, geographicStart), enumerable: true },
    });
    return state;
  }
}
