# M15 phase 14d — red-ochre dyeing

**Status: delivered 2026-10-12.** Dyeing is a manual, exact-unit action. A
person who knows `dyeing` can apply one unit of mined `red_ochre` to one owned
garment that has not already been dyed. The pigment is consumed atomically with
the garment update. It adds one point of garment status and stores the pigment
name on that `GarmentUnit`, so different copies of the same item may remain
undyed or carry different colour treatments.

## Pigment source

`red_ochre` is a physical, finite resource, distinct from `mud`. Five deposits
are generated per default-size world and scaled by `resourceScale`; each deposit
holds up to twelve harvest units and does not regrow. The resource pass has its
own RNG fork appended after `ironRng`, and mapped worlds derive a stream from
their map identity and extent. It never uses `spawnRng`, so adding it does not
shift herds or founders. `dyeing` is a cloth-web technology requiring the
existing `ochre` knowledge.

The map geology does not currently encode iron-oxide pigment-bearing ground.
Ochre therefore spawns deterministically on rocky uplands (`rock` or `hills`)
in both classic and mapped worlds. This is a terrain proxy for exposed mineral
deposits, not a claim that every such geological region contains ochre; a future
geology pass can replace the mapped-world gate with an explicit ochre feature.

## Persistence and appearance

`GarmentUnit.dye` accepts only the supported `ochre` pigment. Inventory
transfer validation, checkpoint graph hydration, equipment ownership, and
whole-unit moves retain it. Legacy garment rows without a dye remain valid and
undyed. A dyed garment receives one status point; new and existing garments do
not acquire that point until a real pigment is applied.

The renderer reads the exact unit referenced by a visible equipment slot and
tints only that garment's art layers. The tint participates in the appearance
cache key. Private spare garments remain invisible to observers. No art sheet
changes are needed: the existing garment layers support runtime tinting; the
new mineral has its own inventory icon.

## Verification

`garment-dyeing.test.ts` checks deterministic deposit placement, finite rocky
source, exact-unit pigment consumption, status, checkpoint and transfer
preservation, invalid pigment rejection, and refusal without knowledge or
material. `art.test.ts` checks the pigment icon and that dyed and undyed outfits
do not share a composed-sprite cache entry. The Spanish E2E capture of a dyed
owned cloak is
`artifacts/screenshots/m15-phase14d-2026-10-12/03-red-ochre-dye-v0.15.118.png`.
