# M15 phase 17: taming animation

`tame` shows four generated open-palm poses (`z0`–`z3`) during a real order's
approach and arrival. `ActionSystem.doTame` records work before moving toward
the animal; once in reach, it feeds and completes the order in that same tick.
The actor therefore holds out food while approaching, and the gesture remains
visible through the arrival frame. Feeding still happens on the original tick.

`tamingPose` reads only the acting person's `alive`, `action`, `actionTicks` and
`workedTicks` fields. It does not inspect the target animal or ID, animal event
timestamps, temperament, meals, food, or the person's taming knowledge. The
four-frame cycle uses `actionTicks` and the bounded render fraction, so pause
freezes it. Drawing neither changes the action nor advances the simulation or
RNG. The generic gesture implies no animal reaction or successful outcome.

The source pose geometry lives in `art/src/people/rig.ts`; regenerate the people
sheet through `npm run art:build -- people`. Manifest coverage exercises every
pose over the existing age, sex and facing matrix.

The E2E test issues a real tame order, advances it through a movement tick,
captures all four clock phases while the order is active, then places the actor
within reach and advances one simulation tick to verify the animal received
food. Captures are saved under
`artifacts/screenshots/m15-tame-animation-2026-10-13/`.
