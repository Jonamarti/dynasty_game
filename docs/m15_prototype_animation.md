# M15 phase 17: prototype work has a generic assembly gesture

A real `prototype` order cycles four generated poses (`u0`–`u3`) while the
person adds work to any eligible prototype. Both hands meet at the torso for a
generic join, press, inspect and reset cycle. The pose does not identify a
design and draws no prototype material.

The selector reads only the prototyper's own public `action`, `workedTicks`
and `alive` fields, plus renderer movement and simulation-clock fraction. It
does not read ideas, target technology, inventory, banked progress or another
person's knowledge. The selector and renderer do not change the idea, goods,
work bank, action duration, mechanics or RNG. Travel, interruptions, death and
zero work ticks show no gesture. `doPrototype` already banks its long work on
the person, so interruptions keep their existing behavior.

`art/src/people/rig.ts` generates the four hand-assembly poses for front, side
and back views. `npm run art:build -- people` regenerates the person sheets and
manifest; the art contact sheet includes a dedicated `prototype` row. Unit
tests cover the work-tick cycle, inactive states and privacy. The browser spec
issues a real order for a fixture idea, verifies banked progress, and captures
four distinct frames in
`artifacts/screenshots/m15-prototype-animation-2026-10-13/`.
