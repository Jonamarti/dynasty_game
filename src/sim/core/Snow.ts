/**
 * Snow depth: a single scalar clock, advanced once a day, and how it hides
 * what is small.
 *
 * M9.5 phase 2b, the owner's note: small things like sticks may not be
 * visible, and small stuff left on the ground may become invisible as more
 * snow falls on top. A purely cosmetic burial would be a lie — the player
 * would see bare ground while the AI still finds and hauls a stick that, on
 * screen, is not there — so burial has to reach `Brain.findNode`, the entity
 * picker and the renderer in the same pass that paints it.
 *
 * Deliberately not a tile array: per-tile variation comes from the same
 * deterministic positional hash `Renderer.prerenderTerrain` already uses for
 * its speckle, so there is no new grid to keep in sync with the world and no
 * new RNG stream to fork — nothing here can move a seed on its own, only the
 * one `TimeManager.temperature` read every burial check already depends on.
 */
import type { Tree } from '../entities/Tree.ts';
import type { SpatialHash } from './SpatialHash.ts';

/** How deep snow can pile before it stops getting worse. Capped, so a second
 * winter is not simply a worse version of the first with no ceiling. */
export const SNOW_MAX_DEPTH = 3;

/** Depth at which open ground counts as buried. Below a standing tree's
 * canopy the effective depth is a step shallower — see `isBuried` — so shelter
 * is worth seeking rather than just a colour change underfoot. */
export const SNOW_BURY_AT = 2;

/** Below this, today counts as a hard freeze for snowfall purposes. */
export const FREEZE_AT = -0.15;

/**
 * One day's worth of snowfall or thaw. Stepped rather than a fractional drip
 * — a hard freeze is a single discrete event worth noticing, not a number
 * sliding down unnoticed a hundredth at a time — and the colder the day, the
 * heavier the fall, so the worst winters visibly outdo the mild ones.
 */
export function advanceSnowDepth(current: number, temperature: number): number {
  if (temperature >= FREEZE_AT) return Math.max(0, current - 1);
  const severity = Math.min(1, (FREEZE_AT - temperature) / 0.7);
  return Math.min(SNOW_MAX_DEPTH, current + (severity > 0.55 ? 2 : 1));
}

/** A cheap, stable per-tile fraction from the same hash `Renderer` bakes its
 * terrain speckle from — not an RNG draw, only a fixed texture looked up. */
function positionJitter(x: number, y: number): number {
  const h = (Math.floor(x) * 73856093) ^ (Math.floor(y) * 19349663);
  return ((h & 7) / 7) - 0.5; // -0.5..0.5
}

/**
 * Whether a point on the ground is under enough snow to hide what is on it.
 * Deeper in the open than under a standing tree's canopy, which is both true
 * of real snow and the reason a stripped stand of trees is worse in winter
 * than it looks in summer.
 */
export function isBuried(
  x: number, y: number, snowDepth: number, treeHash: SpatialHash<Tree>
): boolean {
  if (snowDepth <= 0) return false;
  const sheltered = treeHash.queryRadius(x, y, 1.5).some(t => t.standing && !t.isSeedling);
  const local = snowDepth - (sheltered ? 1 : 0) + positionJitter(x, y);
  return local >= SNOW_BURY_AT;
}
