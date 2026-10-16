# M15 32b — producción detallada por estación

La observación anterior (`compact-food-rates.ts`) fija una semilla, diez días y
una banda sin técnicas. No ofrece exposición suficiente a agricultura ni a
conservación para completar la calibración de producción compacta.

`tools/compact-food-cohort.ts` permite elegir escenarios, semillas y días. Usa
el constructor y `setup` del escenario y el foco de banda del juego. Conserva
una fila por día completo, escenario y semilla; cada fila pertenece a la
estación del día que termina, incluso cuando el último tick cruza de estación.
La temperatura es la media de todos los ticks, no una muestra de medianoche.

Los contadores son del trabajo y las transferencias materiales reales de
ActionSystem. Se descuentan snapshots acumulativos para evitar atribuir al
invierno el trabajo del otoño anterior. Sin trabajo, la cobertura conserva
`n/a`. Los registros incluyen exposición de adultos y de toda la población;
las fuentes conservan como denominador los ticks de toda la población según
el contrato v3. No se deducen rendimientos de potenciales o duraciones teóricas.
Las recetas que gastan comida en otros productos también aparecen, con su
balance nutricional real, y no deben tratarse como comida producida.

El CLI guarda tras cada semilla completa; `completed` enumera las parejas
terminadas y `complete` solo es verdadero cuando están todas. Una salida
parcial no sirve como cohorte completa. El instrumento exige una sesión de
telemetría propia y una frontera diaria; rechaza un observador ya activo sin
borrar sus contadores.

```powershell
node node_modules/vite-node/dist/cli.mjs tools/compact-food-cohort.ts -- farmers,salters alpha,beta,gamma 40 artifacts/m15-production-cohort-20261016.json
node node_modules/vite-node/dist/cli.mjs tools/compact-food-cohort.ts -- farmers furrow,alpha,beta 100 artifacts/m15-production-farmers-20261016.json
```

## Evidencia y alcance

La primera ejecución completó seis parejas: `farmers` y `salters`, tres
semillas y cuarenta días cada una (57.600 pasos). `farmers` no registró trabajo
agrícola ni procesado en esas ventanas: esa cobertura es `n/a`, no una tasa
cero.

La segunda ejecución también terminó: `farmers`, `furrow`/`alpha`/`beta`, cien
días por semilla (72.000 pasos). Las tres ventanas siguen sin ticks agrícolas
ni procesado; sus poblaciones finales son 27/21/11. Tres semillas no permiten
calibrar población ni asignar tasas agrícolas. El JSON completo está en
`artifacts/m15-production-farmers-20261016.json`, con las tres parejas en
`completed` y `complete: true`.

Una traza adicional del escenario original `furrow` registra 95 cosechas de
cereal silvestre y hasta 46 unidades de grano transportadas, pero ningún
molino ni campo construido o proyectado durante cien días. Al final quedan
dos pozos de almacenamiento y dos chozas en proyecto, todos sin progreso.
`BandSystem.planBuildings` exige `underway === 0` para proponer estaciones y
campos: la prioridad de obras básicas es una pista concreta para investigar,
pero la traza no prueba que sea la única causa de la ausencia de agricultura.
Su estado y hashes de fuentes están en
`artifacts/m15-farming-diagnostic-20261016.json`. Es una observación adicional,
no un brazo de comparación demográfica.

En `salters` sí hay procesado en las cuatro estaciones: 8.135 / 7.818 / 5.278 /
4.662 ticks de trabajo en otoño / invierno / primavera / verano, sumando las
tres semillas. El balance de nutrición de ingredientes a productos fue
2.382→3.024 / 1.878→2.300 / 1.356→1.700 / 1.080→1.252. Es trabajo observado,
incluidas recetas que consumen grasa; no mide por sí mismo ahorro de comida,
supervivencia ni preferencia por conservar.

Dos pruebas pasan: correspondencia del checkpoint completo, incluidos RNG,
frente a los mismos pasos sin observación al cruzar primavera→verano; y
rechazo sin avanzar ante un día parcial o telemetría ajena activa.

Esta entrega no elige parámetros ni completa `lod-matches-detail`. Faltan
correspondencia anual, contexto por terreno/herramienta/carga, transferencias
de almacén y una muestra suficiente de cada mecanismo. Los datos no activan
15c ni justifican afirmar una mejora económica.
