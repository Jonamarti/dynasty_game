## 2026-11-04 — M16 CI: re-fijar la matriz solo desde artefactos completos

- **Problema:** `fixtures/matrix-baseline.json` se actualizó a mano y no había ninguna herramienta que impidiera repetir un re-pin incompleto.
- **Cambio:** `npm run baseline:matrix-pin` recibe los cuatro `matrix-shard.json` de una ejecución, reconstruye el catálogo con el mismo reparto de shards y se niega a escribir si falta un shard, falta un escenario, el orden no coincide o sobra algo. Sigue exigiendo el Node fijado.
- **Verificación:** `m16-matrix-baseline-pin.test.ts` en `check:fast`. Con los JSON de `ba7cb0d8`, tres shards y dos shards intercambiados se rechazan, y cuatro generan los 49 escenarios. No cambia la simulación.

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

