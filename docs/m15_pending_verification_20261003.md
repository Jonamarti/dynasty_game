# M15 — Evidencia del bloque pendiente, 2026-10-03

Referencia: `34b9823ed01a1a6bca229f4933e4dc8d3cc74c77`. Las funcionalidades se
guardan por separado, con sus contratos y capturas; esta tabla distingue pruebas
del código de salud de los mundos. Los logs se conservan en
`artifacts/verification/m15-pending-20261003-pass1/`.

| Capa | Resultado | Evidencia |
|---|---|---|
| Typecheck final | limpio | `final-typecheck-pass10.log` |
| Suite completa final | 949/949, 129 archivos | `final-tests-pass9.log` |
| Solo huecos públicos, sin inventario/técnicas | 24/24 focales; cubierta por la suite final | `tools-private-final-pass3.log` |
| Navegador final | 74/74 | `final-e2e-pass4.log` |
| Mundo en español | 524 líneas distintas, ninguna marcada como inglesa | `final-i18n-soak.log` |
| Matriz de 27 escenarios | **FAIL**, 104 instancias antes y 108 después | `baseline-matrix.log`, `final-matrix-pass4.log` |

La primera suite de referencia se ejecutó mientras un agente cambiaba
generadores de arte: sus dos fallos de arte eran hojas pendientes de reconstruir,
no una referencia heredada fiable. Hubo regresiones temporales de temporizadores
de cosecha durante la integración; se corrigieron y la suite completa volvió a
pasar. Tampoco se contó como pase una prueba que agotó su timeout: reproducción
animal ahora usa el sistema diario real en condiciones controladas y una mutación
que elimina `fed * fed` la hace fallar. El motor animal no cambió.

## Matriz: fallos y falta de muestra son resultados distintos

93 fallos persisten, 15 aparecen y 11 se retiran. `docs/bugs.md` enumera todos
los nuevos; no se atribuye una causa sin medirla. Una ablación de equipamiento
en doce escenarios conserva detalles completos por check. Identifica doce
pérdidas de aplicabilidad y cuatro ganancias. Dos antiguos FAIL pasan a n/a:
estaciones de `feasts` y exposición a bayas de `polity`. Eso no es mejora.
Carne en `craft`/`lean` y transmisión de conocimientos en `lean` también
pierden muestra. Los escenarios de farmers ahora ejercitan tres comportamientos
que antes no podían juzgar, y fallan.

Reproducción de la auditoría:

```
npx.cmd vite-node artifacts/verification/m15-pending-20261003-pass1/matrix-ablation.ts
node artifacts/verification/m15-pending-20261003-pass1/compare-matrix.cjs
```

El segundo comando lee los logs finales y escribe `matrix-final-delta.json`;
el primer resultado se conserva como `matrix-legacy-applicability.ndjson`.
El rendimiento de esas ejecuciones concurrentes no establece FPS ni coste
individual: el presupuesto de rendimiento se omite cuando corre la matriz.

## Herramientas: puerta declarada antes de medir

Límite: caída de supervivencia media de como máximo tres puntos porcentuales
en **ambas** cohortes, sin cambiar coeficientes para alcanzar la puerta. Cada
variante usa las mismas veinte semillas, con el equipo activado/desactivado.
El porcentaje llamado `MEAN SURVIVAL` por el CLI es `suma end / suma peak`;
se compara ese mismo agregado en las dos variantes, no una media aritmética
de porcentajes por semilla.

| Escenario | Desactivado | Activado final | Diferencia | Colapsos |
|---|---:|---:|---:|---|
| lean, 24.000 pasos/semilla | 4,2% | 4,0% | -0,2 puntos | 20/20 en ambas |
| century, 40.000 pasos/semilla | 77,6% | 77,4% | -0,2 puntos | 1/20 desactivado, 2/20 activado |

La puerta declarada se supera en ambas cohortes. No demuestra una mejora:
century tiene diez nacimientos menos (646 frente a 656) y un colapso más.

Fuentes: `tools-lean-off-20.log`, `tools-lean-on-final-20.log`,
`tools-century-off-20.log` y `tools-century-on-final-20.log`. Las primeras
cohortes activadas, sin sufijo `final`, preceden la corrección de arco/bebé y
recomprobación durante preparación; no son la medición final del código.
El 4,0% de lean es un problema demográfico grave, no una economía arreglada.

## Capturas y límites del alcance

Capturas por hito, sin sobrescribir directorios anteriores, revisadas en el
juego: checkpoints, terreno, banco RNG, cavar, instrumento de reproducción,
talar, fabricar y equipamiento. Los contratos enlazados desde el plan/changelog
registran sus rutas. La última captura de equipo muestra al trabajador y Kit
con hacha en la derecha y lanza transportada, en
`artifacts/screenshots/m15-tools-2026-10-03-final-pass4/`.

La animación comparte reloj de simulación, conserva pausa y no modifica trabajo;
las pruebas de navegador parten de órdenes reales y comparan estado antes y
después del dibujo. Los codecs son registros inertes: todavía faltan objetos del
mundo, agendas y aplicación coordinada a Simulation. No completan guardar/cargar
ni LOD. Herramientas de oficio recogidas del suelo y controles manuales siguen
abiertos en 11d; otros gestos/materiales visibles siguen abiertos en 17.
