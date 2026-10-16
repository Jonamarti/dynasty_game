# M15 — progreso de la búsqueda urgente de comida (2026-10-16)

## Hallazgo

La hipótesis de que `PlaceMemory` conserva indefinidamente cantidades positivas
tras visitar un nodo vacío no quedó demostrada. Al llegar, `ActionSystem` observa
la cantidad actual, actualiza el recuerdo a cero y lo comparte con los testigos
visibles; `PlaceMemory` excluye los nodos agotados del índice de disponibilidad.
Los recuerdos antiguos pueden representar recursos que vuelven a crecer, así
que no se añadió TTL ni una invalidación por edad.

Sí se reprodujo una interrupción causal. Cuando Brain ofrece `explore` a un adulto
autónomo con hambre 100 y sin comida ejecutable, `ActionSystem.doExplore` vuelve
a pasar el límite de hambre a `interruption()` antes del primer movimiento. La
acción termina en `idle`, y el siguiente ciclo puede escoger de nuevo la misma
frontera. El test negativo verificó que la oferta existía pero no había avance
medible antes del cambio.

## Cambio y límites

La pierna de exploración ignora solo la interrupción por hambre cuando se cumplen
todas estas condiciones: adulto, sin orden manual, la intención responde a
hambre, hambre sobre su `workLimit` y `bestFoodFor(...)` no encuentra comida
ejecutable que ya lleve. La búsqueda continúa respondiendo a sed, frío y peligro;
los niños, las órdenes explícitas y quien lleva una comida siguen sujetos a la
interrupción habitual. No se cambiaron pesos ni coeficientes.

El bypass no promete supervivencia por sí solo: deja de cancelar el primer paso,
pero la búsqueda puede alargar el tiempo con hambre crítica. Por eso se midieron
muertes, supervivencia, presión de hambre crítica y recorridos a recuerdos vacíos
en una cohorte emparejada, además de las interrupciones y ofertas.

## Verificación

- `npm.cmd run typecheck`: pasó.
- `npm.cmd test -- --run src/sim/__tests__/food-search-progress.test.ts --maxWorkers=1 --testTimeout=15000`: 3/3 pasó.
- La prueba negativa falló antes del fix exactamente en la aserción de movimiento;
  después pasó. Los controles cubren sed, frío, peligro, comida llevada, infancia
  y orden manual.
- Cohorte `lean` emparejada de 20 semillas, 24.000 pasos por brazo, ejecutada en
  un proceso. Ambos brazos cargan el mismo `ActionSystem.ts`, con el cambio de
  defensa `doAttack` incluido. El brazo baseline solo fuerza
  `ignoreHunger: false` en la llamada a `interruption`; el brazo tratamiento usa
  la regla nueva. Se registran extinción/supervivencia, muertes adultas por
  hambre, exploraciones ofertadas, cortes `explore_ended_hungry`,
  `remembered_empty_walk` y ticks/daño equivalente con hambre crítica.
- Build base: `eafcea4fc9efa1fcdd8702d84c00830b997f5619`.
- SHA-256 del archivo cargado en ambos brazos:
  `0FA5239F15E0D7E2172EB250F3AB069ED43B4D2CCDBEA82EB5618AAA031D1DB4`.
- Resultado completo por semilla: [CSV](m15_hunger_search_cohort_20261016.csv);
  log JSONL local en `artifacts/m15-hunger-search-cohort-20261016.jsonl`.

## Resultado final (20 parejas)

| Semilla | Supervivencia antes → después | Muertes adultas por hambre | Hambre crítica (ticks) | `remembered_empty_walk` |
|---|---:|---:|---:|---:|
| `century` | 0/36 → 0/36 | 17 → 14 (≥14 años) | 47.463 → 49.443 | 10.850 → 10.508 |
| `alpha` | 4/37 → 6/37 | 18 → 17 (≥14 años) | 48.975 → 43.029 | 12.438 → 12.585 |
| `beta` | 2/37 → 6/37 | 11 → 12 (≥14 años) | 31.919 → 44.786 | 6.373 → 7.250 |
| `gamma` | 0/37 → 0/37 | 17 → 14 (≥14 años) | 43.846 → 41.529 | 8.056 → 8.141 |
| `delta` | 0/36 → 0/36 | 14 → 12 (≥14 años) | 28.853 → 30.166 | 10.864 → 11.661 |
| `eps` | 0/38 → 2/38 | 21 → 19 (≥14 años) | 52.389 → 53.357 | 11.899 → 12.405 |
| `zeta` | 0/37 → 0/37 | 16 → 16 (≥14 años) | 48.941 → 45.781 | 10.725 → 10.164 |
| `eta` | 1/37 → 3/37 | 19 → 15 (≥14 años) | 41.596 → 35.106 | 14.664 → 12.147 |
| `theta` | 1/36 → 1/36 | 13 → 13 (≥14 años) | 40.777 → 40.777 | 9.974 → 9.974 |
| `iota` | 0/36 → 0/36 | 16 → 17 (≥14 años) | 45.721 → 46.245 | 13.980 → 15.919 |
| `kappa` | 0/36 → 0/36 | 17 → 16 (≥14 años) | 49.613 → 54.010 | 14.395 → 14.589 |
| `lambda` | 3/37 → 4/37 | 16 → 18 (≥14 años) | 51.542 → 46.133 | 10.491 → 15.662 |
| `mu` | 1/36 → 1/36 | 14 → 14 (≥14 años) | 44.318 → 44.318 | 9.093 → 9.093 |
| `nu` | 1/36 → 1/36 | 12 → 14 (≥14 años) | 45.136 → 44.655 | 12.016 → 12.917 |
| `xi` | 0/37 → 0/37 | 18 → 18 (≥14 años) | 44.019 → 41.551 | 12.723 → 15.601 |
| `omicron` | 3/36 → 1/36 | 16 → 17 (≥14 años) | 38.941 → 39.187 | 11.472 → 11.233 |
| `pi` | 0/38 → 0/38 | 12 → 20 (≥14 años) | 38.967 → 47.680 | 8.860 → 12.722 |
| `rho` | 3/36 → 5/36 | 14 → 13 (≥14 años) | 42.241 → 46.379 | 12.016 → 13.991 |
| `sigma` | 2/37 → 2/37 | 22 → 22 (≥14 años) | 47.649 → 47.649 | 11.632 → 11.632 |
| `tau` | 0/37 → 0/37 | 20 → 13 (≥14 años) | 42.964 → 42.675 | 12.409 → 13.524 |

La supervivencia final media por semilla es 2,87% → 4,35%, con diferencia
pareada media de +1,48 puntos; intervalo t aproximado al 95%: −0,14 a +3,10
puntos. Seis semillas mejoran, trece empatan y una empeora. La media de muertes
adultas por hambre pasa de 16,15 a 15,70 por semilla. Los ticks-persona bajo
hambre crítica aumentan de 43.794 a 44.223 por semilla (+0,98%); los recorridos
a recuerdos vacíos pasan de 11.247 a 12.086 (+7,46%). No se resuelve un
beneficio de supervivencia.

El contador `explore_ended_hungry` baja de 12.447,5 a 219,5 por semilla media
(−98,2%), confirmando que la excepción rompe el bucle causal. El daño
equivalente es solo los ticks críticos multiplicados por la constante de
configuración, no el daño aplicado en el mundo. Se conserva esta guarda
estrecha por el mecanismo reproducido; la cohorte no demuestra una mejora de
supervivencia ni justifica cambiar un coeficiente del scorer.
