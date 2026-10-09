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

## Puentes entregados junto al libro — 2026-10-09

- [Primera jornada parcial](m15_phase34_partial_day.md): límites de duración,
  calendario v2 y guardado de cuotas sin renovación.
- [Inventarios físicos](m15_phase34_inventory.md): escrow tipado, carry y
  retorno prevalidado; JSON es dato independiente, no un lease de autoridad.

Estas tres funcionalidades preparan la frontera. Para habilitar `leave_comarca`
quedan coordinación de autoridad, stock consumido tipado, perfil corregido,
archivo canónico global e IDs reservados, población del destino/materialización,
y deterioro de lo que quedó. Follow_me, scout y decisiones propuestas de banda
siguen pendientes; `drought`/fisión no se declaran aprobados ni n/a como pase.

## Verificación conjunta final de los puentes de fase 34 — 2026-10-09

TypeScript limpio. Focales: libro/raíz 20/20, jornada parcial 42/42 e
inventarios 11/11 (73 en total). Suite completa estable: 233 archivos,
1.765 pruebas pasan, una omitida y dos fallos heredados intactos:
`compact-correspondence` craft/delta (hambre 23,401 frente a <=15) y
`people-knowledge` difusión (0,81 frente a <0,6). Ningún fallo nuevo.
La suite no está verde; no se cambian umbrales. La primera pasada arrancó
antes de integrar la raíz y cargó dos pruebas nuevas contra módulos viejos
cacheados; esas dos fallas de integración desaparecen en focales y en la
suite final sobre código estable.

La semilla única mantiene dieta y rendimiento, 2/147. Tres giras de hito
pasan 1/1 cada una y dejan 39 capturas nuevas; imágenes de arranque revisadas.
No hay cambio de UI ni se declara cruce jugable o mejora económica. No se
lanzaron cohortes, century/generations ni sim:check:all. Logs locales:
`artifacts/m15-frontier-final-tests-20261009.log`,
`artifacts/m15-frontier-final-typecheck-20261009.log` y
`artifacts/m15-frontier-final-simcheck-20261009.log`.
Cambios previos del usuario en notes_for_m15.txt y debug.log quedan fuera.

**Avance 2026-10-09 (retirada física de raciones).** El escrow ahora convierte
una demanda en cantidades de alimentos ya existentes por prioridad explícita,
sin alterar materiales/carry. La retirada de reservas corresponde a `withdrawn`
del reporte compacto; la producción consumida no se vuelve a cobrar. Contrato
en [m15_phase34_rations.md](m15_phase34_rations.md). Sigue el coordinador de
stock producido, consumo parcial y autoridad/materialización; fase 34 abierta.

**Avance 2026-10-09 (deterioro de inventario).** El escrow ahora dispone de un
reductor detached con reloj diario, carry y conservación explícita por fuente.
[Contrato](m15_phase34_decay.md). No avanza fauna, bosques, nodos, edificios o
terreno de TileLedger. La secuencia real de retiradas y producción deberá
intercalarse con cada barrida bajo una sola autoridad; frontera aún abierta.
