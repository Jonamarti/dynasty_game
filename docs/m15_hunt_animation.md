# M15 phase 17: human hunting animation

## Contract

A real `hunt` order uses four generated poses (`H0`–`H3`) while the living
hunter has added work and the living quarry is within the maximum possible
hunting reach. The poses read only the hunter's action, work ticks, life state,
and target ID plus the target animal's public position and life state. The
renderer movement flag suppresses the gesture during pursuit. The action
system remains authoritative for the equipped weapon's actual reach and for
whether a shot hits.

The cycle raises and steadies the carried tool, aims, releases and resets. Its
hand anchors move with the existing held item. It reveals neither a hit nor a
miss, and rendering does not consume ammunition, add work, change the quarry,
or draw RNG. The broad culling distance is derived from the longest reach in
the static item catalogue and the action's existing base reach; it does not
alter hunt mechanics.

## Verification

- Unit selector tests cover four frames, active work, movement, range, target
  life, hunter life and bounded clock interpolation.
- Art tests verify distinct generated poses and finite hand anchors from front
  and side; the normal atlas coverage test checks the rebuilt manifest/sheets.
- `e2e/hunt-animation.spec.ts` issues a real hunt order, waits for the first
  work tick at a living quarry, then captures all four rendered poses while
  checking that drawing leaves quarry health and life unchanged.

Screenshots: `artifacts/screenshots/m15-hunt-animation-2026-10-14/`.
