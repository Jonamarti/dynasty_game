# M15 phase 17: human sleeping pose

## Contract

The `sleep` action uses four generated human poses, `e0` through `e3`, after
the person reaches the place where `ActionSystem.doSleep` restores fatigue.
While the action is still travelling, the normal walk pose remains in use.
The pose selector reads only the person's public `action`, `actionTicks` and
`alive` fields plus the renderer's already-computed movement flag. A still
person with any other action is never inferred to be asleep.

The art generator rotates the existing independent body and clothing layers
together around the centre of the 96 px cell. Small angle changes across the
four frames give a restrained sleeping cycle; hand anchors rotate with the
figure so held items remain attached. The renderer keeps the existing world
position, hit radius and simulation clock. Drawing does not change fatigue,
action progress, needs, RNG or any other simulation state.

`ArtAtlas` falls back to the idle cells and anchors if the code requests a pose
that is absent from a currently loaded manifest. This prevents a Vite asset
reload from crashing between code refresh and the completed `art:build`; the
generated `public/art/people.json` and sheets must still be rebuilt and
committed for the sleeping pose to appear.

## Verification

- Unit selector tests cover all four frames, movement/death/action guards,
  bounded interpolation and unchanged action clock.
- Art tests cover consistent layer rotation and transformed hand anchors.
- `e2e/sleep-animation.spec.ts` issues a real sleep order, verifies fatigue
  recovery, captures the four rendered poses, and confirms rendering itself
  does not change sleep state.

Screenshots: `artifacts/screenshots/m15-sleep-animation-2026-10-13/`.
