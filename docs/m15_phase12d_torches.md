# M15 phase 12d: carried torches

Torch recipes use firemaking, sticks/thatch or sticks/animal fat and produce
unlit items. Deer yield one fat and boar two, with no additional random draw.
Ignition takes three interruptible ticks beside a completed, unruined hearth;
Kit and Simulation.order share ownership, flame and usable-hand refusals.

A plain torch burns for 20 ticks, a fat torch for 60. Remaining fuel lives in
the equipped hand, persists through JSON and moves with a manual hand change.
Tool fitting preserves a live flame while using the other hand for an axe,
and refuses a two-handed tool rather than silently dropping the fuel record.
Detailed, journey and detached compact-body ticks all burn the same fuel.
Pausing does not advance it. At zero, the torch unit is consumed.

Player drop, gift and store operations can move spare unlit copies; the
burning unit remains reserved in its hand until spent. The refusal is visible.
This restriction prevents an aggregate inventory transfer from resetting the
countdown; portable fuel metadata on piles/stores is not part of this slice.

Live owned flames provide radius-four local light, carried warmth 0.2, and
wildlife avoidance at twice the fixed-fire range. The night compositor filters
carriers by present visibility and viewport. Both torch and a tool can be drawn
with the rig's separate hand anchors; lit and unlit props differ.

NPCs make one light for darkness or learned warmth, and ignition reads their
light/warmth beliefs. Making a design gives a tentative expectation; using it
updates the belief. No random draw is introduced by source queries or burning.

## Verification

Torch/light/i18n/art focal run: 46/46 before the compact fuel addition;
torch/compact/art: 34/34 after it. TypeScript passes. The focused browser case
reported ok, verifies pause and loss of light and captures both flame states
in artifacts/screenshots/m15-phase12d-torches-2026-10-10-close/.
The Vite teardown stayed open and was interrupted, so this is not a claim of
a clean global E2E exit. Cohorts remain deferred during M15; no survival-cost
bound is claimed. Phase12e local heat and12f nights measurements remain open.
Último foco integrado: 48/48 (torch, light, light-readers, i18n y art).
También se rechaza equipar un hacha si un bebé ocupa el brazo libre de la llama.
