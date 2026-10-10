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
