# M15 phase 17 — crop work gesture

Sowing and reaping use four generated poses (`a0`–`a3`) while an actual crop
order is being worked. The renderer checks that the worker is alive and still,
has work ticks, remains inside the named completed field, and that the crop is
fallow for sowing or ripe for reaping. The hand reaches down and resets with
feet planted; equipment remains attached to its ordinary hand anchor.

The selector is presentation-only. It reads the visible order, field and crop
state; it does not advance the action, inspect another person's private
knowledge or inventory, or add random draws. Paused simulation time therefore
holds the frame through the shared bounded work accumulator.

The four poses are generated in `art/src/people/rig.ts`. `ART_POSES` makes the
existing generated-art coverage exercise all ages, sexes, and directions. The
focused browser case issues a real reap order against a ripe fixture field and
the milestone capture is `artifacts/screenshots/m15-farming-animation-2026-10-12/00-active-crop-harvest.png`.
Repeatable Playwright runs write to `test-results/` by default; set
`DYNASTY_CAPTURE_DIR` only when intentionally creating a new dated capture set.
