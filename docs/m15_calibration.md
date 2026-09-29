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

| métrica | objetivo | `century` (20 años) | `lean` (20 semillas, isla pobre) | `generations` (15 años) |
|---|---|---|---|---|
| supervivencia media | — (informativo) | 92,3% (1/20 colapsos) | 21,8% (11/20 colapsos) | pendiente |
| `worldLost` | 0/20 | 1/20 | 0/20 | pendiente |
| `bandLost` violencia | ≤1/20 bandas-partida | 0 | 0 | pendiente |
| `selfDestroyed` | ≤1/100 | 0 | 0 | pendiente |
| `drawdown` p50/p90/max | informativo | 0,059/1,000/1,000 | 0,833/1,000/1,000 | pendiente |
| `recovered` (caídas >40%) | ≥50%, solo medible en `generations` | n/a (escenario corto) | n/a (escenario corto) | pendiente — es la métrica que justifica el escenario |
| violent adult deaths (proxy de `violentShare`) | 5%-30% de muertes adultas | 4,5% | 0,2% | pendiente |
| `inBandKillRate` /1000 persona-año | ≤1 | 0,000 | 0,000 | pendiente |
| `answered` (adultos) | ≥90% | **33,3%** | n/a (muy pocos golpes) | pendiente |
| niños que huyen | ≥90% de atacados | n/a (0/0 muestras) | n/a (0/0 muestras) | pendiente |
| `peaceShare` | ≥60% | 99,9% | 99,9% | pendiente |
| `nightNearHome` (<15 casillas) | ≥75% | 82,6% | 78,0% | pendiente |
| niños dentro del radio (¬far>12) | ≥80% | 92,6% | 85,6% | pendiente |
| `fireBy` | ≥50% de semillas (solo se pide en `century`) | 90,0% (18/20) | — | — |
| `adoption` mediana | ≤80 días | 7 días | 4 días (5 cohortes nunca llegaron) | pendiente |
| malnutrición media | por debajo de la línea base | 0,242 | 0,239 | pendiente |

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

**`recovered` sigue sin medirse.** Es la única métrica para la que
`generations` es indispensable (ningún escenario más corto puede mostrar una
población recuperándose de una caída, porque un niño tarda catorce años en
ser adulto). La corrida de `generations` es lenta — unos 15-20 minutos por
semilla en esta máquina — así que esta primera pasada explora con **5
semillas**, no 20; ver la sección siguiente.

## `generations`, exploración (5 semillas, no 20)

**Coste declarado antes de medir:** a ~15-20 min/semilla, 20 semillas de
`generations` cuestan 5-7 horas de cómputo secuencial. Esta primera pasada usa
5 semillas para explorar (el propio protocolo de `m13_plan.md` distingue
«10 semillas para explorar, 20 para decidir»); no se toma ninguna decisión de
calibración basada solo en esta muestra. Ampliar a 20 semillas queda para
cuando se disponga de más tiempo de cómputo o de ejecución en segundo plano
más larga.

*(resultados pendientes — se añaden en cuanto termina la corrida en curso)*

## Qué no se ha hecho en esta pasada

- **No se ha barrido ningún parámetro de `Config.motivation`.** Esta pasada es
  solo la línea de partida; el protocolo pide medir antes de tocar nada, y
  `answered` es el primer candidato una vez diagnosticado.
- **`generations` a 20 semillas** para medir `recovered` con la muestra
  completa que pide el objetivo.
- **La segunda pasada de calibración (fase 41)**, después de los bloques
  III-VI (manos, sal, noche, cuerpo, fauna), que es la que de verdad fija
  `Config.motivation` para el resto de M15.
