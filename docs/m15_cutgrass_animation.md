# M15 phase 17: cutting grass animation

`cut_grass` displays four generated `q0`–`q3` poses while its real action is
working on a reachable tile that still has cuttable grass. The selector reads
the action, work ticks, target tile and current grass height; it does not cut
the tile, award thatch, advance the action or draw randomness. Travel,
interruption, death, a cleared tile or the end of the work timer hides the
gesture.

The hand sweeps low across the grass with planted feet. Frames follow the
existing simulation work clock and bounded interpolation fraction, so pausing
freezes the current stroke. The poses are generated from
`art/src/people/rig.ts`; `npm run art:build -- people` regenerates the sheets
and manifest. The art coverage test checks every new pose across the existing
age, sex and facing matrix.

The browser test issues a real `cut_grass` order, waits for `workedTicks`,
checks the selected pose and saves the active scene to
`artifacts/screenshots/m15-cutgrass-animation-2026-10-12/00-active-thatch-cutting.png`.
