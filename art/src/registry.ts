/**
 * Everything the build has to draw, gathered in one place.
 *
 * Each `collect*` function walks the generators and hands every picture to a
 * `Bank`. A bank keeps one copy of each distinct SVG text and records which
 * asset keys point at it, so the ten thousand layers a full crossing of ages,
 * sexes, facings, poses and garments produces collapse to the few thousand
 * that really differ. Adding an object, a garment or a building means adding
 * one generator here; nothing else in the build changes.
 */
import {
  ART_AGES, ART_BAKED_DIRS, ART_POSES, ART_SEXES, anchorKey, personKey,
  type ArtAge, type ArtSex, type PersonAnchors,
} from '../../src/render/ArtManifest.ts';
import { ANIMAL_KINDS, ANIMAL_POSES, paintAnimal } from './animals/animals.ts';
import { BUILDINGS, PLANS } from './buildings/buildings.ts';
import { ell, limb, normalizeIds, poly, shape, stroke, svgDoc } from './lib/draw.ts';
import { BELLY_COVERS, CARRY_SLOTS, SLOT_ORDER, SLOT_TINT, isWoman, personLayers, type FaceExpr, type HairStyle, type PersonSpec, type Wear } from './people/rig.ts';
import { BABY_BEDS, HAND, HELD_KINDS, babyLyingLayers, heldSvg } from './props/held.ts';
import { ITEMS, WOOD, WOOD_D } from './props/items.ts';

/** One picture to rasterise: its SVG text and the size of the canvas it is drawn on. */
export interface Picture { svg: string; w: number; h: number; }

export class Bank {
  readonly pictures: Picture[] = [];
  readonly keys: Record<string, number> = {};
  private readonly bySvg = new Map<string, number>();

  add(key: string, inner: string, w: number, h: number, viewBox?: string): void {
    if (key in this.keys) return;
    const svg = normalizeIds(svgDoc(inner, w, h, viewBox));
    const tag = `${w}x${h}|${svg}`;
    let idx = this.bySvg.get(tag);
    if (idx === undefined) {
      idx = this.pictures.length;
      this.pictures.push({ svg, w, h });
      this.bySvg.set(tag, idx);
    }
    this.keys[key] = idx;
  }
}

export interface Collected { bank: Bank; meta: Record<string, unknown>; }

const CELL = 96;

// ------------------------------------------------------------------- people
const HAIR_STYLES: readonly HairStyle[] = ['short', 'long', 'balding', 'bald'];
const EXPRESSIONS: readonly FaceExpr[] = ['neutral', 'content', 'warm', 'stern', 'frustrated', 'angry', 'afraid', 'strained', 'pained'];
const TORSO: readonly NonNullable<Wear['torso']>[] = ['cape', 'wrap', 'tunic', 'longtunic'];

export function collectPeople(): Collected {
  const bank = new Bank();
  const anchors: Record<string, PersonAnchors> = {};
  const wears: Wear[] = [
    ...TORSO.map(torso => ({ torso })),
    { legs: 'trousers' }, { feet: 'boots' }, { feet: 'wraps' }, { hands: 'gloves' },
    { head: 'cap' }, { head: 'hood' }, { cloak: 'cloak' },
  ];
  for (const age of ART_AGES) {
    for (const sex of ART_SEXES) {
      for (const dir of ART_BAKED_DIRS) {
        for (const pose of ART_POSES) {
          const base: PersonSpec = { age, sex, dir, pose, wear: {}, carry: false, hair: 'short', beard: false, expr: 'neutral' };
          const calls: PersonSpec[] = [base];
          for (const hair of HAIR_STYLES) if (hair !== 'short') calls.push({ ...base, hair });
          if (sex === 'm' && age !== 'infant' && age !== 'child') calls.push({ ...base, beard: true });
          if (dir !== 'N') for (const expr of EXPRESSIONS) if (expr !== 'neutral') calls.push({ ...base, expr });
          for (const wear of wears) calls.push({ ...base, wear });
          const carries = age === 'adolescent' || age === 'adult' || age === 'elder';
          const carryCalls: PersonSpec[] = carries
            ? [{ ...base, carry: true }, { ...base, carry: true, wear: { torso: 'tunic' } }, { ...base, carry: true, wear: { torso: 'longtunic' } }, { ...base, carry: true, wear: { hands: 'gloves' } }]
            : [];
          // M15 phase 19c: the belly of the last third, for women, seen from the
          // front and the side. Bare, and once over each garment that covers it;
          // only its own two slots are kept (the rest is the ordinary figure).
          const bellyCalls: PersonSpec[] = isWoman(age, sex) && dir !== 'N'
            ? [{ ...base, belly: true }, ...[...BELLY_COVERS].map(torso => ({ ...base, belly: true, wear: { torso } as Wear }))]
            : [];
          for (const spec of [...calls, ...carryCalls, ...bellyCalls]) {
            const out = personLayers(spec);
            const ak = anchorKey(age as ArtAge, sex as ArtSex, dir, pose, spec.carry);
            anchors[ak] ??= out.anchors;
            for (const layer of out.layers) {
              // The carrying call redraws every slot; only the ones that change need keeping.
              if (spec.carry && !CARRY_SLOTS.has(layer.slot)) continue;
              if (spec.belly && layer.slot !== 'belly' && layer.slot !== 'belly_wear') continue;
              bank.add(personKey(layer.slot, layer.variant, age, sex, dir, pose), layer.svg, CELL, CELL);
            }
          }
        }
      }
    }
  }
  return {
    bank,
    meta: {
      order: SLOT_ORDER, tint: SLOT_TINT, anchors, carrySlots: [...CARRY_SLOTS], cell: CELL,
      baseline: 88,
    },
  };
}

// -------------------------------------------------------------------- props
export function collectProps(): Collected {
  const bank = new Bank();
  for (const [id, , , draw] of ITEMS) bank.add(`item/${id}`, draw(), 64, 64);
  for (const kind of HELD_KINDS) {
    bank.add(`held/${kind}/S`, heldSvg(kind, false), CELL, CELL);
    bank.add(`held/${kind}/E`, heldSvg(kind, true), CELL, CELL);
  }
  for (const bed of BABY_BEDS) {
    for (const awake of [true, false]) {
      const l = babyLyingLayers(bed, awake);
      const p = `baby/${bed}/${awake ? 'awake' : 'asleep'}`;
      bank.add(`${p}/bed`, l.bed, CELL, CELL);
      bank.add(`${p}/blanket`, l.blanket, CELL, CELL);
      bank.add(`${p}/skin`, l.skin, CELL, CELL);
      bank.add(`${p}/bedfront`, l.bedFront, CELL, CELL);
    }
  }
  return {
    bank,
    meta: {
      handAnchor: HAND,
      tint: { 'baby/*/*/skin': 'skin' },
      items: ITEMS.map(([id, label, tech]) => ({ id, label, tech })),
      heldKinds: [...HELD_KINDS],
      babyBeds: [...BABY_BEDS],
    },
  };
}

// ---------------------------------------------------------------- buildings
/** Units that make one tile in a building drawing: a 3-tile house spans 144. */
const UNIT_PER_TILE = 48;
const EXT_TOP = -14;

export function collectBuildings(): Collected {
  const bank = new Bank();
  const widths: Record<string, number> = {};
  for (const [id, , , w, draw] of BUILDINGS) {
    const vw = w === 288 ? 288 : 144;
    widths[id] = vw;
    bank.add(`b/${id}/ext`, draw(), vw, 126, `0 ${EXT_TOP} ${vw} 126`);
  }
  for (const [id, , w, draw] of PLANS) {
    const vw = w === 288 ? 288 : 144;
    bank.add(`b/${id}/plan`, draw(), vw, 116, `0 -2 ${vw} 116`);
  }
  // A pennant on a pole: the pole and the cloth are separate so the cloth takes the tribe's colour.
  bank.add('banner/pole', limb([[6, 46], [6, 4]], 2.2, WOOD, WOOD_D) + ell(6, 3, 2.4, 2.4, '#d9b04a', WOOD_D), 32, 48);
  bank.add('banner/cloth', shape(poly([[7, 6], [26, 10], [21, 17], [26, 24], [7, 22]]), '#f2f2f2', '#797979') + stroke('M9,14L21,15', '#b8b8b8', 1), 32, 48);
  return {
    bank,
    meta: {
      unitPerTile: UNIT_PER_TILE,
      /** Row of the exterior picture, in px, that the footprint's front edge sits on. */
      groundY: 100 - EXT_TOP,
      planGroundY: 100 + 2,
      widths,
      tint: { 'banner/cloth': 'band' },
      buildings: BUILDINGS.map(([id, label, tech]) => ({ id, label, tech })),
      plans: PLANS.map(([id]) => id),
    },
  };
}

// ------------------------------------------------------------------ animals
export function collectAnimals(): Collected {
  const bank = new Bank();
  for (const kind of ANIMAL_KINDS) for (const pose of ANIMAL_POSES) {
    bank.add(`a/${kind}/E/${pose}`, paintAnimal(kind, pose), CELL, CELL);
  }
  return { bank, meta: { kinds: [...ANIMAL_KINDS], poses: [...ANIMAL_POSES], baseline: 84 } };
}

export const DOMAINS = {
  people: collectPeople,
  props: collectProps,
  buildings: collectBuildings,
  animals: collectAnimals,
} as const;
export type DomainName = keyof typeof DOMAINS;
