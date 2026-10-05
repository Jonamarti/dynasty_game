# M15 fase 27: verificación y coste conjunto

## Estado de la medición

La implementación de 27a–27e está integrada. La verificación completa y la
comparación económica final siguen en ejecución; este documento no declara
la fase cerrada ni la puerta de coste superada.

## Protocolo económico

Referencia: `cf903f7`, antes de 27a. El árbol final se congeló tras la retirada
comprometida del NPC a la orilla y coincide con `6cd49a5` en código de
simulación; los cambios de 27e son del harness, fixtures y sus tests.

Se ejecutan veinte semillas emparejadas en cada uno de los 28 escenarios
clásicos no lentos de la matriz: 560 mundos por brazo. `shallows` se comprueba
por mecanismos; no tiene contraparte previa. Cada mundo avanza los pasos de
su escenario. Supervivencia ponderada: `100 × sum(vivos finales) / sum(pico
de población)`, la fórmula de `tools/seeds.ts`. También se publican media
por semilla, colapsos por debajo del 25 % e intervalo aproximado del cambio
emparejado. La puerta exige perder como máximo tres puntos por escenario;
una fluctuación de un mundo no establece mejora ni causa.

Pool: `century`, `alpha`, `beta`, `gamma`, `delta`, `eps`, `zeta`, `eta`,
`theta`, `iota`, `kappa`, `lambda`, `mu`, `nu`, `xi`, `omicron`, `pi`, `rho`,
`sigma`, `tau`.

Excepción explícita: `food-news` requiere un banco fuera de vista y cercano
en ambos árboles. Se aplica el MISMO fixture final de proximidad a ambos
brazos; `kappa` y `lambda` no ofrecen esa oportunidad y se sustituyen por
`food-news-1` y `food-news-2`. La selección y las exclusiones quedan en los
datos. Los otros 27 escenarios conservan el pool completo. Las ejecuciones
intermedias v1 y v2 no forman parte de los resultados finales.

## Verificación de implementación

- `npm.cmd run typecheck`: pasa.
- `npm.cmd test -- --maxWorkers=2 --testTimeout=15000`: 149 archivos, 1.055 tests pasan.
- Checks focalizados: 18/18 pasan, incluidos controles negativos.
- Matriz, navegador y soak de español: en ejecución.

## Referencia de checks

La matriz previa ya era roja: 100 fallos en 28 escenarios. Los resultados
finales se compararán por check y aplicabilidad; `n/a` no equivale a pasar.
No se han ajustado umbrales de checks ni coeficientes del Brain para forzar
una matriz verde. Las pruebas de mecanismo de 27e contienen controles
negativos que detectan capturas ausentes, ahogamientos en bajíos, personas
en agua honda o cargadas y regiones corruptas.

## Evidencia visual

- Fondo: `artifacts/screenshots/m15-phase27-depth-2026-10-05-pass2/01-coast-depth.png`.
- Humedad: `artifacts/screenshots/m15-phase27-wading-2026-10-05-pass2/02-wading-condition.png`.
- Pesca y tecnología: `artifacts/screenshots/m15-phase27-fishing-2026-10-05/`.
- Natación: `artifacts/screenshots/2026-10-05/m15-phase27d-swimming/01-swim-hand-load-refusal.png`.
- Conjunto final: `artifacts/screenshots/m15-phase27-final-2026-10-05-v3/`.
