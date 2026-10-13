# M15 phase 17: dyeing animation

The `dye_garment` order runs eight interruptible work ticks. Each tick
revalidates the physical garment and pigment; red ochre is consumed and the
selected unit is dyed atomically on the last tick. Eight ticks stay below the
project's progress-banking ceiling and let the four generated poses (`y0`–`y3`)
remain visible long enough to read.

The renderer observes only the public action marker, timer and `workedTicks`.
It does not inspect inventory, private knowledge, garment target or dye state.
Travel, idle and unstarted work keep the ordinary pose. Pose timing uses the
simulation work clock and freezes when the world is paused. The displayed work
bar uses the remaining stroke count and therefore tracks the same eight ticks.

The hand positions hold cloth at the waist and rub pigment across it. The SVG
source is `art/src/people/rig.ts`; `npm run art:build -- people` regenerates the
committed atlas and manifest. Unit coverage checks pose timing and invalid
states. The E2E issues a real order, captures its active `y2` stroke, then lets
the order finish and checks the dyed unit and consumed pigment. Capture:
`artifacts/screenshots/m15-dyeing-animation-2026-10-13/00-active-garment-dyeing.png`.
