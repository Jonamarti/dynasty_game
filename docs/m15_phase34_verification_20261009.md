# Fase 34 — cierre funcional y verificación (2026-10-09)

La implementación de salir de la comarca está cerrada: órdenes físicas de salida y seguimiento, propuesta/consenso y fisión, exploración de dos días con retorno o muerte, intercambio de propietario y reentrada desde un libro que avanza cuerpos y bienes reales. El destino conserva identidades y la región entrega residentes de sus cohortes sin duplicarlos. La siguiente fase funcional es 35 (transporte). Calibración/LOD posterior permanece separada, con los límites en bugs.md y m16_notes.md.

## Comprobaciones ejecutadas

- Typecheck final: pasa.
- npm.cmd test -- --maxWorkers=1 --testTimeout=15000: **239 ficheros, 1815 pruebas pasan, 3 fallan y 1 omitida**, 471,19 s. Dos fallos son los iniciales, con valores idénticos: craft/delta, diferencia de hambre 23,401217 frente a <=15; people-knowledge, difusión 0,81 frente a <0,6. El tercero era una fixture v1 que había conservado el nuevo campo frontier al simular un archivo anterior: se corrigió quitándolo, sin relajar el parser, y su fichero volvió a ejecutar **10/10**. La suite completa no se describe como verde; la comprobación posterior fue focalizada en esa corrección.
- Controles focalizados de frontera: 13 de viaje, 5 de runtime físico, 10 de migración, 5 de raíz y 4 de ecología pasan en las ejecuciones registradas. Incluyen los negativos de borde/autoridad, agua ausente/presente, población y parentesco conservados, JSON parcial, muerte del explorador y nodo agotado al volver.
- npm.cmd run sim:check, escenario predeterminado y una semilla: **2/147 fallan**, igual que al inicio: cravings-steer-the-diet y perf-budget (806 pasos/s frente a 1724). Las comprobaciones n/a no se cuentan como pases. La medida de rendimiento convivió con E2E y no demuestra mejora ni regresión de velocidad.
- npm.cmd run e2e: **123/124 pasan**. El único fallo fue version.spec: Vite había inyectado a28abb al arrancar, y Git ya estaba en 9e1cde después de los commits del pase. Con un servidor nuevo en el puerto 5409, versión, las tres pruebas de frontera y la gira completa pasan: **22/22**. No se cambió la aserción de versión ni código para esconder la discrepancia de servidor.

## Capturas y registros

Capturas anteriores T-01, T-02 y T-03 preservadas; controles y llegada real en artifacts/screenshots/m15-phase34-travel-2026-10-09T-04/. Gira final en **artifacts/screenshots/m15-phase34-close-2026-10-09T-05/**, con pantallas españolas, controles ingleses, llegada real, estaciones y paneles. Se revisaron visualmente los controles españoles y la llegada. Las tres pantallas de la funcionalidad quedan en Git; la gira completa queda en artifacts. Se restauraron las capturas antiguas que specs heredadas escriben en rutas fijas.

Logs locales: artifacts/m15-phase34-final-unit-20261009.log, artifacts/m15-phase34-final-e2e-20261009.log, artifacts/m15-phase34-final-simcheck-20261009.log y artifacts/m15-phase34-final-captures-20261009.log. Sin sim:check:all, sim:seeds ni cohortes century/generations. La puerta empírica anual y fission-happens de cohorte se difieren por AGENTS.md; el control corto de mecanismo no se presenta como esa medición. notes_for_m15.txt y debug.log del usuario permanecen fuera de los commits.
