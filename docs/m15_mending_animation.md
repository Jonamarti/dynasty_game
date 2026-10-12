# M15 phase 17 — garment mending gesture

Garment repair uses four generated sewing poses (`r0`–`r3`) while an actual
`mend_garment` action is working. The renderer requires a living, stationary
worker, positive work ticks and the active repair timer/denominator set by
`ActionSystem.doMendGarment`. Setup, travel, interruption, completion and death
therefore return the person to the ordinary pose.

The selector reads only the public action/work markers. It does not inspect the
worker's inventory, garment identity, repair method or private knowledge. The
repair remains owned by `GarmentUnit.repairProgress`; drawing a frame neither
advances nor reads that progress. The existing bounded work accumulator drives
two ticks per pose and freezes when the simulation is paused. It adds no
simulation state or RNG draws.

The people generator emits all four poses across age, sex and baked facing
combinations. Both hands meet low at the waist for a small needle-and-thread
gesture; feet stay planted and an unrelated held item is hidden during the
hands-on repair. Coverage comes from the shared `ART_POSES` manifest tests.
The browser case starts a real tailoring repair order against a damaged physical
garment and captures the active gesture at
`artifacts/screenshots/m15-mending-animation-2026-10-12/00-active-garment-mending.png`.

This adds a visual reader for an existing repair action; it does not change
repair requirements, work rate, materials, or garment condition.
