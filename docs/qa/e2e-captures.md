# Capturas E2E seguras (issue #24)

La carpeta `artifacts/screenshots/` guarda capturas históricas de hitos. **Las pruebas corrientes no deben escribir en ella**. Algunas specs antiguas siguen haciéndolo y están pendientes de migración.

## Convención para specs nuevas y migradas

Dentro de una prueba Playwright, usar `testInfo.outputPath('captures', '01-estado.png')` o `test.info().outputPath('captures', '01-estado.png')`:

```ts
import { test } from '@playwright/test';

test('example', async ({ page }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('captures', 'example.png') });
});
```

Playwright aísla la ruta por prueba, proyecto, reintento y worker bajo `artifacts/playwright`. Los artefactos del workflow E2E se publican incluso si los tests fallan; revisarlos en el job y no copiar encima de un hito anterior.

## Cómo registrar un nuevo hito

Copiar deliberadamente imágenes ya verificadas desde el artefacto E2E a una **carpeta nueva** en `artifacts/screenshots/<fecha>-<hito>/`, con nombres estables y sin colisiones, en un PR específico. No pedir a un test corriente que escriba directamente en esa carpeta ni reutilizar una ruta de un hito antiguo.

## Barreras y alcance actual

- El job E2E usa `git diff --quiet -- artifacts/screenshots` para fallar si una prueba modifica un fichero de imagen **versionado**. Esto detecta la modificación al terminar, pero por sí solo no impide una escritura; los runners de CI son desechables.
- Las specs migradas en esta PR son `attack-response`, `attend-feast-animation`, `dyeing-animation`, `extraction-animation` y el tour de `screenshots`.
- **Pendiente:** las demás specs que aún usan rutas históricas deben migrarse antes de considerar cerrada la issue #24. El guard de CI sirve para localizar las que efectivamente sobrescriban imágenes; no acredita la seguridad de todas las escrituras no versionadas.
- Validar que dos ejecuciones sucesivas preservan la historia, añadiendo un fixture reproducible, sigue pendiente. No cerrar #24 con este PR parcial.
