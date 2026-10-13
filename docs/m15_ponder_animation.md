# M15 phase 17: pondering has a generic visible gesture

A real `ponder` order cycles four generated poses (`o0`–`o3`) while the thinker
adds effort to a valid idea. One hand rises toward the chin and lowers through
a quiet loop; no prop or pose identifies the technology.

The selector reads only the thinker's own public `action`, `workedTicks` and
`alive` fields, plus movement and the simulation-clock fraction. It never
reads `ideas`, `targetTech`, `knownTech`, or another person's knowledge. The
selector does not mutate the thinker or simulation. Travel, interruption,
death and zero work ticks show no gesture. No action mechanics, rates or RNG
streams change.

`art/src/people/rig.ts` generates the hand-to-chin gesture for front, side and
back views. `npm run art:build -- people` regenerates the person sheets and
manifest; the generated contact sheet has a dedicated `ponder` row. Unit tests
cover the four frames, inactive states, immutability and privacy. The browser
spec gives a real order a fixture idea, verifies that its effort increases,
and captures four distinct frames in
`artifacts/screenshots/m15-ponder-animation-2026-10-13/`.
