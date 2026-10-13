# M15 phase 17: feast attendance animation

## Contract

When a person has an active `attend` order, has started its simulation clock,
is not moving, and is within `FEAST_SEAT` of their own target coordinates, the
renderer cycles four generated seated poses (`v0`–`v3`) using `actionTicks`.
The renderer reads no host object or host state. The target coordinates are
already part of the guest's public action state and let the selector distinguish
walking to the feast from sitting down after arrival.

The generated art draws a wooden stool, bent legs, and hands resting in the lap.
The existing feast action and its interruption, serving, and social rules are
unchanged. This wait has no work cost; its pose follows the simulation clock
and stops automatically when `attend` ends.

## Verification

The selector unit tests cover the four frames, movement, range, inactive/dead
guests, and bounded render interpolation. The browser test starts a real
`attend` order against an active feast, advances until the guest is seated, and
captures the rendered stool and guest at
`artifacts/screenshots/m15-attend-feast-animation-2026-10-13/00-seated-feast-guest.png`.
