# M15 phase 35 — live transport animals

Donkeys and horses are individual, tameable animals. Learning `pack_animals` or
`horse_riding` does not create an animal. A newly tamed eligible animal is
claimed automatically when the person has no lease; the animal radial menu can
assign a nearby tamed animal explicitly. A reciprocal lease is valid only while
the person owns the living animal and has the matching practice. A manual
release disables automatic reacquisition until the player claims an animal
again. The animal remains a visible companion at its tamer's heel.

A donkey adds 24 units to total and per-item cargo limits, so food and timber
both fit in the separate pack load. A horse grants a 1.5 journey speed factor
only; local walking keeps the established movement rules. Cargo and journey
readers use the canonical lease resolver in `TransportAnimals.ts`.

Transport stock is generated in a dedicated seed-derived pass after all
established spawn passes. `PREY_SPECIES`, `spawnRng`, old fork positions and
pre-existing entity spawns remain unchanged. Old Person and Animal records
migrate absent transport fields to empty lease state. Donkey and horse activity
sheets are generated from `art/src/animals/animals.ts`.

The changed radial menu, reciprocal lease, following companion, and release are captured in
`artifacts/screenshots/m15-phase35-animals-clear-2026-10-09/` (`transport-animal-radial-dispatch.png`, `transport-animal-following.png`, and `transport-animal-release.png`).
Coverage includes an actual WorldState scout return: physical riding horse returns in 54 ticks versus 80 with knowledge alone (40 ticks/day). The lease ceases to contribute beyond eight tiles; claiming through the UI requires nearby ownership. The isolated animal delivery passes typecheck and 101 focused checks across eight test files.
