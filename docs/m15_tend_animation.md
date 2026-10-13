# M15 phase 17: tending has a visible dressing gesture

An active `tend` order cycles four generated poses (`t0`–`t3`) after the
healer reaches a patient and begins real work. The hands steady an arm and
wrap a dressing; the cycle deliberately does not identify which body part is
being treated.

The selector reads only the healer's own public action, `workedTicks` and
alive state, plus the renderer's movement flag and simulation-clock fraction.
It does not look up the patient or read their health, wounds, conditions,
identity, knowledge or inventory. `workedTicks` advances only after
`ActionSystem` validates a living patient, herbalism and reach. Rendering does
not change the healer, patient or simulation; travel, interruption, death and
zero work ticks return the ordinary pose. The action and RNG streams are
unchanged.

`art/src/people/rig.ts` generates the hand poses for front, side and back views.
`npm run art:build -- people` regenerates the people sheet and manifest; the
contact sheet has a dedicated `tend` row. Unit tests cover the work-clock cycle
and inactive states. The browser spec issues a real `tend` order, confirms the
patient was treated, and captures four distinct frames in
`artifacts/screenshots/m15-tend-animation-2026-10-13/`.
