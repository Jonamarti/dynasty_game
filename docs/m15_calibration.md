# M15 fase 10 — calibración contra la historia, primera pasada

Protocolo de `m13_plan.md` fase 14, heredado por M15 fase 10: un parámetro a
la vez, 20 semillas por valor, tabla de resultados frente a la tabla
«Objetivos históricos» de `m13_plan.md`. `--set` (fase 1b) y el escenario
`generations` (fase 10a) ya existen.

**Nota sobre el instrumento.** Al preparar esta pasada se descubrió que
`sim:seeds -- --scenario X --seeds N` llevaba desde la fase 1b (`a69eeb9`)
leyendo el propio valor de `--seeds` como si fuera `--size`, encogiendo la
isla a `N×N` mientras la población se quedaba igual — un colapso total
garantizado que no tenía nada que ver con el mundo. El arreglo y su alcance
están en `docs/bugs.md` («M15 fase 10 — `sim:seeds` …») y en el changelog del
2026-09-29. Todas las cifras de este documento están medidas **después** del
arreglo.

## Línea de partida (sin tocar ningún parámetro)

20 semillas, mundo por defecto (`Config.motivation` tal y como queda tras la
fase 9).

| métrica | objetivo | `century` (20 años, 20 semillas) | `lean` (isla pobre, 20 semillas) | `generations` (15 años, **5 semillas**) |
|---|---|---|---|---|
| supervivencia media | — (informativo) | 92,3% (1/20 colapsos) | 21,8% (11/20 colapsos) | 86,4% (0/5 colapsos) |
| `worldLost` | 0/20 | 1/20 | 0/20 | 0/5 |
| `bandLost` violencia | ≤1/20 bandas-partida | 0 | 0 | 0 |
| `selfDestroyed` | ≤1/100 | 0 | 0 | 0 |
| `drawdown` p50/p90/max | informativo | 0,059/1,000/1,000 | 0,833/1,000/1,000 | 0,380/0,759/1,000 |
| `recovered` (caídas >40%) | ≥50%, solo medible en `generations` | n/a (escenario corto) | n/a (escenario corto) | **0/7 (7 censuradas, ninguna aún)** |
| violent adult deaths (proxy de `violentShare`) | 5%-30% de muertes adultas | 4,5% | 0,2% | 8,6% |
| `inBandKillRate` /1000 persona-año | ≤1 | 0,000 | 0,000 | 0,000 |
| `answered` (adultos) | ≥90% | **33,3%** | n/a (muy pocos golpes) | **0,0%** |
| niños que huyen | ≥90% de atacados | n/a (0/0 muestras) | n/a (0/0 muestras) | n/a (0/0 muestras) |
| `peaceShare` | ≥60% | 99,9% | 99,9% | 99,7% |
| `nightNearHome` (<15 casillas) | ≥75% | 82,6% | 78,0% | 80,6% |
| niños dentro del radio (¬far>12) | ≥80% | 92,6% | 85,6% | 92,9% |
| `fireBy` | ≥50% de semillas (solo se pide en `century`) | 90,0% (18/20) | — | — |
| `adoption` mediana | ≤80 días | 7 días | 4 días (5 cohortes nunca llegaron) | 8 días (1 nunca llegó) |
| malnutrición media | por debajo de la línea base | 0,242 | 0,239 | 0,255 |

## Lectura de esta primera pasada

**Sin tocar ningún parámetro todavía**, la mayoría de los objetivos ya se
cumplen en `century` y `lean`: mundo perdido, autodestrucción, matanza dentro
de la banda, `peaceShare`, sueño cerca de casa, niños dentro del radio,
`fireBy` y la mediana de adopción están todos dentro de su rango.

**Un objetivo falla con claridad: `answered` en `century` (33,3% frente a
≥90%)**, y no se ajusta aquí porque la regla del protocolo es no tocar un
parámetro sin saber qué mide. Es probable que esté relacionado con las fases 7
(coste de las órdenes) y 8 (incursiones e instigadores), que son las más
recientes en tocar cómo se responde a una agresión; se deja anotado en
`docs/bugs.md` para diagnosticarlo con `npm run why` antes de mover ningún
coeficiente. `violentShare` en `lean` (0,2%) está muy por debajo del 5%-30%
recomendado — el mundo pobre es demasiado pacífico para su propia escasez —
mientras que `century` (4,5%) queda justo al borde inferior.

## `generations`, exploración (5 semillas, no 20)

**Coste declarado antes de medir:** a ~11 min/semilla medidos (3.333 s para 5
semillas), 20 semillas de `generations` cuestan del orden de 3,7 horas de
cómputo secuencial. Esta primera pasada usa 5 semillas para explorar (el
propio protocolo de `m13_plan.md` distingue «10 semillas para explorar, 20
para decidir»); **ninguna decisión de calibración se toma sobre esta
muestra**, solo se registra lo que dice antes de ampliarla.

**Lo que dice, con la reserva de que son 5 semillas.** La supervivencia media
(86,4%, 0/5 colapsos) y la mayoría de la tabla —`worldLost`, autodestrucción,
matanza dentro de la banda, `peaceShare`, sueño cerca de casa, niños dentro
del radio, mediana de adopción— caen dentro de objetivo, igual que en
`century` y `lean`. Dos cosas laten con la misma dirección que ya apuntaban
las cohortes más cortas y merecen seguimiento, no ajuste:

- **`recovered` es 0/7**: de las caídas de más del 40% observadas en estas
  cinco semillas, ninguna se había recuperado al terminar los quince años de
  juego — las siete quedan censuradas (la caída seguía sin resolverse cuando
  acabó la corrida), no confirmadas como «nunca se recuperan». Es la métrica
  para la que existe `generations`, así que es la primera que hay que revisar
  con una muestra de 20: si sigue en 0% ahí, la recomendación de
  `m13_plan.md` (≥50%) no se cumple y hace falta diagnosticar el mecanismo de
  recuperación (comida disponible tras la caída, natalidad, distancia a otros
  bandos) antes de tocar ningún coeficiente.
- **`answered` es 0,0% aquí**, coherente con el 33,3% ya bajo de `century` y
  reforzando que es un problema real y no ruido de una sola cohorte corta. Ver
  la entrada de `bugs.md`.

## Qué no se ha hecho en esta pasada

- **No se ha barrido ningún parámetro de `Config.motivation`.** Esta pasada es
  solo la línea de partida; el protocolo pide medir antes de tocar nada, y
  `answered` es el primer candidato una vez diagnosticado.
- **`generations` a 20 semillas** para medir `recovered` con la muestra
  completa que pide el objetivo — a ~11 min/semilla, unas 3,7 horas de
  cómputo; se deja para cuando haya un tramo de ejecución en segundo plano
  igual de largo.
- **Diagnóstico de `answered`** con `npm run why` sobre una agresión concreta,
  antes de mover el coeficiente de autoridad o de ánimo de respuesta.
- **La segunda pasada de calibración (fase 41)**, después de los bloques
  III-VI (manos, sal, noche, cuerpo, fauna), que es la que de verdad fija
  `Config.motivation` para el resto de M15.
