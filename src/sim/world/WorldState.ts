import { Simulation, type GeographicStart } from '../core/Simulation.ts';
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
 * resource inspection world only; people cannot start there until freshwater
 * has local semantics (phase 30). The default remains the classic island.
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
