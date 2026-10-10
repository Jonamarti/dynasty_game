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
 * Cached figures are trimmed to their visible bounds and bounded in pixel
 * bytes. Transparent margins must not multiply with every pose of a crowd.
 *
 * Nothing here reads the simulation. The renderer builds a `PersonAspect`
 * from a `Person` and hands it over; the direction is deduced from
 * movement by the renderer, never stored (M15 rule 15).
 */
import {
  anchorKey, personKey, CARRY_SUFFIX,
  type ArtAge, type ArtCell, type ArtDir, type ArtManifest, type ArtPose, type ArtSex, type ArtTint, type PersonAnchors,
} from './ArtManifest.ts';
import { PixelCache } from './PixelCache.ts';

export interface WornGarments {
  torso?: 'cape' | 'wrap' | 'tunic' | 'longtunic' | 'hide_armour' | 'fur_coat';
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
  /** A second observed object uses the other hand's existing rig anchor. */
  heldLeft?: string | null;
  /**
   * The belly of the last third of a pregnancy (M15 phase 19c). Optional so
   * every aspect written before it keeps meaning what it meant.
   */
  belly?: boolean;
}

/** Garments that lie over the abdomen, so the belly is drawn in their colours (mirrors `art/src/people/rig.ts`). */
const BELLY_COVERS: ReadonlySet<string> = new Set(['wrap', 'tunic', 'longtunic', 'hide_armour', 'fur_coat']);

/** Slots that stay planted when the upper body bobs in the walk. */
const GROUNDED = /^(shadow|legs|trousers|feet)/;

const MIB = 1024 * 1024;
export interface PersonSprite { image: HTMLCanvasElement; ox: number; oy: number; }
interface LayerDraw { manifest: ArtManifest; key: string; tint: string | null; dx: number; dy: number; }

export class ArtAtlas {
  private readonly people: ArtManifest;
  private readonly props: ArtManifest;
  private readonly others: Record<string, ArtManifest>;
  private readonly sheets = new Map<string, HTMLImageElement>();
  private readonly cache = new PixelCache<PersonSprite>(24 * MIB, 4096);
  private readonly tints = new PixelCache<HTMLCanvasElement>(8 * MIB, 6000);

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
      this.tints.set(tk, t, w * h * 4);
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
      a.carryBaby ? 'c' : '', a.held ?? '', a.heldLeft ?? '', a.belly ? 'belly' : '',
    ].join('|');
  }

  /** A trimmed figure with its origin inside the original 96 px body cell. */
  sprite(a: PersonAspect): PersonSprite {
    const key = ArtAtlas.aspectKey(a);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const cell = this.people.cell;
    const mirror = a.dir === 'W';
    const dir: 'S' | 'E' | 'N' = a.dir === 'W' ? 'E' : a.dir;

    const order = (this.people.meta['order'] as Record<string, string[]>)[dir]!;
    const tintOf = this.people.meta['tint'] as Record<string, ArtTint>;
    const carrySlots = new Set(this.people.meta['carrySlots'] as string[]);
    const anchors = (this.people.meta['anchors'] as Record<string, PersonAnchors>);
    const anchor = anchors[anchorKey(a.age, a.sex, dir, a.pose, a.carryBaby)] ?? anchors[anchorKey(a.age, a.sex, dir, a.pose, false)]!;
    const w = a.wear;
    const covers = !!w.legs || w.torso === 'tunic' || w.torso === 'longtunic' || w.torso === 'hide_armour' || w.torso === 'fur_coat';
    const bandCovered = w.torso === 'tunic' || w.torso === 'longtunic' || w.torso === 'wrap' || w.torso === 'hide_armour' || w.torso === 'fur_coat';
    const layers: LayerDraw[] = [];

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
        // Bare skin where nothing covers the abdomen; the same bulge in the
        // garment's colours where a wrap or a tunic does.
        case 'belly': variant = a.belly && !(w.torso && BELLY_COVERS.has(w.torso)) ? 'base' : null; break;
        case 'belly_wear': variant = a.belly && w.torso && BELLY_COVERS.has(w.torso) ? w.torso : null; break;
        case 'held': break;
        default: break;
      }
      if (variant === null) continue;
      const dy = GROUNDED.test(slot) ? 0 : anchor.bob;
      if (slot === 'held') {
        const hand = this.props.meta['handAnchor'] as [number, number];
        for (const [item, at] of [[a.heldLeft, anchor.hl], [a.held, anchor.hr]] as const) {
          if (!item) continue;
          const hk = `held/${item}/${dir === 'E' ? 'E' : 'S'}`;
          layers.push({ manifest: this.props, key: hk, tint: null, dx: at[0] - hand[0], dy: at[1] - hand[1] + dy });
        }
        continue;
      }
      if (a.carryBaby && carrySlots.has(slot)) variant += CARRY_SUFFIX;
      const tintSlot = tintOf[slot];
      // A glove is leather, not skin: only bare pictures take the skin colour.
      const glove = (base === 'hands' || base === 'hand') && w.hands;
      const colour = glove ? null : tintSlot === 'skin' ? a.skin : tintSlot === 'hair' ? a.hair : tintSlot === 'band' ? a.band : null;
      layers.push({ manifest: this.people, key: personKey(slot, variant, a.age, a.sex, dir, a.pose), tint: colour, dx: 0, dy });
    }

    // Bounds come from the already trimmed manifest cells, not a GPU readback
    // on every miss. Integer origins preserve the old rasterisation exactly;
    // clamp to the old cell so a held object clipped before stays clipped now.
    let left = cell, top = cell, right = 0, bottom = 0;
    for (const layer of layers) {
      const c = this.cellOf(layer.manifest, layer.key);
      if (!c) continue;
      left = Math.min(left, c[5] + layer.dx); top = Math.min(top, c[6] + layer.dy);
      right = Math.max(right, c[5] + layer.dx + c[3]); bottom = Math.max(bottom, c[6] + layer.dy + c[4]);
    }
    // Keep one transparent pixel for bilinear sampling at fractional zoom.
    left = Math.max(0, Math.floor(left) - 1); top = Math.max(0, Math.floor(top) - 1);
    right = Math.min(cell, Math.ceil(right) + 1); bottom = Math.min(cell, Math.ceil(bottom) + 1);
    const ox = mirror ? cell - right : left, oy = top;
    const image = document.createElement('canvas');
    image.width = Math.max(1, right - left); image.height = Math.max(1, bottom - top);
    const ctx = image.getContext('2d')!;
    ctx.translate(-ox, -oy);
    if (mirror) { ctx.translate(cell, 0); ctx.scale(-1, 1); }
    for (const layer of layers) this.blit(ctx, layer.manifest, layer.key, layer.tint, layer.dx, layer.dy);
    const sprite = { image, ox, oy };
    this.cache.set(key, sprite, image.width * image.height * 4);
    return sprite;
  }

  /** One draw, retaining the old cell origin and scale for hit-testing. */
  drawPerson(ctx: CanvasRenderingContext2D, a: PersonAspect, x: number, y: number, scale: number): void {
    const { image, ox, oy } = this.sprite(a);
    ctx.drawImage(image, x + ox * scale, y + oy * scale, image.width * scale, image.height * scale);
  }

  /** Full cell for exports/tools. The game uses drawPerson to avoid margins. */
  compose(a: PersonAspect): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.people.cell; canvas.height = this.people.cell;
    const { image, ox, oy } = this.sprite(a);
    canvas.getContext('2d')!.drawImage(image, ox, oy);
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
  get cacheSize(): number { return this.cache.stats.entries; }
  /** Pixel storage only: browser canvas/texture overhead is not measurable here. */
  get cacheStats() { return { composed: this.cache.stats, tints: this.tints.stats }; }
}
