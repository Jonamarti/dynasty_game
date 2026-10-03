# M15 23d — Una comprobación de reproducción que mide su mecanismo

2026-10-03. La prueba de reproducción de `grazing.test.ts` antes ejecutaba dos
economías humanas completas hasta la siguiente primavera y otros nueve días.
Durante las cohortes concurrentes tardó 88 segundos y agotó su límite de 60;
el fallo era un timeout, no una comparación de nacimientos fallida. La repetición
también agotó ese límite.

La comprobación ahora llama al `WildlifeSystem.daily` real nueve veces, con
cinco ciervos, los mismos IDs/RNG, terreno transitable y capacidad de hierba
controlada. Compara alimentación 1 frente a 0,2; comprueba también que en invierno
o sin capacidad de pasto no nazcan crías. No cambia coeficientes, reproducción,
movimiento, calendario ni simulación de juego. Las otras dos pruebas mantienen
la integración con Simulation para pastar y morir sin comida.

Se comprobó el control negativo sobre una copia temporal del sistema: sustituir
el factor `fed * fed` por `1` hace fallar la comparación (`1 > 1`). Las copias
temporales se eliminaron después; el sistema de producción permanece intacto.
La suite completa pasó 940/940 en 128 archivos con la prueba aislada. Typecheck
limpio. Logs de timeout y mutación conservados bajo
`artifacts/verification/m15-pending-20261003-pass1/`.

Registro visual general sin cambio de UI:
`artifacts/screenshots/m15-grazing-check-2026-10-03-pass1/` (tour 1/1).
