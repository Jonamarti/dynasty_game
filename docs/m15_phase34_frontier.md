# M15 fase 34 — libro detached de comarcas

2026-10-09. Primera pieza de persistencia para el paso 2 de LOD y la fase 34:
`src/sim/persistence/TileLedger.ts` guarda revisiones de comarcas geográficas
identificadas por mapa y coordenadas globales (`cx`, `cy`). Una captura exige
que el `WorldState` represente exactamente una comarca y que el `worldFrame`
de la simulación coincida con su colocación; así el libro no puede etiquetar
terreno local con una coordenada distinta.

Cada entrada JSON v1 conserva el tick y día, la revisión monotónica,
`WorldTerrainRecord` y `WorldObjectRecord`. Reutilizar esos codecs guarda suelo,
terreno modificado y cachés; también los objetos ordenados, índices,
contenedores, progreso de edificios, campos y cadáveres. `hydrate` verifica la
identidad y la fecha pedidas, crea un `World` y un grafo de objetos nuevos, y
vuelve a enlazar los cadáveres con el mapa canónico de personas que aporta el
coordinador. El ledger almacena copias serializables; lecturas y restauraciones
no comparten referencias mutables con la captura.

La actualización permite revisiones al mismo tick (por cambios entre pasos),
pero rechaza ticks o días anteriores y revisiones repetidas. El cargador
rechaza identidades duplicadas, referencias/índices inválidos, entidades fuera
del terreno y progreso de edificio no representable. Las entradas se emiten en
orden ordinal estable para que el JSON no dependa del locale del host.

Esto solo conserva estado detallado. No ejecuta una comarca abandonada ni
calcula su deterioro, regeneración ecológica o perfil de recursos corregido;
tampoco mueve personas, transfiere autoridad, crea una comarca o habilita una
orden de migración. El puente de fase 34 queda pendiente de integración y de un
modelo que avance esa comarca. No hay cambio de interfaz. Gira de hito 1/1, trece capturas en
`artifacts/screenshots/m15-frontier-ledger-2026-10-09T-01/`.

Prueba focal: `npm.cmd test -- --run src/sim/__tests__/tile-ledger.test.ts --maxWorkers=1 --testTimeout=15000` (5/5).
Typecheck integrado limpio. Libro, raíz y guardados: 20/20 focales.
`WorldStateRecord` v3 persiste el libro; v1/v2 migran con libro vacío.
La raíz rechaza identidad ajena y fecha futura o discordante con el calendario.
