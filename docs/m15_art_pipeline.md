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
- **pose** `idle w0 w1 w2 w3` (the four walk frames). Work, sleep, sit and swim
  poses come with their phases: add a name to `ART_POSES`, draw it in
  `people/rig.ts`, rebuild. A pose is a set of layers like any other.
- **Cell** 96 px, feet on row 88. The upper body bobs by
  `anchors[...].bob` whole pixels on the odd walk frames: draw every layer except
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
- Composes a person once per distinct appearance into a 96 px canvas
  (`ArtAtlas.compose`, at most 1500 kept); on screen a person is one
  `drawImage`. Below `PERSON_LOD_BELOW` a person is a flat ellipse in the
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
- **Work, sleep and sit poses** and the swimming pose (phase 27) are not drawn.
- **Trees, resource nodes and terrain** are still drawn in code.
