import { Simulation, worldFrameOf, type GeographicStart } from '../core/Simulation.ts';
import { IdSpace } from '../core/IdSpace.ts';
import type { DeepPartial, SimConfig } from '../core/Config.ts';
import type { WorldGeography } from './WorldGeography.ts';
import { legacyIslandGeography } from './WorldGeography.ts';
import { PeopleWorld, gridFromGeography, regionOfStart, type PeopleWorldRecord } from './PeopleWorld.ts';
import { TileLedger, comarcaIdentityAt } from '../persistence/TileLedger.ts';

export interface WorldStateGeographicStart {
  geography: WorldGeography;
  start: { x: number; y: number };
  comarcasWide?: number;
  comarcasHigh?: number;
  /**
   * Seed the rest of the map with peoples (phase 33a). On by default for a start with a map; off for a test that only
   * wants the detailed comarca and should not pay for a thousand peoples it never reads.
   */
  peoples?: boolean;
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
  /** Detached comarca revisions survive root saves; this book activates no off-map motor. */
  readonly tileLedger = new TileLedger();
  /** Original placement, kept by the root even though Simulation consumes it only during construction. */
  readonly initialGeographicStart: (WorldStateGeographicStart & { comarcasWide: number; comarcasHigh: number }) | null;
  /**
   * The abstract peoples of every other habitable region (phase 33a), or null on the classic island, which has no map.
   * It owns nothing the detailed comarca owns: its streams are derived from the seed, not forked from `Simulation`.
   */
  readonly peoples: PeopleWorld | null;

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
    this.peoples = geographicStart && geographicStart.peoples !== false
      ? seedPeoples(this.geography, geographicStart.start, this.current)
      : null;
  }

  /**
   * Run the world of peoples up to the detailed clock. Called once a game day by whoever steps `current` (the browser loop,
   * a harness): a seasonal update is due only a few times a year, and the schedule is a function of the steps alone, so
   * calling this every tick, every day or once a year yields the same world (tested).
   */
  advancePeoples(): void {
    const tick = this.current.time.tick;
    if (this.peoples && tick % this.current.config.time.ticksPerDay === 0) this.peoples.advanceTo(tick);
  }

  /** Join an independently restored Simulation checkpoint to its world root. */
  static fromRestored(current: Simulation, geography: WorldGeography,
    geographicStart: WorldStateGeographicStart | null, peoplesRecord: PeopleWorldRecord | null = null,
    tileLedger = new TileLedger()): WorldState {
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
    assertWorldTileLedger(tileLedger, geography, current);
    const state = Object.create(WorldState.prototype) as WorldState;
    Object.defineProperties(state, {
      geography: { value: geography, enumerable: true },
      ids: { value: current.ids, enumerable: true },
      current: { value: current, enumerable: true },
      tileLedger: { value: tileLedger, enumerable: true },
      initialGeographicStart: { value: retainStart(geography, geographicStart), enumerable: true },
      peoples: { value: restorePeoples(geography, geographicStart, peoplesRecord), enumerable: true },
    });
    return state;
  }
}

function peopleOptions(geography: WorldGeography, start: { x: number; y: number }) {
  const grid = gridFromGeography(geography)!;
  return { grid, options: { game: true, trackEvents: false, reserved: new Set([regionOfStart(grid, start)]) } };
}

/** The peoples of every other region, from the world's own seed. The detailed comarca holds the player's region. */
function seedPeoples(geography: WorldGeography, start: { x: number; y: number }, current: Simulation): PeopleWorld | null {
  if (!gridFromGeography(geography)) return null;
  const { grid, options } = peopleOptions(geography, start);
  return new PeopleWorld(grid, String(current.config.seed), options);
}

function restorePeoples(geography: WorldGeography, start: WorldStateGeographicStart | null, record: PeopleWorldRecord | null): PeopleWorld | null {
  if (!record) return null;
  if (!start || !gridFromGeography(geography)) throw new RangeError('A world of peoples needs a map to stand on');
  const { grid, options } = peopleOptions(geography, start.start);
  return PeopleWorld.fromRecord(grid, record, options);
}


/** A root must never attach another map's book or restore local history from its future. */
export function assertWorldTileLedger(ledger: TileLedger, geography: WorldGeography, current: Simulation): void {
  for (const entry of ledger.toRecord().entries) {
    if (geography.kind === 'legacyIsland' ||
        JSON.stringify(entry.identity) !== JSON.stringify(comarcaIdentityAt(geography, entry.identity.cx, entry.identity.cy))) {
      throw new RangeError('Tile ledger geography does not match its world root');
    }
    const expectedDay = current.config.time.startDay + Math.floor(entry.lastAdvancedTick / current.config.time.ticksPerDay);
    if (entry.lastAdvancedTick > current.time.tick || entry.lastAdvancedDay !== expectedDay) {
      throw new RangeError('Tile ledger date does not match its world clock');
    }
  }
}
