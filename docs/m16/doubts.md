# M16 doubts

## Phase 2.21 — seed and actions for the reported flood (2026-10-21)

- **Phase:** 2.21 — N39, delayed land-to-water conversion.
- **Expected:** the five-day guard covers classic seeds 1–3 and two map seeds;
  a reported flood should be attributable to digging, rain, or comarca travel
  (`phases/2.21-sudden-flood.md:22-29`).
- **Found:** no unknown land-to-water transition was recorded in five days on
  those five fixed starts. Runtime water conversion in `World` currently occurs
  in `floodFrom` after a below-water-level dig (`src/sim/core/World.ts:604-652`);
  map water is built at installation. No supplied seed reproduced the reported
  delayed river or trapped people/animals.
- **Question for the owner:** which seed reproduces it, and in that game did
  anyone dig a trench/well or travel to another comarca before the water
  appeared? Please provide the save or seed and approximate day if available.
- **Resolution:** leave the cause open. Keep `m16-no-sudden-flood` as a guard;
  do not change hydrology without a reproduction. The separate night-colour
  report was traced to `Renderer.drawNightOverlay` using season-adjusted
  `TimeManager.daylight`; its tint now uses only the time-of-day fraction.

## Phase 2.17 — visible water-search failure for band members (2026-10-21)

- **Phase:** 2.17 — N21/N44/E2/E3 hunger and thirst search.
- **Expected:** when a band member on land between impassable waters has no
  reachable drinkable source or unexplored frontier, it must move or show a
  visible notice once per day (`phases/2.17-search-food-water.md:19-20,36-39`).
- **Found:** thirst can select an unexplored frontier in `Brain.findExplorePoint`
  (`src/sim/ai/Brain.ts:4645-4728`), but exhaustion of the frontier only
  increments `water_exploration_no_frontier`. The visible `autonomyStall`
  explanation is set only by the directed-character autonomy path
  (`src/sim/core/Simulation.ts:7175-7202`); no equivalent notice exists for
  other members of the band. The card does not define the NPC notice's owner,
  presentation, persistence, or daily reset, and the state would be player-
  visible (R24).
- **Resolution:** R0. Do not invent a new notice channel or its saved-state
  contract. Keep the passing capability tests for N21, E2, E3 and directed
  character no-water feedback; leave N44 open and take independent phase 2.18.

## Phase 2.14 — predator bites as defence targets (2026-10-20)

- **Phase:** 2.14 — a bandmate answers a predator biting someone in their band.
- **Expected:** step 1 asks a witness to score a defensive action against the
  wolf; step 2 says to make the bite an assault that existing `Defence` can
  see and reuse the human-attack structure (`phases/2.14-defend-from-predators.md:22-28`).
- **Found:** the card cites `src/sim/core/AnimalAttack.ts`, but the current
  module is `src/sim/entities/AnimalAttack.ts` (`Simulation.ts:21`). More
  substantially, `animalBlow` updates `lastHarmedTick` but not
  `lastHarmedBy` (`entities/AnimalAttack.ts:50`). `Simulation.animalBites`
  directly sends the bitten person toward a fire or away and applies witness
  fear; it never registers an attacker (`core/Simulation.ts:4215-4244`). The
  wildlife callback does carry `(animal, person)` (`systems/WildlifeSystem.ts:162,593`),
  but `Defence.assailantOf` resolves and returns a `Person`
  (`social/Defence.ts:311-320`). Brain's kin-defence route only scans child
  victims with a `lastHarmedBy` person ID and calls that resolver
  (`ai/Brain.ts:3000-3012`). The existing fixture likewise assigns a human
  aggressor (`__tests__/kin_defence.test.ts:19-20`). No
  `defended_from_predator` counter exists; the nearby
  `predator_kept_off_by_guard` counter measures pre-bite patrol avoidance
  (`systems/WildlifeSystem.ts:569`). The underlying gap is still listed as
  open in `docs/bugs.md:1389-1390`.
- **File:line:** `phases/2.14-defend-from-predators.md:18-28`,
  `entities/AnimalAttack.ts:50`, `core/Simulation.ts:4215-4244`,
  `systems/WildlifeSystem.ts:162,593`, `social/Defence.ts:311-320`,
  `ai/Brain.ts:3000-3012`.
- **Resolution:** R0. The actual module path is a name correction, but
  `assailantOf` and the attack target model are person-only, so the card's
  reuse instruction does not define how an animal becomes a defensive target.
  Do not invent a second response path; leave phase 2.14 until the animal
  attacker/target representation is decided.

## Phase 2.6 — roofed and roofless art line up (2026-10-20)

- **Phase:** 2.6 — N7, the house image with its roof lifted.
- **Expected:** the card says the exterior (`ext`) and floor plan (`plan`) are
  the two house views to compare and correct in the generators.
- **Found:** the current houses with interiors do not switch between those two
  layers. `Renderer.drawBuildingArt` draws `floor` and `walls` when the roof
  lifts, then `front` in the depth pass (`src/render/Renderer.ts:1821-1831,
  1863-1880`). The `ext`/`plan` path still serves roof-lifted buildings without
  interior layers, such as the granary and library. The existing roof-lift
  e2e exercises the room layers instead (`e2e/roof-lift.spec.ts:44-58`).
- **Evidence:** `npm.cmd exec playwright -- test e2e/roof-lift.spec.ts` passes
  1/1; `npm.cmd run art:sheet` exits 0 and shows that generated plans are still
  separate assets from the house interior layers. The room implementation
  arrived in M15 commit `74cedae` (2026-10-10).
- **Resolution:** R0. Do not rewrite generators against a renderer contract
  that the house path no longer uses. Leave N7 open; phase 2.6 is marked
  skipped, and work proceeds to independent phase 2.7.

## Phase 11.5 — D-19 coast-card wording (2026-10-20)

- **Phase:** 11.5 — action labels in both languages, including the coast-card
  copy required by D-19.
- **Expected:** the phase card's step 5 and D-19 require the comarca card to say
  “Coast: there may be no reachable shore.”
- **Found:** `WorldPicker.ts:388` currently says “Coast: you will begin on the
  shore.” Its Spanish entry at `src/i18n/es/ui.ts:174` says “Costa: empezarás
  en la orilla.” These statements make different promises about access to a
  reachable shore; the card does not explain whether the wording was intended
  to change or which copy reflects the owner's decision.
- **Resolution:** R0. No 11.5 implementation was started. The labels work and
  coast-card copy are left untouched; the phase is marked skipped pending a
  decision. Continue with the next independent phase, 2.1.

## Phase 2.19 N36 travel and living-person views — 2026-10-18

- **Phase:** 2.19 — N36 expected that after scouting east, the family/tribe
  views would appear empty and returning west could report land under the sea.
- **Found:** `m16-scout-roundtrip.test.ts` passes on the pre-N36-change code:
  east travel keeps the active identity and living people in both views, and
  west travel returns home without a refusal. The test in
  `src/sim/__tests__/comarca-travel.test.ts:362` also documents that
  `initialGeographicStart` must be set after `installCurrent`.
- **Decision:** R22 classifies this as already fixed in M15 (`124c0a7`). The
  card's suspected stale-start/view defect is not present on this build; no
  travel or view code changed. Keep the regression coverage.

## Phase 1.7 fast-level duration — 2026-10-18

**Resolved direction, 2026-10-20:** the owner explicitly requested reducing
test costs and running full suites per phase rather than per commit. A named
small rules subset is therefore authorized for `check:fast`; every existing
integration replay remains in `npm test` and in the full gate. This removes
the ambiguity recorded below without claiming a full unit run takes <2 min.

- **Phase:** 1.7 — run levels `check:fast`, `check:area`, `check:full`.
- **Expected:** the card defines `check:fast` as `npm run typecheck && vitest
  run` and requires it to complete in under two minutes.
- **Found:** the required full Vitest suite took 896.46 seconds (14m56s) on the
  phase 1.6 build: 327 files passed, 2,398 tests passed, one skipped. The same
  machine's 1.1 timing recorded the unit suite at 1,061.52 seconds (17m42s).
  Making the command faster would require changing which tests run or changing
  the stated limit; neither choice is specified by the card.
- **File:line:** `docs/m16/phases/1.7-run-levels.md:13-15,21-22`,
  `docs/m16/timings.md:68-69`,
  `artifacts/verification/m16-1.6/after/unit-tests-full.log`.
- **Resolution:** R0: leave phase 1.7 unchanged and mark it skipped pending a
  decision on whether `check:fast` means the full unit suite or a smaller,
  named subset. Phase 1.8 depends on 1.7; phase 1.9 depends only on 0.1 and is
  the next independent card.

## Phase order and phase protocol — 2026-10-16

- **Phase:** 0.1 / 0.2 / 0.3
- **Expected:** The ordered cards say to finish 0.1 and 0.2 before 0.3 creates
  branch `m16` and the diary; the protocol also requires every phase to run on
  `m16` and append its diary before committing.
- **Found:** That order cannot satisfy the protocol. The starting checkout was
  `codex/m15-closeout-20261016` at `0946fa7`, with a pre-existing user change in
  `docs/notes_for_m15.txt`.
- **File:line:** `docs/m16/README.md:158`, `docs/m16/README.md:204`,
  `docs/m16/README.md:306-308`, `docs/m16/phases/0.3-rules-and-version.md:12-24`.
- **Resolution:** Created local branch `m16` at the plan-only M16 commit and
  added this diary scaffold before phase 0.1. The user's pre-existing change is
  preserved and excluded from phase commits. Phase 0.3 still needs to verify
  the remaining rules and version note; its branch-creation step is already
  done and should be recorded as such rather than repeated.

## M16 2.24 — la identidad que diverge no está localizada — 2026-10-22

- **Fase:** 2.24, E5.
- **Esperado:** guardar, cargar y avanzar 20 días conserva el grafo de objetos
  exacto; la tarjeta sospecha que la carga duplica el evento `share_food`.
- **Encontrado:** la prueba de capacidad `m16-load-keeps-sharing` reproduce un
  nodo adicional (3.049 frente a 3.048). La diferencia ya aparece en la
  estructura raíz al serializar, con los índices de `corpsesById` desplazados;
  todavía no se identificó el objeto cuya identidad se pierde ni se confirmó
  que sea `share_food`. El test previo de `world-state-peoples.test.ts`
  normaliza el grafo por contenido y por eso no detectaba esta pérdida.
- **Archivo/línea:** `src/sim/__tests__/world-state-peoples.test.ts`, prueba
  `m16-load-keeps-sharing`; `src/sim/persistence/WorldObjectRecords.ts`,
  rehidratación del grafo y reenganche de personas en `fromWorldObjectRecord`.
- **Resolución:** mantener la prueba roja y detener la fase según R0 hasta
  localizar la primera referencia concreta; no modificar el cargador con una
  causa no confirmada. Próxima fase independiente: 2.25.
