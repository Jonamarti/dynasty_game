# M15 phase 17 — hide dressing gesture

`dress_hide` is a real, interruptible 100-work-tick action whose progress and
material treatment belong to one physical garment unit. The renderer now shows
four generated poses (`h0`–`h3`) while that order is actively working. The arms
rub a hide held in front of the body, distinguishing treatment from the small
needle motions used by `mend_garment`.

The pose selector requires a living worker, the committed `dress_hide` action,
an active action timer, a positive validated work total and positive
`workedTicks`. Travel, preparation, interruption and completed work have no
gesture. It reads no inventory, target garment, dressing progress or material
state; ActionSystem owns those checks. The frame follows the bounded simulation
work clock, so pausing freezes it and rendering cannot advance work or consume
random draws.

The authored vectors live in `art/src/people/rig.ts`; `npm run art:build -- people`
generates the committed people sheets and manifest. Tests cover the
selector guards and frame timing, and the E2E test captures a real order at
`artifacts/screenshots/m15-hide-dressing-animation-2026-10-13/00-active-hide-dressing.png`.
