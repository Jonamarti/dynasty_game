# M15 phase 31c — FamilyTree mobile pan and zoom

## Behavior

`FamilyTreeLayout` keeps the relaxed node coordinates at their natural scale
and pads them into a canvas large enough for the whole family. It no longer
scales a large family down to the dimensions of a phone panel.

`FamilyTreeOverlay` opens centered on the selected person. The viewport pans
with one pointer, pinches with two pointers, and zooms around the pointer on a
wheel gesture. Zoom stays between 0.35× and 2.5×; the opening scale has a 0.85×
floor so labels remain readable. Gesture updates change only the canvas
transform, preserving DOM nodes under the pointer. The viewport tracks its
panel dimensions while the overlay remains open.

The viewport itself reveals a portion of a large tree at once. Drag or pinch to
inspect other relatives. The layout remains deterministic and makes no
simulation reads beyond the existing family graph and knowledge gate.

## Verification

- `src/sim/__tests__/familytree.test.ts`: narrow and wide viewports retain the
  same natural-scale coordinates; existing deterministic, relationship and
  overlap checks remain.
- `e2e/phase31-familytree-zoom.spec.ts`: 16-person mobile tree, readable
  opening scale, wheel zoom, pointer pan, and close behavior.
- Captures: `artifacts/screenshots/m15-familytree-mobile-zoom-2026-10-13/`.
- The same pan-and-zoom treatment remains open for `TribeGraph`.
