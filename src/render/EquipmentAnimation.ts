/** Reads the object actually fitted to a working person's hands. */
import type { Person } from '../sim/entities/Person.ts';
import { ITEMS } from '../sim/entities/Item.ts';
import { AXE_TOOLS } from '../sim/knowledge/Tech.ts';
import type { HeldItemKind } from './Sprites.ts';

const HELD_ART: Readonly<Record<string, HeldItemKind>> = {
  handaxe: 'handaxe',
  // The atlas has one small stone axe silhouette; the polished head is the
  // same outline at game scale, so both fitted axe stages use that cell.
  stone_axe: 'handaxe',
  // The cast axe is the same head on a haft; the dagger has a held picture of its own.
  copper_axe: 'handaxe',
  bronze_axe: 'handaxe',
  iron_axe: 'handaxe',
  copper_dagger: 'copper_dagger',
  bronze_sword: 'bronze_sword',
  // The same silhouette; the atlas keeps the steel colour on its inventory icon.
  steel_sword: 'bronze_sword',
  spear: 'spear',
  bow: 'bow',
  atlatl: 'atlatl',
  sling: 'sling',
  bone_point: 'bone_point',
};

/**
 * `undefined` means this action/configuration uses the legacy inventory read.
 * `null` means hands should look empty because no drawable fitted item exists.
 */
export function fittedActionToolFor(
  person: Person, autoEquipTools: boolean,
): HeldItemKind | null | undefined {
  if (!autoEquipTools || (person.action !== 'chop' && person.action !== 'hunt')) return undefined;

  const handItems = [person.equipment.right?.item, person.equipment.left?.item].filter(
    (item): item is string => !!item,
  );
  // Choosing by effectiveness here would inspect a stranger's techniques and
  // pack. The executor fits the tool; presentation observes hands, preferring
  // a visible action tool and then the right-hand object, without inferring skill.
  const fitted = handItems.find(item => person.action === 'chop'
    ? AXE_TOOLS.some(axe => axe.item === item)
    : !!ITEMS[item]?.weapon) ?? handItems[0] ?? null;
  return fitted === null ? null : HELD_ART[fitted] ?? null;
}
