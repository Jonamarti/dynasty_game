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

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

