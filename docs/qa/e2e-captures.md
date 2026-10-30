# Capturas E2E seguras — #24

## Problema y regla

`artifacts/screenshots/` es un **archivo histórico versionado**: nunca debe recibir capturas de pruebas rutinarias. La antigua suite E2E escribía ahí y ya produjo pérdidas documentadas en `docs/m16/doubts.md`.

## Salidas para pruebas

- Las specs que se han migrado a `test.info().outputPath('captures')` escriben dentro del directorio aislado por test, retry y worker.
- Las demás specs escriben en `artifacts/playwright/captures/<nombre-spec>/` (también desechable). Es una ruta distinta por spec, no por test. No conservarla como registro de hitos.
- `DYNASTY_CAPTURE_DIR` se mantiene como opción de salida, pero Playwright rechazará explícitamente un valor que dirija a `artifacts/screenshots`. Para capturas de hito hay que copiar **manualmente tras verificar el resultado** a una carpeta nueva por fecha e hito, mediante un PR independiente. No se permite que un test reescriba un hito existente.
- El workflow E2E adjunta `artifacts/playwright` en Actions tanto si las pruebas pasan como si fallan.

## Protección de CI

1. Antes de Playwright, `node tools/check-e2e-captures.mjs` recorre todos los `e2e/*.spec.ts` y rechaza referencias a la ruta histórica, incluso con barras de Windows. Incluye casos de prueba positivos/negativos para el propio guard.
2. Tras la suite, GitHub Actions utiliza `git diff --quiet -- artifacts/screenshots` para detectar y rechazar cualquier modificación de archivos históricos **versionados**.
3. El directorio `artifacts/playwright` es desechable y no se versiona. El registro de hitos sigue deliberadamente separado.

## Evidencias y límites

- En la primera ejecución de PR #35 el guard de git detectó sobrescrituras reales de imágenes históricas y hubo un fallo de TypeScript en el tour. Ambos motivaron la ampliación de la migración.
- El control estático y las comprobaciones de CI del **último commit** deben completarse antes de aprobar la PR.
- La comparación de dos ejecuciones de CI se basa en preservar el mismo historial de git sin diffs en cada ejecución independiente; no acredita calidad visual del juego ni sustituye revisión humana de capturas.
- Cualquier escritura nueva que no utilice las convenciones anteriores debe añadir test y ampliar el guard antes de ser aceptada.
