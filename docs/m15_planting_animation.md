# M15 phase 17: fruit-tree planting animation

`plant` displays four generated `p0`–`p3` poses while its real action is
working on a reached grass or forest tile that remains suitable for a tree.
The hands place the fruit, press it into the soil, cover it and withdraw. The
selector reads the active action, `workedTicks`, target tile and ground; it
does not inspect inventory or technology, plant a tree, advance the action or
draw randomness.

Travel, interruption, death, an invalid tile or completed work hides the pose.
Frames follow the simulation work clock and bounded interpolation fraction, so
pausing freezes the current movement. Source poses live in
`art/src/people/rig.ts`; `npm run art:build -- people` regenerates the sheets
and manifest. Art coverage checks every pose across the existing age, sex and
facing matrix.

The browser test gives the player the prerequisites, issues a real `plant`
order and waits for `workedTicks`. It captures the active scene at
`artifacts/screenshots/m15-planting-animation-2026-10-13/00-active-tree-planting.png`.
