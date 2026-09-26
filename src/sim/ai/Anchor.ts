import type { Person } from '../entities/Person.ts';
import type { Building } from '../entities/Building.ts';
import type { Household } from '../entities/Household.ts';
import type { MotivationConfig } from '../core/Config.ts';
import type { World } from '../core/World.ts';
import { homeRange } from '../social/Fear.ts';
import { sensitivity } from './Temperament.ts';

export interface Anchor { x: number; y: number; kind: 'carer' | 'home' | 'camp'; carerId: number | null }
export interface AnchorContext {
  world: World;
  peopleById: ReadonlyMap<number, Person>;
  buildingsById: ReadonlyMap<number, Building>;
  householdsById: ReadonlyMap<number, Household>;
  homes: ReadonlyMap<number, { x: number; y: number }>;
  motivation: MotivationConfig;
}

export function childRadius(person: Person, motivation: MotivationConfig): number {
  const years = person.age / person.daysPerYear;
  if (years < 1) return motivation.childRadius.under1;
  if (years < 4) return motivation.childRadius.years1to3;
  if (years < 8) return motivation.childRadius.years4to7;
  if (years < 12) return motivation.childRadius.years8to11;
  return motivation.childRadius.years12to13;
}

export function carerOf(child: Person, ctx: AnchorContext): Person | null {
  const eligible = (id: number | null): Person | null => {
    if (id === null) return null;
    const candidate = ctx.peopleById.get(id);
    return candidate?.alive && candidate.bandId === child.bandId && candidate.captiveOf === null &&
      ctx.world.sameRegion(child.x, child.y, candidate.x, candidate.y) ? candidate : null;
  };
  const mother = eligible(child.motherId);
  if (mother) return mother;
  const father = eligible(child.fatherId);
  if (father) return father;
  const household = child.householdId === null ? null : ctx.householdsById.get(child.householdId);
  if (household && household.headId !== child.id) return eligible(household.headId);
  return null;
}

export function anchorOf(person: Person, ctx: AnchorContext): Anchor | null {
  if (person.isChild) {
    const carer = carerOf(person, ctx);
    if (carer) return { x: carer.x, y: carer.y, kind: 'carer', carerId: carer.id };
  }
  const household = person.householdId === null ? null : ctx.householdsById.get(person.householdId);
  const home = household?.homeBuildingId == null ? null : ctx.buildingsById.get(household.homeBuildingId);
  if (home?.complete && !home.ruined && home.ownerBandId === person.bandId) {
    return { x: home.centerX, y: home.centerY, kind: 'home', carerId: null };
  }
  const camp = ctx.homes.get(person.bandId);
  return camp ? { ...camp, kind: 'camp', carerId: null } : null;
}

export function reachOf(person: Person, ctx: AnchorContext): number {
  if (!ctx.motivation.reachFilter) return Number.POSITIVE_INFINITY;
  if (person.isChild) return childRadius(person, ctx.motivation) + 4;
  let reach = Math.min(homeRange(person), ctx.motivation.reachAdult / sensitivity(person, 'home'));
  const hasYoungChild = person.childIds.map(id => ctx.peopleById.get(id)).some(child => child?.alive && child.isChild &&
    child.bandId === person.bandId && child.age < 4 * child.daysPerYear &&
    (child.motherId === person.id || (child.fatherId === person.id &&
      (!ctx.peopleById.get(child.motherId ?? -1)?.alive || ctx.peopleById.get(child.motherId ?? -1)?.bandId !== person.bandId))));
  if (hasYoungChild) reach = Math.min(reach, ctx.motivation.parentReach);
  return reach;
}

export function withinReach(anchor: Anchor | null, reach: number, x: number, y: number): boolean {
  return !anchor || Math.hypot(x - anchor.x, y - anchor.y) <= reach;
}
