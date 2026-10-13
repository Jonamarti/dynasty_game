# M15 phase 17: spreading compost animation

The `spread` action uses four generated poses (`s0`–`s3`) only after the worker
has reached a completed field and real compost work has started. The hand
scoops low, fans compost across the soil and returns; movement, fetching,
waiting, interruption and invalid fields keep the ordinary pose.

The selector reads the public action marker, `workedTicks`, target field and
field containment. It does not inspect inventory, compost quantity, soil
fertility or private technology, and it never advances the action or consumes
randomness. Frames share the bounded simulation work clock, so pausing freezes
the gesture. The renderer suppresses a carried hand tool while the worker is
spreading.

The authored vectors live in `art/src/people/rig.ts`; `npm run art:build -- people`
generates the people sheets and manifest. Unit coverage checks work timing and
invalid states; browser coverage issues a real `spread` order and captures the
active work at
`artifacts/screenshots/m15-spread-animation-2026-10-13/00-active-compost-spreading.png`.
