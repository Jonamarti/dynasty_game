# M15 phase 17 — construction gesture

Active `build` work uses four generated hammer poses (`b0`–`b3`). The renderer
requires a live worker with work ticks, the named site within the same reach
used by the action system, and actual construction progress with all materials
delivered. Damaged finished structures use the same gesture while durability
is below the design's work threshold. Earthworks and sites waiting for
materials are handed to other verbs and keep their own presentation.

The selector is visual-only: it does not advance building or repair progress,
read private inventory/knowledge, or add RNG draws. The bounded simulation
work accumulator advances the pose and pauses freeze it. Held tools continue
to use the ordinary hand anchor.

The generated source is in `art/src/people/rig.ts`; `ART_POSES` coverage checks
all four poses across the existing age, sex and facing combinations. The
focused browser case places a real windbreak site, issues a build order and
captures the active pose at
`artifacts/screenshots/m15-building-animation-2026-10-12/00-active-windbreak-construction.png`.
