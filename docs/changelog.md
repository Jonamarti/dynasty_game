## 2026-11-03 — M16 0.16.25-alpha — las bandas deciden sus obras iniciales

- Se elimina la precolocación de dos chozas de barro y un almacén por banda y la asignación retrospectiva de su proponente en `Simulation.spawnPeople` (#55).
- La primera obra surge del ciclo habitual de `BandSystem.planBuildings`, que considera las necesidades, escoge diseño y asigna un patrocinador adulto; ninguna estructura se construye gratuitamente.
- Prueba de capacidad `m16-no-unplanned-starting-sites` con fundación multibanda, planificación posterior y continuidad de guardado/carga en la misma versión; `building-sponsor.test.ts` deja de asumir obras prefijadas.
- **Pendiente de verificar en GitHub CI:** typecheck, suite unitaria, matrices y supervivencia en la escalera de refugios. Este cambio afecta la secuencia de RNG del mundo inicial; no repinear baselines sin analizar la diferencia.

## 2026-11-02 — M16 0.16.24-alpha — pozos solo conocidos

- La IA puede buscar un pozo visible o recordado como `building:well`, pero no obtiene acceso global a pozos lejanos nunca descubiertos.
- La telemetría de `drink` reconoce `building:well` además de `water`, para no registrar un falso objetivo desconocido cuando bebe de un pozo recordado.
- Pruebas `m16-known-well.test.ts` en `check:fast`: invisible desconocido, visible, recordado, no terminado/derrumbado y clasificación del contador.
- Verificar matrices emparejadas y todos los E2E antes del merge; no modificar seeds, RNG, baselines ni formato de guardado.

