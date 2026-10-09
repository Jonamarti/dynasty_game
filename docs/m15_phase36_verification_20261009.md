# M15 fase 36 — verificación del 2026-10-09

Versión funcional: 0.15.7-alpha. Cuatro commits separados entregan noticias (c7fab4d), casas rivales (1018c82), caravanas (ecb1dc6) e incursiones (6736467). El arreglo medido de memoria llena (3e4ab90) añade una quinta entrega funcional; a64abff estabiliza la captura del fixture acelerado. Cada entrega incluye contrato, plan y changelog; las dos pantallas cambiadas tienen capturas fechadas. Se usaron tres subagentes GPT-6 Luna con razonamiento high.

| Capa | Resultado |
|---|---|
| npm.cmd run typecheck | Pasa; también pasa la versión aislada del índice de caravanas. |
| npm.cmd test -- --maxWorkers=2 --testTimeout=15000 | 251 ficheros; 1.885 pruebas pasan, una omitida y un fallo heredado. Exit 1. |
| npm.cmd run sim:check | Exit 1: los mismos dos fallos de 147 del punto de partida. |
| npm.cmd run e2e -- --workers=1 | 132/132 pasan antes del arreglo de memoria llena, con servidor nuevo en 5443. Exit 0; 11,7 minutos. |
| E2E focal final, CLI de Playwright | 5/5 pasan (rivales, caravanas y versión 0.15.7-alpha), 56,4 segundos. |

La suite completa del índice exportado, con el arreglo de memoria llena, falla únicamente en people-knowledge.test.ts: dispersión 0,68 frente a <0,6. Era el fallo estable de fase 35 y no se cambiaron tasas ni umbrales. La primera pasada de fase 36 también encontró dos errores de fixture: el test de un portador NPC no cambiaba al propietario activo y conservaba un objeto PeopleWorld anterior a la sustitución; el fixture de guardado v1 mantenía el nuevo campo traffic. Se corrigieron los fixtures y la pasada completa final ya no los reproduce. Un rechazo de propietario duplicado puede producirse en el lector del checkpoint antes de llegar al validador raíz; la aserción conserva ese rechazo, admitiendo la causa equivalente.

El sim:check inicial y final fallan en cravings-steer-the-diet y perf-budget. El primer final mide 0,8% de comidas ricas en proteína durante el antojo frente a 8,1% en calma, y 729 pasos/s frente al límite de 1.724; la línea base ya fallaba y medía 739 pasos/s. El índice final vuelve a fallar solo en esos dos checks y mide 755 pasos/s; no es una mejora de rendimiento demostrada. Un n/a no se cuenta como éxito. No se atribuye una mejora económica a una sola semilla.

Las pruebas focales de noticias pasan 20/20; las de incursiones pasan 35/35, incluida una partida desde una comarca aparcada, guardado a mitad de ruta y llegada con identidades únicas y orden local de saqueo. Caravanas prueban trueque físico de tin_ore, ida/campamento/regreso, muertos junto a escoltas vivas, contactos reales de mercader y corrupción de propietarios/calendarios. Los lectores v1-v4 y el guardado v5 están ejercitados. El E2E focal del control y del mercader real pasa 2/2. Detectó y corrigió el cierre del mapa antes de enseñar la confirmación del encargo.

Capturas revisadas y conservadas:

- artifacts/screenshots/m15-phase36-rival-integrated-2026-10-09/01-rival-from-origin-archive.png
- artifacts/screenshots/m15-phase36-caravans-2026-10-09/01-known-comarca-caravan-control.png
- artifacts/screenshots/m15-phase36-caravan-real-2026-10-09T-02/02-named-merchant-departure.png
- artifacts/screenshots/m15-phase36-final-2026-10-09/ (pasada general; las capturas de hitos antiguos que sus specs vuelven a producir se copian aquí y se restaura su original histórico).

Los logs quedan en artifacts/m15-phase36-baseline.log, artifacts/m15-phase36-unit.log, artifacts/m15-phase36-unit-final.log, artifacts/m15-phase36-sim.log y artifacts/m15-phase36-e2e-final.log. La pasada aislada de caravanas validó cuatro ficheros 38/38 y el lector actualizado 7/7; el primer rechazo fue una aserción de mensaje, no una aceptación de un guardado corrupto.

La regresión de memoria llena fue comprobada contra el código roto y pasó 7/7 tras corregirlo; el último typecheck también pasa. Dos pasadas focales posteriores agotaron 60 segundos en screenshot de casas rivales, después de pasar sus aserciones. Se pausó el fixture de días de cuatro ticks tras sincronizar el propietario; la siguiente pasada pasó 5/5. La captura final revisada usa artifacts/screenshots/m15-phase36-final-2026-10-09T-05/. Los timeouts permanecen en m15-phase36-e2e-focused-final.log y m15-phase36-rival-final-retry.log.

Los resultados del índice final están en artifacts/m15-phase36-unit-committed.log (251 ficheros, 1.885 pasan, un fallo heredado, una omitida; 277,29 segundos, exit 1) y artifacts/m15-phase36-sim-committed.log (2/147, exit 1). El E2E final está en artifacts/m15-phase36-e2e-paused-final.log. El índice exportado excluyó los cambios locales ajenos de WorldTerrain; el último commit solo cambia el fixture de captura, versión y documentación.

Las cohortes, sim:check:all y escenarios largos no se ejecutaron, según AGENTS.md. No se inventa stock por objeto desde el excedente abstracto de PeopleSim; las rutas actuales llevan existencias poseídas por mercaderes nombrados. Producción macro por objeto y los límites demográficos/ecológicos del adaptador de fase 35 permanecen en bugs/M16. Las notas personales pendientes no se procesaron.
