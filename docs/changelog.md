## 2026-11-02 — M16 0.16.25-alpha — identidad compartida de hechos en crónicas

- Corregida la restauración del mismo objeto `deed` entre el autor y la víctima tras guardar cada persona en un `PersonRecord` separado. El enlace se reconstruye solo si coinciden tick, texto, tipo y participantes, emparejando por orden los hechos repetidos en el mismo tick.
- Pruebas nuevas para la identidad compartida, dos hechos idénticos distintos, crónicas sin contrapartida y guardado/carga real de la versión actual.
- No se modifica el formato de guardado, RNG, semillas ni referencias de matrices. La comparación exhaustiva de grafos `m16-load-keeps-sharing` dejó de fallar en la CI inicial: los checkpoints 1/2/4/8/12/16/20 días y el hash final de grafo coinciden. Se convierte `it.fails` en prueba obligatoria y se exige que no haya divergencias intermedias; pendiente validar el nuevo commit completo antes del merge.

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

