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
upgrades. The fireplace and other planned furniture remain open, as do the
remaining phase 16e/16f measures and comfort work.

## 2026-10-12: autonomous household fat lamp

Once a completed home already has a sleep surface, bench and shelf, an adult
with `firemaking` and the recipe materials can craft and place one fat lamp in
the home. It uses the existing furniture placement checks and receives the
ordinary full fuel charge on placement, so the night-light reader and renderer
show a real light source. A home with any hosted lamp does not produce another
one. No new UI, art, saved field, or RNG draw is involved.

This is one initial charge only. NPC refuelling, lamp upkeep during a long
campaign, the fireplace and other listed furniture, and the phase 16e/16f
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

`fat_lamp` is a firemaking furniture recipe using one flint and two fat. Placing
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
