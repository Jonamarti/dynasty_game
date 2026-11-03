## 2026-11-03 — E2E: esperar la navegación al cargar e importar partidas

**Problema:** `save-load.spec.ts` podía ejecutar `page.evaluate()` durante la recarga completa al importar un archivo válido; la CI de PR #60 ([run 41723472828](https://github.com/Jonamarti/dynasty_game/actions/runs/41723472828), E2E 3/4) registró `Execution context was destroyed, most likely because of a navigation`.

**Causa:** `importGame()` persiste la partida y después ejecuta `location.search` en `reloadInto()`; las pruebas sólo esperaban un HUD no vacío, que también podía corresponder al documento anterior.

**Cambio:** esperar explícitamente `page.waitForNavigation({ waitUntil: 'domcontentloaded' })` en paralelo con los comandos Load e Import, antes de inspeccionar el estado. Se mantienen las aserciones de persistencia, errores de entrada, tick y pausa. No cambia la lógica de guardado, juego, baseline ni versiones.

**Verificación:** pendiente CI y ejecución de `e2e/save-load.spec.ts` en el HEAD de esta PR. Se deja en borrador hasta observar la prueba.

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

