# Cohorte de colocación de peces — 2026-10-16

## Resultado

La comparación completa de 20 semillas y 9.000 ticks por brazo no muestra una
ventaja económica consistente para la distribución gaussiana. El control
uniforme produjo algo más de pesca agregada, pero la diferencia fue pequeña
(frente al volumen total), las métricas de supervivencia se solapan y el hambre
final varió en sentidos opuestos entre semillas. No se justifica cambiar la
simulación a partir de esta cohorte.

`SCENARIOS.fishers` no ejercita la colocación geográfica: crea una simulación
clásica sin `GeographicStart`. Esta prueba construyó un inicio geográfico real
en `earth-12000-bce`, comarca única `(460.5, 137.5)`, perfil de bahía con
somero salino y cuota topada de 75 nodos. El control sustituyó solo el selector
de casillas residuales: conserva la reserva por clase de agua, centros,
cuota, muestreo sin reemplazo, flujo dedicado
`geographicResourceRng('fish')` y una llamada RNG por nodo; usa selección
uniforme en lugar de `pickGaussianTile`. La partida avanza con el mismo foco
headless que `simcheck`.

Cada brazo de cada semilla comenzó con el mismo checkpoint completo tras
normalizar únicamente `x/y` de los nodos de pez. Ese checkpoint incluye
terreno, roster, entidades, ledgers, contadores de IDs y `ExecutionRecord`
(snapshots RNG y alias de streams). Las 20 parejas emparejaron y mantuvieron
75 nodos iniciales con el mismo stock por semilla. Las distancias iniciales se
midieron con `nodeHash.findNearest`, no escaneando el arreglo de nodos.

| Métrica, uniforme menos gaussiano | Gaussiano | Uniforme | Diferencia |
|---|---:|---:|---:|
| Capturas de pez (eventos agregados) | 15.323 | 16.064 | +741 (+4,8%) |
| Nutrición de pescado | 373.626 | 386.496 | +12.870 (+3,4%) |
| Trabajo de pesca (ticks) | 541.770 | 575.272 | +33.502 |
| Fundadores vivos al final | 354/407 (87,0%) | 359/407 (88,2%) | +5 (+1,2 pp) |
| Muertes por hambre | 19 | 20 | +1 |
| Hambre media final, media pareada | — | — | −3,20 puntos |
| Adultos a ≤5 tiles del pez, cambio pareado medio | — | — | +0,90 |
| Adultos a ≤10 tiles del pez, cambio pareado medio | — | — | +0,55 |

La supervivencia cambió solo en 9/20 pares (7 favorecen uniforme, 2 gaussiano,
11 empatan). La mortalidad por hambre cambió en 7/20 (3/4, 13 empatan). El
cambio medio de hambre favorece al uniforme (menor hambre), y el uniforme
tuvo menor hambre final en 14 semillas frente a 6 del gaussiano. La cuota incluye
68 peces de agua dulce y 7 de agua salada en la semilla `century` gaussiana;
el reparto por hábitat varía con semilla y brazo, aunque el número de nodos y
el stock inicial se mantienen.

Es una medición descriptiva de un solo perfil geográfico y una cuota máxima,
no una calibración general de costas, ríos, comarcas grandes o poblaciones con
agricultura. La telemetría de trabajo/nutrición y los resultados de población
son observaciones de este build; no se alteraron reglas, pesos ni configuración
de la simulación.

## Artefactos y reproducibilidad

- Tabla durable por semilla y brazo: [`m15_fish_cohort_20261016.csv`](m15_fish_cohort_20261016.csv).
- JSON completo por semilla, hash SHA-256 por pareja, metadatos, resumen y hash
  del resumen: `artifacts/m15-fish-cohort-20261016-final/`.
- El `metadata.json` guarda SHA-256 del mapa y de `Simulation.ts`, `RNG.ts`,
  `SpatialHash.ts`, `GaussianPlacement.ts` y del instrumento, todos calculados
  al arrancar la cohorte. Los logs de ejecuciones piloto y de la primera
  corrida interrumpida permanecen separados y no alimentan estos resultados.
- Comando: `npm.cmd exec -- vite-node tools/fish-placement-cohort.ts -- --seeds 20 --steps 9000 --out artifacts/m15-fish-cohort-20261016-final`.

La prueba `salters-checks.test.ts` también se corrigió en este trabajo: su
fallo era una expectativa de `hunger≥40=0`, no una regresión del check de
preservación. El escenario actual mide una cantidad positiva de person-ticks
por encima de 40. La prueba ahora valida límites de la instrumentación
(observaciones subconjunto de ticks con portador), mantiene las expectativas de
comidas reales de invierno y verifica que quitar las recetas elimina la
atribución a comida preservada. No fija valores incidentales de hambre ni
debilita el check de conservación.

Verificación focal: `npm.cmd run typecheck` y
`npm.cmd test -- src/sim/__tests__/salters-checks.test.ts --maxWorkers=1 --testTimeout=15000` pasan.
