# M15 phase 16d: bedding and beds

## Delivered mechanism

- Bedding is craftable with `cordage` from either four thatch or two hides.
- A wooden bed is gated by `carpentry` and consumes three wood plus bedding.
- A carried bedding item or bed can be placed through the house radial action
  while its carrier is inside their household's finished, unruined home.
- Placement chooses the free, walkable room tile nearest the house center,
  with stable row/column tie breaks.
  Furniture stays walkable, keeps its `hostId` through a JSON checkpoint, and
  does not change the house wall ring or its door.
- An explicit sleep order enters the room and routes to the best available
  surface before restoring fatigue. Bare interior uses 0.9 recovery, bedding
  1.0, and a bed 1.1. These are multipliers on the existing recovery rate.

## 2026-10-12: hide rug as a low-cost sleep surface

`rug` is a one-hide cordage recipe and a walkable 1×1 household furnishing.
It raises sleep quality on its room tile to 1.0, the same reader used by
bedding. NPC household furnishing can choose it when the room has no better
sleep surface and the adult has the recipe materials; the normal placement
path checks ownership, interior space and checkpoints the host. The recipe
offers an alternative when one hide is available but the bedding recipe's
thatch or two-hide load is not. It adds no save fields or RNG draws. The
focused capture is
`artifacts/screenshots/m15-phase16d-hide-rug-2026-10-12/01-hide-rug-in-house.png`.
This is a mechanism delivery, not comfort calibration or a population claim.

## Deliberate scope

The sleep-surface ladder and bench/lamp slices are delivered separately below.
This document does not close autonomous furniture crafting as a whole, a comfort
mood, storage categories/upgrades beyond the single shelf below, all listed
room furniture or family-specific sleeping assignments. The recipes use
existing technology and current ingredient values;
this change does not claim a measured improvement to the food economy. No cohort
run was made.

Legacy saves already retain building definitions and dimensions. The new
furniture fields are optional on ordinary buildings and `hostId` defaults to
null, so old house records need no migration. Older houses keep the dimensions
stored in their save; this slice does not resize them.

## Focused verification

`src/sim/__tests__/furniture-sleep.test.ts` covers recipe alternatives,
placement/refusal, JSON reconstruction, walkable furniture, and the sleep
recovery reader. The lamp tests also cover its light, fuel lifecycle and
refill refusals; `art.test.ts` verifies the generated furniture and item art.

The art registry includes the bedding, bed, bench and fat-lamp sprites and item
icons. The bed capture is `artifacts/screenshots/m15-phase16d-2026-10-10/01-bed-in-house.png`; the bench capture is in
`artifacts/screenshots/m15-phase16d-bench-2026-10-11/`. Browser captures use
debug fixtures to place furniture; the lamp capture additionally shows its
Spanish refill option in the physical radial menu.

## 2026-10-12: household shelf storage

`shelf` is a carpentry recipe using two wood. A carried shelf can be placed by
the household member inside their completed home, using the shared furniture
placement path. The placed building has 20 capacity in its ordinary
`Building.store`; radial store/take actions, direct transfer, ownership rules,
and inventory persistence therefore use the existing store contract. It is
walkable and does not replace or resize the home store. NPC with carpentry and
two carried wood autonomously make and place one when their home has a sleep
surface, a bench and a free room tile. Tests cover autonomous placement, saving
stock, and storing/retrieving through the normal APIs. The new sprite and item
icon are generated from `art/src`; no panel or overlay changed.

This is a single shelf per home with the existing 20-unit generic capacity.
It does not provide category sorting, dedicated stock requests, or shelf
upgrades. Other planned furniture remains open, as do the
remaining phase 16e/16f measures and comfort work.

## 2026-10-12: autonomous household fat lamp

Once a completed home already has a sleep surface, bench and shelf, an adult
with `fat_lamp` and the recipe materials can craft and place one fat lamp in
the home. It uses the existing furniture placement checks and receives the
ordinary full fuel charge on placement, so the night-light reader and renderer
show a real light source. A home with any hosted lamp does not produce another
one. No new UI, art, saved field, or RNG draw is involved.

This is one initial charge only. NPC refuelling, lamp upkeep during a long
campaign, other listed furniture, and the phase 16e/16f
measurements remain open. No cohort or lighting calibration is claimed.

## 2026-10-10: household autonomy, first surface

An adult with a completed household home and a free room tile can make bedding
from owned ingredients, turn carried bedding and wood into a bed when carpentry
is known, and place the carried furniture. The scorer reads actual hosted sleep
quality: once the home has the desired surface, its keep demand stops. The trip
inside checks interruptions and retains the object until physical placement.
Tests cover the crafting ladder, completed-home suppression, absent-home refusal
and a real autonomous doorway-to-room trip (selection weight forced in the test,
no player order). Six furniture tests pass. No new UI or art is introduced.

This ladder supplies shared surfaces per home. Material gathering specifically
for furniture, upgrades in a completely full room, additional comfort furniture,
player-managed individual assignments and the rest of 16d remain open. It is not
completion of the whole furnishing phase or evidence of improved household
survival.

## 2026-10-11: household sleep-surface assignment

When a home has several complete sleep surfaces, each living member of the
household receives one by sorting the household roster and hosted surface IDs
in ascending order. A household with more members than surfaces reuses them
round-robin. `doSleep` routes to that assignment before recovering fatigue;
the existing quality reader still measures the surface the person actually
reaches. With no household or no valid hosted surface, the prior best-surface
fallback remains in place.

The assignment is derived from `Household.memberIds`, live people and hosted
buildings, so it has no new checkpoint field, RNG draw or UI. The focused
regression checks stable sorting, distinct surfaces when available, and the
round-robin case. Individual player-managed assignments, shelf categories and
upgrades, fireplace, and the phase 16f measurement remain open. Seated family
conversation is covered below.

## 2026-10-11: bench and seated rest

`bench` is a two-wood carpentry recipe. It uses the existing furniture
placement contract: only the household owner may place it inside the finished
home, the placement picks an open walkable room tile, and `hostId` survives a
checkpoint. The radial action on a bench says “Sit and rest”; attempting it
still goes through the ordinary property/interruption checks, so a seat that
becomes unavailable reports its stop reason. The Spanish label and action are
translated.

An adult with carpentry, two wood, a completed household home and a free tile
may autonomously make and place one bench when that home has none. Tired adults
may select a usable hosted bench; the rest action routes to the seat and
recovers fatigue at 1.6 times the standing rest rate. This reader is
deliberately separate from sleep quality; benches do not replace beds or alter
night sleep. Art generators supply the world sprite and inventory icon,
rebuilt into `public/art`. The focused capture is
`artifacts/screenshots/m15-phase16d-bench-2026-10-11/01-bench-in-house.png`.
Focal furniture, tech, art and i18n tests cover the recipe, placement,
persistence, seated recovery, Spanish strings and generated art. No cohort or
calibration is claimed.

## 2026-10-11: belonging from seated family conversation

When a conversation completes between members of the same household, each
still gets the ordinary family belonging update. If either person is actively
resting on a complete, unruined bench hosted by a home, both get one additional
small belonging update. The scorer favors a seated family member as company and
adds a modest talk urge when belonging is low. `seatedOnBench` and
`benchConversationBelonging` are shared readers, so the scoring and action
writer agree on what counts; a standing person or a non-family conversation
does not qualify. The focused test covers the positive case and both negative
gates. There is no new action label or UI, so no screenshot was needed.

## 2026-10-11: fat lamp, persistent fuel and room light

`fat_lamp` is a Fire-web furniture recipe using one flint and two fat. Placing
it in the finished household home starts a 1200-tick charge. Its fuel is a
`Building` field, restored from older graphs as empty; each simulation tick
burns one unit, and two carried fat refill an empty or partly used lamp to full.
The contextual “Refuel lamp” order checks the household, home, lamp state and
fuel before accepting, routes inside before consuming fat, and reports refusals
in both languages.

The fueled lamp enters the shared spatial-hash `lightAt` reader and renderer
night overlay with radius 3 and strength 0.9. It is not a hearth: it does not
count for fire-dependent recipes and its building shelter remains zero. Tests
cover placed/loaded fuel, burn-out, actual local light, successful refill, lack
of fuel, foreign home and the disabled-menu reason. Generated item and building
art lives in `art/src`; the new capture shows the lamp and its Spanish refill
option at `artifacts/screenshots/m15-phase16d-fat-lamp-2026-10-11/`.

When a furniture tile overlaps its host footprint, `buildingAt` resolves the
small furniture object first so its own contextual actions remain reachable.

## 2026-10-12: indoor household fireplace

`fireplace` is a Fire-web design downstream of `firemaking`; the furniture
recipe uses four mud and two flint. A household member can place a carried
fireplace only while inside their own completed, unruined home, on a free
walkable interior tile. Its hosted `Building` persists through checkpoints.
Like the planned table, it is a permanent hearth with no `fuelRemaining`
requirement: a zero fuel value does not disable the fire.

This is a real heat and local-light source through the shared hearth readers.
The existing recipes that name `station: 'hearth'` can now use the indoor
fireplace, while smoking recipes keep their `drying_rack` station and accept a
nearby fireplace through the shared `hearthNear` fire check. Tests exercise
warmth, bounded local light, cooking at the fireplace, smoke-drying at a rack,
ownership/interior/design refusals, and checkpoint persistence. The world
sprite and carried item icon are generated from `art/src`; the capture is
`artifacts/screenshots/m15-phase16d-fireplace-2026-10-12/01-fireplace-in-house.png`.

### Fireplace construction autonomy — 2026-10-12

When an adult has fireplace design, cold debt, a completed own home and a free
tile, the recipe takes priority over comfort furnishings. The NPC targets the
first missing ingredient (four mud from clay nodes, then two flint from flint
nodes), bounds the harvest to that shortage, then crafts and places the hearth
through existing actions. Only fireplace work is exempted from the cold work
threshold because it answers that need; hunger and thirst still interrupt it.
No resource source, fuel rule, RNG stream or player authority was added.

Tests cover missing-tech, no-cold and incomplete-home controls plus gather,
craft and place targets. The fixture isolates the scored chain; it does not
measure natural adoption, comfort balance or population effects. Autonomous
sources and other planned comfort furniture remain open. Lamp upkeep is below.

### Hosted light and fire stay inside the room — 2026-10-12

The shared `lightAt` and `hearthNear` readers resolve the host of a placed
fireplace or fueled lamp and apply its radius only to tiles inside that
finished, unruined home's room. Outdoor hearths and furniture hosted by a
ruined home remain unoccluded. This closes the recorded leak where indoor
light, warmth and smoking fuel crossed a house wall; it does not model light
or smoke escaping through the doorway.

The focused fireplace regression checks that a room tile still sees light and
fire while a nearby tile beyond a wall sees neither. No new fields, UI, art,
RNG streams or balance coefficients were added.

## 2026-10-12: phase 16e, one midnight sleep and safety sample

Sleep recovery and the mood writer use the same surface-quality ladder: open
ground is 0.7, open ground near a physical hearth is 0.8, a bare interior is
0.9, bedding is 1.0 and a bed is 1.1. The existing interior recovery reader
remains authoritative; the outdoor action now also reads its nearby hearth.

`shareTheHearth` already runs once per day and records the roof used by
conception. It now uses that same pass to write comfort from sleep quality,
the sleeper's cold need and exposed snow, and security from four observable
terms: proximity to the band's camp, band members nearby, a nearby band guard,
and sleeping on a cell claimed by the band. Non-sleepers receive no nightly
nudge. These are direct, deterministic samples with no added state or RNG.
Focused tests cover surface/cold/snow direction, each safety term, the sleeping
gate and outdoor hearth quality. The coefficients are mechanisms only; no
cohort or calibration is claimed.

## 2026-10-12: phase 16f, the `homes` mechanism scenario

The fast `homes` scenario stages one completed family home per band and gives
one adult a bed, so it can isolate indoor sleep and mood readers from the
longer material-gathering and house-construction economy. The NPC still routes
and places the furniture through the regular action. Its checks require that
at least 60% of midnight samples under an interior roof reach bedding-or-bed
quality, observe quality and nonzero cold debt in the same mood sample, observe
each of camp/huddle/guard/claimed-cell security inputs, see NPC-placed furniture,
and retain pathfinding and wall-safety checks. The 2026-10-12 single-seed run
passed all seven applicable checks in 2400 steps. This validates the readers
and fixture, not comfort amplitudes or population outcomes; calibration and
cohort runs remain deferred.

## 2026-10-12: NPC upkeep for an empty household fat lamp

An adult scores a refill only for a complete, non-ruined, empty fat lamp hosted
by their own completed, usable household home, and only when the lamp was not
placed by the player. With two fat already carried, the existing `refuel_lamp`
action routes to the room and uses the ordinary refill validation/consumption.
Otherwise, if the home hosts a completed storage piece with at least two fat,
the scorer sends the adult to take exactly two from that piece; the next think
can then select the lamp. Both paths use existing inventory and building state,
add no fuel rule or RNG draw, and leave other households' goods and player-
placed lamps alone. A partial carried hunt yield can now take the ordinary
item-scoped `store` route into this same household shelf when the empty lamp
needs it; no fuel source is scripted into storage.

Focused tests inspect the live brain score/target, exercise carried-fat refill,
and reject player-placed, non-empty, foreign-home and ruined-host candidates.
Existing explicit-order tests retain the visible refusal for missing fat and
foreign ownership. NPCs do not gather/craft fat for lamp upkeep, refill lamps
outside their own home, replace lamps, or refill a player-placed lamp; partial
charges are left alone until empty. Other planned comfort furniture remains
open. No calibration or cohort result is claimed. NPCs do not seek or kill
quarry just to maintain the lamp, and no
renderer/crafting recipe produces fat; ordinary deer/boar hunts remain the
physical source.

Still open after 16e/16f: other planned comfort furniture and deferred
calibration.

## 2026-10-12: phase 16e, the comfort drive reads sleep mood

The new `comfort` drive is `urgencyCurve(max(0, -mood.comfort))`: a neutral or
positive mood creates no new pressure, while an accumulated comfort deficit
uses the same 0–100 need curve already used elsewhere. The existing score rows
consume it directly: it raises the dusk return-home score, increases the
existing room-quality weight when choosing a sleep shelter, lets that shelter
justify sleep before fatigue is high, and scales the existing scores for
crafting or placing an already-eligible household furnishing. The pressure
uses no added sensitivity/weight, draws no RNG, and is excluded from
long-action commitment/interruption policy; it cannot create a destination or
missing furniture/materials.

The focused mechanism test compares equal-seed simulations with neutral versus
positive comfort as a control, then verifies a negative comfort sample raises
the real `go_home` score. It also checks the pressure endpoints and declared
readers. Typecheck and the drive/commitment tests pass. No UI surface changed;
no coefficient calibration or cohort result is claimed.

## 2026-10-12: carried hunting fat reaches its household lamp shelf

`doHunt` is the physical source: deer yield one fat and wild boar two, stored
in the hunter's ordinary inventory up to capacity and dropped as an ordinary
item pile only for the overflow. No renderer or scripted stock path exists.
When an adult carries a partial amount, has an empty NPC-owned lamp in their
completed home, and that home has a usable storage piece with room, the scorer
targets that home piece and names only the carried fat count. The ordinary
`store` action moves it through inventory transfer; after enough real fat has
accumulated, the existing lamp upkeep route can withdraw two and refill.

The focused tests prove the selected target and item-scoped deposit, preserve
other carried food, and reject player-placed/charged lamps and a full shelf.
NPCs still do not start hunts because a lamp is low, retrieve fat from a ground
pile for lamp upkeep, butcher a carcass specifically for fat, or render fat.
These would need separate mechanisms and should use real hunting/carcass state
if added; no stock is generated by this feature. No UI changed, and no
calibration or cohort result is claimed.

## 2026-10-12: nearby hunting fat reaches an empty household lamp

When an adult's completed home contains an empty NPC-owned fat lamp, the scorer
can select real fat from a nearby same-region item pile for the existing
`pickup` action. It uses the spatial hash, ordinary pile ownership checks and
carry limits; it picks one unit per action and reevaluates whether another is
needed. It does not hunt, butcher or manufacture fat, and does not target a
player-placed lamp or a different household's lamp. The focused regression
checks that the fat pile wins over an unrelated food pile and that the pickup
target names `fat`. No UI or saved state changed. No calibration or cohort
result is claimed.
