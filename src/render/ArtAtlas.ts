/**
 * Loads the committed art sheets and composes people from their layers.
 *
 * M15 phase 17c. `npm run art:build` cuts every layer of every figure out of
 * `public/art/*.png`; this file puts them back together. A person is the
 * stack of pictures the manifest's `order` lists for their facing: shadow,
 * legs, torso, the default loincloth, any garments, arms, hands, head, hair.
 * Skin, hair and the tribe's colour were drawn in white and grey and are
 * multiplied by the wearer's colours here, so ten skin tones cost no extra
 * sheets.
 *
 * Composing is the expensive step, so the result is cached per distinct
 * appearance (`aspectKey`) and drawing a person on screen is one `drawImage`.
 * The cache is bounded: a crowd of a thousand distinct people fits, and past
 * that the least recently drawn appearance is dropped and rebuilt on demand.
 *
 * Nothing here reads the simulation. The renderer builds a `PersonAspect`
 * from a `Person` and hands it over; the direction is deduced from
 * movement by the renderer, never stored (M15 rule 15).
 */
import {
  anchorKey, personKey, CARRY_SUFFIX,
  type ArtAge, type ArtCell, type ArtDir, type ArtManifest, type ArtPose, type ArtSex, type ArtTint, type PersonAnchors,
} from './ArtManifest.ts';

export interface WornGarments {
  torso?: 'cape' | 'wrap' | 'tunic' | 'longtunic';
  legs?: 'trousers';
  feet?: 'boots' | 'wraps';
  hands?: 'gloves';
  head?: 'cap' | 'hood';
  cloak?: 'cloak';
}

export interface PersonAspect {
  age: ArtAge;
  sex: ArtSex;
  dir: ArtDir;
  pose: ArtPose;
  /** `#rrggbb` multipliers for the three colour slots. */
  skin: string;
  hair: string;
  band: string;
  hairStyle: 'short' | 'long' | 'balding' | 'bald';
  beard: boolean;
  expression: string;
  wear: WornGarments;
  carryBaby: boolean;
  held: string | null;
}

/** Slots that stay planted when the upper body bobs in the walk. */
const GROUNDED = /^(shadow|legs|trousers|feet)/;

const CACHE_LIMIT = 1500;
const TINT_LIMIT = 6000;

export class ArtAtlas {
  private readonly people: ArtManifest;
  private readonly props: ArtManifest;
  private readonly others: Record<string, ArtManifest>;
  private readonly sheets = new Map<string, HTMLImageElement>();
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly tints = new Map<string, HTMLCanvasElement>();

  private constructor(people: ArtManifest, props: ArtManifest, others: Record<string, ArtManifest>, sheets: Map<string, HTMLImageElement>) {
    this.people = people;
    this.props = props;
    this.others = others;
    for (const [k, v] of sheets) this.sheets.set(k, v);
  }

  /** Fetch the manifests and every sheet they name. */
  static async load(base = 'art/'): Promise<ArtAtlas> {
    const url = (f: string): string => new URL(base + f, document.baseURI).href;
    const all = await Promise.all(
      ['people', 'props', 'buildings', 'animals'].map(async d => (await fetch(url(d + '.json'))).json() as Promise<ArtManifest>)
    );
    const [people, props, buildings, animals] = all as [ArtManifest, ArtManifest, ArtManifest, ArtManifest];
    const sheets = new Map<string, HTMLImageElement>();
    await Promise.all(all.flatMap(m => m.sheets).map(async f => {
      const img = new Image();
      img.src = url(f);
      await img.decode();
      sheets.set(f, img);
    }));
    return new ArtAtlas(people, props, { buildings, animals }, sheets);
  }


  private cellOf(m: ArtManifest, key: string): ArtCell | null {
    const i = m.keys[key];
    if (i === undefined) return null;
    const c = m.cells[i]!;
    return c[3] === 0 ? null : c;
  }

  private tinted(m: ArtManifest, key: string, cell: ArtCell, color: string): CanvasImageSource {
    const tk = `${m.domain}:${m.keys[key]}|${color}`;
    let t = this.tints.get(tk);
    if (!t) {
      const [s, x, y, w, h] = cell;
      t = document.createElement('canvas');
      t.width = w; t.height = h;
      const c = t.getContext('2d')!;
      const sheet = this.sheets.get(m.sheets[s]!)!;
      c.drawImage(sheet, x, y, w, h, 0, 0, w, h);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(sheet, x, y, w, h, 0, 0, w, h);
      if (this.tints.size >= TINT_LIMIT) this.tints.delete(this.tints.keys().next().value!);
      this.tints.set(tk, t);
    }
    return t;
  }

  private blit(dst: CanvasRenderingContext2D, m: ArtManifest, key: string, tint: string | null, dx: number, dy: number): void {
    const cell = this.cellOf(m, key);
    if (!cell) return;
    const [s, x, y, w, h, ox, oy] = cell;
    if (tint) dst.drawImage(this.tinted(m, key, cell, tint), ox + dx, oy + dy);
    else dst.drawImage(this.sheets.get(m.sheets[s]!)!, x, y, w, h, ox + dx, oy + dy, w, h);
  }

  /** The stable text an appearance is cached under. */
  static aspectKey(a: PersonAspect): string {
    const w = a.wear;
    return [
      a.age, a.sex, a.dir, a.pose, a.skin, a.hair, a.band, a.hairStyle, a.beard ? 'b' : '-', a.expression,
      w.torso ?? '', w.legs ?? '', w.feet ?? '', w.hands ?? '', w.head ?? '', w.cloak ?? '',
      a.carryBaby ? 'c' : '', a.held ?? '',
    ].join('|');
  }

  /** A 96 px canvas with the whole figure on it, feet at y = 88. */
  compose(a: PersonAspect): HTMLCanvasElement {
    const key = ArtAtlas.aspectKey(a);
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const cell = this.people.cell;
    const canvas = document.createElement('canvas');
    canvas.width = cell; canvas.height = cell;
    const ctx = canvas.getContext('2d')!;
    const mirror = a.dir === 'W';
    const dir: 'S' | 'E' | 'N' = a.dir === 'W' ? 'E' : a.dir;
    if (mirror) { ctx.translate(cell, 0); ctx.scale(-1, 1); }

    const order = (this.people.meta['order'] as Record<string, string[]>)[dir]!;
    const tintOf = this.people.meta['tint'] as Record<string, ArtTint>;
    const carrySlots = new Set(this.people.meta['carrySlots'] as string[]);
    const anchors = (this.people.meta['anchors'] as Record<string, PersonAnchors>);
    const anchor = anchors[anchorKey(a.age, a.sex, dir, a.pose, a.carryBaby)] ?? anchors[anchorKey(a.age, a.sex, dir, a.pose, false)]!;
    const w = a.wear;
    const covers = !!w.legs || w.torso === 'tunic' || w.torso === 'longtunic';
    const bandCovered = w.torso === 'tunic' || w.torso === 'longtunic' || w.torso === 'wrap';

    for (const slot of order) {
      const base = slot.replace(/_(far|near)$/, '');
      let variant: string | null = 'base';
      switch (base) {
        case 'loincloth': if (covers) variant = null; break;
        case 'chestband': if (bandCovered) variant = null; break;
        case 'hands': case 'hand': variant = w.hands ?? 'base'; break;
        case 'trousers': variant = w.legs ?? null; break;
        case 'feet': variant = w.feet ?? null; break;
        case 'torso_wear': case 'sleeves': case 'sleeve': variant = w.torso ?? null; break;
        case 'cloak_back': case 'cloak_front': variant = w.cloak ?? null; break;
        case 'hair': case 'hair_back': case 'shine': variant = a.hairStyle; break;
        case 'face': variant = a.expression; break;
        case 'beard': variant = a.beard ? 'beard' : null; break;
        case 'head_back': case 'head_wear': variant = w.head ?? null; break;
        case 'baby': case 'baby_skin': variant = a.carryBaby ? 'baby' : null; break;
        case 'held': break;
        default: break;
      }
      if (variant === null) continue;
      const dy = GROUNDED.test(slot) ? 0 : anchor.bob;
      if (slot === 'held') {
        if (!a.held) continue;
        const hk = `held/${a.held}/${dir === 'E' ? 'E' : 'S'}`;
        const hand = this.props.meta['handAnchor'] as [number, number];
        this.blit(ctx, this.props, hk, null, anchor.hr[0] - hand[0], anchor.hr[1] - hand[1] + dy);
        continue;
      }
      if (a.carryBaby && carrySlots.has(slot)) variant += CARRY_SUFFIX;
      const tintSlot = tintOf[slot];
      // A glove is leather, not skin: only bare pictures take the skin colour.
      const glove = (base === 'hands' || base === 'hand') && w.hands;
      const colour = glove ? null : tintSlot === 'skin' ? a.skin : tintSlot === 'hair' ? a.hair : tintSlot === 'band' ? a.band : null;
      this.blit(ctx, this.people, personKey(slot, variant, a.age, a.sex, dir, a.pose), colour, 0, dy);
    }

    if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, canvas);
    return canvas;
  }

  /**
   * Draw one picture from any domain at `x, y` (where its original cell's
   * top-left would be), `scale` px per art px, optionally tinted.
   */
  drawAsset(ctx: CanvasRenderingContext2D, domain: 'people' | 'props' | 'buildings' | 'animals', key: string, x: number, y: number, scale: number, tint: string | null = null): void {
    const m = domain === 'people' ? this.people : domain === 'props' ? this.props : this.others[domain]!;
    const cell = this.cellOf(m, key);
    if (!cell) return;
    const [s, sx, sy, w, h, ox, oy] = cell;
    const src = tint ? this.tinted(m, key, cell, tint) : this.sheets.get(m.sheets[s]!)!;
    if (tint) ctx.drawImage(src, x + ox * scale, y + oy * scale, w * scale, h * scale);
    else ctx.drawImage(src, sx, sy, w, h, x + ox * scale, y + oy * scale, w * scale, h * scale);
  }

  manifest(domain: 'buildings' | 'animals'): ArtManifest { return this.others[domain]!; }
  /** The trimmed size of a picture and where it sat in its cell, or null if the key is unknown. */
  assetBox(domain: 'people' | 'props' | 'buildings' | 'animals', key: string): { w: number; h: number; ox: number; oy: number } | null {
    const m = domain === 'people' ? this.people : domain === 'props' ? this.props : this.others[domain]!;
    const c = this.cellOf(m, key);
    return c ? { w: c[3], h: c[4], ox: c[5], oy: c[6] } : null;
  }

  get propsManifest(): ArtManifest { return this.props; }
  get peopleManifest(): ArtManifest { return this.people; }
  get cacheSize(): number { return this.cache.size; }
}
