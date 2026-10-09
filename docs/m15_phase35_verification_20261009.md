# M15 fase 35 — verificación y cierre (2026-10-09)

## Entregas

| Commit | Funcionalidad |
|---|---|
| 0962769 | Canoa física y navegación local resguardada |
| 99a942d | Viajes fechados, provisiones, guardado parcial, rastra y carro |
| 9d15911 | Asnos de carga y caballos de monta vivos; asignación/liberación persistentes |
| aae03ca | Vela física y rutas marítimas no contiguas |

Cada entrega incorpora documentación, pruebas de mecanismo y capturas nuevas. Participaron tres subagentes gpt-6-luna en high, como pidió el propietario. El cierre añade controles de encuentros y de fechas persistidas; no cambia producción después de la suite completa estable.

## Resultados reales

| Verificación | Resultado |
|---|---|
| typecheck final | Pasa, también después de las pruebas adicionales |
| Suite completa estable | 243 ficheros; 1.848 pasan, 1 falla, 1 omitida (1.850) |
| Entrega terrestre aislada | typecheck y 81/81 controles focales en seis ficheros |
| Entrega animal aislada | typecheck y 101/101 en ocho ficheros |
| Entrega vela aislada | typecheck y 76/76 en cuatro ficheros |
| Viajes finales, incluidos encuentros añadidos después | 16/16 en cuatro ficheros |
| sim:check final, sin otras pruebas concurrentes | Fallan 2 de 147: cravings-steer-the-diet y perf-budget; n/a conserva su significado |
| E2E general | 126 pasan y 2 fallan, sobre 128 ejecutadas |
| E2E focal con servidor nuevo tras los commits | 8/8: las cuatro nuevas, forja de acero y las dos de versión |

La suite completa se ejecutó con npm.cmd test -- --maxWorkers=1 --testTimeout=15000; la orden y recuento están en artifacts/m15-phase35-unit-stable.log. El único fallo es people-knowledge.test.ts: contacto sostenido mide 0,68 frente a <0,6; ya fallaba al inicio con 0,81. No se cambia la aserción. El fallo inicial craft/delta pasa en este build, pero no se presenta como reparación de la correspondencia económica. Una ejecución anterior durante la integración tuvo fallos transitorios de traducción/comida; la ejecución estable posterior y los focales prueban sus correcciones.

sim:check conserva los fallos iniciales de dieta y rendimiento. La última lectura de rendimiento fue 763 pasos/s frente al suelo 1.724; la referencia inicial fue 868. Una lectura previa de 375 se hizo con otros verificadores ejecutándose y no sirve para comparar velocidad. No se atribuye causalidad ni mejora económica a una semilla. Informe: artifacts/m15-phase35-simcheck-isolated.log.

En E2E general falló el elemento UI de espada de acero y la identidad de versión. El servidor arrancó con 096276 y 0.15.0-alpha mientras los commits y cambios paralelos de versión avanzaron: se observó 096276 frente a 99a942. La repetición completa de esos dos specs más las cuatro nuevas usa puerto 5427 y servidor nuevo, y pasa 8/8; el fallo UI de acero no se reprodujo. La ejecución general fallida no se describe como pase. Logs: artifacts/m15-phase35-e2e-final.log y artifacts/m15-phase35-e2e-recheck.log. Las salidas Playwright focales usan carpetas propias.

## Cobertura de mecanismos

Los controles negativos separan técnica de objeto físico, y conocimiento de animal vivo asignado. Cubren alcance, nieve, velocidad, cargo, pérdida/muerte/distancia, liberación manual, colisiones de identidad, migración de registros, comida/hidratación, deterioro y carry tras guardar, partida/llegada real y corrupción de fecha/transporte. Las nuevas pruebas recorren WorldState por tick para comprobar retraso de tormenta, daño de fauna y encuentro de pueblo, con continuidad del stream tras guardar/cargar.

## Capturas revisadas

- artifacts/screenshots/m15-phase35-logboat-2026-10-09/: bloqueo, receta disponible y canoa en navegación.
- artifacts/screenshots/m15-phase35-journeys-2026-10-09/: propuesta, estado del viaje y llegada.
- artifacts/screenshots/m15-phase35-animals-clear-2026-10-09/: menú real, asno visible al lado y liberación.
- artifacts/screenshots/m15-phase35-sail-2026-10-09/: ruta larga con vela.
- artifacts/screenshots/m15-phase35-final-2026-10-09T-02/: cuatro capturas finales de viaje, canoa, asno y vela, revisadas visualmente.

Las capturas históricas modificadas por specs antiguos se restauraron. Las finales también muestran la etiqueta global de versión del trabajo paralelo del propietario; ese cambio, package.version, AGENTS.md, e2e/version.spec.ts, WorldPicker/style y notes_for_m15.txt permanecen fuera de los commits de transporte.

## Límites y mediciones diferidas

El tránsito es abstracto: avanza cuerpos/consumo/deterioro/encuentros de la partida, no los pases locales de residentes/ecología del destino ni LifeSystem.daily/nacimientos/lactancia completa. Llamar advancePeoples después de cada step es el contrato usado por main; el salto de nueve ticks sobre una llegada de ocho aún produce una incoherencia de reloj de ledger, reproducida y registrada en bugs/M16. Conservación manufacturada/pemmican/secadero faltan en la tabla pese a afirmaciones antiguas de fase 15; se conserva la política de retención y no se calibra un peso del consenso sin medir suministro/costes.

No se ejecutaron migrants de veinte semillas, sim:check:all, cohorts century/generations ni la puerta anual lod-matches-detail, por la instrucción expresa de AGENTS.md. El cierre es funcional y no declara completas esas mediciones ni resueltos los fallos de base. Siguiente fase funcional: 36, noticias, caravanas, incursiones y casa rival; trade ya existe.
