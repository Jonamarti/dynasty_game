/**
 * The saved game as one piece of text (M15 phase 33c): the world root (`WorldStateRecord`: the geography, the detailed comarca and,
 * since 33a, the abstract peoples of every other region) under a small envelope that says what it is without reading it.
 *
 * The same text goes to IndexedDB and to an exported file, so whatever loads from one loads from the other. It is JSON on
 * purpose: `JSON.stringify` is the persistence boundary every continuation test already crosses (it canonicalises `-0`), so a
 * saved-then-loaded world is compared with a never-saved one through the same lens, and the only way a load differs from not
 * having saved is a bug, not a format.
 *
 * Nothing here touches the DOM, the clock or `localStorage`: the browser side (`src/ui/SaveStore.ts`) owns where the text lives, and
 * the caller passes in when it was saved. That keeps this file in `src/sim/`, where the headless harness can use it.
 */
import { toWorldStateRecord, fromWorldStateRecord, type WorldStateRecord } from './WorldStateRecords.ts';
import type { WorldState } from '../world/WorldState.ts';

export const SAVE_FORMAT = 'dynasty-save' as const;
export const SAVE_VERSION = 2 as const;

/** Renderer-owned explored cells. Kept in the save envelope, outside simulation state. */
export interface FogRevealRecord {
  readonly observerId: number | null;
  readonly active: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly number[];
}

const INACTIVE_FOG: FogRevealRecord = { observerId: null, active: false, cols: 0, rows: 0, cells: [] };

/** What a list of saves shows without loading any of them. */
export interface SaveSummary {
  readonly seed: string;
  /** Simulation tick, and the clock's own label for it ("Year 3, spring, day 2"). */
  readonly tick: number;
  readonly label: string;
  /** Living people of the detailed comarca, and peoples in the rest of the world (0 on the classic island). */
  readonly living: number;
  readonly peoples: number;
  /** Milliseconds since the epoch, given by the caller. */
  readonly savedAt: number;
}

export interface SaveEnvelope {
  readonly format: typeof SAVE_FORMAT;
  readonly version: typeof SAVE_VERSION;
  readonly summary: SaveSummary;
  readonly world: WorldStateRecord;
  readonly fogReveal: FogRevealRecord;
}

/** Why a text is not a save, in a sentence the UI can show (the caller wraps it in `t`). */
export class SaveError extends Error {
  constructor(readonly reason: 'not_json' | 'not_a_save' | 'newer_version' | 'corrupt', detail = '') {
    super(`${reason}${detail ? `: ${detail}` : ''}`);
    this.name = 'SaveError';
  }
}

export function summaryOf(state: WorldState, savedAt: number): SaveSummary {
  const sim = state.current;
  return {
    seed: String(sim.config.seed), tick: sim.time.tick, label: sim.time.label(),
    living: sim.livingPeople().length, peoples: state.peoples?.sim.peoples.size ?? 0, savedAt,
  };
}

export function serializeSave(state: WorldState, savedAt: number, fogReveal: FogRevealRecord = INACTIVE_FOG): string {
  const envelope: SaveEnvelope = { format: SAVE_FORMAT, version: SAVE_VERSION, summary: summaryOf(state, savedAt), world: toWorldStateRecord(state), fogReveal };
  return JSON.stringify(envelope);
}

/** Read the envelope only: cheap enough to list many saves. Throws `SaveError`. */
export function peekSave(text: string): SaveSummary {
  return parseEnvelope(text).summary;
}

function parseEnvelope(text: string): SaveEnvelope {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SaveError('not_json'); }
  if (raw === null || typeof raw !== 'object' || (raw as SaveEnvelope).format !== SAVE_FORMAT) throw new SaveError('not_a_save');
  const envelope = raw as SaveEnvelope;
  if (!Number.isInteger(envelope.version) || envelope.version < 1) throw new SaveError('not_a_save');
  if (envelope.version > SAVE_VERSION) throw new SaveError('newer_version', String(envelope.version));
  const s = envelope.summary;
  if (!s || typeof s.seed !== 'string' || !Number.isSafeInteger(s.tick) || typeof s.label !== 'string' || !envelope.world) throw new SaveError('not_a_save');
  const fogReveal = (raw as { version: number }).version === 1 ? INACTIVE_FOG : validateFogReveal((raw as SaveEnvelope).fogReveal);
  return { ...envelope, version: SAVE_VERSION, fogReveal } as SaveEnvelope;
}

function validateFogReveal(value: unknown): FogRevealRecord {
  if (value === null || typeof value !== 'object') throw new SaveError('corrupt', 'missing fog reveal');
  const record = value as Partial<FogRevealRecord>;
  const validObserver = record.observerId === null || Number.isSafeInteger(record.observerId) && record.observerId! >= 0;
  const validDims = Number.isSafeInteger(record.cols) && record.cols! >= 0 && Number.isSafeInteger(record.rows) && record.rows! >= 0 &&
    ((record.cols === 0 && record.rows === 0 && record.cells?.length === 0) ||
      (record.cols! > 0 && record.rows! > 0 && record.cols! * record.rows! === record.cells?.length && record.cells!.length <= 4_000_000));
  if (!validObserver || typeof record.active !== 'boolean' || record.active && record.observerId === null || !validDims || !Array.isArray(record.cells) ||
    record.cells.some(cell => cell !== 0 && cell !== 1)) throw new SaveError('corrupt', 'invalid fog reveal');
  return { observerId: record.observerId!, active: record.active, cols: record.cols!, rows: record.rows!, cells: [...record.cells!] };
}

/** Rebuild the whole world. Throws `SaveError` (never half a world): the record readers reject what they do not understand. */
export function deserializeSave(text: string): WorldState {
  const envelope = parseEnvelope(text);
  try { return fromWorldStateRecord(envelope.world); }
  catch (error) { throw new SaveError('corrupt', error instanceof Error ? error.message : String(error)); }
}

/** Load the simulation and the renderer's presentation state together. */
export function deserializeSaveRecord(text: string): { world: WorldState; fogReveal: FogRevealRecord } {
  const envelope = parseEnvelope(text);
  try { return { world: fromWorldStateRecord(envelope.world), fogReveal: envelope.fogReveal }; }
  catch (error) { throw new SaveError('corrupt', error instanceof Error ? error.message : String(error)); }
}
