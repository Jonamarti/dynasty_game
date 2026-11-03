## 2026-11-02 — M16 0.16.25-alpha (experimento) — rastrear el lugar recordado, no una presa desconocida

- En caza autónoma, si el scorer seleccionó una presa fuera de visión de una especie distinta de la manada recordada, el personaje va a explorar las coordenadas de **ese recuerdo**, sin recibir el identificador ni la posición exacta de la presa invisible.
- Se conserva el comportamiento de caza cuando la presa es visible o existe memoria válida de su especie; la decisión se corrige **solo tras elegir cazar**, sin cambiar la lista de puntuaciones ni la RNG.
- Tests de capacidad: especie ajena, visible, recordada y ausencia de memoria. **Experimento en draft**: comparar cuatro matrices y cohortes antes de aceptar; no re-pin ni modificar saves.

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

