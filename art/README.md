# Dynasty art

The pictures in the game are **generated once, committed as PNG, and loaded at
run time**. Nothing here runs when the game starts.

```
art/src/          the generators: code that emits SVG text (the editable source)
tools/art/        build.ts (SVG → sheets + manifests), sheet.ts (contact sheets)
public/art/       what the game loads: *-0.png sheets and *.json manifests. Committed.
src/render/ArtManifest.ts   the key format both sides share
src/render/ArtAtlas.ts      loads the sheets and composes people from their layers
docs/m15_art_pipeline.md    the pipeline contract: layers, keys, anchors, poses
docs/m15_art_contract.md    the hands contract from phase 11a (what needs an anchor)
```

```bash
npm run art:build        # regenerate public/art (about 15 s)
npm run art:build -- people   # one domain: people | props | buildings | animals
npm run art:sheet        # compose every picture with the game's own code and
                         # save contact sheets to artifacts/art/ for review
```

**Never edit `public/art/` by hand.** Change a generator and rebuild. A test
(`src/render/__tests__/art.test.ts`) fails if the committed sheets and the
generators disagree, or if the game grew a species, a building, an expression
or a held object the art does not cover.

## Style

- Flat fills, one dark outline (`OUTLINE` in `lib/draw.ts`) around every shape,
  no textures, no gradients. Light comes from the upper left.
- A person is 96 px cell, feet on row 88, drawn facing south, east or north.
  West is east flipped by the renderer, so never draw a fourth direction.
- Buildings are drawn obliquely (front wall and roof together), 144 units wide
  for a 3-tile building, and every roofed building also has a floor plan.
- Natural materials only: skin and leather, wool, thatch, wattle, clay, stone.
  No dyed clothes until dye exists as a technology.
- **Colour slots.** Skin, hair and tribe colour are drawn in white and greys
  (`REF` in `people/rig.ts`) and multiplied by the wearer's colour at run time.
  Draw a shadow as a darker grey, never as black over a colour slot.

## How to add something

**A held object or tool.** Add a `[id, label, tech, draw]` row to `ITEMS` in
`props/items.ts` (a 64 px icon). If people carry it, add its case to `heldSvg`
in `props/held.ts` (grip at `HAND`) and its name to `HELD_KINDS`. Build.

**A garment.** Add it to the `Wear` type in `people/rig.ts` and draw it in the
matching function (`torsoWearFront`/`torsoWearSide`, `legWear`, `headWear*`).
Each garment region is independent of the others, so draw only that garment.
Add its variant to the `wears` list in `registry.ts`. Build. The renderer needs
no change: `ArtAtlas.compose` stacks whatever the manifest has.

**A building.** Add a row to `BUILDINGS` in `buildings/buildings.ts` (and to
`PLANS` if it has a roof). The coverage test names any sim building without one.

**An animal.** Add it to `ANIMAL_KINDS` and `paintAnimal` in `animals/animals.ts`.

Look at `npm run art:sheet` before committing: it is the fastest way to catch a
wrong tint, a missing key or a garment that does not sit on a child.
