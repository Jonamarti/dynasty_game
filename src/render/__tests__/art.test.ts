/**
 * The art pipeline's tripwires (M15 phase 17b).
 *
 * The committed sheets under `public/art/` are what the game loads, and the
 * generators under `art/src/` are what makes them. These tests fail when the
 * two drift apart, and when the game grows something the art does not cover:
 * a new expression, a new species, a new building, a new thing to hold. A
 * missing picture is otherwise a silent blank on screen.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANIMAL_KINDS, ANIMAL_POSES } from '../../../art/src/animals/animals.ts';
import { collectAnimals, collectBuildings, collectPeople, collectProps } from '../../../art/src/registry.ts';
import { personLayers, type PersonSpec } from '../../../art/src/people/rig.ts';
import { ART_AGES, ART_BAKED_DIRS, ART_POSES, ART_SEXES, CHOP_POSES, DIG_POSES, GATHER_POSES, MAKE_POSES, anchorKey, personKey, type ArtManifest, type PersonAnchors } from '../ArtManifest.ts';
import { BUILDINGS } from '../../sim/entities/Building.ts';
import { EXPRESSIONS } from '../../sim/core/Mood.ts';
import { SPECIES } from '../../sim/entities/Animal.ts';
import { DIG_TOOLS } from '../../sim/core/Earth.ts';
import { heldItemFor } from '../Sprites.ts';
import { Person } from '../../sim/entities/Person.ts';
import { RNG } from '../../sim/core/RNG.ts';

const load = (domain: string): ArtManifest =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../public/art/${domain}.json`, import.meta.url)), 'utf8')) as ArtManifest;

/** Buildings drawn by the renderer itself, on purpose: a field is ground that changes with its crop. */
const PROCEDURAL_BUILDINGS = new Set(['field']);

describe('art coverage', () => {
  const people = load('people');
  const props = load('props');
  const buildings = load('buildings');
  const animals = load('animals');

  it('draws every age, sex, facing and pose the renderer can ask for', () => {
    for (const age of ART_AGES) for (const sex of ART_SEXES) for (const dir of ART_BAKED_DIRS) for (const pose of ART_POSES) {
      for (const slot of ['legs', 'torso', 'head'] as const) {
        if (dir === 'E') continue; // the side view splits its legs and arms
        expect(people.keys[personKey(slot, 'base', age, sex, dir, pose)], `${slot} ${age} ${sex} ${dir} ${pose}`).toBeDefined();
      }
      expect(people.keys[personKey('legs_near', 'base', age, sex, 'E', pose)], `side legs ${age} ${sex} ${pose}`).toBeDefined();
    }
  });

  it('has a face for every expression the game can show', () => {
    for (const expr of EXPRESSIONS) for (const dir of ['S', 'E'] as const) {
      expect(people.keys[personKey('face', expr, 'adult', 'm', dir, 'idle')], `${expr} ${dir}`).toBeDefined();
    }
  });

  it('has a hand-held picture for everything the sim can put in a hand', () => {
    const held = props.meta['heldKinds'] as string[];
    // The kinds `Sprites.ts` names today; the renderer would draw nothing for a missing one.
    for (const kind of ['spear', 'bow', 'atlatl', 'sling', 'bone_point', 'copper_dagger', 'handaxe', 'net', 'basket', 'digging_stick', ...DIG_TOOLS.filter(tool => tool.tech).map(tool => tool.item)]) {
      expect(held, kind).toContain(kind);
      expect(props.keys[`held/${kind}/S`]).toBeDefined();
      expect(props.keys[`held/${kind}/E`]).toBeDefined();
    }
  });

  it('draws an inventory icon for the sling', () => {
    expect(props.keys['item/sling']).toBeDefined();
  });

  it('draws an inventory icon for each crafted digging tool', () => {
    for (const tool of DIG_TOOLS.filter(tool => tool.tech)) {
      expect(props.keys[`item/${tool.item}`], tool.item).toBeDefined();
    }
  });

  it('shows the digging tool being used even when the worker also carries a weapon', () => {
    const person = new Person('Worker', 0, 0, 0, new RNG('held-tool'));
    person.inventory.add('spear', 1);
    person.inventory.add('sticks', 1);
    person.inventory.add('antler_pick', 1);
    person.inventory.add('spade', 1);
    person.knownTech.add('bone_working');
    person.knownTech.add('carpentry');
    expect(heldItemFor(person)).toBe('spear');
    person.action = 'dig';
    expect(heldItemFor(person)).toBe('spade');
    person.techLevel.set('bone_working', 20);
    expect(heldItemFor(person)).toBe('antler_pick');
    person.inventory.remove('antler_pick', 1);
    person.inventory.remove('spade', 1);
    expect(heldItemFor(person)).toBe('digging_stick');
  });

  it('draws every species', () => {
    for (const species of SPECIES) {
      expect(ANIMAL_KINDS, species).toContain(species);
      for (const pose of ANIMAL_POSES) expect(animals.keys[`a/${species}/E/${pose}`], `${species} ${pose}`).toBeDefined();
    }
  });

  it('draws every building the sim can place, or says it is drawn in code', () => {
    for (const id of Object.keys(BUILDINGS)) {
      // An earthwork is the ground itself: the terrain bake shows the relief and
      // the renderer marks the plan, so there is no sprite to draw.
      if (PROCEDURAL_BUILDINGS.has(id) || BUILDINGS[id]!.earthwork) continue;
      expect(buildings.keys[`b/${id}/ext`], id).toBeDefined();
    }
  });

  it('gives every roofed building its floor plan', () => {
    // A building whose plan is missing would stay a solid block while somebody stands inside it.
    for (const id of ['mud_hut', 'wattle_hut', 'stone_house', 'longhouse', 'granary', 'library']) {
      expect(buildings.keys[`b/${id}/plan`], id).toBeDefined();
    }
  });
});

describe('art build', () => {
  it('plants the gathering feet while the hand moves, with finite anchors in every body and facing', () => {
    for (const age of ART_AGES) for (const sex of ART_SEXES) for (const dir of ART_BAKED_DIRS) {
      const base: PersonSpec = { age, sex, dir, pose: 'idle', wear: { torso: 'longtunic', hands: 'gloves' }, carry: false, hair: 'long', beard: false, expr: 'neutral' };
      const idle = personLayers(base);
      const grounded = (out: ReturnType<typeof personLayers>) => out.layers.filter(layer => /^(shadow|legs|trousers|feet)/.test(layer.slot));
      const hands = new Set<string>();
      const manifest = load('people');
      const anchors = manifest.meta['anchors'] as Record<string, PersonAnchors>;
      for (const pose of GATHER_POSES) {
        const frame = personLayers({ ...base, pose });
        expect(grounded(frame)).toEqual(grounded(idle));
        expect(anchors[anchorKey(age, sex, dir, pose, false)]).toEqual(frame.anchors);
        expect([...frame.anchors.hr, ...frame.anchors.hl, frame.anchors.bob].every(Number.isFinite)).toBe(true);
        hands.add(JSON.stringify(frame.anchors.hr));
        expect(frame.layers.some(layer => /^(arms|arm_near)$/.test(layer.slot))).toBe(true);
      }
      expect(hands.size).toBe(4);
    }
  });

  it('keeps digging feet planted and gives each tool stroke its own hand anchor', () => {
    for (const age of ART_AGES) for (const sex of ART_SEXES) for (const dir of ART_BAKED_DIRS) {
      const base: PersonSpec = { age, sex, dir, pose: 'idle', wear: { torso: 'longtunic', hands: 'gloves' }, carry: false, hair: 'long', beard: false, expr: 'neutral' };
      const idle = personLayers(base);
      const grounded = (out: ReturnType<typeof personLayers>) => out.layers.filter(layer => /^(shadow|legs|trousers|feet)/.test(layer.slot));
      const hands = new Set<string>();
      const manifest = load('people');
      const anchors = manifest.meta['anchors'] as Record<string, PersonAnchors>;
      for (const pose of DIG_POSES) {
        const frame = personLayers({ ...base, pose });
        expect(grounded(frame)).toEqual(grounded(idle));
        expect(anchors[anchorKey(age, sex, dir, pose, false)]).toEqual(frame.anchors);
        expect([...frame.anchors.hr, ...frame.anchors.hl, frame.anchors.bob].every(Number.isFinite)).toBe(true);
        hands.add(JSON.stringify(frame.anchors.hr));
      }
      expect(hands.size).toBe(4);
    }
  });

  it('draws the same text twice', () => {
    const spec: PersonSpec = { age: 'adult', sex: 'f', dir: 'E', pose: 'w1', wear: { torso: 'tunic', cloak: 'cloak' }, carry: true, hair: 'long', beard: false, expr: 'warm' };
    expect(JSON.stringify(personLayers(spec))).toBe(JSON.stringify(personLayers(spec)));
  });

  it('anchors four distinct axe swings with planted feet in every body and facing', () => {
    const anchors = load('people').meta['anchors'] as Record<string, PersonAnchors>;
    for (const age of ART_AGES) for (const sex of ART_SEXES) for (const dir of ART_BAKED_DIRS) {
      const base: PersonSpec = { age, sex, dir, pose: 'idle', wear: { torso: 'tunic', hands: 'gloves' }, carry: false, hair: 'long', beard: false, expr: 'neutral' };
      const feet = (out: ReturnType<typeof personLayers>) => out.layers.filter(layer => /^(shadow|legs|trousers|feet)/.test(layer.slot));
      const idle = feet(personLayers(base));
      const hands = new Set<string>();
      for (const pose of CHOP_POSES) {
        const frame = personLayers({ ...base, pose });
        expect(feet(frame)).toEqual(idle);
        expect(anchors[anchorKey(age, sex, dir, pose, false)]).toEqual(frame.anchors);
        expect([...frame.anchors.hr, ...frame.anchors.hl].every(Number.isFinite)).toBe(true);
        hands.add(JSON.stringify(frame.anchors.hr));
      }
      expect(hands.size).toBe(4);
    }
  });

  it('gives manipulation four distinct anchors with stable feet in every body and facing', () => {
    const anchors = load('people').meta['anchors'] as Record<string, PersonAnchors>;
    for (const age of ART_AGES) for (const sex of ART_SEXES) for (const dir of ART_BAKED_DIRS) {
      const base: PersonSpec = { age, sex, dir, pose: 'idle', wear: { torso: 'tunic', hands: 'gloves' }, carry: false, hair: 'long', beard: false, expr: 'neutral' };
      const feet = (out: ReturnType<typeof personLayers>) => out.layers.filter(layer => /^(shadow|legs|trousers|feet)/.test(layer.slot));
      const idle = feet(personLayers(base));
      const hands = new Set<string>();
      for (const pose of MAKE_POSES) {
        const frame = personLayers({ ...base, pose });
        expect(feet(frame)).toEqual(idle);
        expect(anchors[anchorKey(age, sex, dir, pose, false)]).toEqual(frame.anchors);
        expect([...frame.anchors.hr, ...frame.anchors.hl].every(Number.isFinite)).toBe(true);
        hands.add(JSON.stringify(frame.anchors.hr));
      }
      expect(hands.size).toBe(4);
    }
  });

  it('keeps the committed sheets in step with the generators', () => {
    // If this fails, run `npm run art:build` and commit public/art.
    const check = (name: string, collected: { bank: { keys: Record<string, number>; pictures: unknown[] } }): void => {
      const m = load(name);
      expect(Object.keys(m.keys).sort(), `${name}: keys`).toEqual(Object.keys(collected.bank.keys).sort());
      expect(m.cells.length, `${name}: pictures`).toBe(collected.bank.pictures.length);
    };
    check('props', collectProps());
    check('buildings', collectBuildings());
    check('animals', collectAnimals());
    check('people', collectPeople());
  }, 60_000);
});
