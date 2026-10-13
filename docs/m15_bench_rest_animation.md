# M15 phase 17: sitting on a bench

## Contract

The generated human pose `j0`–`j3` appears only while a living person is not
moving, has an active `rest` action clock, and has reached a complete, intact,
hosted bench. Eligibility comes from the shared `seatedOnBench` reader in
`HouseInterior.ts`, so the art selector and the simulation's public bench
conversation rule agree on what counts as sitting. It reads no fatigue, family
relationship, inventory or private state from another person.

The four frames use the existing bent-leg sitting geometry and relaxed hands.
Unlike a feast guest, a bench sitter does not get a second seat baked into the
person's layers; the actual bench remains the one furniture object rendered
under the sitter. The pose follows simulation `actionTicks`, freezes on pause,
and changes no action, fatigue, furniture, RNG, position or collision radius.
Rest without a hosted bench keeps the ordinary idle pose.

## Verification

- Unit tests cover the four-frame action clock and reject travel, death, idle,
  missing/unhosted benches and other furniture.
- Art tests cover generated frames, anchors, all baked directions, bent legs
  and the absence of a duplicate seat layer.
- `e2e/bench-rest-animation.spec.ts` issues a real rest order against a hosted
  bench, checks actual fatigue recovery, observes all four rendered poses and
  confirms rendering does not change the rest state.

Screenshots: `artifacts/screenshots/m15-bench-rest-animation-2026-10-13/`.
