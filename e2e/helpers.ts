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
