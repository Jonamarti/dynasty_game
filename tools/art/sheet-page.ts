/**
 * The page `npm run art:sheet` opens: every kind of picture the build made,
 * composed by the same `ArtAtlas` the game uses, so a broken layer, a wrong
 * tint or a missing key is visible here before it is visible in play.
 */
import { ArtAtlas, type PersonAspect, type WornGarments } from '../../src/render/ArtAtlas.ts';
import type { ArtAge, ArtDir, ArtPose, ArtSex } from '../../src/render/ArtManifest.ts';

const BANDS = ['#3b6ea8', '#a83b52', '#7a4ea8', '#a8843b', '#3ba88a', '#a83b8f', '#6f9a3b', '#a8603b', '#7d7d7d'];
const SKINS = ['#ecd0ab', '#d4a276', '#bd865a', '#a26a46', '#84512f', '#663a24', '#f2d8ba', '#b17c50', '#c58d5f'];
const HAIRS = { black: '#2b2018', brown: '#5b3d28', grey: '#a7a197', white: '#d8d3c8' };

const atlas = await ArtAtlas.load('/art/');
const root = document.getElementById('root')!;

function section(id: string, title: string): HTMLElement {
  const s = document.createElement('section');
  s.id = id;
  s.innerHTML = `<h2>${title}</h2><div class="row"></div>`;
  root.appendChild(s);
  return s.querySelector('.row') as HTMLElement;
}
function fig(row: HTMLElement, c: HTMLCanvasElement, label: string): void {
  const f = document.createElement('figure');
  f.appendChild(c);
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  f.appendChild(cap);
  row.appendChild(f);
}
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

type AspectOver = Partial<Omit<PersonAspect, 'wear'>> & { wear?: WornGarments };
function aspect(over: AspectOver): PersonAspect {
  return {
    age: 'adult', sex: 'm', dir: 'S', pose: 'idle', skin: SKINS[1]!, hair: HAIRS.black, band: BANDS[0]!,
    hairStyle: 'short', beard: false, expression: 'neutral', carryBaby: false, held: null, ...over, wear: over.wear ?? {},
  };
}
const SC = 1.5;
function person(over: AspectOver, label: string, row: HTMLElement): void {
  const [c, ctx] = canvas(96 * SC, 96 * SC);
  const a = aspect(over);
  // The tribe's ring, as the renderer draws it, under the feet.
  ctx.save();
  ctx.scale(SC, SC);
  ctx.strokeStyle = a.band; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(48, 88.6, 17, 4.4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.drawImage(atlas.compose(a), 0, 0);
  ctx.restore();
  fig(row, c, label);
}

// ---- people
{
  const row = section('tribes', 'Tribes: one skin tone and one colour each');
  SKINS.forEach((skin, i) => person({ skin, band: BANDS[i]!, sex: i % 2 ? 'f' : 'm', hairStyle: i % 2 ? 'long' : 'short', beard: i % 4 === 0, expression: 'content' }, `tribe ${i + 1}`, row));
}
{
  const row = section('ages', 'Five ages, four facings');
  const ages: [ArtAge, ArtSex][] = [['adult', 'm'], ['adult', 'f'], ['adolescent', 'f'], ['child', 'm'], ['infant', 'f'], ['elder', 'm'], ['elder', 'f']];
  for (const [age, sex] of ages) {
    for (const dir of ['S', 'E', 'N', 'W'] as ArtDir[]) {
      person({ age, sex, dir, hairStyle: sex === 'f' ? 'long' : age === 'elder' ? 'balding' : 'short', hair: age === 'elder' ? HAIRS.grey : HAIRS.black, beard: sex === 'm' && age !== 'child', expression: 'warm' }, `${age} ${sex} ${dir}`, row);
    }
  }
}
{
  const row = section('faces', 'Nine expressions, and hair');
  for (const e of ['neutral', 'content', 'warm', 'stern', 'frustrated', 'angry', 'afraid', 'strained', 'pained']) person({ expression: e }, e, row);
  for (const h of ['short', 'long', 'balding', 'bald'] as const) for (const dir of ['S', 'E', 'N'] as ArtDir[]) person({ hairStyle: h, dir, hair: HAIRS.brown }, `${h} ${dir}`, row);
}
{
  const row = section('wear', 'Garments, alone and combined');
  const sets: [string, WornGarments][] = [
    ['none', {}], ['cape', { torso: 'cape' }], ['wrap', { torso: 'wrap' }], ['tunic', { torso: 'tunic' }], ['longtunic', { torso: 'longtunic' }],
    ['trousers', { legs: 'trousers' }], ['boots', { feet: 'boots' }], ['foot wraps', { feet: 'wraps' }], ['gloves', { hands: 'gloves' }],
    ['cap', { head: 'cap' }], ['hood', { head: 'hood' }], ['cloak', { cloak: 'cloak' }],
    ['gloves+cape', { hands: 'gloves', torso: 'cape' }], ['tunic+trousers+boots+cap', { torso: 'tunic', legs: 'trousers', feet: 'boots', head: 'cap' }],
    ['everything (wool)', { torso: 'longtunic', legs: 'trousers', feet: 'boots', hands: 'gloves', head: 'hood', cloak: 'cloak' }],
  ];
  for (const [label, wear] of sets) {
    for (const dir of ['S', 'E', 'N'] as ArtDir[]) {
      person({ wear, dir, sex: label.includes('everything') || label === 'cape' ? 'f' : 'm', hairStyle: 'short' }, `${label} ${dir}`, row);
    }
  }
}
{
  const row = section('hands', 'Holding things, and babies in arms');
  for (const held of ['spear', 'bow', 'atlatl', 'bone_point', 'handaxe', 'net', 'basket', 'torch']) {
    for (const dir of ['S', 'E'] as ArtDir[]) person({ held, dir, wear: { torso: 'wrap' } }, `${held} ${dir}`, row);
  }
  for (const dir of ['S', 'E', 'N', 'W'] as ArtDir[]) person({ sex: 'f', hairStyle: 'long', carryBaby: true, dir }, `baby ${dir}`, row);
  for (const dir of ['S', 'E', 'N', 'W'] as ArtDir[]) person({ sex: 'f', hairStyle: 'long', carryBaby: true, dir, wear: { torso: 'tunic', head: 'cap' } }, `baby+tunic ${dir}`, row);
}
{
  const row = section('walk', 'Walk cycle');
  for (const dir of ['S', 'E', 'N'] as ArtDir[]) {
    for (const pose of ['idle', 'w0', 'w1', 'w2', 'w3'] as ArtPose[]) person({ pose, dir, sex: 'f', hairStyle: 'long', wear: { torso: 'wrap' } }, `${dir} ${pose}`, row);
  }
}

// ---- props
{
  const row = section('items', 'Objects');
  const items = atlas.propsManifest.meta['items'] as { id: string; label: string; tech: string }[];
  for (const it of items) {
    const [c, ctx] = canvas(96, 96);
    atlas.drawAsset(ctx, 'props', `item/${it.id}`, 16, 16, 1);
    fig(row, c, `${it.label} (${it.tech})`);
  }
  for (const bed of ['ground', 'mat', 'cradle']) {
    for (const st of ['awake', 'asleep']) {
      const [c, ctx] = canvas(144, 96);
      ctx.scale(1.5, 1);
      for (const layer of ['bed', 'blanket', 'skin', 'bedfront']) {
        atlas.drawAsset(ctx, 'props', `baby/${bed}/${st}/${layer}`, 0, 0, 1, layer === 'skin' ? SKINS[2]! : null);
      }
      fig(row, c, `baby ${bed} ${st}`);
    }
  }
}
// ---- buildings
{
  const row = section('buildings', 'Buildings and their floor plans');
  const bm = atlas.manifest('buildings');
  const list = bm.meta['buildings'] as { id: string; label: string; tech: string }[];
  const plans = new Set(bm.meta['plans'] as string[]);
  const widths = bm.meta['widths'] as Record<string, number>;
  for (const b of list) {
    const w = widths[b.id]!;
    const [c, ctx] = canvas(w * 1.2, 126 * 1.2);
    atlas.drawAsset(ctx, 'buildings', `b/${b.id}/ext`, 0, 0, 1.2);
    atlas.drawAsset(ctx, 'buildings', 'banner/pole', w * 1.2 - 44, 126 * 1.2 - 78, 1.2);
    atlas.drawAsset(ctx, 'buildings', 'banner/cloth', w * 1.2 - 44, 126 * 1.2 - 78, 1.2, BANDS[1]!);
    fig(row, c, `${b.label} (${b.tech})`);
    if (plans.has(b.id)) {
      const [p, pctx] = canvas(w * 1.2, 116 * 1.2);
      atlas.drawAsset(pctx, 'buildings', `b/${b.id}/plan`, 0, 0, 1.2);
      fig(row, p, `${b.label}, roof off`);
    }
  }
}
// ---- animals
{
  const row = section('animals', 'Animals');
  for (const k of ['deer', 'boar', 'hare', 'wolf', 'bear', 'lynx']) {
    for (const p of ['idle', 'w0', 'w1', 'w2', 'w3']) {
      const [c, ctx] = canvas(144, 144);
      atlas.drawAsset(ctx, 'animals', `a/${k}/E/${p}`, 0, 0, 1.5);
      fig(row, c, `${k} ${p}`);
    }
  }
}
document.body.dataset['ready'] = '1';
