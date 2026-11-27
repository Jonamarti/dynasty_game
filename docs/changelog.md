## 2026-11-27 — M16 0.16.31-alpha — validar también el refugio del hogar compacto (#58)

- **Causa estática:** el fallback del hogar de `CompactBody` aceptaba una construcción completa con abrigo, incluso derruida o sin plazas de sueño.
- **Cambio propuesto:** usar `isUsableRoof`, el mismo predicado que el sueño detallado. No añadir una probabilidad de concepción, no otorgar plazas gratis, ni cambiar la lógica del calendario.
- **Verificación pendiente:** prueba de refugio compacto inválido (ruina, obra sin terminar, estructura sin plazas) y controles positivos existentes.
- **Límite:** el modelo compacto por persona conserva su aproximación de hogar; la comarca fuera de pantalla entrega un mapa vacío a `advanceCompactBandLife`. La admisión conjunta de familias y su calibración siguen abiertas; véase `docs/bugs.md`.

## 2026-11-27 — M16 0.16.30-alpha — descanso privado bajo un techo amueblado (#58)

- **Causa estática:** `shareTheHearth` consultaba `buildingAt`, que devuelve primero el mueble situado dentro de la vivienda. El mueble no tiene plazas de refugio; el descanso privado quedaba descartado aunque la persona estuviera dentro de una casa terminada.
- **Cambio propuesto:** consultar el techo real mediante el índice espacial y la misma geometría de cubierta que usa el sueño, con desempate determinista por abrigo e ID. Compartir la validez física del refugio y ampliar la búsqueda de ocupantes a la cobertura completa. La selección de muebles, la privacidad, la admisión por capacidad y la tirada de concepción permanecen intactas.
- **Verificación pendiente:** prueba focal de una pareja descansando sobre mobiliario, intruso despierto, borde de habitación y ruina. Sin re-fijar baseline.

## 2026-11-27 — M16 0.16.29-alpha — capacidad de refugio real frente a proyectada (#58)

- **Causa estática:** la decisión entre refugio rápido y vivienda más costosa consideraba las plazas de obras sin terminar como si ya protegieran del frío; el patrocinio del lean-to tampoco utilizaba las necesidades de refugio.
- **Cambio propuesto:** usar las plazas terminadas para la urgencia y la suma de terminadas y pendientes para limitar nuevas obras; elegir promotor por capacidad de refugio, no por una lista incompleta de IDs. Excluir ruinas de la experiencia previa de construcción.
- **Diagnóstico:** `shelter_completed_places_short` y `shelter_short_sites_full` muestran déficit nominal y bloqueo por obras incluso cuando hay capacidad proyectada suficiente. Conservamos las obras iniciales, el límite de dos, los costes y la política de abandono; no repetir la variante #56 sin validar el hambre.
- **Verificación pendiente:** pruebas focalizadas y cohortes emparejadas, especialmente `herders`, `orchard` y `generations`. Sin cambio de semillas ni baseline; el problema de obras que reciben materiales lentamente sigue abierto.

## 2026-11-27 — M16 0.16.28-alpha — cola de construcción actualizada al abandonar una obra (#58)

- **Causa estática:** `Simulation.removeBuilding` reemplaza el array de edificios, pero el contexto de la pasada diaria de `BandSystem` conservaba el array anterior. Tras `dropStaleSites` podía contar una obra que ya no existía y ordenar trabajos en ella hasta la siguiente revisión.
- **Cambio propuesto:** leer la lista vigente mediante un getter del contexto diario. No se toca la política de abandono, el límite de obras, las devoluciones de materiales, ni la generación inicial.
- **Verificación pendiente:** nueva prueba focal `m16-shelter-planning.test.ts`; falta ejecución local y comparación de cohortes. Baseline intacta.

## 2026-11-27 — M16 0.16.27-alpha — selección coherente con la interrupción del descanso (#58)

- **Causa estática:** `Brain` ofrecía `sleep` y `rest` aun cuando hambre >50 o sed >45 obligaban a `ActionSystem.wakeReason` a cancelar de inmediato; el compromiso podía seleccionar repetidamente la misma acción inviable.
- **Cambio propuesto:** predicado puro compartido para los dos límites, preservando valores, precedencia, sueño circadiano, órdenes e interrupciones por peligro/cuidado. El refugio por frío (`shelter`) queda separado: llegar a un techo puede aliviar exposición y requiere evaluación propia.
- **Verificación pendiente:** pruebas focalizadas en `furniture-sleep.test.ts` y `circadian-sleep.test.ts` (límites exactos, hambre/sed, frío, reanudación, interrupción comprometida). Comparar en local las mismas semillas antes del merge; sin re-fijar baseline ni declarar resuelta #58.

## 2026-11-27 — M16 0.16.26-alpha — llegada real a la superficie de descanso (#58)

- **Causa estática:** dormir exigía distancia ≤0,3 al centro del mueble, pero el movimiento dejaba de avanzar por debajo de 0,6. Además, el centro nominal de un mueble 1×1 está en la frontera de su casilla, mientras la calidad de sueño usa la casilla física.
- **Cambio propuesto:** dirigir el último tramo al centro de la casilla asignada con radio local de 0,3 y recuperar fatiga solo al entrar en la casilla; no cambiar el radio general ni teletransportar al personaje.
- **Verificación pendiente:** prueba focal desde una casilla contigua en el intervalo problemático; comprobar sueño, movimiento y continuación determinista en local antes de integrar. Baseline intacta.

## 2026-11-27 — M16 0.16.25-alpha — escala de la prioridad de dormir (#58)

- **Causa estática:** `Brain.score` ya usa `drive.rest` y `drive.comfort` normalizados a 0–1; multiplicar solo comodidad por 100 descompensa la elección frente a otras necesidades.
- **Cambio propuesto:** comparar ambas presiones directamente; conservar coeficientes, filtros, semillas y RNG.
- **Verificación pendiente:** prueba focal en `furniture-sleep.test.ts`; falta ejecución local y comparación de escenarios. No se altera ni se re-fija la baseline.

## 2026-11-04 — M16: diagnóstico de nacimientos y refugio nocturno, sin arreglo

- **Problema:** en varios mundos no nace casi nadie y casi nadie duerme bajo techo.
- **Resultado:** mecanismos medidos y variantes descartadas; detalle en `docs/bugs.md`. No cambia el juego ni la referencia.

## 2026-11-04 — M16 CI: la referencia de la matriz vuelve a describir ejecuciones reales

- **Problema:** las matrices 1, 2 y 4 de `master` fallaban en cada ejecución comparando con la referencia, en cualquier PR, aunque no tocara la simulación.
- **Causa:** `00d6d395` aplicó 132 de las 167 transiciones del run 40283921764. Los otros 35 checks conservaron el estado de `50b5c90e`, que ninguna compilación posterior producía. Es muy probable que el re-pin partiera de las anotaciones de GitHub, limitadas por nivel y paso, pero esa parte no está probada.
- **Cambio:** referencia regenerada con `baseline:matrix-pin` desde los cuatro JSON de `ba7cb0d8`. 35 estados corregidos, 21 de ellos regresivos. Las 167 transiciones reconstruidas de los logs quedan en `docs/m16/matrix-transitions-40283921764.json`. No cambian el juego, los umbrales ni las semillas.
- **Verificación (Node 22.23.3, 49 escenarios, 4.354 checks):** `ba7cb0d8` frente a `494c5bef`: 0 diferencias. Windows frente a CI en Linux (run 41719047414): 0 diferencias. Comparador de `master` con la nueva referencia: 0 regresiones en los 4 shards.
- **Esto no arregla el juego:** los 21 checks siguen mal y abiertos en #58 y en `docs/bugs.md`. La referencia los acepta como rojos conocidos.

## 2026-11-04 — M16 CI: re-fijar la matriz solo desde artefactos completos

- **Problema:** `fixtures/matrix-baseline.json` se actualizó a mano y no había ninguna herramienta que impidiera repetir un re-pin incompleto.
- **Cambio:** `npm run baseline:matrix-pin` recibe los cuatro `matrix-shard.json` de una ejecución, reconstruye el catálogo con el mismo reparto de shards y se niega a escribir si falta un shard, falta un escenario, el orden no coincide o sobra algo. Sigue exigiendo el Node fijado.
- **Verificación:** `m16-matrix-baseline-pin.test.ts` en `check:fast`. Con los JSON de `ba7cb0d8`, tres shards y dos shards intercambiados se rechazan, y cuatro generan los 49 escenarios. No cambia la simulación.

## 2026-11-03 — E2E: esperar la navegación al cargar e importar partidas

**Problema:** `save-load.spec.ts` podía ejecutar `page.evaluate()` durante la recarga completa al importar un archivo válido; la CI de PR #60 ([run 41723472828](https://github.com/Jonamarti/dynasty_game/actions/runs/41723472828), E2E 3/4) registró `Execution context was destroyed, most likely because of a navigation`.

**Causa:** `importGame()` persiste la partida y después ejecuta `location.search` en `reloadInto()`; las pruebas sólo esperaban un HUD no vacío, que también podía corresponder al documento anterior.

**Cambio:** esperar explícitamente `page.waitForNavigation({ waitUntil: 'domcontentloaded' })` en paralelo con los comandos Load e Import, antes de inspeccionar el estado. Se mantienen las aserciones de persistencia, errores de entrada, tick y pausa. No cambia la lógica de guardado, juego, baseline ni versiones.

**Verificación:** el fallo volvió a aparecer en `master` tras #62 ([run 41797559975](https://github.com/Jonamarti/dynasty_game/actions/runs/41797559975), E2E 3/4). Se comprueba en la CI de esta PR actualizada sobre `master` antes de integrarla. Al ser intermitente, una pasada no demuestra que haya desaparecido.

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

