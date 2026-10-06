/**
 * Local freshwater features derived from an elevation field. Regional feature
 * flags are only candidate areas: this module still has to find a channel or
 * a real depression before any tile becomes water.
 *
 * The generator is pure. Its small coordinate hash is only used to thin
 * spring candidates; it never reads or advances a Simulation RNG stream.
 */

export const HYDROLOGY_NONE = 0;
export const HYDROLOGY_FRESH = 1;

export interface HydrologyRiver {
  /** Index of the high-side entry tile in the local grid. */
  source: number;
  /** Index of the low-side exit tile, or null when the route ends in a basin. */
  outlet: number | null;
  /** Ordered from source to outlet; elevation never increases along this list. */
  tiles: readonly number[];
}

export interface HydrologyInput {
  width: number;
  height: number;
  /** Ground elevation, in the same units as `waterLevel`. */
  elevation: Float32Array;
  moisture: Float32Array;
  /** Nonzero only where a regional river feature is a plausible source. */
  riverCandidates: Uint8Array;
  /** Rasterized global centerline corridor, used to keep traces on its path. */
  riverCorridor?: Uint8Array;
  /** Nonzero where regional lake metadata overlaps the local elevation field. */
  lakeCandidates: Uint8Array;
  /** Canonical downhill direction, independent of the local patch bounds. */
  flowX: Int8Array;
  flowY: Int8Array;
  /** Global tile-centre coordinates, used only for stable spring thinning. */
  globalX: Float64Array;
  globalY: Float64Array;
  /** Shared macro-network distance to outlet, equal on either side of a map seam. */
  riverDistance?: Float64Array;
  /** Canonical, descending absolute river surface sampled from the macro segment. */
  riverSurface?: Float32Array;
  /** Ford spacing in comarca units; maps at equal tile resolution share this phase. */
  fordInterval?: number;
  waterLevel: number;
  wadeDepth: number;
  swimDepth: number;
}

export interface HydrologyResult {
  /** 0 means no natural water; 1 means a local freshwater feature. */
  readonly kind: Uint8Array;
  /** Absolute water-surface elevation. Zero where kind is `HYDROLOGY_NONE`. */
  readonly surface: Float32Array;
  /** Carved bed height; unchanged away from generated water. */
  readonly bed: Float32Array;
  readonly rivers: readonly HydrologyRiver[];
}

export function generateLocalHydrology(input: HydrologyInput): HydrologyResult {
  validate(input);
  const n = input.width * input.height;
  const fordInterval = input.fordInterval ?? 0;
  const fordTolerance = fordInterval > 0 ? localTileRadius(input) : 0;
  const kind = new Uint8Array(n);
  const surface = new Float32Array(n);
  const bed = input.elevation.slice();
  const claimed = new Uint8Array(n);
  const rivers: HydrologyRiver[] = [];

  if (input.riverCorridor && input.riverDistance && input.riverSurface && fordInterval > 0) {
    rasterCanonicalRivers(input, kind, surface, bed, claimed, rivers, fordInterval, fordTolerance);
  } else {
    // A regional river flag is deliberately sparse in the local map: only
    // candidate cells at a channel head can start a course. Steepest descent
    // then determines the path, so a flag never paints an entire region blue.
    const starts = candidateIndices(input.riverCandidates);
    for (let i = starts.length - 1; i >= 0; i--) {
      if (input.elevation[starts[i]!]! <= input.waterLevel) starts.splice(i, 1);
    }
    starts.sort((a, b) => input.elevation[b]! - input.elevation[a]! || a - b);
    for (const source of starts) {
      if (claimed[source]) continue;
      const route = traceDownhill(input, source, claimed);
      if (route.tiles.length < 2) continue;
      for (let step = 0; step < route.tiles.length; step++) {
        const index = route.tiles[step]!;
        claimed[index] = 1;
        kind[index] = HYDROLOGY_FRESH;
        // The surface follows the falling terrain. The channel is cut below it,
        // so water does not sit above unmodified river banks and spread inland.
        const wantsFord = input.riverDistance && fordInterval > 0
          ? isCanonicalFord(input.riverDistance[index]!, fordInterval, fordTolerance)
          : step % 9 === 4;
        const targetDepth = wantsFord ? input.wadeDepth * 0.65 : input.swimDepth * 1.15;
        const waterSurface = input.elevation[index]!;
        surface[index] = waterSurface;
        const depth = targetDepth;
        bed[index] = waterSurface - depth;
        widenRiver(input, route.tiles, step, kind, surface, bed, claimed, depth);
      }
      rivers.push({ source, outlet: route.outlet, tiles: route.tiles });
    }
  }

  fillCandidateLakes(input, kind, surface, bed, claimed);
  addSprings(input, kind, surface, bed, claimed);

  return { kind, surface, bed, rivers };
}

function traceDownhill(input: HydrologyInput, source: number, claimed: Uint8Array): { tiles: number[]; outlet: number | null } {
  const tiles = [source];
  const visited = new Uint8Array(input.width * input.height);
  visited[source] = 1;
  let current = source;
  let outlet: number | null = null;
  const maxSteps = Math.min(input.width * input.height, input.width + input.height + 8);
  for (let step = 0; step < maxSteps && outlet === null; step++) {
    const x = current % input.width;
    const y = Math.floor(current / input.width);
    const flowX = input.flowX[current]!;
    const flowY = input.flowY[current]!;
    let next = -1;
    let nextHeight = input.elevation[current]!;
    const currentHeight = input.elevation[current]!;
    let nextAlignment = -Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= input.width || yy >= input.height) continue;
      const candidate = yy * input.width + xx;
      const height = input.elevation[candidate]!;
      if (visited[candidate] || height >= currentHeight) continue;
      if (input.riverCorridor && !input.riverCorridor[candidate]) continue;
      if (input.riverDistance && Number.isFinite(input.riverDistance[current]!) &&
          (!Number.isFinite(input.riverDistance[candidate]!) ||
           input.riverDistance[candidate]! >= input.riverDistance[current]!)) continue;
      const projection = dx * flowX + dy * flowY;
      const alignment = flowX === 0 && flowY === 0 ? 0 :
        projection / (Math.hypot(flowX, flowY) * Math.hypot(dx, dy));
      if ((flowX !== 0 || flowY !== 0) && projection <= 0) continue;
      if (alignment > nextAlignment || (alignment === nextAlignment && height < nextHeight) ||
          (alignment === nextAlignment && height === nextHeight && (next < 0 || candidate < next))) {
        next = candidate;
        nextHeight = height;
        nextAlignment = alignment;
      }
    }
    if (next < 0 || claimed[next]) break;
    // The local river ends at the sea surface. The coastal tile remains the
    // mouth of a freshwater course, while the next tile retains its salt or
    // open-ocean classification in World.
    if (input.elevation[next]! < input.waterLevel) {
      outlet = current;
      break;
    }
    current = next;
    visited[current] = 1;
    tiles.push(current);
    if (current !== source && onEdge(current, input.width, input.height)) outlet = current;
  }
  return { tiles, outlet };
}

function widenRiver(input: HydrologyInput, route: readonly number[], step: number,
  kind: Uint8Array, surface: Float32Array, bed: Float32Array, claimed: Uint8Array, depth: number): void {
  const center = route[step]!;
  const previous = route[Math.max(0, step - 1)]!;
  const next = route[Math.min(route.length - 1, step + 1)]!;
  const dx = Math.sign((next % input.width) - (previous % input.width));
  const dy = Math.sign(Math.floor(next / input.width) - Math.floor(previous / input.width));
  // Rivers stay one to three tiles wide. A stable width is important at local
  // map edges: tying width to the route's local step number made a one-tile
  // stream disappear and reappear where two detailed maps met.
  const radius = 1;
  for (let side = -radius; side <= radius; side++) {
    if (side === 0) continue;
    const x = center % input.width - dy * side;
    const y = Math.floor(center / input.width) + dx * side;
    if (x < 0 || y < 0 || x >= input.width || y >= input.height) continue;
    const index = y * input.width + x;
    const sideDepth = input.elevation[center]! + depth - input.elevation[index]!;
    if (claimed[index] || input.elevation[index]! < input.waterLevel ||
        sideDepth <= 0 || sideDepth > input.swimDepth * 1.4) continue;
    claimed[index] = 1;
    kind[index] = HYDROLOGY_FRESH;
    surface[index] = input.elevation[index]!;
    bed[index] = surface[index]! - sideDepth;
  }
}

function fillCandidateLakes(input: HydrologyInput, kind: Uint8Array, surface: Float32Array,
  bed: Float32Array, claimed: Uint8Array): void {
  const candidates = candidateIndices(input.lakeCandidates).filter(index => !claimed[index]);
  if (candidates.length === 0) return;
  let basin = candidates[0]!;
  for (const index of candidates) if (input.elevation[index]! < input.elevation[basin]!) basin = index;
  if (input.elevation[basin]! < input.waterLevel) return;
  let spill = Infinity;
  for (const index of boundaryIndices(input.width, input.height)) spill = Math.min(spill, input.elevation[index]!);
  // A flat or open region is not a lake. There must be a measurable bowl, and
  // the filled footprint is capped so coarse atlas flags cannot flood a map.
  if (!(spill > input.elevation[basin]! + input.wadeDepth)) return;
  const level = Math.min(spill, input.elevation[basin]! + input.swimDepth * 1.5);
  const basinTiles: number[] = [];
  const queue = [basin];
  const visited = new Uint8Array(input.width * input.height);
  visited[basin] = 1;
  while (queue.length) {
    const index = queue.pop()!;
    if (claimed[index] || input.elevation[index]! < input.waterLevel || input.elevation[index]! > level) continue;
    basinTiles.push(index);
    const x = index % input.width, y = Math.floor(index / input.width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= input.width || yy >= input.height) continue;
      const next = yy * input.width + xx;
      if (!visited[next] && input.elevation[next]! >= input.waterLevel && input.elevation[next]! <= level) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }
  if (basinTiles.length === 0 || basinTiles.length > input.width * input.height * 0.4) return;
  for (const index of basinTiles) {
    kind[index] = HYDROLOGY_FRESH;
    surface[index] = level;
    bed[index] = input.elevation[index]!;
    claimed[index] = 1;
  }
}

function addSprings(input: HydrologyInput, kind: Uint8Array, surface: Float32Array,
  bed: Float32Array, claimed: Uint8Array): void {
  const n = input.width * input.height;
  const spacing = 257;
  for (let i = 0; i < n; i++) {
    if (claimed[i] || input.moisture[i]! < 0.64 || stableHash(input.globalX[i]!, input.globalY[i]!) % spacing !== 0) continue;
    const low = lowestNeighbor(input, i);
    if (low < 0 || input.elevation[low]! < input.waterLevel ||
        input.elevation[i]! - input.elevation[low]! < input.wadeDepth * 0.35) continue;
    // The spring is at the foot of a wet slope. One or two adjoining low tiles
    // make a source visible in the terrain without fabricating a broad lake.
    const level = input.elevation[low]!;
    kind[low] = HYDROLOGY_FRESH;
    surface[low] = level;
    bed[low] = level - input.wadeDepth * 0.5;
    claimed[low] = 1;
    break;
  }
}

function lowestNeighbor(input: HydrologyInput, index: number): number {
  const x = index % input.width, y = Math.floor(index / input.width);
  let low = -1, height = input.elevation[index]!;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= input.width || yy >= input.height) continue;
    const next = yy * input.width + xx;
    if (input.elevation[next]! < height) { low = next; height = input.elevation[next]!; }
  }
  return low;
}

function candidateIndices(mask: Uint8Array): number[] {
  const indices: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) indices.push(i);
  return indices;
}

function boundaryIndices(width: number, height: number): number[] {
  const result: number[] = [];
  for (let x = 0; x < width; x++) result.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) result.push(y * width, y * width + width - 1);
  return result;
}

function onEdge(index: number, width: number, height: number): boolean {
  const x = index % width, y = Math.floor(index / width);
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

function stableHash(x: number, y: number): number {
  // Quantized global coordinates are stable across adjacent local maps.
  let hash = Math.imul(Math.round(x * 4096) ^ 0x9e3779b9, 0x85ebca6b);
  hash = Math.imul(hash ^ Math.round(y * 4096), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function validate(input: HydrologyInput): void {
  const n = input.width * input.height;
  if (!Number.isInteger(input.width) || input.width < 2 || !Number.isInteger(input.height) || input.height < 2 ||
      input.elevation.length !== n || input.moisture.length !== n || input.riverCandidates.length !== n ||
      (input.riverCorridor !== undefined && input.riverCorridor.length !== n) ||
      input.lakeCandidates.length !== n || input.flowX.length !== n || input.flowY.length !== n ||
      input.globalX.length !== n || input.globalY.length !== n ||
      (input.riverDistance !== undefined && input.riverDistance.length !== n) ||
      (input.riverSurface !== undefined && input.riverSurface.length !== n) ||
      (input.fordInterval !== undefined && (!Number.isFinite(input.fordInterval) || input.fordInterval <= 0)) ||
      !Number.isFinite(input.waterLevel) || !Number.isFinite(input.wadeDepth) || input.wadeDepth <= 0 ||
      !Number.isFinite(input.swimDepth) || input.swimDepth <= input.wadeDepth) {
    throw new RangeError('Invalid local hydrology grid or water-depth thresholds');
  }
}

function rasterCanonicalRivers(input: HydrologyInput, kind: Uint8Array, surface: Float32Array,
  bed: Float32Array, claimed: Uint8Array, rivers: HydrologyRiver[], fordInterval: number,
  fordTolerance: number): void {
  const n = input.width * input.height;
  for (let index = 0; index < n; index++) {
    const waterSurface = input.riverSurface![index]!;
    if (!input.riverCorridor![index] || !Number.isFinite(input.riverDistance![index]!) ||
        !Number.isFinite(waterSurface) || input.elevation[index]! < input.waterLevel ||
        waterSurface < input.waterLevel) continue;
    const ford = isCanonicalFord(input.riverDistance![index]!, fordInterval, fordTolerance);
    const depth = ford ? input.wadeDepth * 0.65 : input.swimDepth * 1.15;
    kind[index] = HYDROLOGY_FRESH;
    surface[index] = waterSurface;
    bed[index] = waterSurface - depth;
    claimed[index] = 1;
  }

  // Report the rasterized courses in upstream-to-downstream order. Their
  // cells came from the shared geographic line above, so crops cannot choose
  // a different head or restart the ford phase.
  const next = new Int32Array(n).fill(-1);
  const incoming = new Uint8Array(n);
  for (let index = 0; index < n; index++) {
    if (kind[index] !== HYDROLOGY_FRESH) continue;
    const x = index % input.width, y = Math.floor(index / input.width);
    const flowX = input.flowX[index]!, flowY = input.flowY[index]!;
    let best = -1, bestAlignment = -Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= input.width || yy >= input.height) continue;
      const candidate = yy * input.width + xx;
      if (kind[candidate] !== HYDROLOGY_FRESH ||
          input.riverDistance![candidate]! >= input.riverDistance![index]! ||
          surface[candidate]! >= surface[index]!) continue;
      const projection = dx * flowX + dy * flowY;
      if ((flowX || flowY) && projection <= 0) continue;
      const alignment = (flowX || flowY)
        ? projection / (Math.hypot(flowX, flowY) * Math.hypot(dx, dy))
        : 0;
      if (alignment > bestAlignment ||
          (alignment === bestAlignment && (best < 0 || input.riverDistance![candidate]! < input.riverDistance![best]!)) ||
          (alignment === bestAlignment && best >= 0 && input.riverDistance![candidate] === input.riverDistance![best] && candidate < best)) {
        best = candidate;
        bestAlignment = alignment;
      }
    }
    next[index] = best;
    if (best >= 0) incoming[best]++;
  }

  // Each listed river is now an actual directed course; confluences produce
  // one course per incoming arm instead of a component sorted into a fake line.
  const visitedEdges = new Set<string>();
  for (let start = 0; start < n; start++) {
    if (kind[start] !== HYDROLOGY_FRESH || incoming[start] > 0) continue;
    const tiles = [start];
    let current = start;
    while (next[current]! >= 0) {
      const downstream = next[current]!;
      const edge = `${current}:${downstream}`;
      if (visitedEdges.has(edge)) break;
      visitedEdges.add(edge);
      tiles.push(downstream);
      current = downstream;
    }
    if (tiles.length > 1) rivers.push({ source: start, outlet: current, tiles });
  }
}

function isCanonicalFord(distance: number, interval: number, tolerance: number): boolean {
  if (!Number.isFinite(distance)) return false;
  const phase = ((distance % interval) + interval) % interval;
  return Math.min(phase, interval - phase) <= tolerance;
}

function localTileRadius(input: HydrologyInput): number {
  const xStep = input.width > 1 ? Math.abs(input.globalX[1]! - input.globalX[0]!) : 0;
  const yStep = input.height > 1 ? Math.abs(input.globalY[input.width]! - input.globalY[0]!) : 0;
  return Math.hypot(xStep, yStep) * 0.55;
}
