# M15 phase 35: logboat navigation

Date: 2026-10-09

## Scope

The existing reed raft remains a freshwater craft and keeps its original
`raft` movement mode. This phase adds a physical hollowed-log boat for local
routes that cross sheltered salt water. It does not enable travel between
comarcas; that world-map journey is a separate phase.

The `logboat` technology is Mesolithic and requires carpentry, firemaking and
ground-stone knowledge (internal technology id `stoneworking`). A route needs both independent locks: the traveller
must know `logboat` and carry a crafted `logboat` item. The recipe uses four
wood and two rope, takes 120 work ticks and produces one boat. Failed orders
explain which lock is missing.

## Water and routing

`World.isLogboatTile` admits freshwater and salt-water tiles up to four times
the local swim-depth threshold. The map's open sea remains impassable. A
separate, lazily rebuilt connected-component cache keeps these passages from
changing the existing freshwater `sameBoatRegion` contract. Terrain edits
invalidate both caches through the world's existing terrain version.

Pathfinder and MovementSystem use the `logboat` pass mode for these regions.
Rafts continue to use the original freshwater-only `boat` mode. Movement marks
the person as afloat and records the actual vessel in the public
`aboardBoat` observation; the renderer uses this observation and does not read
another person's inventory or knowledge. Needs and the headless ground check
use the same craft-specific safety predicate, so a raft alone does not exempt
its owner from drowning in salt water. On interruption, boat travel returns
toward a shore reachable by the vessel actually available to that person.

## Verification

The focused rafting suite covers the existing raft checks plus a synthetic
sheltered salt-water lane. It verifies the separate water thresholds and
regions, refusal without either lock, the recipe definition, a successful
canoe crossing, and rejection of a deep/open-water tile. The menu has Spanish
translations for the new labels and refusal reasons.

The focused Playwright test `e2e/phase35-logboat.spec.ts` passes and captures
the locked menu, unlocked order, and person afloat. The dated screenshots are
in `artifacts/screenshots/m15-phase35-logboat-2026-10-09/`. The game label for
the shared boat action is “boating” (Spanish: “navegando”), so freshwater raft
and logboat actions both describe the movement rather than the craft.

The isolated canoe snapshot typechecks. Its rafting, technology, Spanish and art suites pass: 76 tests in four files. The Playwright crossing test passes. Final combined verification is recorded separately.
