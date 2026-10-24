# M16 diary

## M16 1.7 — Cronometraje aislado de las nueve áreas (2026-10-24)

Goal: dar a cada `check:area` una medición de pared sin carga concurrente para
poder juzgar el presupuesto de cinco minutos de la tarjeta.

What was done: las nueve áreas del registro de `simcheck.ts` corren en serie,
una tras otra, sin ningún otro proceso pesando en la CPU. Sin cambios de
código ni de juego; se registran tiempo, escenarios y checks por área.

Before and after: la medida anterior de `objects` (506,31 s) tenía solapes y
no valía; la aislada es 513,49 s. `foresight` 13,66 s, `player` 42,41 s,
`shelter` 102,32 s, `discovery` 150,02 s, `world` 166,99 s, `assembly`
363,97 s, `base` 397,02 s, `bands` 546,17 s. Cuatro áreas exceden los 300 s y
`objects` repite su cuenta 924/985 exacta, señal de estabilidad.

What turned out differently from the card: el presupuesto por área no se
cumple en cuatro de nueve; no se recorta cobertura ni se cambia el límite,
porque eso es una decisión del propietario (R0). La fase sigue sin cerrarse.

What is left open: la decisión sobre el presupuesto; el gate de etapa 2.G,
que arranca tras este registro.

Screenshots: ninguna; la medición no cambia la UI.

## M16 2.10 — El menú no revela la tecnología de un desconocido (2026-10-20, `f94c77e`)

Goal: ensure the action menu does not read a stranger's known technologies or
skills, while explicit social actions still explain why they cannot help.

What was done: `ActionCatalog` now asks `knowledgeOfPerson` whether the player
knows the target's character before reading their skills or technologies. If
not, `teach` and any discussion about the player's idea stay enabled; the
attempt itself decides. An explicit lesson with nothing transmissible stops
with `learned_nothing`, and discussion keeps `partner_ignorant`. The teach
eligibility check is shared with `KnowledgeSystem`. NPC-autonomous lessons and
the world are unchanged.

Before and after: `m16-stranger-menu-does-not-reveal-known-tech` failed before
the change because `discuss` and `teach` differed between two strangers; it
now passes. Two action tests confirm a visible refusal for empty lessons and
uninformed discussion. The former interruption fixture now supplies a lesson
that can actually be taught. Typecheck passes; full Vitest passes (345 files,
2,434 passed, one skipped); the screenshot tour passes 19/19. `sim:check:all`
still reports 48 scenarios and 152 failures, exactly the same failed-check
sets as the full 2.9 matrix. No new failure appeared.

What turned out differently from the card: `discuss` already refused an
uninformed partner with a visible reason; the live bug was that the menu
revealed the reason ahead of the conversation. `teach` needed an explicit
refusal before waiting through a lesson that could not transfer anything.

What is left open: A10 is closed. The inherited scenario matrix remains red;
it is unchanged from the preceding full M16 phase run.

Screenshots: `artifacts/screenshots/m16-2026-10-20-2.10/08-stranger-actions.png`.

## M16 2.9 — La armadura de piel respeta `leatherwork` (2026-10-20, `c3a2a98`)

Goal: comprobar los tres efectos de A9 y hacer que la armadura de piel dependa
de la tecnología que la produce.

What was done: el arco y la tala ya usaban el alcance del arma y `axeFactor`;
las pruebas negativas confirmaron que ambos fallan si se retira esa integración.
La armadura de piel era la excepción: no declaraba `armourTech`, así que el
lector compartido omitía `leatherwork`. Se añadió el vínculo y una prueba para
cada expectativa visible: alcance del arco, protección de piel y tala con hacha.

Before and after: la prueba de armadura observó 100% de protección en una
persona sin el oficio; ahora recibe 75%, mientras que una persona que sabe
curtir recibe el valor completo. Typecheck y cuatro suites enfocadas pasan
(155/155). El baseline de semillas 1–3 no cambió (`c61a6bd8`, `98d972e4`,
`988c035e`). El health report mantiene los dos fallos ya presentes antes del
cambio (`moods-move-choices`, `perf-budget`) y 27 acciones en la misma
distribución. La primera suite completa detectó dos tests de ropa que asumían
protección completa sin conocer `leatherwork`; corregidos los fixtures, las
seis suites enfocadas pasan (175/175) y la suite completa pasa (344/344
archivos, 2.431 pruebas correctas y una omitida); typecheck y la suite de
armadura pasan (89/89). La matriz completa termina con 48 escenarios y 152
fallos. La referencia M16 congelada en `0.15.160-alpha` tiene 43 escenarios y
118 fallos; 23 escenarios compartidos ahora tienen distintos conjuntos de
fallos, así que esa comparación histórica no atribuye la divergencia a 2.9.
El informe centrado `band` mantiene los mismos dos fallos anteriores
(`moods-move-choices`, `perf-budget`; 525 pasos/s frente al suelo de 1.678).
La matriz global no se presenta como verde.

What turned out differently from the card: A9 ya figuraba cerrado en M15; el
test de capacidad encontró que el dato de `hide_armour` faltaba aunque
`armourOf` ya delegaba en `protectionOf` y `armourFit`.

What is left open: `moods-move-choices` y `perf-budget` siguen en rojo en la
matriz de referencia; no se cambiaron los pesos de IA.

Screenshots: `artifacts/screenshots/m16-2026-10-20-2.9/01-start.png`.

## M16 2.8 — El agua cierra el foso aislado con un motivo (2026-10-20)

Goal: prevent water from leaving a moat with unreachable pending tiles and no explanation.

What was done: earthwork selection now checks that a working bank is connected to the worker and keeps the same walking target between ticks. When no pending tile has a reachable bank, the unfinished site is removed, delivered materials return to the ground, and the player sees the water cutoff reason in the stop notice and insight.

Before and after: `m16-earthwork-water-cutoff` failed on the former generic `cannot_reach` path and passes with the change. Both water-specific and general-reachability closure tests pass; typecheck passes; earthworks and `diggers` checks pass 19/19; stop-reason and i18n tests pass 6/6. Full Vitest passes (344 files, 2,429 tests, one skipped). The final `diggers` report finishes one ditch with 58 lifts and 11/12 people alive; `spatial-hash-spreads` is a new open failure (10 of 11 people in two cells), recorded in `docs/bugs.md`. The craft health scenario had 5 unrelated failures.

What turned out differently from the card: it names `Earth.ts` and `World.updateShore`; the defect was in earthwork target selection, and existing region labels already tracked flooded connectivity. Re-pinned the switched-off baseline: seeds 1–3 are `c61a6bd8`, `98d972e4`, `988c035e`.

What is left open: the `diggers` scenario's clustered-person spatial-hash warning remains to be checked outside this focused earthwork world. The screenshot tour captured the new reason but one unrelated tree-menu frame failed to open its radial menu (17/18).

Screenshots: `artifacts/screenshots/m16-2026-10-20-2.8/14-earthwork-water-cutoff.png`.


## M16 2.3 — Fog is saved, dimmed not black, and forgets what is gone (2026-10-20)

The save envelope is version 2 and records the exact `FogReveal` observer and
cell grid. Version 1 loads with inactive fog. A committed walker now records
explored cells through a cursor separate from the daily static-place refresh;
observing an empty place drops stale entity markers while water remains a map
fact. Touched rim cells reveal, remembered cells outside sight stay dim, and
remembered places draw without requiring the current observer to have revealed
them.

Typecheck passes. The complete Vitest suite passes (342 files; 2,425 passed,
one skipped); `m16-fog-forgets-removed`, `m16-memory-while-walking`,
`m16-fog-saved`, `m16-fog-dimmed`, `fog-on-switch` pass. E2E captures are in
`artifacts/screenshots/m16-2026-10-20-2.3-final/` and
`artifacts/screenshots/m16-2026-10-20-2.3-switch-verified/`.

R13 was re-pinned after the final memory-cursor fix: seeds 1–3 are
`73931030`, `d60a58d5`, `8c971f70`. The complete matrix is still red (134 failed
checks versus 118 in the comparison matrix); 45 checks moved PASS→FAIL and 27
moved FAIL→PASS, with other transitions to or from `n/a`. This phase deliberately
changes AI-readable memory, so it changes subsequent choices and world states.
The run is recorded separately at `artifacts/verification/m16-2.3/after/`; no
matrix check is represented as passing when it failed.

What turned out differently from the card: the per-cell walk cursor had to be
separate from `placeMemoryStaticCell`; sharing it suppressed daily discovery of
new resource nodes in a cell. The manual-build regression test exposed this.

What remains open: review the 45 PASS→FAIL transitions against their individual
mechanisms; the aggregate run does not establish a direct regression for each.

Screenshots: see the two M16 directories above.

## M16 2.22 — furniture without banners; stations respect territory (2026-10-18, `63bc104`)

Goal: close N45 and K6 by removing household ownership marks from furniture
and requiring outdoor stations to use their band's territory under D-16.

The renderer now omits the band ring and pennant for furniture and stations.
`placementRefusal` rejects a station on another band's ground and rejects an
unclaimed site unless the band has no territory and a finished own building is
within eight tiles. Player placement and NPC placement share that check, and
both refusal reasons have Spanish translations. Tests were written first and
all four failed on the old code. Several older station fixtures now claim
their test tile only during placement, then restore the territory map so the
test setup does not alter later AI.

Before and after: the full unit suite passes 340 files (2,419 passed, one
skipped); typecheck and the focused E2E pass. The `craft` area remains at its
four baseline failures. The full matrix has 118 failed checks in 48 scenarios,
same as the before matrix, but `feasts` has status transitions. Disabling the
new rule in a controlled run restores the prior status for `discovery-is-situated`
and `hills-see-farther`; this is an observed consequence of the territory rule,
recorded for block 10 calibration. Switch-off fingerprints remain
`f268441f`, `a90f56fc`, `f8401ac8` after re-pinning. Logs, matrices and the
control run are under `artifacts/verification/m16-2.22/`.

What turned out differently from the card: the full matrix shows a measured
world change in `feasts`, rather than identical check statuses. Furniture and
station rendering changes are visible in both Spanish captures:
`artifacts/screenshots/m16-2026-10-18-2.22/01-furnished-interior-es.png` and
`artifacts/screenshots/m16-2026-10-18-2.22/02-outdoor-station-es.png`.

What is left open: review the `feasts` matrix transition during block 10
calibration; no threshold was tuned here.

## M16 2.19 — the map edge is not sea (2026-10-18)

Goal: close N34, K1, K2, K8, E1, and measure N36 using capability tests.

The edge-specific tests were run red first: map perimeter tiles were reported
as shore, a west-edge river wrapped to a phantom east-edge fresh shore,
outside-map shallow water was true, and player movement at the east edge
reported deep water. Classic-island behavior remains sea at the perimeter.
Added `World.outsideIsSea`, map-bounds-safe shore and water-kind checks, and a
movement query that keeps map edges out of the sea. The first full suite caught
that applying the new bounds rule to classic `hasWaterOfKind` also changed its
historical wrapped neighbor lookup; the classic branch now retains that exact
lookup, while geographic maps stop before indexing. The specific water-source
consumer test passes after this correction. Geographic terrain saves
record the flag in schema v4; old records default to the prior sea-edge rule.
Classic islands keep their v3 record shape. No RNG stream or switch was added.

N36's scout east/return, family/tribe living-person views, active identity, and
westward return test passed before any N36-related code change. Under R22 that
is recorded as already fixed in M15 (`124c0a7`); this phase did not alter travel
or those views.

Before/after: the capability tests, persistence round trip, focused tests, and
switch-off fingerprint check pass; the pinned classic fingerprints remain
`f268441f`, `a90f56fc`, `f8401ac8`. Typecheck passes. The full unit suite
passes 338 files (2,415 passed, one skipped). `sim:check:all` exits 1 with the
inherited 118 failed checks; `baseline:diff` reports no check status changes
against M16 1.6 across 48 scenarios. `tiny` retains the same four reds as its
baseline (`moods-move-choices`, `materials-delivered`, `forest-is-used`,
`perf-budget`). Logs and matrix are in `artifacts/verification/m16-2.19/`.
Screenshot:
`artifacts/screenshots/m16-2026-10-18-2.19/map-edge-no-false-swim-es.png`.

What differed from the phase card: N36's suspected stale comarca identity and
empty trees did not reproduce on the current build, so no speculative travel
fix was made. Existing old saves need no migration because the new flag is
absent from classic records and defaults to true when loading versions 1–3.

## M16 2.4 — pickup reasons and the rest of the pile (2026-10-18)

Goal: close N8/N20 and the code findings K3/K4 with player-facing capability
tests.

What was done: the pile menu and pickup action now use the same per-item
refusal rule and translated reason. A second bundle explains that one is
already on the shoulder. “Take all” skips a stack that cannot fit and checks
the remaining stacks. No new RNG stream was needed; `baseline:pin` kept all
three switch-off fingerprints unchanged.

Before and after: all four capability tests pass; typecheck passes; the full
Vitest suite passes 335 files (2,408 passed, one skipped). The `tiny` scenario
retains its four pre-existing reds. `sim:check:all` exits 1 with 118 failing
checks; their names match the M16 1.6 saved matrix across 48 scenarios, with
no checks added or resolved. The full report is saved under
`artifacts/verification/m16-2.4/`. N20's conservation test passed before an
N20-specific fix, so the owner report was not reproduced and its cause remains
unknown.

What turned out differently from the card: the first item in a pile needs to
be skipped only in the take-everything path; explicit single-item pickups keep
their existing selection. The conservation test found no loss in
`transferTo`/inventory handling.

What is left open: the original N20 disappearance report is unconfirmed; the
full health matrix's failures remain baseline/open work.

Screenshots: `artifacts/screenshots/m16-2026-10-18-2.4/pickup-refusal-es.png`.

## M16 2.15 — fetch missing materials for ordered building (2026-10-18, `9434096`)

Goal: verify N16/N40: a fresh hearth can be built from nearby ground materials,
and an explicit player “Work on” order fetches and delivers what the site lacks.

What was done: added capability coverage for NPC and player orders, monotone
hearth progress, the unavailable-material refusal, and the Spanish names. The
player order reuses `gather_for_site` and resumes building after delivery.
NPC continuation remains unchanged. `Hearth` is «Hoguera»; `Fireplace` is
«Hogar».

Before and after: targeted verification passes 60/60 tests across six files;
typecheck passes. Baseline fingerprints are unchanged. The hearths scenario
keeps `earthworks-are-dug` and the five frozen R21 reds, with `perf-budget`
under its floor at 444 steps/s. The full suite ended with one fixture timeout;
that file passes alone in 126.23 s, with 120.34 s in tests.

What turned out differently from the card: the existing gather selector is
called only for an explicit player build order; the NPC's old plan-and-rescore
flow is preserved. The baseline re-pin was identical, so no fixture changed.

What is left open: the fixture test has almost no margin against its timeout;
the full-suite timeout and the scenario performance budget are recorded in
`docs/bugs.md`.

Screenshots: `artifacts/screenshots/m16-2026-10-18-2.15/hearth-buildbar-es.png`.

## M16 0.1 — Freeze the M15 baseline (2026-10-16, `71e5729`)

Goal: establish a fixed, reviewable starting point for M16.

What was done: recorded the M15 closing commit and version, ran the requested
checks, and saved the raw outputs. The per-scenario CSV keeps all 43 matrix
results and the exact names of their failed checks.

Before and after: before this phase, M16 had no baseline file; now the matrix
records 17 clean scenarios, 1,810/1,928 applicable checks passing and 118
failing. The unit suite passed 320 files (2,339 passed, one skipped), and E2E
reported 186/186 cases correct.

What turned out differently from the card: the `century` cohort overlapped the
unit suite for part of its runtime, so its throughput is not an isolated
performance measurement. E2E reported all cases correct but exited 1 during
runner teardown.

What is left open: M15's accepted gates remain open; M16 phases 0.2 and 0.3
remain to be done.

Screenshots: none; the UI did not change. Historical screenshots rewritten by
E2E were restored.

## M16 0.2 — Actualizar el triaje (2026-10-16, `1b615c6`)

Goal: separar los defectos ya corregidos de los que siguen pendientes y enlazar
los informes recientes con fases concretas.

What was done: se revisaron las entradas de M15 posteriores al triaje y los
hallazgos nuevos de `docs/bugs.md`. T9, T10 y A9 quedan cerrados con evidencia
de la línea base o cambios de M15; A5 y A10 siguen activos tras revisar su
flujo actual. N9, N16/N40, N21 y E7 reflejan qué parte cubrió M15 y qué prueba
capability falta todavía.

Before and after: el triaje tenía 2 filas V sin verificar y 3 defectos A/V;
ahora no queda ninguna etiqueta V. Se enlazaron los seis grupos de hallazgos
posteriores al 13-10 con fases o gates existentes; no se necesita una tarjeta
nueva.

What turned out differently from the card: los dos fallos E2E antiguos y los
fallos de `herding.test.ts` no reaparecieron en la línea base completa; A9 ya
había sido atendido durante M15. La lectura actual confirma que A5 y A10 siguen
abiertos.

What is left open: las pruebas capability de N9, N16/N40, E7, A5 y A10 siguen
en sus fases programadas. Los gates de M15 permanecen abiertos y fijados como
baseline.

Screenshots: none; no UI change.

## M16 2.23 — Selección de personas en la costa (2026-10-18, `80ce45d`)

Goal: seleccionar a una persona al pulsar sobre su dibujo en playa o agua somera y conservar la acción de beber en agua abierta.

What was done: `candidatesAt` ahora examina los objetivos antes del fallback de agua. `World.tileOf` comparte el truncado de `World.index` en selección y colocación con el cursor. La e2e cubre vadeo, playa y agua abierta.

Before and after: los casos de vadeo y playa fallaban antes del cambio; las tres e2e finales pasan. La prueba de truncado falla cuando se fuerza `Math.round` (x=69 en vez de x=68). Capturas: `artifacts/screenshots/m16-2026-10-18-2.23/`. La suite completa pasó 2.419 tests y omitió 1; el único fallo fue el hook `afterEach` de fixtures bajo carga, y el archivo aislado pasó 2/2 con timeout de hook ampliado.

What turned out differently from the card: el test completo requirió 17 minutos y excedió el límite de 10 s de limpieza; la repetición aislada tardó 154 s. La fase no modifica simulación, por lo que se conserva la matriz previa de 118 fallos en 48 escenarios.

What is left open: ninguno para N46/K7. Sin cambios de mundo, RNG, switch ni estado guardado.

Screenshots: `artifacts/screenshots/m16-2026-10-18-2.23/wading-npc-picker-es.png` y `artifacts/screenshots/m16-2026-10-18-2.23/beach-npc-picker-es.png`.

## M16 2.2 — obras planeadas (2026-10-18, 112eec6)
Goal: confirmar que la obra marcada por el jugador sobrevive y que el retiro
automático de una obra NPC explica el motivo y conserva lo entregado.
What was done: se añadió `m16-player-sites-not-dropped`, que deja avanzar diez
días a una obra del jugador y otra NPC sin trabajo. No se cambió código de
juego: las dos rutas ya funcionaban desde M15.
Before and after: antes faltaba una prueba conjunta del ciclo natural de
caducidad; después, la obra del jugador sigue, la NPC se retira con aviso y
crónica, y los tres palos entregados se recuperan en el suelo. Prueba focal
1/1; `typecheck` pasa.
What turned out differently from the card: todo estaba corregido en M15; la
fase cierra como «verified already fixed» por R22. No hubo cambio de UI.
Screenshots: ninguno; no cambió la UI.

## M16 0.3 — Reglas y rama del hito (2026-10-16, `80af525`)

Goal: dejar las reglas de M16 visibles desde `AGENTS.md` y fijar cómo se cierra
e integra el hito.

What was done: se añadió la referencia al plan M16 y una copia legible de las
reglas R0, R11–R13, R21–R24 y R26. También se dejó escrito que, tras completar
las fases y la verificación completa, `m16` se integra en `master`; el
propietario hace la subida a GitHub para la prueba remota.

Before and after: `AGENTS.md` ya no prescribe el prefijo M15 para trabajo M16,
y tanto ese archivo como el protocolo de M16 describen el mismo cierre de
rama. La versión sigue en `0.15.160-alpha`; `0.16.0-alpha` se reserva para el
primer cambio de comportamiento.

What turned out differently from the card: la rama `m16` y el diario ya
existían porque el protocolo de 0.1 exigía estar en la rama y llevar diario
antes del primer commit de fase; se documentó la preparación anticipada en vez
de repetirla.

What is left open: sigue pendiente la fase 1.2. M16 permanece en curso y
todavía no corresponde integrarlo en `master`.

Screenshots: none; no UI change.

## M16 1.1 — Medir el coste de verificación (2026-10-16, `095d90c`)

Goal: medir el tiempo de cada escenario, la suite unitaria y E2E para ordenar
las futuras mejoras de herramientas.

What was done: se ejecutaron de forma aislada las 41 claves de `SCENARIOS`,
Vitest completo y los 186 casos E2E. Se guardaron logs por escenario, el JSON
con duraciones por archivo y las salidas de las dos pruebas E2E: la fallida en
5173 y la válida en 5399.

Before and after: el barrido aislado suma 1.361,88 s de pared; Vitest tarda
1.061,52 s y E2E 898,46 s hasta el último resultado. El spec más lento fue el
de eventos animales (24,7 s); el archivo unitario más lento fue
`compact-correspondence.test.ts` (86,53 s).

What turned out differently from the card: el reporter normal de Vitest no
mostró duraciones por archivo, así que se hizo una segunda pasada JSON. El
puerto 5173 rechazó conexiones; con 5399 pasaron los 186 specs. El runner quedó
en teardown y se interrumpió tras 30 s; las capturas históricas reescritas se
restauraron.

What is left open: la matriz de salud conserva los rojos de baseline; los 28
códigos de salida 1 en ejecuciones aisladas no son una lectura de regresiones.
El cierre del runner E2E todavía no tiene salida limpia.

Screenshots: none; no UI change.

## M16 1.2 — Corregir las herramientas de prueba (2026-10-18, `c4c14c2`)

Goal: conseguir que las suites de Vitest y Playwright terminen por sí solas y
que los fallos de tests no queden ignorados por CI.

What was done: se cerraron seis cambios separados: guardia de regresión para
`tiny`, timeouts locales para los tests lentos, propiedad del servidor Vite,
aserciones de superficie en la gira de capturas, repetición de 50 inicios de
personaje y retirada de `continue-on-error` en CI/Deploy. El plan y el triaje
ahora reflejan el cierre.

Before and after: Vitest pasó dos veces con 321 archivos y 2.340 pruebas
aprobadas (una omitida); E2E pasó dos veces seguidas, 186/186, con código 0 y
sin listener en 5399. `tiny` avanzó los 2.000 pasos previstos, frente al caso
anterior de cero pasos. Sus cuatro checks rojos y el `perf-budget` general son
fallos de salud heredados, no cambios de esta fase.

What turned out differently from the card: la primera pasada E2E completa
falló en `boundingBox()` del grafo de tribu; el caso aislado y las dos pasadas
completas siguientes pasaron. Queda registrado como intermitente sin causa
confirmada.

What is left open: investigar si vuelve a aparecer la lectura nula de
`boundingBox()`; no se modificó un test por una sola incidencia.

Screenshots: none; no UI change.

## M16 1.3 — Comparar la línea base (2026-10-18, `2f3aefb`)

Goal: guardar las matrices de escenarios en un formato comparable y fijar que
los switches apagados conservan exactamente el mundo de antes.

What was done: se exporta la matriz con `passed`, `failed` y `na`, se añade el
comando `baseline:diff` para señalar deterioros y se guardan huellas completas
de checkpoint para tres semillas de `band`. La prueba R17 detectó una mutación
temporal del apetito de caza y volvió a pasar al restaurar el valor original.

Before and after: la matriz contiene 43 escenarios, 1.810 checks aprobados,
118 fallidos y 2.268 `n/a`; el JSON coincide con la tabla y no incluye tiempos.
El auto-comparador terminó con código 0, mientras que una mutación sintética
pass → fail terminó con código 1. Las huellas fijadas son `37125c01`,
`7bf8a322` y `1d3f0ade`. Vitest completo: 324 archivos, 2.344 pruebas
aprobadas y una omitida.

What turned out differently from the card: fue necesario crear `fixtures/`
desde `baseline:pin`; ahora el comando crea la carpeta cuando falta. La matriz
completa conserva el código 1 por los rojos heredados.

What is left open: los 118 checks rojos siguen siendo baseline; no hubo nuevas
regresiones conocidas.

Screenshots: none; no UI change.

## M16 1.4 — Guardar checkpoints de todos los escenarios (2026-10-18, `9e567c5`)

Goal: comprobar que cada escenario del arnés puede guardarse y recargarse tras
su configuración y sus primeros diez pasos.

What was done: el codec reconoce las dos claves reales de tecnologías
fundadoras, valida sus datos y migra checkpoints antiguos al valor vacío que
ya tenían semánticamente. Las fixtures de yunque buscan un emplazamiento legal
en el mapa. E10 queda cerrado.

Before and after: la prueba inicial falló en seis escenarios: cuatro con
`unknown or missing fields` y dos con `world object outside terrain`. Tras los
cambios pasan los 44 escenarios y la prueba de migración demuestra que avanzar
un checkpoint antiguo da el mismo resultado que avanzar la configuración
completa. Vitest pasó 325 archivos (2.389 aprobadas, una omitida). La matriz
conservó 1.810 aprobadas, 118 fallidas y 2.268 `n/a`; no hubo transiciones de
estado contra la base.

What turned out differently from the card: además de las cuatro claves
previstas, `carburisers` e `ironworkers` situaban su yunque fuera del terreno.
Se corrigió la fixture sin alterar sus checks. El cambio de forma del config
movió las huellas completas R13; la línea base se volvió a fijar y las nuevas
huellas pasan.

What is left open: los 118 checks rojos heredados permanecen sin cambios.

Screenshots: none; no UI change.

## M16 1.5 — Mundos de fixture reutilizables (2026-10-18, `64aaef4`)

Goal: guardar mundos vividos y volver a cargarlos sin simular de nuevo toda su
historia cuando un test necesita ese punto de partida.

What was done: se añadieron cinco recetas, un comando para construirlas y un
cargador que verifica la receta, la configuración, sus campos y la versión del
checkpoint antes de reutilizar el archivo. Si falta el mundo o cambió la clave,
lo reconstruye; los overrides se aplican a la simulación cargada.

Before and after: antes faltaban el módulo y el comando, y `fixtures.test.ts`
fallaba al importarlos. Después, los cinco mundos quedaron con 34, 23, 15, 13
y 28 personas vivas; cargar y avanzar dos copias 200 pasos dio el mismo hash,
y tanto una clave obsoleta como un archivo borrado provocaron reconstrucción.
Vitest pasó 326 archivos (2.391 aprobadas, una omitida).

What turned out differently from the card: el codec solo tenía la versión `1`
como literal, sin una constante exportada; se nombró para que la clave dependa
de un único valor. El reporte completo de Vitest asignó 8.216,98 s a
importación y 634,65 s a tests; el test focal importó en 4,79 s. No se confirmó
la causa y quedó registrada en `docs/bugs.md`.

What is left open: diagnosticar la duración de importación reportada por la
pasada completa. No queda pendiente de la función de fixtures.

Screenshots: none; no UI change.

## M16 1.6 — Escenarios cortos desde fixtures (2026-10-18, `6055379`)

Goal: ejecutar checks de área desde mundos vividos sin retirar ni acortar los
escenarios completos.

What was done: `Scenario` ahora acepta `world` y `areas`; `runScenario` carga
el checkpoint y mide solo la continuación. Se agregaron cinco escenarios
`-from`, cada uno con un tercio o menos de los pasos originales, y se etiquetó
cada escenario con áreas permitidas. La prueba detecta tanto etiquetas
ausentes como una fixture sin su continuación corta.

Before and after: antes faltaban las etiquetas y los cinco `-from`; los dos
checks de `scenario-areas.test.ts` fallaron como se esperaba. Después, la
matriz ejecutó 48 escenarios: los 43 anteriores mantuvieron exactamente sus
estados (1.810 aprobados, 118 fallidos, 2.268 `n/a`); los cinco nuevos suman
siete aprobados, cero fallos y dos `n/a` explicados. `baseline:diff` no encontró
cambios. Typecheck pasó y Vitest pasó 327 archivos (2.398 pruebas, una
omitida) en 896,46 s.

What turned out differently from the card: el sueño del escenario completo
usa un montaje controlado que el checkpoint no conserva, así que
`hearths-from` solo repite el check de refugio y frío. `opinions-diverge`
requiere un asalto nuevo y `bands-take-sides` más tiempo para que se propague
la postura; las descripciones explican por qué quedan `n/a` en los mundos
cortos. La matriz completa tomó 16m12s.

What is left open: nada de la fase. Los 118 checks rojos siguen coincidiendo
con la base.

Screenshots: none; no UI change.

## M16 1.7 — Niveles de ejecución (2026-10-18, omitida por R0)

Goal: separar las verificaciones rápidas, por área y completas.

What was done: no se cambió el arnés. La evidencia previa ejecutó exactamente
la suite completa de Vitest que la tarjeta prescribe para `check:fast`.

Before and after: la suite tomó 896,46 s (14m56s) en el build de 1.6; la
medición anterior de 1.1 registró 1.061,52 s (17m42s). Ambos exceden el límite
de dos minutos. La fase queda marcada `skipped (R0; see doubts.md)`.

What turned out differently from the card: su definición de `check:fast`
incluye todos los tests y a la vez fija un máximo que las mediciones repetidas
no cumplen. Elegir una suite más pequeña o cambiar el límite sería inventar un
criterio.

What is left open: decidir qué subconjunto nominal puede cubrir
`check:fast`; la fase 1.8 depende de ello. Se continúa con 1.9 por ser
independiente (depende de 0.1).

Screenshots: none; no UI change.

## M16 1.9 — Veredictos de los rojos congelados (2026-10-18, `a40a6dc`)

Goal: dar un veredicto respaldado por medidas a los fallos unitarios y de salud
que E12/E13 atribuían a la base.

What was done: se ejecutaron por separado las cinco suites de E12 y se midieron
los checks de E13 en tres ejecuciones de `band`. También se repitieron tres
veces los 26 escenarios que tienen fallos en la matriz congelada; no se cambió
ningún test, regla, umbral ni código de juego.

Before and after: los cinco tests de E12 pasan en el build de M16:
`compact-correspondence` 2 aprobados y 1 omitido, `determinism` 11/11,
`people-knowledge` 35/35, `polity` 32/32 y `salters-checks` 2/2. E12 queda
resuelto por correcciones anteriores a M16. En E13, `cravings-steer-the-diet`
da 736/736 elecciones alcanzables, `moods-move-choices` da 3,8% frente a 2,6%
y `hills-see-farther` 8/120; pasan las tres corridas. `perf-budget` queda rojo
a 554, 591 y 508 pasos/s frente al suelo de 1.678.

La línea base de 0.1 tiene 118 checks rojos en 26 escenarios. Las 78
ejecuciones aisladas (tres por escenario) reprodujeron exactamente los mismos
118 fallos y las mismas métricas. Cada check recibe el veredicto **world wrong**:
la condición medida ocurre con datos suficientes y el fallo pertenece al mundo
de prueba; el resultado no autoriza a mover el umbral. La tabla agrupa los 118
pares escenario/check por nombre del check:

| Check rojo | Escenarios de la línea base | Veredicto |
|---|---|---|
| `animals-are-tamed` | farmers, herders, culture | world wrong |
| `bands-take-sides` | century, hearths, millers, farmers, herders, feasts | world wrong |
| `camps-move-when-the-land-fails` | lean | world wrong |
| `cooking-spreads` | smiths, polity, conquest | world wrong |
| `deaths-explained` | lean | world wrong |
| `discovery-is-situated` | smiths, craft, scribes, herders, stewards, labour, polity, conquest | world wrong |
| `families-exist` | lean | world wrong |
| `food-spoils` | fishers | world wrong |
| `forest-is-used` | tiny | world wrong |
| `generations-turn-over` | feasts, lean | world wrong |
| `gossip-is-aimed` | smiths, wilds, emptied, traps, hunters, fishers, herders, labour, culture, diggers, orchard | world wrong |
| `health-holds-up` | lean | world wrong |
| `ideas-become-tech` | lean | world wrong |
| `kills-are-butchered-for-bone` | culture | world wrong |
| `knowledge-is-found` | lean | world wrong |
| `materials-delivered` | tiny | world wrong |
| `moods-move-choices` | tiny, crowded, emptied, hearths, porters, herders, labour, polity, culture, diggers | world wrong |
| `needs-not-pinned` | harsh-winter | world wrong |
| `nights-are-slept` | smiths, century, craft, wilds, emptied, hearths, porters, scribes, traps, millers, hunters, fishers, farmers, herders, feasts, stewards, labour, polity, conquest, culture, lean, diggers, orchard | world wrong |
| `nights-are-spent-at-home` | lean | world wrong |
| `people-survive` | smiths, wilds, labour | world wrong |
| `peoples-drift-apart` | lean | world wrong |
| `population-persists` | feasts, conquest, lean | world wrong |
| `pots-reach-a-granary` | polity | world wrong |
| `projects-find-backers` | smiths, millers, polity, conquest | world wrong |
| `records-are-cut` | conquest | world wrong |
| `research-is-social` | emptied, labour, lean | world wrong |
| `roast-wins` | smiths, hearths, polity, conquest | world wrong |
| `shelter-answers-cold` | harsh-winter, labour, lean | world wrong |
| `soldiers-are-kept` | conquest | world wrong |
| `spatial-hash-spreads` | diggers, orchard | world wrong |
| `sub-webs-are-climbed` | craft, hearths | world wrong |
| `techs-are-refined` | farmers, herders, feasts, polity, conquest | world wrong |
| `the-beaten-pay-tribute` | conquest | world wrong |
| `the-map-grows` | lean | world wrong |
| `the-tree-is-climbed` | lean | world wrong |
| `the-wise-avoid-baneberries` | century, millers, polity | world wrong |
| `walkers-do-not-grind` | herders | world wrong |

What turned out differently from the card: `determinism` y los cuatro tests
unitarios restantes ya no están rojos en la base de M16. El check unitario
`polity.test.ts` (32/32) no es la fila de escenario `polity`, que mantiene nueve
fallos de matriz idénticos en sus tres corridas. Los informes aislados añaden
`perf-budget` (fuera de la matriz): en `polity` midió 342, 331 y 304 pasos/s
frente al suelo 1.724. E13 permanece abierto por la insuficiencia de
rendimiento; el valor cambia entre corridas y no se ajusta ningún límite.

What is left open: los 118 fallos aceptados por R21 y `perf-budget` siguen
abiertos; los mecanismos que no se confirmaron permanecen documentados sin
atribución causal.

Screenshots: none; no UI change.

## M16 2.1 — Un arbusto cosechado no enseña una estación estéril (2026-10-20, `19cd284`)

Goal: evitar que una cosecha haga creer que la especie no da fruto en esa
estación.

What was done: el comportamiento ya estaba corregido en M15. La observación
solo enseña esterilidad cuando la especie está realmente fuera de temporada;
la prueba existente protege el caso de un arbusto agotado al recogerlo.

Before and after: typecheck pasó; el conjunto completo pasó con 2.421 pruebas y
1 omitida; `season-lore.test.ts` pasó 8/8. No se cambió código ni se re-pinneó.

What turned out differently from the card: R22 confirmó la corrección previa
en `19cd284`; se conserva la cobertura como regresión.

What is left open: nada para A1.

Screenshots: none; no UI change.

## M16 11.5 — Etiquetas y tarjeta de costa (2026-10-20; skipped: R0)

Goal: etiquetar cada acción con su objetivo, en inglés y español, y respetar la
decisión D-19 de la tarjeta de costa.

What was done: no se modificó código. La tarjeta pide avisar que puede no haber
una orilla accesible, mientras el selector actual asegura que se empezará en
la orilla.

Before and after: se confirmó la diferencia en `src/ui/WorldPicker.ts:388` y
`src/i18n/es/ui.ts:174`. El baseline rápido empezó antes de revisar los archivos;
el resultado se conserva en `artifacts/verification/m16-11.5/before/`.

What turned out differently from the card: las dos frases hacen afirmaciones
distintas y el plan no dice cuál debe regir; R0 impide elegir una sin respaldo.

What is left open: resolver la intención de D-19; después se puede retomar toda
la fase 11.5.

Screenshots: none; no UI change.

## M16 2.29 — `art:sheet` termina (2026-10-20; ya corregido)

Goal: confirmar que la hoja de contacto de `dig` se compone sin un lienzo vacío.

What was done: no se cambió código porque el fallo descrito no ocurre en este
build. El generador terminó y produjo la hoja de `dig` con poses de varias
edades y direcciones.

Before and after: `npm.cmd run art:sheet` terminó con código 0 y la imagen
`artifacts/art/contact-dig.png` se revisó visualmente.

What turned out differently from the card: R22 encontró el comportamiento ya
corregido; no se añadió otra prueba ni se modificó el generador.

What is left open: nada para E14; no se atribuye cuándo se corrigió.

Screenshots: none; no game UI change.

## M16 2.7 — El indicador de alarma desaparece al vencer (2026-10-20)

Goal: hacer que el signo visual y el inspector dejen de mostrar a un animal
alarmado una vez alcanzado `alarmedUntil`.

What was done: `Animal.isAlarmed(tick)` reemplaza la lectura que solo comprobaba
si el plazo era positivo. El renderer, el HUD, el selector y el contador del
sim-check pasan el reloj actual; el test negativo reproduce el fallo antiguo.

Before and after: Typecheck y Vitest pasan (344 archivos; 2.427 correctas, una
omitida); la e2e pasa 1/1. La matriz completa conserva 1.805 aprobadas, 134
fallidas y 2.266 n/a sin transiciones respecto a 2.3. El log no incluyó JSON;
la comparación guardada reconstruye los estados desde su resumen y el JSON de
2.3. La matriz continúa roja por sus fallos heredados.

What turned out differently from the card: el código de simulación nunca
consultaba el getter antiguo; también había que corregir el HUD y la
telemetría de escenario. No hizo falta re-fijar el baseline.

What is left open: los 134 fallos de salud del baseline siguen abiertos; N7 de
2.6 sigue pendiente por R0.

Screenshots: `artifacts/screenshots/m16-2026-10-20-2.7-verified/`.

## M16 2.6 — Cubiertas y vistas sin cubierta (2026-10-20, skipped: R0)

Goal: comprobar que la vista de una vivienda con cubierta y al levantarla
mantiene las paredes alineadas.

What was done: se revisó la ruta actual de dibujo de viviendas y se ejecutó la
prueba de roof lift. El renderer usa superficies interiores generadas (`floor`,
`walls`, `front`); la pareja `ext/plan` de la tarjeta corresponde a otra ruta.

Before and after: `roof-lift.spec.ts` pasa 1/1 y `npm.cmd run art:sheet` termina
correctamente. No hubo cambio de juego ni de arte.

What turned out differently from the card: las viviendas con interior ya no
levantan la cubierta mostrando `plan`; el interior fue implementado en M15
`74cedae`.

What is left open: N7. R0 deja la fase omitida hasta que una tarjeta defina la
comparación entre el exterior y las superficies interiores actuales.

Screenshots: none; no game UI change.

## M16 2.27 — Los bebés no se visten solos (2026-10-20, `c25b967`)

Goal: impedir que los bebés reciban o elijan órdenes para vestirse antes de la
etapa infantil.

What was done: una función compartida de etapa de vida ahora controla la ropa
que elige la IA y las órdenes manuales. El menú muestra el motivo en español;
los adultos todavía pueden vestirse solos.

Before and after: la prueba de capacidad falló antes del cambio y pasa después.
Typecheck y Vitest pasan; la e2e española pasa 1/1. Las huellas de las semillas
1–3 no cambiaron y la matriz conserva sus 118 fallos heredados sin transiciones.
El chequeo corto mantiene el único rojo conocido, `perf-budget`.

What turned out differently from the card: el fallo de rendimiento sigue
siendo el baseline medido, no una regresión de esta fase.

What is left open: la calibración de `perf-budget` y los 118 checks de baseline
siguen abiertos según R21.

Screenshots: `artifacts/screenshots/m16-2026-10-18-2.27/01-infant-wear-refusal-es.png`.

## M16 2.5 — Picking up a far pile walks there first (2026-10-20)

Goal: verify that selecting a distant pile does not transfer its contents
before the directed character reaches it.

What was done: `m16-pickup-reach` checks that the first tick leaves the pile and
inventory unchanged while the person starts walking, then checks that the
contents transfer on arrival. The current `doPickup` already uses `travel`
before `takeFromPile`; R22 records the behavior as already fixed by M15
`3b8a57b` on 2026-09-11. No game code changed.

Before and after: typecheck passes; the test passes 1/1. For the R17 negative
control, omitting the `travel` call makes the test fail because `sticks` enter
the inventory on the first tick; restoring the call makes it pass. The `band`
area baseline has only the known `perf-budget` failure (546 steps/s, floor
1,678); it was not re-run because the phase changed no game behavior.

What turned out differently from the card: the fix was already present since
M15, but no capability test guarded the walk-before-transfer behavior.

What is left open: nothing for A5. The baseline `perf-budget` remains open.

Screenshots: none; no game UI change.
## M16 2.11 — Nobody starts a chat they will abandon for thirst (2026-10-20, `35a4cafd`)

Goal: verify that a character already past the thirst work limit does not start
a conversation.

What was done: `m16-talk-under-thirst` checks both sides of the behavior: a
comfortable character has a conversation option, and a thirsty character does
not. The test passed before any game code changed; M12 phase 2c already removes
`talk` from the score when `pressedByNeed` is true. A11 is therefore verified
already fixed, with no game code or version change.

Before and after: the `band` report records `talked_thirsty=12` and
`talked_hungry=13` both times. Those counters include conversations stopped
after a need rises during the action; the capability test confirms that a new
conversation is filtered when the need is already past its line. The known
`moods-move-choices` and `perf-budget` checks remain red.

What turned out differently from the card: it expected a missing per-action
gate, but the shared M12 phase 2c filter already covers `talk`.

What is left open: nothing for A11; interruptions after a need crosses its
limit during an active conversation remain expected.

Verification: typecheck passes; full suite: 346 files, 2,435 passed and 1
skipped. `sim:check:all` has 48 scenarios and the same 152 failing checks as
2.10; no failure sets changed.

Screenshots: none; no UI change.

## M16 1.7 — Verification cost (2026-10-20)
Goal: shorten the edit loop while retaining the full regression coverage.
What was done: added explicit fast, area and full commands under the owner's new instruction. Shared repeated geographic fixture setup and combined the two ArtAtlas page boots into named steps with independent atlases.
Before and after: fast Vitest 9 files/46 tests in 18.47s versus the historical full run near fifteen minutes; these are different, explicitly named levels. Start-place retains all 17 tests and independent seed repeatability, but its measured wall time did not improve (37.77s to 39.78s). Browser budgets retain all assertions with one fewer page navigation.
What turned out differently from the card: the owner authorized a small fast subset, resolving R0. Complete unit coverage remains in npm test and check:full.
What is left open: full phase verification and measured five-minute area budgets; no claim that the complete suite meets the fast budget.
Screenshots: none; tooling only.

## M16 2.14 — Animal assailant mismatch (2026-10-20)
Goal: make bandmates answer a predator bite using the common defence rules.
What was found: the shared defence helper and action targets accept people only; bites record no typed animal assailant. This exceeds the card's file-name mismatch.
Resolution: R0 recorded in doubts.md; no game code changed. Continue to independent 2.16. A14 remains open.

## M16 2.12 — Labels follow their subject (2026-10-20)
Goal: keep action labels over moving people and animals.
What was done: optional typed entity references resolve the drawn, interpolated position each frame. Unseen/missing subjects retain their last visible anchor, and explicit site notices remain at their site.
Before and after: the original capability test drew at x=10 rather than x=60 and failed; the corrected test passes and also checks colliding person/animal IDs. Browser coverage checks visibility and interpolation in the same journey.
What turned out differently from the card: numeric IDs need a kind because each entity type allocates independently; this is part of resolving the intended subject.
What is left open: full verification closure recorded with this batch.
Screenshots: artifacts/screenshots/m16-2026-10-20-2.12/.

## M16 1.8 — Serial performance medians (2026-10-20)
Goal: make the 30/300-person simulation budget measurable with one command.
What was done: npm run perf repeats the existing browser profiler three times serially, validates its state equivalence evidence, and reports median overall and inclusive method cost per simulation step. A pure report helper tests the divisor and rejects missing/equivalence-invalid runs. A discovered initial-frame clock race is fixed in the profiler only.
Before and after: median unprofiled mean 1.4781 ms/step at 30 people and 16.1854 at 300. The default five ticks/second allows a 200 ms simulation tick interval; this is not an FPS claim.
What turned out differently from the card: profile:systems already runs both populations, so the new runner composes it instead of adding a redundant population flag.
What is left open: long-run and full frame budgets; no game coefficients changed.
Screenshots: none; measurement tooling only.

## M16 2.16 — Equip and remove all slots (2026-10-20)
Goal: let the owner remove tools and fitted containers through the inventory.
What was done: shared preflight and timed orders for five non-garment slots, with localized feedback. Menus use a projected equipment view and do not mutate saved state. Linked two-handed slots clear together; independent one-handed tools stay independent, and lit-torch removal refuses without losing fuel.
Before and after: pre-change capability 2/2 failed because removal actions were absent; final focused tests 4/4 pass. Existing equipment browser flow now also removes a hide pouch and hide armour.
What turned out differently from the card: garments and armour already had removal; only other slots needed implementation. Over-capacity removal refuses with a reason rather than discarding owned goods.
What is left open: full batch verification closes this phase below.
Screenshots: artifacts/screenshots/m16-2026-10-20-2.16/.

## M16 2.18 — Marcar orillas donde se extrae barro (2026-10-21, `e9bb7f36`)
Goal: señalar en el mapa las casillas transitables junto al agua dulce donde cavar produce barro.
What was done: se añadió un borde terroso en esas casillas y la opción de cavar barro queda visible y desactivada en otras, con su motivo traducido. El indicador no depende de explorar previamente.
Before and after: antes no había marcador y la acción desaparecía de casillas secas; ahora el test compara exactamente los marcadores con `canDigBankMud` y la opción presenta el motivo en inglés/español. N32 queda cerrado.
What turned out differently from the card: elegí mostrar el indicador siempre, incluso sin conocer barro, para que la orilla enseñe dónde se encuentra el recurso.
What is left open: nada de 2.18.
Screenshots: `artifacts/screenshots/m16-2026-10-21-2.18/01-mud-bank-action-es.png`.

## M16 2.17 — Búsqueda urgente de comida y agua (2026-10-21; R0)
Goal: verificar que el hambre y la sed graves desencadenan búsqueda y que una ruta no se aleja del agua conocida.
What was done: las pruebas focales con nombre confirman exploración con hambre sin fuente, aviso al personaje dirigido sin agua conocida, comida antes de volver a casa y prioridad del agua durante una ruta. No se cambió código del juego.
Before and after: `check:fast` pasó (46 pruebas); las cuatro capacidades focales pasaron. El cierre completo anterior tuvo 2.444 pruebas aprobadas y una omitida; la matriz conservó rojos heredados.
What turned out differently from the card: N44 exige un aviso diario para miembros NPC; el código solo registra telemetría al agotarse la frontera y el aviso actual solo cubre al personaje dirigido. El contrato de presentación/persistencia no está definido; R0 deja N44 abierto.
What is left open: aviso N44 para NPC y medición de la banda entre aguas. N21 se verifica como ya corregido; E2/E3 quedan cubiertos por pruebas de regresión.
Screenshots: ninguna; no cambió la UI.

## M16 2.20 — Usar y retirar el lecho (2026-10-21; `76ce70d6`)

El menú del lecho y la cama de la vivienda permite dormir allí y
recuperar el mueble. La retirada da el motivo si pertenece a otra casa, alguien
lo ocupa o el personaje no puede cargarlo. N38 queda cerrado. No se cambió el
mundo ni se añadió estado persistente o RNG.

La primera suite completa encontró la clave española de capacidad de carga que
faltaba. Se tradujo y pasó i18n 6/6; `check:fast` terminó 46/46. En la matriz
`objects`, el escenario `homes` quedó 7/7; los fallos restantes corresponden a
checks heredados documentados.

Capturas: `artifacts/screenshots/m16-2026-10-21-2.20/`.

## M16 2.21 — Estabilizar el tinte nocturno; inundación sin reproducir (2026-10-21; `ab6a9308`)

Goal: mantener el color del suelo estable entre noches equivalentes y
encontrar una causa para la inundación repentina reportada.
What was done: el oscurecimiento nocturno se calcula solo con la hora del día.
La prueba de capacidad comparaba el color de la capa a la misma hora en días
consecutivos y fallaba antes del arreglo. El monitor observó cinco días en
tres mundos clásicos y dos mapas, anotando el origen de los cambios de terreno.
Before and after: la prueba nocturna y la E2E pasan; el monitor no encontró
transiciones sin causa. El informe de inundación no se reprodujo sin la semilla
ni saber si hubo excavación o viaje. La matriz `world` no añadió fallos frente
al baseline. `check:fast`: 46/46; suite unitaria: 355 archivos, 2.454
aprobadas y una omitida.
What turned out differently from the card: no se encontró una conversión de
terreno que justifique cambiar la hidrología; queda pendiente el dato del
propietario.
What is left open: N39, inundación repentina, pendiente de semilla y actividad
previa. El tinte nocturno queda cerrado.
Screenshots: `artifacts/screenshots/m16-2026-10-21-2.21/`.

## M16 2.25 — Parked rations and batch arrival (2026-10-22, 269222fe)
Goal: verify that off-map rationing stays within the requested relief and that a host batch crossing the journey arrival tick produces a valid destination save.
What was done: named R22 capability tests cover the six-person `repro-scout-cross` crossing and a batch that advances past journey arrival. Both behaviours were already present in the M15 implementation; no game code changed.
Before and after: focused checks pass 9/9, `frontier` passes 2/2, and `check:fast` passes 9 files / 46 tests. The complete unit suite reported 349 files passed, one failed (known E5), 2,444 passed, and one skipped.
What turned out differently from the card: the E6 `RangeError` does not reproduce in the documented case. The fractional credit guard is already present from M15 commit `9fe57c9d`; no speculative clamp or counter was added. E7 is covered by the M15 phase-35 catch-up implementation.
What is left open: E5 remains an independent R0 finding; the historical 400-tick notice limit is still unattributed.
Screenshots: none; UI did not change.

## M16 2.21 — seguimiento: nieve fugaz de primavera (2026-10-22)

Goal: comprobar y corregir el cambio de suelo entre d5, d6 y d7.
What was done: la nieve diaria usa la base estacional del crecimiento diario;
la temperatura instantánea sigue atendiendo las necesidades. Se añadieron
pruebas de nieve de invierno y continuidad al guardar antes de medianoche.
Before and after: profundidad 0→1→0 antes, 0→0→0 después. La comparación de
píxeles en navegador avanza la simulación real. `check:fast` pasa 46/46.
What turned out differently from the card: había otra causa además del tinte
nocturno. La prueba anterior no avanzaba los sistemas diarios.
What is left open: la inundación se investiga con las semillas nuevas del autor.
Screenshots: `artifacts/screenshots/m16-2026-10-22-2.21/`.

## M16 2.21 — el relleno respeta las riberas naturales (2026-10-22)

Goal: impedir que una excavación convierta terreno natural en agua.
What was done: `floodFrom` exige desplazamiento negativo en cada casilla;
el monitor comprueba esa condición antes de justificar una conversión como
zanja. Se conserva la propagación por canales excavados y la persistencia.
Before and after: una prueba de río elevado falló al inundar vecinos intactos;
ahora pasa junto a las pruebas existentes de inundación y agua continental.
What turned out differently from the card: el monitor anterior habría aceptado
esta invasión como causada por una zanja; registrar el método no bastaba.
What is left open: cotejar la comarca exacta de la captura francesa del autor.
Screenshots: las capturas del autor se describen en bugs.md; sin cambio de UI.

## M16 — fuentes locales en bosques húmedos, petición del autor (2026-10-22)

Goal: poder comenzar exactamente en una comarca húmeda con una pequeña fuente.
What was done: el inicio acepta una fuente física; las surgencias pequeñas se
anclan en coordenadas mundiales y usan las capas normales del terreno.
La búsqueda admite regiones húmedas sin río cartografiado.
Before and after: tres comarcas francesas pasan de cero agua a una fuente;
la selección de navegador ya no muestra el aviso ni desplaza el inicio.
What turned out differently from the card: alcance ampliado explícitamente por
el autor. La comparación del grafo completo reencontró E5, aún independiente;
el terreno y el resultado de beber coinciden al guardar, cargar y avanzar.
La primera implementación rompía un recorte sin río de la prueba de continuidad;
se sustituyó la selección por ventana por puntos mundiales estables.
What is left open: E5 y la comarca exacta de la mancha N39.
Screenshots: `artifacts/screenshots/m16-2026-10-22-local-water/`.

## M16 2.21 — reproducción concreta y cierre N39 (2026-10-22)

Goal: identificar y comprobar la mancha de la captura, además del mecanismo aislado.
What was done: se cotejó la silueta del río y el tamaño de sus escalones. La
comarca es 470,125; el tamaño 160×160; la semilla numérica 728083595; el personaje
Narsh en autonomía `auto`. Se añadió la reproducción concreta a unidad y navegador.
Before and after: sin el guard, una excavación 37,123 en d7/tick 708 llena 512
casillas, 511 intactas. Con él, llena una; tras ocho días hay cuatro llenados
excavados y cero casillas naturales inundadas. Ambas pruebas fallan antes y
pasan después. La imagen reproduce la misma cuña bajo las obras.
What turned out differently from the card: el tamaño del mapa era esencial;
128×128 no reproducía el caso aunque coincidiesen semilla y comarca.
What is left open: E5 independiente; la matriz `world` mantiene rojos.
Screenshots: `artifacts/screenshots/m16-2026-10-22-exact-france/`.

## M16 2.26 — Antorchas entregadas sin perder la llama (2026-10-24, `90cebb50`)

Goal: conservar el combustible y el propietario de una antorcha al pagar una
compensación o aceptar una exigencia.
What was done: ambas acciones usan el mismo contrato de transferencia que
la entrega manual, con una política explícita para la llama. Las rutas
sociales la trasladan a una mano libre; la entrega manual mantiene su reserva.
Un receptor sin mano o espacio produce un motivo traducido y deja intacta
la oferta; una compensación rechazada conserva la deuda. La amenaza conserva
su propio agravio aunque no pueda recibirse el objeto.
Before and after: antes se movía el inventario sin la llama; después las
pruebas comparan combustible, manos, propiedad, deuda y checkpoint completo
al guardar/cargar/avanzar. 59 pruebas focales, check:fast 46/46 y dos E2E pasan.
Las huellas re-pinned de semillas 1–3 no cambian.
What turned out differently from the card: Amends calcula la oferta y el
movimiento real reside en ActionSystem; el contrato manual existente reservaba
la llama. Se conserva esa regla y se añade la política pedida para las rutas
automáticas. No se añaden RNG, configuración ni otro formato de guardado.
What is left open: la preparación de la hoguera en el E2E original de
antorchas falla también en `efecdaa9`; no es una regresión de esta fase.
El área `bands` conserva 63/751 fallos/aplicables en 13 escenarios sin cambios
de estado. La suite completa se ejecutó una vez: 356/357 archivos aprobados,
2.468 pruebas aprobadas, una fallida, una con fallo esperado y una omitida.
La prueba fallida se añadió durante la ejecución y detectó la capacidad por
objeto del receptor anciano antes del guard final; ahora pasa en las focales.
El guard impide que reconciliar la carga suelte la llama recién recibida.
Tras ese ajuste pasan `conflicts`, el control rápido y las mismas huellas.
No se declara verde la ejecución completa ni se repite por el commit.
Screenshots: `artifacts/screenshots/m16-2026-10-24-2.26/`.

## M16 2.16 — Cierre documental de N18 (2026-10-24, `92fd53ee`)

Goal: resolver el estado pendiente con la evidencia original del equipo.
What was done: la tarjeta enlaza capacidad, navegador, typecheck y suite
del lote del 20 de octubre; se actualizan el plan y N18.
Before and after: cuatro casos de capacidad y E2E 1/1; suite del lote
350 archivos y 2.444 pruebas aprobadas, una omitida.
What turned out differently from the card: el código y las capturas ya estaban;
se completa documentación sin nuevas ejecuciones o cambios de comportamiento.
What is left open: la matriz roja y su comparación en el gate 2.G.
Screenshots: `artifacts/screenshots/m16-2026-10-20-2.16/`, ya existentes.

## M16 2.12 — Cierre documental de A12 (2026-10-24, `2b25754c`)

Goal: cerrar el estado pendiente contrastando las pruebas guardadas.
What was done: se enlazan las focales, E2E y suite completa del lote del
20 de octubre en la tarjeta y se cierra A12 en el triage.
Before and after: 5/5 focales, 1/1 seguimiento, 3/3 navegador conjunto,
46/46 rápidas; suite del lote 350 archivos y 2.444 pruebas, una omitida.
What turned out differently from the card: sólo faltaba documentar el cierre;
no hubo cambios ni nuevas ejecuciones de pruebas.
What is left open: comparación de la matriz roja en 2.G.
Screenshots: `artifacts/screenshots/m16-2026-10-20-2.12/`, ya existentes.

## M16 1.8 — Cierre de verificación del perfilador (2026-10-24, `d58faae9`)

Goal: enlazar la evidencia existente y resolver el estado pendiente de la fase.
What was done: se cotejaron los tres perfiles seriales del 20 de octubre,
las pruebas del informe y la suite completa posterior del mismo lote.
Before and after: sin nuevas mediciones; se conservan 1,4781/16,1854 ms por
paso con 30/300 personas. El lote pasó 350 archivos y 2.444 pruebas, una omitida.
What turned out differently from the card: el trabajo ya estaba implementado;
faltaba asociar explícitamente el cierre conjunto a la tarjeta.
What is left open: el gate de etapa, la matriz roja y los límites de FPS/largo
plazo siguen separados de este contrato de medición.
Screenshots: ninguna; no cambia la UI.

## M16 1.7 — El gate completo conserva todas sus capas (2026-10-24)

Goal: ejecutar E2E incluso cuando la matriz termine con fallos heredados.
What was done: el orquestador sustituye el encadenamiento con `&&`, ejecuta
las cuatro capas serialmente y conserva sus códigos de fallo. La prueba del
CLI usa un npm simulado explícito para no arrancar otra suite desde Vitest.
Before and after: el comando anterior invoca tres capas con la matriz roja;
el nuevo invoca cuatro y devuelve 1. Focales 5/5; rápido 46/46. La suite
completa del lote final pasa 358 archivos y 2.474 pruebas, con un fallo esperado
E5 y una omitida; una sola ejecución completa, 987,27 s.
What turned out differently from the card: el área objects tarda 506,31 s en
una ejecución con solapamiento; no demuestra el presupuesto aislado de cinco
minutos. El primer intento del test CLI arrancó procesos reales y se detuvo;
no cuenta como suite completa ni como medición válida.
What is left open: tiempos aislados de todas las áreas, gate de etapa y 2.G.
Los 61 fallos de 985 checks aplicables en objects no se presentan como verde.
Screenshots: ninguna; este cambio de orquestación no modifica la UI.

## M16 1.7 — Montaje territorial compartido para las hogueras E2E (2026-10-24)

Goal: recuperar el caso heredado de antorchas antes del gate completo.
What was done: ambos tests de luz usan una preparación compartida con sim.place;
sólo reclama temporalmente suelo sin dueño y restaura exactamente los claims.
Se conservan las semillas, la búsqueda y las aserciones de cada caso.
Before and after: el caso de antorchas fallaba al colocar la hoguera en 2.26;
ahora los dos E2E pasan 2/2 en 35 s. El rápido final pasa typecheck y 46/46.
La suite completa de la fase ya pasó una vez; no se repite por este commit.
What turned out differently from the card: la premisa territorial del fixture
quedó desfasada al implementar estaciones en 2.22; no había un fallo de luz.
El typecheck intermedio encontró literales ensanchados y una variable sin uso,
corregidos antes de la validación final.
What is left open: los tiempos aislados de 1.7 y el gate 2.G con matriz,
cohortes seriales y capturas de etapa.
Screenshots: artifacts/screenshots/m16-2026-10-24-1.7-fixtures/.
