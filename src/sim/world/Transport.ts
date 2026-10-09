import { ITEMS } from '../entities/Item.ts';
import type { Person } from '../entities/Person.ts';
import { techPower } from '../knowledge/Tech.ts';

export interface JourneyPoint { readonly cx: number; readonly cy: number }
export interface JourneyTransport {
  readonly distance: number;
  readonly days: number;
  readonly maximumDistance: number;
  readonly mode: 'foot' | 'sledge' | 'cart' | 'pack' | 'riding' | 'boat' | 'sail';
  readonly cargoCapacity: number;
  readonly crossedSea: boolean;
}
export interface JourneyTransportOptions {
  readonly person: Person;
  readonly from: JourneyPoint;
  readonly to: JourneyPoint;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly seaCells: number;
  readonly snow: boolean;
  readonly animal?: { readonly mode: 'pack' | 'riding'; readonly capacity: number; readonly speed: number } | null;
}
function equipped(person: Person, item: string): boolean {
  return Object.values(person.equipment).some(slot => slot?.item === item && slot.count > 0 && person.inventory.count(item) > 0);
}
/** Physical possession and knowledge are independent gates. Cart speed applies only on this world route. */
export function journeyTransport(options: JourneyTransportOptions): JourneyTransport | null {
  const { person, from, to } = options;
  const dx = Math.abs(from.cx - to.cx);
  const distance = Math.min(dx, options.mapWidth - dx) + Math.abs(from.cy - to.cy);
  if (!Number.isSafeInteger(distance) || distance < 1 || options.mapHeight < 1 || options.mapWidth < 2) return null;
  const crossedSea = options.seaCells > 0;
  const hasLogboat = person.inventory.count('logboat') > 0 && techPower(person, 'logboat') > 0;
  const hasSail = person.inventory.count('sail') > 0 && techPower(person, 'sail') > 0;
  if (crossedSea && !hasLogboat) return null;
  if (crossedSea && (options.seaCells > 1 || distance > 1) && !hasSail) return null;
  let maximumDistance = 1, cargoCapacity = 0, speed = 1;
  let mode: JourneyTransport['mode'] = 'foot';
  if (options.animal?.mode === 'riding' && techPower(person, 'horse_riding') > 0) {
    maximumDistance = 3; mode = 'riding'; speed = Math.max(speed, options.animal.speed); cargoCapacity += options.animal.capacity;
  } else if (options.animal?.mode === 'pack' && techPower(person, 'pack_animals') > 0) {
    maximumDistance = 2; mode = 'pack'; cargoCapacity += options.animal.capacity;
  }
  if (crossedSea && !hasSail) { maximumDistance = 1; mode = 'boat'; }
  // Sail is the explicit long-distance sea gate. Apply its range before the
  // common range check; checking the coastal range first made the sail node
  // decorative for every non-contiguous route.
  if (crossedSea && hasSail) { mode = 'sail'; maximumDistance = Number.MAX_SAFE_INTEGER; speed = Math.max(speed, 1.5); }
  if (distance > maximumDistance) return null;
  if (equipped(person, 'sledge') && techPower(person, 'sledge') > 0) {
    cargoCapacity += ITEMS.sledge?.container?.capacity ?? 0;
    if (!crossedSea) { mode = 'sledge'; speed *= options.snow ? 1.25 : 0.8; }
  }
  if (equipped(person, 'cart') && techPower(person, 'the_wheel') > 0) {
    cargoCapacity += ITEMS.cart?.container?.capacity ?? 0;
    if (!crossedSea) { mode = 'cart'; speed *= 2; }
  }
  return { distance, days: distance / speed, maximumDistance, mode, cargoCapacity, crossedSea };
}
/** Deterministic wrapped Manhattan route candidate used by the world-map plan. */
export function comarcaRoute(from: JourneyPoint, to: JourneyPoint, mapWidth: number): JourneyPoint[] {
  const east = (to.cx - from.cx + mapWidth) % mapWidth;
  const west = (from.cx - to.cx + mapWidth) % mapWidth;
  const stepX = east <= west ? 1 : -1, horizontal = Math.min(east, west);
  // Coordinates only: a ComarcaIdentity may be passed structurally, but its
  // geography fields do not belong in the persisted route-point schema.
  const result: JourneyPoint[] = [{ cx: from.cx, cy: from.cy }];
  let x = from.cx;
  for (let i = 0; i < horizontal; i++) { x = (x + stepX + mapWidth) % mapWidth; result.push({ cx: x, cy: from.cy }); }
  const stepY = to.cy < from.cy ? -1 : 1;
  let y = from.cy;
  while (y !== to.cy) { y += stepY; result.push({ cx: x, cy: y }); }
  return result;
}
