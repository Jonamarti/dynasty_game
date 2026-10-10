# M15 phase14c: first clothing recipes

Hide cape: cloak slot, warmth0.25, clothing, two hide and one rope; a flint or
hand axe is required and retained. Sewn tunic: torso, warmth0.30, tailoring,
three hide and two sinew; a bone needle is required and retained. The shared
recipe resolver includes tool availability, so menus, scorer and final craft
revalidation agree without consuming the cutting/sewing tool.

Both are ordinary worn garment references. They stack through existing
warmthFrom, stay cold in inventory and disappear visually when ownership is
lost. The generated rig already supplies cloak front/back and tunic/sleeves;
Renderer maps these observed worn items to those layers. New inventory icons
are generated from art/src/props/items.ts. Spanish names and all six garment
slot labels are supplied. No private inventory is shown as public appearance.

Garment crafting answers present cold and improves its worn slot. A full slot
or an already owned copy stops the keep loop, avoiding permanent summer craft
demand. This uses the current thermal utility; learning/observing garment
warmth expectations remains a later14c reader, together with the remaining
catalogue, pockets, deterioration, dressing and repair. This is not full14c.

## Verification

Four garment recipe tests pass, including actual craft retaining its needle,
layer composition and cold-demand suppression. Focal garment/clothing/i18n/art
run passed43 tests before adding the fourth recipe test. Typecheck passes.
Single-seed health: initial named failures cravings-steer-the-diet/perf-budget
remain. No cohort or survival improvement claim.

The Spanish browser case clicks both wear actions in Equipo, checks combined
warmth0.475 and records artifacts/screenshots/m15-phase14c-layers-2026-10-10-final/01-tunica-y-capa.png.
It reported ok in14.5s; Vite teardown remained open and was interrupted, so
this is not a clean global E2E exit.
