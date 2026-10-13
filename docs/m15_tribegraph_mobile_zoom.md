# M15 phase 31d — TribeGraph mobile pan and zoom

## Behavior

The tribe graph uses the same 1000×760 layout reference at every screen size.
The visible viewport follows `panelBox`, while the graph canvas keeps its
coordinates and node labels at their usual scale. Opening centers the subject
and keeps a minimum 0.85× scale so names remain readable on a phone.

One pointer pans, two pointers pinch around their midpoint, and a wheel gesture
zooms around the cursor. Zoom is clamped to 0.35×–2.5×. Gestures update only the
canvas transform; they do not rebuild the layout or change simulation state.
Changing the shown membership resets the fit around the subject.

## Verification

- `e2e/phase31-tribegraph-zoom.spec.ts`: 17-person mobile fixture, natural
  reference canvas, readable opening scale, wheel zoom, pointer pan, and close.
- Captures: `artifacts/screenshots/m15-tribegraph-mobile-zoom-2026-10-13/`.
- Browser-only relationships are introduced by the test; no simulation setup
  or RNG stream changes.
