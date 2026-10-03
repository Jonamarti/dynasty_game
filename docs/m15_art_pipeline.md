# M15 art pipeline (phase 17)

What the renderer may rely on from the art pipeline, and what the pipeline may
rely on from the renderer. It sits beside `m15_art_contract.md` (the phase 11a
list of what a hand, a shoulder and a back must be able to anchor); phases 11
(hands), 14 (clothes), 16 (interiors) and 20 (parenting) add to this one, and
their entries say where.

Contents: files, people, props, buildings, animals, what the renderer does, open items.

## Files

`public/art/<domain>.json` + `<domain>-N.png` for four domains: `people`,
`props`, `buildings`, `animals`. A manifest is
`{ version, domain, cell, sheets, cells, keys, meta }`
(`src/render/ArtManifest.ts`). `keys` maps an asset key to an index into
`cells`; identical pictures share a cell. A cell is
`[sheet, x, y, w, h, ox, oy]`: the trimmed picture's place in the sheet, and the
offset of its top-left corner inside the original canvas (96 px for people and
animals). Draw a picture at `origin + (ox, oy)`.

The generators are `art/src/`, the build is `npm run art:build`, and a contact
sheet for review is `npm run art:sheet`. See `art/README.md`.

## People

Key: `p/<slot>/<variant>/<age>.<sex>/<dir>/<pose>` (`personKey`).

- **age** `infant child adolescent adult elder` (`sizeClassOf`); **sex** `m f`;
  **dir** `S E N`, with `W` the renderer's mirror of `E` about x = 48.
- **pose** `idle w0 w1 w2 w3 g0 g1 g2 g3` (four walk and four gathering frames).
  Other work, sleep, sit and swim poses come with their phases: add a name to `ART_POSES`, draw it in
  `people/rig.ts`, rebuild. A pose is a set of layers like any other.
- **Cell** 96 px, feet on row 88. The upper body bobs by
  `anchors[...].bob` whole pixels on odd walk frames and during gathering: draw every layer except
  `shadow`, `legs*`, `trousers*`, `feet*` that much lower.
- **Slots** stack bottom to top in `meta.order[dir]`. A missing key means
  "nothing to draw for this slot" (a woman's chest band exists; a man's does not).

  | slot | variant | tint |
  |---|---|---|
  | `shadow`, `legs`, `torso`, `arms`, `hands`, `head` (`_far`/`_near` in profile) | `base` (`hands`: `base` or `gloves`) | skin (not gloves) |
  | `loincloth`, `chestband` | `base` | tribe colour |
  | `hair`, `hair_back`, `beard` | `short long balding bald` / `beard` | hair colour |
  | `shine` | as hair | none (a highlight on a bald head) |
  | `face` | an `Expression` | none |
  | `torso_wear`, `sleeves` | `cape wrap tunic longtunic` | none |
  | `trousers`, `feet`, `head_wear`, `head_back` | `trousers`; `boots wraps`; `cap hood` | none |
  | `cloak_back`, `cloak_front` | `cloak` | none |
  | `baby`, `baby_skin` | `baby` (arms carrying: variants get `+carry`) | skin for `baby_skin` |

- **Independence.** Garment regions do not depend on one another (torso, legs,
  feet, hands, head, cloak). The default loincloth is hidden when trousers or a
  tunic cover the hips; the default chest band when a tunic or wrap covers the
  chest (`ArtAtlas.compose` applies both rules).
- **Carrying a baby** (phase 20): slots in `meta.carrySlots` take the suffix
  `+carry` (arms folded, the baby's blanket and skin). Adolescents, adults and
  elders only.
- **Tint** is a multiply by `#rrggbb`, done once per distinct appearance and
  cached. Skin tone is per tribe today (`Renderer.TRIBE_SKIN`); phase 29's
  latitude will feed the same slot.
- **Anchors** `meta.anchors[<age>.<sex>/<dir>/<pose>[c]]` → `{ hr, hl, bob }`:
  the right and left hand in cell coordinates (in profile both are the near
  hand) and the bob. `c` marks the carrying pose.
- **Held objects** are pictures of their own: `props` key
  `held/<kind>/<S|E>`, drawn with the grip at `meta.handAnchor` and placed on
  `hr`. `HELD_KINDS` (`art/src/props/held.ts`) must include every
  `HeldItemKind` of `Sprites.ts`; a test checks the seven that exist. Phase 11
  extends the list to every `ITEMS` entry with `hand`, and adds the shoulder and
  back anchors that `m15_art_contract.md` asks for. Objects that need both
  hands (the bow's string arm, a log, a cart) have no two-handed pose yet.
- **Garments per item** (phase 14): each garment names its layer here, in the
  same commit as its `garment` field, and gets a row in `registry.ts`.

## Props

`item/<id>` 64 px icons; `held/<kind>/<S|E>`; a baby lying down as four stacked
pictures, `baby/<bed>/<awake|asleep>/<bed|blanket|skin|bedfront>` with `bed` in
`ground mat cradle`. A phase 16 bed only needs to say where a baby rests.

## Buildings

`b/<id>/ext` (oblique exterior), `b/<id>/plan` (roofless floor plan; roofed
buildings only: both huts, the stone house, the longhouse, the granary and the
library), `banner/pole` + `banner/cloth` (a tribe-coloured pennant).
`meta.groundY` is the row of the exterior picture on which the footprint's front
edge sits, and `meta.planGroundY` likewise for the plan. The renderer fits the
picture's trimmed width to the footprint. A `field` stays procedural (its
picture is its crop). Today the roof lifts when the player or the selected person
stands inside, or when `Renderer.hideRoofs` is set; phase 16 owns the final
rule (and the key), and the two pictures stay.

## Animals

`a/<species>/E/<idle|w0|w1|w2|w3>`, facing east; the renderer mirrors for west.

## What the renderer does (and does not)

- Deduces facing from movement (or, standing, from the target of an action),
  never stores it in `src/sim/` (plan rule 15).
- Draws people, animals and tall buildings **back to front**, on the row their
  feet (or a wall's foot) stand on. Flat buildings (stockpile, pit, snare, fish
  trap, quern, hearth) stay in the ground pass so they never hide anybody.
- Draws the tribe's colour as a thin ring on the ground under each person and
  round each building, plus a pennant on buildings. Both are drawn in code; only
  the pennant's cloth is art.
- Falls back to the procedural figures of `Sprites.ts` when the sheets fail to
  load. That code stays until the art has shipped a milestone.
- Composes a person once per distinct appearance into a trimmed canvas
  (`ArtAtlas.sprite`, 24 MiB of pixels / at most 4,096 entries); `drawPerson`
  preserves the logical 96 px cell origin and uses one `drawImage`. Tinted
  layers have a separate 8 MiB / 6,000-entry LRU budget. Below `PERSON_LOD_BELOW` a person is a flat ellipse in the
  tribe's colour, as before.

## Open items

- **Skin of a child of two tribes.** Owner's rule: a child takes its parents'
  tone, and of two tones the mean (deterministic; no RNG). It needs a stored
  tone per person in `src/sim/`, so it waits for a sim phase. Until then the
  renderer uses the tone of the person's current tribe, which is wrong for
  somebody who married into another one.
- **Garments are not in the sim yet**: `PersonAspect.wear` is always empty until
  phase 14. The layers exist, are drawn for every age, sex and facing, and are on
  `npm run art:sheet`.
- **Other work, sleep and sit poses** and the swimming pose (phase 27) are not drawn.
  Gathering now uses four poses for berries, sticks, reeds, wild grain and tree
  fruit. Fish, flint and clay keep their previous appearance. The same hand
  gesture is used for bush and tree fruit; different reaching heights remain
  a possible visual refinement. The procedural fallback has no work gesture.
- **Trees, resource nodes and terrain** are still drawn in code.

## Gathering cost measured on 2026-10-02

The regenerated people domain still fits one sheet: 1,397 → 1,829 distinct
pictures after deduplication. The PNG grows from 747,678 to 977,046 bytes
(+224 KiB); the sheet grows from 2048×293 to 2048×431. Its raw RGBA pixels grow
from 2,400,256 to 3,530,752 bytes (+1.08 MiB), before browser overhead or any
GPU copies. These are asset measurements, not measured browser memory or FPS.

The initial 1,500-entry cache stored whole 96×96 RGBA sprites: 36 KiB each,
144 KiB for four gathering frames and 52.7 MiB at capacity. This historical
measurement motivated the optimisation below. Use finite pose keys, never an
unbounded time or angle in `aspectKey`.

`npm run art:sheet` includes `contact-gather.png`: all four facings, clothing,
child and elder. Tests verify stationary legs, four distinct hand anchors,
manifest coverage, pause/interruption and four distinct composed browser frames.

## Memory optimisation measured on 2026-10-03

The source bank already reuses identical SVG layers: adding aliases for heads
or legs cannot save another copy. Pixel inspection found only two duplicate
raster cells (48 pixels) among 1,829 people cells. The population-dependent
cost was the full-cell cache and its 1,500-entry ceiling, not repeated sheets.

`sprite()` stores only the union of selected layer bounds, clamped to the
original 96 px cell, with integer offsets and one transparent pixel for
sampling. West mirrors around the same original centre. Both runtime figure
paths use `drawPerson()`; `compose()` reconstructs a full cell on demand for
tools/exports and does not retain that larger image. Budgeted `PixelCache`
refreshes hits for both caches and evicts until both byte and entry limits fit.
An image larger than its budget is drawn without being retained.

In a synthetic browser workload of **500 distinct appearances × four poses**:

| Measurement | Before | After |
|---|---:|---:|
| Retained figure pixels | 52.7 MiB | 20.8 MiB |
| Retained frames | 1,500 | 2,000 |
| Warm lookups (32 frames) | 16,000 misses | 16,000 hits, zero misses |
| Figure pixel limit | 52.7 MiB by entry size | 24 MiB |
| Tint pixel limit | entry count only | 8 MiB |

Figure pixels decrease **60.5%** while retaining more frames; combined figure
and tint pixels decrease from 60.3 to 28.4 MiB in that workload. It uses distinct
synthetic skin colours to stress retention; it is not 500 simulated NPCs or
a whole-game FPS/heap measurement. The first pass still has composition cost.
Warm drawing submission timings are included in the report, but runs overlapped
other verifiers and are not a controlled FPS comparison. A browser test also
pushes 1,800 appearances and verifies both byte limits under eviction.

Pixel parity compares 1,080 full-cell figures and 2,160 fractional-zoom draws
against the compositor from `6d5fe4f`: all match exactly, covering five ages,
two sexes, four directions, nine poses, clothing, carried babies and tools.
The 360 unclothed reference SHA-256 hashes are pinned in
`src/render/__tests__/person-pixels.json` and checked in the browser suite.

Reproduce current measurements with `npx vite-node tools/art/memory.ts after`.
For actual NPC simulation, renderer, HUD, frame cadence and browser memory,
run `npx vite-node tools/profile-population.ts`; conditions and results are in
`population-profile.md`. Its 300 real founders are distinct from the synthetic
500-appearance cache workload above.
For the historical run, export `git show 6d5fe4f:src/render/ArtAtlas.ts` to
`artifacts/verification/m15-art-memory-2026-10-02/reference/ArtAtlas.ts`, changing
its relative `./ArtManifest.ts` import to `/src/render/ArtManifest.ts` for Vite.
Then `npx vite-node tools/art/memory.ts before` uses that reference.
`npx vite-node tools/art/compare.ts` validates parity against it and refreshes
the pinned hashes only after parity succeeds. Reference source and JSON reports
are in the same verification directory. No sheet regeneration was needed for
this runtime optimisation; `art:sheet` was inspected again.
