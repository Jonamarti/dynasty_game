# Capturas E2E seguras — #24

## Problema y regla

`artifacts/screenshots/` es un **archivo histórico versionado**: nunca debe recibir capturas de pruebas rutinarias. La antigua suite E2E escribía ahí y ya produjo pérdidas documentadas en `docs/m16/doubts.md`.

## Salidas para pruebas

- Las specs que se han migrado a `test.info().outputPath('captures')` escriben dentro del directorio aislado por test, retry y worker.
- Las demás specs escriben en `artifacts/playwright/captures/<nombre-spec>/` (también desechable). Es una ruta distinta por spec, no por test. No conservarla como registro de hitos.
- `DYNASTY_CAPTURE_DIR` se mantiene como opción de salida, pero Playwright rechaza las variables `DYNASTY_*CAPTURE*`, `DYNASTY_*SCREENSHOT*` y `DYNASTY_*SHOTS*` que resuelvan al historial, incluidas rutas relativas con `..` y enlaces simbólicos. Para capturas de hito hay que copiar **manualmente tras verificar el resultado** a una carpeta nueva por fecha e hito, mediante un PR independiente. No se permite que un test reescriba un hito existente.
- El workflow E2E adjunta `artifacts/playwright` en Actions tanto si las pruebas pasan como si fallan.

## Protección de CI

1. Antes de Playwright, `node tools/check-e2e-captures.mjs` recorre todos los `e2e/*.spec.ts` y rechaza referencias a la ruta histórica, incluso con barras de Windows. Incluye casos de prueba positivos/negativos para el propio guard.
2. Tras la suite, `node tools/check-e2e-history.mjs` detecta cambios en imágenes versionadas **y** archivos nuevos (ignorados por Git) dentro del historial.
3. `node --test tools/check-e2e-history.test.mjs tools/archive-e2e-milestone.test.mjs` prueba dos ejecuciones sintéticas, modificaciones del historial, archivos ignorados y rechazo de colisiones al archivar hitos.
4. El directorio `artifacts/playwright` es desechable y no se versiona. El registro de hitos sigue deliberadamente separado.

## Archivo explícito de hitos

Una vez revisadas visualmente las capturas, se pueden copiar a una **nueva** carpeta de hito con `node tools/archive-e2e-milestone.mjs artifacts/playwright/captures/<spec> YYYY-MM-DD-slug`. El comando rechaza directorios de origen fuera de Playwright, enlaces simbólicos, archivos que no sean PNG, fechas incorrectas y carpetas de destino existentes; usa copia exclusiva. El hito nuevo debe añadirse manualmente con `git add -f` en una PR de aceptación visual separada. Nunca usar esta herramienta durante E2E rutinarias.

## Evidencias y límites

- En la primera ejecución de PR #35 el guard de git detectó sobrescrituras reales de imágenes históricas y hubo un fallo de TypeScript en el tour. Ambos motivaron la ampliación de la migración.
- El control estático y las comprobaciones de CI del **último commit** deben completarse antes de aprobar la PR.
- La comparación de dos ejecuciones de CI se basa en preservar el mismo historial de git sin diffs en cada ejecución independiente; no acredita calidad visual del juego ni sustituye revisión humana de capturas.
- Cualquier escritura nueva que no utilice las convenciones anteriores debe añadir test y ampliar el guard antes de ser aceptada.
