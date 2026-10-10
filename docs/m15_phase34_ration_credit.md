# Fase 34 — límite del crédito de ración

2026-10-10. `consumeComarcaOffmapNutrition` retira cantidades de inventario
físico y limita el alivio informado a la petición original. La operación
`(0.000059 / 14) * 14` produce `0.000059000000000000004`; `CompactBody` compara
el alivio con la petición sin tolerancia, por lo que el exceso de una ULP puede
rechazarse. Si la cantidad pedida es menor que la precisión del stack y restarla
no cambia el inventario, la retirada se omite y no se concede alivio.

El caso de integración documentado con `frontierGeography()`,
`repro-scout-cross`, seis personas y una comarca aparcada no se reprodujo con
cruce directo ni con la orden `leave_comarca` en los intentos de 2026-10-10
(80 ticks tras cruce directo; 240 ticks de viaje más 100 aparcada). La prueba
de integración presente es un control negativo; no demuestra que la
`RangeError` original quede resuelta. La prueba focal sí reproduce y cubre el
exceso numérico y la extracción sub-ULP.

Durante una exploración adicional de 400 ticks apareció también
`TypeError: Invalid ledger record: too many interruption notices`. Es otro
fallo reproducido a esa duración, sin vínculo causal establecido con el error
de raciones; queda pendiente de aislar en el coordinador/codec de frontera.

Pruebas focales: `comarca-offmap-rations-regression.test.ts` y
`comarca-offmap-runtime.test.ts`; 8/8. `npm.cmd run typecheck`: limpio. La
comprobación base previa a estos cambios ya fallaba en `cravings-steer-the-diet`
y `perf-budget` (478 pasos/s frente a 1.724); no se atribuye a este cambio.
