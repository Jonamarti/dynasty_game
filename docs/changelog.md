## 2026-11-03 — M16 0.16.25-alpha — alternativa a recuerdos obsoletos de manadas

**Problema:** la IA solo evaluaba la manada recordada más cercana; si esta se había desplazado o desaparecido, no consultaba otros recuerdos aunque existiese una presa conocida y alcanzable. Un recuerdo de ciervos tampoco debe autorizar una presa de otra especie.

**Causa:** elección de `nearestAny` antes de verificar la presencia de un animal vivo de la especie recordada.

**Cambio:** `findRememberedHerdQuarry` filtra el índice espacial de memoria por presas compatibles, vivas y alcanzables, y continúa hasta encontrar un recuerdo válido. Mantiene preferencia de animales visibles, radio y restricciones territoriales. No hay nuevas llamadas RNG, baseline ni formato de guardado.

**Verificación:** pruebas deterministas nuevas para recuerdo compatible, recuerdo cercano obsoleto con alternativa, especie incompatible y presa muerta, inaccesible o fuera de alcance. La prueba queda registrada en `check:fast`. **CI completa y comparación de matrices pendientes; mantener draft y no re-pin hasta confirmar que no aparecen regresiones nuevas.**

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

