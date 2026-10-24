/**
 * Place any station on open ground through the real Simulation API. Since
 * M16 2.22, stations require territory (D-16); a fixture band minutes old has
 * neither claims nor buildings, so every site would refuse everywhere. The
 * helper claims only an otherwise unowned coarse cell for the instant of the
 * call — the same trick as `placeHearthFixtureOnClaimedGround` — and restores the
 * original claims in `finally`. The widening spiral and clearance options
 * reproduce the premises the M15 specs scattered over their own inline scans,
 * so callers can replace those scans wholesale.
 * This function is passed directly to page.evaluate, so it must stay
 * self-contained and serializable.
 */
export function placeStationFixtureOnClaimedGround(arg: {
  kind: string;
  originX?: number;
  originY?: number;
  radiusMin?: number;
  radiusLimit?: number;
  nodeClear?: number;
  treeClear?: number;
  peopleClear?: number;
  footprint?: { width: number; height: number };
  overlap?: { x: number; y: number }[];
  overlapClear?: number;
  shore?: boolean;
}): { id: number; x: number; y: number; centerX: number; centerY: number } {
  const anyWindow = window as any;
  const d = anyWindow.__dynasty;
  const sim = d?.sim;
  const player = sim?.player;
  if (!sim || !player) throw new Error('Station fixture needs a player');
  const band = sim.bands.find((candidate: any) => candidate.id === player.bandId);
  if (!band) throw new Error(`Station fixture has no player band: ${player.bandId}`);

  const originX = arg.originX ?? player.x;
  const originY = arg.originY ?? player.y;
  const radiusMin = arg.radiusMin ?? 3;
  const radiusLimit = arg.radiusLimit ?? 12;
  const nodeClear = arg.nodeClear ?? 2;
  const treeClear = arg.treeClear ?? 2;
  const peopleClear = arg.peopleClear ?? 0;
  const foot = arg.footprint ?? { width: 1, height: 1 };
  const overlapClear = arg.overlapClear ?? 0;
  const bandId = player.bandId;

  // Free ground in every sense the callers used to check before placing:
  // walkable, no building, clear of nodes, standing trees and (asked) people,
  // without a foreign claim. The footprint ring is what the ploughshare
  // fixture checked tile by tile; anchors only is what the others did.
  const open = (x: number, y: number): boolean => {
    if (sim.territoryOwnerAt(x, y) !== null && sim.territoryOwnerAt(x, y) !== bandId) return false;
    if (!sim.world.isWalkable(x, y) || sim.buildingAt(x, y)) return false;
    if (nodeClear > 0 &&
        sim.nodes.some((n: any) => Math.hypot(n.x - x, n.y - y) <= nodeClear)) return false;
    if (treeClear > 0 &&
        sim.trees.some((t: any) => t.standing && Math.hypot(t.x - x, t.y - y) <= treeClear)) return false;
    if (peopleClear > 0 &&
        sim.livingPeople().some((p: any) => Math.hypot(p.x - x, p.y - y) <= peopleClear)) return false;
    for (let dy = 0; dy < foot.height; dy++) {
      for (let dx = 0; dx < foot.width; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!sim.world.isWalkable(tx, ty) || sim.buildingAt(tx, ty)) return false;
        if (sim.trees.some((t: any) =>
          t.standing && Math.hypot(t.x - tx - 0.5, t.y - ty - 0.5) <= treeClear)) return false;
      }
    }
    if (arg.overlap && arg.overlap.some(at =>
      Math.hypot(at.x - x - foot.width / 2, at.y - y - foot.height / 2) <= overlapClear)) return false;
    return true;
  };

  const claimedOneNone = Object.hasOwn(band, 'claimedCells');
  const originalClaims = band.claimedCells as Set<string> | undefined;
  const claims = originalClaims ?? new Set<string>();
  let claimedTemporarily = false;
  let site: any = null;
  // Shore mode walks the world's own shore tiles, nearest first — what the
  // salt-pan fixture did — because a pan must sit at salt water, wherever the
  // coast happens to be.
  const candidates: { x: number; y: number }[] = [];
  if (arg.shore) {
    const shores = [...sim.world.shoreTiles].sort((a: any, b: any) =>
      player.distanceTo(a) - player.distanceTo(b));
    candidates.push(...shores);
  } else {
    for (let radius = radiusMin; radius <= radiusLimit; radius++) {
      for (let angle = 0; angle < 32; angle++) {
        candidates.push({
          x: Math.round(originX + Math.cos(angle * Math.PI / 16) * radius),
          y: Math.round(originY + Math.sin(angle * Math.PI / 16) * radius),
        });
      }
    }
  }
  for (const at of candidates) {
    if (site) break;
      const x = at.x, y = at.y;
      if (!open(x, y)) continue;
      const key = `${Math.floor(x / 8)},${Math.floor(y / 8)}`;
      claimedTemporarily = sim.territoryOwnerAt(x, y) === null && !claims.has(key);
      if (claimedTemporarily) {
        if (!originalClaims) band.claimedCells = claims;
        claims.add(key);
      }
      try {
        site = sim.place(arg.kind, x, y, bandId, null);
      } finally {
        if (claimedTemporarily) {
          claims.delete(key);
          if (!originalClaims) {
            if (claimedOneNone) band.claimedCells = undefined;
            else delete band.claimedCells;
          }
        }
        claimedTemporarily = false;
      }
  }
  if (!site) {
    throw new Error(
      `Could not place the ${arg.kind} fixture in open ground; lastRefusal: ${sim.lastRefusal || '(none recorded)'}`);
  }
  return { id: site.id, x: site.x, y: site.y, centerX: site.centerX, centerY: site.centerY };
}

/**
 * Place a hearth through the real Simulation API. Since M16 2.22, stations
 * require territory; briefly claim only an otherwise unowned coarse cell so
 * these fixtures do not depend on where the generated band happens to start.
 * This function is passed directly to page.evaluate, so it must stay
 * self-contained and serializable.
 */
export function placeHearthFixtureOnClaimedGround(options?: {
  radiusLimit?: number;
  rounding?: 'floor' | 'round';
}): { id: number; x: number; y: number } {
  const d = (window as any).__dynasty;
  const sim = d?.sim;
  const person = sim?.player;
  if (!sim || !person) throw new Error('Hearth fixture needs a player');
  const band = sim.bands.find((candidate: any) => candidate.id === person.bandId);
  if (!band) throw new Error(`Hearth fixture has no player band: ${person.bandId}`);

  const radiusLimit = options?.radiusLimit ?? 22;
  const rounding = options?.rounding ?? 'round';
  let hearth: any = null;
  for (let radius = 4; radius < radiusLimit && !hearth; radius++) {
    const candidates = [[radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius, radius]];
    for (const [dx, dy] of candidates) {
      const x = Math[rounding](person.x + dx);
      const y = Math[rounding](person.y + dy);
      const owner = sim.territoryOwnerAt(x, y);
      if (owner !== null && owner !== person.bandId) continue;

      const key = `${Math.floor(x / 8)},${Math.floor(y / 8)}`;
      const hadClaims = Object.hasOwn(band, 'claimedCells');
      const originalClaims = band.claimedCells as Set<string> | undefined;
      const claims = originalClaims ?? new Set<string>();
      const claimedTemporarily = owner === null && !claims.has(key);
      if (claimedTemporarily) {
        if (!originalClaims) band.claimedCells = claims;
        claims.add(key);
      }
      try {
        hearth = sim.place('hearth', x, y, person.bandId, null);
      } finally {
        if (claimedTemporarily) claims.delete(key);
        if (!originalClaims) {
          if (hadClaims) band.claimedCells = undefined;
          else delete band.claimedCells;
        }
      }
      if (hearth) break;
    }
  }

  if (!hearth) {
    throw new Error(`Could not place a hearth fixture; lastRefusal: ${sim.lastRefusal || '(none recorded)'}`);
  }
  return { id: hearth.id, x: hearth.x, y: hearth.y };
}
