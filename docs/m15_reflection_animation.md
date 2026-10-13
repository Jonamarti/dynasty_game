# M15 phase 17: open-ended reflection gets a quiet thought gesture

A real `reflect` order now cycles four generated hand-to-chin poses (`o0`–`o3`)
while it accrues work. It shares the generic gesture used by `ponder`: both
verbs represent focused thought, while reflection has no target idea or partner.

The selector reads only the reflector's own `action`, `workedTicks` and `alive`
state, plus movement and the simulation-clock fraction. It never infers or reads
ideas, target technology, cooldown or private knowledge. The renderer changes no
work, cooldown, conception, RNG or action state. Travel, interruption, death and
zero work ticks show no gesture.

No new art pose is needed: the same generated thought poses already serve
pondering. The unit test checks the cycle and inactive states. The browser spec
issues a real target-free reflection order, verifies no idea is created, and
captures all four frames in
`artifacts/screenshots/m15-reflection-animation-2026-10-13/`.
