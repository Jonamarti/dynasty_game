# M15 fase 29 — verificación de la pasada del 2026-10-05

La pasada entrega registros de raíz geográfica, procedencia por semilla,
un banco de carga global provisional y la protección del ensamblado directo.
No cierra la fase: agua dulce/inicio poblado, selección jugable, fuentes
históricas y paleoclima, y la puerta del modelo global real siguen pendientes.

## Verificación ejecutada

- Typecheck completo limpio, también después de la revisión.
- Suite completa: 1.075 tests, 153 archivos, todos pasan. Repetida tras el
  arreglo de la fábrica pública: de nuevo 1.075/1.075.
- E2e completo: 80/80. Las capturas geográficas adicionales y la gira clásica
  pasan cada una 1/1; hay dieciséis capturas repartidas en cuatro hitos nuevos.
- Nueve SHA-256 de checkpoints clásicos completos coinciden: tres semillas
  (`band`, `century`, `phase29-continuity`) a ticks 0, 180 y 500. Esto incluye
  estado, IDs y RNG, pero no prueba igualdad de todos los mundos a largo plazo.
- Banco Earth: 200 años, 2.440 registros sintéticos y 800 pasadas estacionales.
  El coste amortizado es provisional; no mide un scheduler ni picos de frame,
  y los bytes JSON no son un guardado completo. [Informe](m15_phase29_bench.md).

La primera suite se inició mientras los agentes editaban los módulos y terminó
con una referencia a `WORLD_FEATURE_SOURCE_IDS` indefinida: 1 fallo y 1.066
pases. No se presenta como baseline ni como pase; se conserva en
`tests-during-edits.log`. Las dos suites posteriores sobre módulos completos
pasan. La comprobación inicial aislada `sim:check` ya fallaba en
`cravings-steer-the-diet` y `perf-budget`.

## Matriz clásica

Referencia del checkout `df88cca`: 30 escenarios, 1.695 checks aprobados de
1.811 aplicables; 116 fallos. Incluye `orchard`, incorporado antes de esta
pasada. No se sustituyen las cifras históricas de la fase 27, que corresponden
a otra revisión y conjunto de escenarios. El rendimiento se informa como
`n/a` en la matriz por el contrato existente del harness.

La matriz posterior también termina con código 1: 116 fallos, 1.695 pases
y 1.811 aplicables en los mismos 30 escenarios. La comparación automatizada
no encuentra diferencias de recuentos ni IDs de fallos. La referencia y la
matriz final siguen rojas; esto no convierte sus fallos en pases.
`compare-matrices.mjs` compara recuentos PASS/aplicables y IDs de fallos por
escenario; excluye los tiempos y las métricas individuales de cada check.
Por ello este resultado igual no demuestra igualdad de todas esas métricas
ni de los IDs individuales de checks omitidos/aprobados: compara sus recuentos.

## Evidencia y capturas

Scripts, hashes, logs completos y comparación en
`artifacts/verification/m15-phase29-20261005/`; medición del banco en
`artifacts/verification/m15-world-bench-2026-10-05/earth-200y.json`.

Hitos sin cambio de UI, conservados en orden de entrega:

- `artifacts/screenshots/m15-phase29-root-2026-10-05/`
- `artifacts/screenshots/m15-phase29-sources-2026-10-05/`
- `artifacts/screenshots/m15-phase29-bench-2026-10-05/`
- `artifacts/screenshots/m15-phase29-root-guard-2026-10-05/`

Las vistas de Iberia fueron revisadas; la captura posterior al guard tiene el
mismo SHA-256 que la primera. La gira guarda trece vistas clásicas, incluida la
partida inicial revisada. Los cambios ajenos iniciales en `docs/notes_for_m15.txt`
y `debug.log` se mantienen fuera de los commits.
