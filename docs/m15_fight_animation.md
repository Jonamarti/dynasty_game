# M15 phase 17: human combat animation

A real `attack` action shows four generated poses: guard, wind-up, strike and
recovery (`k0`–`k3`). The selector requires a living attacker, a stationary
renderer track, an active attack action and a running action clock. It reads no
quarry state and makes no decisions about whether a blow will land.

The bounded render fraction interpolates the existing simulation action clock.
The pose adds no simulation ticks, damage, RNG draws or private-state reads.
Weapons continue to use the normal held-item hand anchor so an armed strike
follows the same arm movement.

The focused order test positions two real people in reach, submits the attack
through `Simulation.order`, confirms the actual wind-up, and captures all four
distinct poses without changing target health or wounds. Captures are in
`artifacts/screenshots/m15-fight-animation-2026-10-13/`.
