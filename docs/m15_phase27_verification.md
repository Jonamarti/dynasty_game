# M15 fase 27: verificación y coste conjunto

## Estado de la medición

La implementación de 27a–27e y su medición están entregadas. Typecheck,
1.056 unitarios, 80 e2e y los seis checks de `shallows` pasan. La matriz
clásica sigue roja (106 → 112 fallos) y siete escenarios exceden el coste
declarado. **La fase permanece abierta por su puerta económica.**

## Protocolo económico

Referencia: `cf903f7`, antes de 27a. El árbol final se congeló tras la retirada
comprometida del NPC a la orilla y coincide con `6cd49a5` en código de
simulación; los cambios de 27e son del harness, fixtures y sus tests.

Se ejecutaron veinte semillas emparejadas en cada uno de los 28 escenarios
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
- Suite v3: 149 archivos, 1.055 tests pasan.
- Tras corregir instrumentación, una ejecución de 1.056 tests agota un timeout
  de 15 segundos bajo carga. La repetición completa
  `npm.cmd test -- --maxWorkers=1 --testTimeout=60000` pasa: 149 archivos, 1.056 tests.
  El log fallido se conserva; no se ha cambiado una aserción ni el test para aprobarlo.
- Checks focalizados: 18/18 pasan, incluidos controles negativos.
- `DYNASTY_PORT=5399 npm.cmd run e2e`: 80/80 pasan.
- `npm.cmd run i18n:soak`: 419 líneas en español, cero detectadas como inglesas.
- `npm.cmd run sim:check -- --scenario shallows`: 6/6 checks pasan;
  23 capturas someras, seis pasos de nado y cero muertes en bajíos.
- Matriz v3: roja, 113 fallos frente a 106 previos; 37 fallos nuevos y
  30 ausentes (ausente no establece paso). Nueve escenarios pierden checks
  aplicables. Matriz final v4: 112 fallos; el único cambio respecto a v3 es
  que `slopes-slow` pasa en `crowded` tras corregir su medición. La matriz
  sigue roja, con 36 fallos nuevos y 30 ausentes respecto a la referencia.

## Referencia de checks

La matriz previa ya era roja: 106 fallos en 28 escenarios. Los resultados
finales se comparan por check y aplicabilidad; `n/a` no equivale a pasar.
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

## Sonda de divergencia: `century/sigma`

Con el mismo árbol congelado y 40.000 pasos, la referencia termina con
18 vivos de un pico de 37 y el resultado con uno de 37. Las causas de muerte
son referencia: hambre 22, exposición 4, agresión 1; resultado: hambre 24,
exposición 8, oso 4, agresión 1. El resultado no registra pasos de nado ni
ahogamientos. Sus capturas de peces bajan de 862 a 277, pero el desplome
temprano reduce también las oportunidades de actuar: estos totales no aíslan
una causa económica. No se ha cambiado un coeficiente a partir de esta sonda.

## Corrección de instrumentación de pendiente

`crowded` produjo un nuevo fallo `slopes-slow`: la clasificación usaba solo
pendiente, mientras `moved / asked` incluía también el factor 0,4 del vadeo.
La regresión de una bajada somera mide 0,4096 con el contador anterior y falla;
el contador corregido divide únicamente por ese factor independiente y pasa.
No se cambia el movimiento, el RNG ni los coeficientes de la pendiente.
La suite pasa con 1.056 tests y la matriz corregida conserva todos los
resultados de v3 salvo el paso de `slopes-slow` en `crowded`. Las cohortes usan
la instrumentación desactivada y mantienen el árbol v3 congelado.

## Sonda de mortalidad: `scribes/alpha`

El hash de nombre, posición, traits y habilidades iniciales (salvo la habilidad
nueva `swim`) coincide entre referencia y resultado. A 14.000 pasos la
referencia conserva 35 vivos de pico 35 y no registra muertes; el resultado
conserva 19 de pico 31, con once muertes por hambre y dos por exposición.
No hay muertes por ahogamiento. La caída se produce después de 10.000 pasos:
a ese punto las poblaciones son 30 y 31. La sonda confirma una diferencia
posterior al arranque; no identifica por sí sola qué cambio de 27 la causa.

## Resultado económico final

560 parejas completas, veinte por cada uno de los 28 escenarios clásicos.
Siete escenarios exceden los tres puntos declarados. La fase permanece abierta
por esa puerta. Pérdida positiva = peor supervivencia ponderada; una pérdida
negativa no establece una mejora causal.

| Escenario | Referencia % | Resultado % | Pérdida (puntos) | ≤ 3 |
|---|---:|---:|---:|:---:|
| food-news | 100,00 | 100,00 | 0,00 | Sí |
| conflicts | 100,00 | 100,00 | 0,00 | Sí |
| tiny | 99,40 | 99,40 | 0,00 | Sí |
| band | 99,53 | 99,69 | -0,16 | Sí |
| crowded | 99,93 | 99,67 | 0,26 | Sí |
| century | 72,88 | 68,18 | 4,70 | **No** |
| craft | 96,41 | 97,94 | -1,53 | Sí |
| wilds | 90,39 | 88,55 | 1,85 | Sí |
| emptied | 99,53 | 100,00 | -0,47 | Sí |
| hearths | 93,02 | 95,53 | -2,52 | Sí |
| porters | 99,22 | 99,03 | 0,19 | Sí |
| scribes | 94,26 | 86,00 | 8,26 | **No** |
| harsh-winter | 98,63 | 100,00 | -1,37 | Sí |
| coast | 100,00 | 100,00 | 0,00 | Sí |
| traps | 99,76 | 98,59 | 1,17 | Sí |
| millers | 61,63 | 59,23 | 2,40 | Sí |
| hunters | 96,25 | 95,51 | 0,74 | Sí |
| fishers | 97,92 | 97,52 | 0,40 | Sí |
| farmers | 69,20 | 64,91 | 4,29 | **No** |
| herders | 86,93 | 88,23 | -1,30 | Sí |
| feasts | 85,89 | 76,45 | 9,45 | **No** |
| stewards | 64,69 | 54,62 | 10,07 | **No** |
| labour | 96,11 | 88,77 | 7,34 | **No** |
| polity | 97,71 | 97,29 | 0,41 | Sí |
| conquest | 81,06 | 60,97 | 20,09 | **No** |
| culture | 97,53 | 99,43 | -1,90 | Sí |
| lean | 3,26 | 2,89 | 0,37 | Sí |
| diggers | 82,51 | 86,23 | -3,72 | Sí |

La tabla no sustituye los datos por semilla ni sus intervalos. `scribes` y
`conquest` tienen intervalos aproximados del cambio emparejado completamente
negativos; los demás escenarios que incumplen tienen intervalos que incluyen
cero. Esto limita la atribución causal, pero no convierte una puerta numérica
incumplida en superada. No se ajustó un coeficiente para escoger el resultado.

`lean` permanece en colapso en las veinte semillas de ambos brazos: estar
dentro del coste añadido no implica que ese mundo esté sano. Los colapsos
suben de 2 a 4 en `millers`, de 0 a 2 en `feasts`, de 2 a 3 en `stewards`
y de 0 a 1 en `farmers`. Se conserva esa información en el resumen.

Datos, scripts, hashes de fuente y logs: `artifacts/verification/m15-phase27-20261005/`.
El README explica la reconstrucción de snapshots y las excepciones. El reductor
rechaza duplicados contradictorios; su control negativo está registrado.
