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
