# M16 1.1 — Coste de las verificaciones

Medido el 2026-10-16 en `NoPE` (Windows, AMD64, AMD family 23/model 8),
branch `m16`, commit de partida `74dd860`, versión `0.15.160-alpha`. No se
cambió código. Las salidas originales están en
[`artifacts/verification/m16-1.1/before/`](../../artifacts/verification/m16-1.1/before/).

## Escenarios

Cada clave de `SCENARIOS` se ejecutó en un proceso aislado. `sim s` y
`steps/s` son los que imprime el informe; `wall s` mide el comando completo,
incluido el arranque de Vite Node. Se ordenan por tiempo de pared. El CSV
conserva las 41 filas y códigos de salida; cada escenario tiene también su
log individual.

| Escenario | Pasos | Sim s | Wall s | pasos/s | Exit |
|---|---:|---:|---:|---:|---:|
| generations | 144.000 | 226,80 | 230,70 | 635 | 1 |
| century | 40.000 | 87,36 | 93,18 | 458 | 1 |
| polity | 24.000 | 72,11 | 76,78 | 333 | 1 |
| millers | 36.000 | 62,78 | 69,35 | 573 | 1 |
| farmers | 24.000 | 56,92 | 61,19 | 422 | 1 |
| stewards | 24.000 | 49,82 | 53,75 | 482 | 1 |
| conquest | 24.000 | 48,96 | 53,43 | 490 | 1 |
| craft | 16.000 | 35,29 | 53,03 | 453 | 1 |
| feasts | 24.000 | 48,21 | 52,61 | 498 | 1 |
| herders | 20.000 | 47,04 | 51,19 | 425 | 1 |
| wilds | 14.000 | 25,17 | 49,65 | 556 | 1 |
| smiths | 16.000 | 42,62 | 47,15 | 375 | 1 |
| labour | 12.000 | 39,85 | 43,76 | 301 | 1 |
| hearths | 16.000 | 29,83 | 38,27 | 536 | 1 |
| scribes | 14.000 | 32,82 | 37,66 | 427 | 1 |
| lean | 24.000 | 30,97 | 34,97 | 775 | 1 |
| hunters | 9.000 | 16,64 | 34,20 | 541 | 1 |
| traps | 9.000 | 15,87 | 24,21 | 567 | 1 |
| culture | 9.000 | 15,33 | 22,81 | 587 | 1 |
| crowded | 3.000 | 15,23 | 19,18 | 197 | 1 |
| fishers | 9.000 | 15,20 | 19,12 | 592 | 1 |
| diggers | 9.600 | 14,53 | 18,40 | 661 | 1 |
| ironsmiths | 300 | 0,25 | 15,75 | 1.190 | 0 |
| shallows | 5.000 | 8,63 | 15,45 | 579 | 0 |
| orchard | 9.600 | 10,85 | 14,87 | 885 | 1 |
| porters | 3.000 | 4,90 | 14,28 | 613 | 1 |
| emptied | 9.600 | 9,64 | 14,21 | 996 | 1 |
| nights | 150 | 0,36 | 12,65 | 423 | 0 |
| homes | 2.400 | 6,73 | 11,72 | 357 | 0 |
| ploughmen | 8.000 | 6,78 | 11,13 | 1.180 | 0 |
| coast | 4.000 | 5,44 | 10,38 | 735 | 1 |
| band | 3.000 | 5,24 | 8,99 | 573 | 1 |
| salters | 2.400 | 3,88 | 8,72 | 618 | 0 |
| tailors | 2.400 | 3,36 | 7,91 | 713 | 0 |
| ironworkers | 300 | 0,31 | 4,96 | 971 | 0 |
| tiny | 2.000 | 1,06 | 4,75 | 1.892 | 1 |
| carburisers | 300 | 0,43 | 4,70 | 704 | 0 |
| frontier | 300 | 0,15 | 4,52 | 2.041 | 0 |
| forgers | 300 | 0,27 | 4,30 | 1.128 | 0 |
| conflicts | 80 | 0,13 | 4,02 | 630 | 0 |
| ironminers | 200 | 0,18 | 3,98 | 1.136 | 0 |

El barrido sumó 1.361,88 s de pared (22 min 42 s). Veintiocho comandos
terminaron con código 1 por checks de salud; trece terminaron con 0. La línea
base congelada en 0.1 sigue siendo la referencia para distinguir fallos
heredados. Una ejecución directa incluye `perf-budget`, que la matriz completa
desactiva como medición de pared: por ejemplo, `coast` solo falla ese check
(735 pasos/s frente al suelo de 2.066), aunque `coast` sale limpio en la
matriz. No se interpreta como regresión.

## Suite unitaria

`npm.cmd test -- --maxWorkers=1 --testTimeout=15000`: 320 archivos, 2.339
pruebas aprobadas y 1 omitida, en 1.061,52 s (17 min 42 s). La primera pasada
dio el resultado de suite; una segunda con reporter JSON permitió ordenar los
archivos. Duración por archivo medida desde sus tiempos de inicio y fin:

| Archivo | s |
|---|---:|
| `src/sim/__tests__/compact-correspondence.test.ts` | 86,53 |
| `src/sim/__tests__/start-place.test.ts` | 24,50 |
| `src/render/__tests__/art.test.ts` | 24,24 |
| `src/sim/__tests__/band.test.ts` | 17,79 |
| `src/sim/__tests__/earthwork-checks.test.ts` | 17,34 |

## E2E

La primera ejecución sobre 5173 fue inválida: los 186 casos fallaron con
`ERR_CONNECTION_REFUSED` y no hubo servidor disponible. Se repitió la misma
suite con `DYNASTY_PORT=5399`. Sus 186 casos terminaron `ok`; los tiempos
individuales sumaron 889 s y el log abarcó 898,46 s (14 min 58 s) hasta el
último resultado. Los cinco casos más lentos:

| Spec | s |
|---|---:|
| `animals.spec.ts` — eventos animales y pausa | 24,7 |
| `tech-subwebs.spec.ts` — capturas de subweb en español y móvil | 19,2 |
| `phase36-rival.spec.ts` — panel de casa rival tras viaje | 16,8 |
| `smoke.spec.ts` — autonomía visible y persistente | 9,9 |
| `smoke.spec.ts` — presupuesto de píxeles para 500 poses de recolección | 9,8 |

El runner se quedó en teardown tras el caso 186. Se esperaron 30 s y se
interrumpió el proceso; por tanto los 186 casos pasaron, pero la orden no tuvo
salida limpia. El primer intento fallido y la segunda ejecución válida están
conservados en los logs. Playwright reescribió capturas antiguas; se restauró
`artifacts/screenshots/`, que estaba limpio antes de la prueba.

## Tres mayores costes

1. El barrido de 41 escenarios: 1.361,88 s de pared.
2. La suite unitaria: 1.061,52 s.
3. E2E: 898,46 s hasta el último caso, más el teardown colgado.

Entre los escenarios individuales, `generations` domina: 144.000 pasos,
226,80 s informados y 230,70 s de pared. El siguiente paso de infraestructura
deberá reducir arranques repetidos y segmentar esas verificaciones largas; no
se cambia ningún umbral de salud a partir de esta medición.
