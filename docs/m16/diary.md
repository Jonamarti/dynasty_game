# M16 diary

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
