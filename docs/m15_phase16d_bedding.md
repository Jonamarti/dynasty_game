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

This slice supplies one sleep surface ladder. It does not add autonomous
furniture crafting, a comfort mood, benches, storage furniture, lights, or
family-specific sleeping assignments. The recipes use existing technology and
current ingredient values; this change does not claim a measured improvement
to the food economy. No cohort run was made.

Legacy saves already retain building definitions and dimensions. The new
furniture fields are optional on ordinary buildings and `hostId` defaults to
null, so old house records need no migration. Older houses keep the dimensions
stored in their save; this slice does not resize them.

## Focused verification

`src/sim/__tests__/furniture-sleep.test.ts` covers recipe alternatives,
placement/refusal, JSON reconstruction, walkable furniture, and the sleep
recovery reader. The art registry and renderer wiring are coordinated in the
separate art task; this contract does not declare the renderer portion closed.

The art registry includes bedding and bed sprites and item icons. The in-world capture is saved at artifacts/screenshots/m15-phase16d-2026-10-10/01-bed-in-house.png. The browser capture drives the simulation order through the debug fixture; it does not independently verify a physical radial-menu click.

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
round-robin case. Individual player-managed assignments, shelf storage,
fireplace, fat lamp, and the phase 16f measurement remain open. Seated family
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
