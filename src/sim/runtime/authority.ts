import type { IdSpace } from '../core/IdSpace.ts';

/** Raised when a stale simulation or a consumed parked handle is used. */
export class SimulationAuthorityError extends Error {
  constructor(message = 'Simulation authority has been transferred') {
    super(message);
    this.name = 'SimulationAuthorityError';
  }
}

const owners = new WeakMap<object, boolean | 'transferring'>();
interface ParkedState {
  readonly checkpoint: unknown;
  readonly ids: IdSpace;
  consumed: boolean;
  inFlight: boolean;
}
const parkedStates = new WeakMap<ParkedSimulation, ParkedState>();

/** Opaque, in-memory handoff. JSON checkpoints remain reusable independent clones. */
export class ParkedSimulation {}

/** Called by Simulation's constructor; authority state is kept outside public fields. */
export function registerExecutionOwner(owner: object): void {
  if (owners.has(owner)) throw new TypeError('Simulation owner already registered');
  owners.set(owner, true);
}

export function assertExecutionOwner(owner: object): void {
  if (owners.get(owner) !== true) throw new SimulationAuthorityError();
}

/** Hydration may be retried after failure; successful hydration consumes the handle. */
export function resumeParkedSimulation<T extends object>(
  handle: ParkedSimulation,
  reconstruct: (checkpoint: unknown, ids: IdSpace) => T,
): T {
  const state = parkedStates.get(handle);
  if (!state || state.consumed || state.inFlight) throw new SimulationAuthorityError();
  state.inFlight = true;
  try {
    const destination = reconstruct(state.checkpoint, state.ids);
    assertExecutionOwner(destination);
    state.consumed = true;
    // The handle remains unusable because it is no longer present in the WeakMap;
    // dropping the value also releases its checkpoint graph and shared allocator.
    parkedStates.delete(handle);
    return destination;
  } finally {
    state.inFlight = false;
  }
}

/** Capture first; only after that succeeds is the live source parked. */
export function parkExecutionOwner(owner: object, checkpoint: unknown, ids: IdSpace): ParkedSimulation {
  assertExecutionOwner(owner);
  const handle = new ParkedSimulation();
  parkedStates.set(handle, { checkpoint, ids, consumed: false, inFlight: false });
  owners.set(owner, false);
  return handle;
}

/** Atomic live handoff. Failed reconstruction leaves the original owner active. */
export function transferSimulationAuthority<T extends object, U extends object>(
  source: T,
  reconstruct: () => U,
): U {
  assertExecutionOwner(source);
  owners.set(source, 'transferring');
  try {
    const destination = reconstruct();
    if ((destination as object) === (source as object)) throw new SimulationAuthorityError('Transfer must create a distinct Simulation owner');
    assertExecutionOwner(destination);
    owners.set(source, false);
    return destination;
  } catch (error) {
    owners.set(source, true);
    throw error;
  }
}
