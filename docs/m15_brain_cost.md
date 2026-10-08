# M15 — El coste del cerebro y la regla de compromiso

Escrito el 2026-10-08 para el agente que lo implemente. Sigue al paso 0 del
LOD revisado ([m15_simulation_lod.md](m15_simulation_lod.md) §0.5) y a la
entrega de memoria que dejó de apuntar personas para los NPCs. Lee antes
`AGENTS.md` entero: los coeficientes de `Brain` están calibrados entre sí, todo
sorteo sale de un `RNG` con semilla, y durante M15 solo se ejecutan las capas
rápidas de verificación.

## 1. La medición

Perfil de CPU de V8 (`node --cpu-prof`) sobre `profile:step`, 300 humanos en un
campamento, 480 pasos, master `2019b9e`. Para repetirla:

```bash
node --cpu-prof --cpu-prof-dir=<dir> node_modules/vite-node/dist/cli.mjs \
  tools/profile-step.ts -- --humans=300 --steps=480 --hash=false
```

`--cpu-prof` no se admite en `NODE_OPTIONS`: hay que lanzar `node` directamente.
vite-node transforma el TypeScript, así que en el perfil **los nombres de
función son fiables y los números de línea no**.

Por bloques (`profile:step`), el paso son 15,5 ms y `loop: brain` se lleva
10,8 ms (**71 %**). Lo siguiente es `observePlaces` (12 %) y `execute` (7 %).

Dentro de `Brain.score`, tiempo inclusivo:

| Qué | Parte del cerebro |
|---|---:|
| `findNode` → `SpatialHash.findNearest`: el recurso más cercano | **~50 %** |
| Cuerpo de `score`: puntuar unas setenta acciones | ~26 % |
| `collectKnownNodes` y `PlaceMemory.nearest`: recursos recordados | ~7 % |
| Social: `persuasionAuthority`, `support`, `standingOver`, `standing` | ~7 % |
| `findExplorePoint` | ~6 % |

Cada persona ejecuta el puntuador completo aproximadamente cada 7 ticks:
unas 20.000 llamadas en 480 pasos con 300 personas.

## 2. Por qué la búsqueda de recursos cuesta la mitad

- **El filtro caro va antes que la distancia.** `SpatialHash.findNearest`
  (`src/sim/core/SpatialHash.ts:102`) llama a `filter(item)` para cada
  elemento de cada celda y solo después compara `d2 < bestDist2`. En
  `Brain.findNode` (`src/sim/ai/Brain.ts:4142`) ese filtro es `eligible`:
  el filtro del llamador, `canTravelTo`, nieve, `withinReach`. El filtro del
  llamador suele ser `isFoodNode` (`Brain.ts:955`), que llama a `nodeWorth` →
  `appealOf` (antojos, creencias) para cada nodo.
- **La misma búsqueda, hasta cuatro veces por pensamiento.** `Brain.ts:956-970`
  busca comida a su alcance, comida sin límite de alcance (si está
  desesperado), proteína a su alcance y proteína sin límite. Cada una recorre
  el radio de visión.
- **Búsquedas en vano.** Alrededor de un campamento de 300 personas los
  arbustos están vacíos: la búsqueda recorre todo el radio, evalúa el filtro
  caro en cada nodo y no encuentra nada, y entonces pasa a los recordados.
- **`nodeWorth` depende de la persona y del tipo de objeto, no del nodo**
  (`Brain.ts:4116`): se recalcula para cada arbusto del mismo tipo.

## 3. Entrega A: arreglos exactos (sin cambio de comportamiento)

Un commit por arreglo. **El estado final debe ser bit a bit idéntico** al de
antes: usa el hash de `profile:step` y los controles negativos del
instrumento. Mide la mejora con 30 y con 300.

1. `findNearest`: calcular `d2` primero y descartar si `d2 >= bestDist2` antes
   de llamar a `filter`. El resultado es el mismo, porque un elemento que no
   mejora la distancia nunca podía ganar, y el orden de recorrido no cambia,
   así que los empates se resuelven igual. Revisa otros llamadores con filtros
   caros (`queryRadius` + filtro).
2. Memorizar `nodeWorth` por persona y por `itemId` durante un mismo
   pensamiento (por ejemplo, un `Map` que se vacía al empezar `score`, como ya
   se hace con `rememberedNodeTargets`).
3. Si es exacto, compartir el trabajo entre las cuatro búsquedas de comida (un
   solo recorrido que guarde el mejor candidato de cada categoría). Si no se
   puede hacer exacto, no se mezcla con lo demás.

Si algo de esto cambia el hash, no es exacto: sepáralo, explica por qué y no lo
entregues como optimización.

## 4. Entrega B: la regla de compromiso (cambia el comportamiento)

Decisión del propietario, 2026-10-08. Hoy hay una inercia pequeña: la acción
en curso puntúa ×1,25 (`Brain.ts:856-889`, en `add`). Pero quien camina hacia
lo que eligió vuelve a puntuar todo en cada turno (`Simulation.ts:5828-5850`;
`ai/ThinkCadence.ts` para las otras bandas). Como las distancias cambian al
andar, las puntuaciones se reordenan y el NPC alterna: hacia el agua, hacia el
arbusto, otra vez hacia el agua. El propietario lo describe así: "yo puedo
tener varias necesidades, pero no voy saltando entre una y otra; abordo
primero la más importante y luego la siguiente".

La regla:

1. **Elegir la necesidad que más aprieta.** Si dos están prácticamente
   empatadas, elegir al azar entre ellas, con un `RNG` con semilla (nunca
   `Math.random()`). Si hace falta un stream nuevo, se añade al final de los
   forks de `Simulation` y se anota en la tabla de `AGENTS.md`.
2. **Comprometerse.** Mientras persigue lo elegido, incluido el camino hasta
   allí, no vuelve a puntuar las setenta acciones.
3. **Comprobación barata en su turno.** Compara la presión de sus necesidades
   (`drivePressures`, `pressedByNeed` o equivalente): O(1), sin búsquedas en el
   mapa. Solo si otra necesidad supera a la actual **por un margen claro** (el
   "plus por abandonar la acción") abandona y piensa entero. El margen es un
   valor de configuración documentado.
4. **Lo urgente no espera.** Peligro, ataque, herida y todo lo que hoy pasa por
   `interruption()`/`abandon()` llegan en el acto (ver
   `ThinkCadence.wakesNow`). Una necesidad que cruza un umbral crítico (sed o
   hambre extremas) cuenta como urgente.
5. **El jugador no cambia.** Las órdenes del jugador ya se mantienen hasta
   completarse o abandonarse.

Verificación de B: `sim:check` de una semilla, con el reparto de
`ai-uses-many-actions` comparado antes y después (no solo pasa/falla). Mirar
las columnas de población (`fruit`, `cold`, `store`). Contar los cambios de
acción por persona y día antes y después: esa es la evidencia directa de que
dejan de alternar. Y medir con `profile:step` cuántas llamadas a `score` se
ahorran. Sin cohortes: el commit dice que la cohorte queda diferida y no
afirma ninguna mejora económica.

## 5. Lo que no se toca aquí

- `observePlaces` (12 %): ya se recortó en la entrega de memoria. El bucle de
  `noticeStarving`/`meetOnGlobe` sobre las personas vistas cuesta ~1,7 ms con
  300 y se dejó exacto.
- Los cálculos sociales (~7 %) se pueden cachear por día o por banda en otra
  entrega. Anótalo en `bugs.md` si lo mides.
- `perf-budget` (suelo de 1.724 pasos/s con 30) sigue fallando: 752 pasos/s en
  master `2019b9e`.

## 6. Verificación y documentación

`npm.cmd run typecheck`; `npm.cmd test -- --maxWorkers=1 --testTimeout=15000`
(comprueba que corrió la suite entera); `npm.cmd run sim:check` de una semilla;
`npm.cmd run profile:step`. **Prohibido** `sim:seeds`, cohortes,
`century`/`generations` y `sim:check:all`. Fallos heredados: en `sim:check`,
`cravings-steer-the-diet` y `perf-budget`; en la suite,
`people-knowledge.test.ts` («sustained full contact does homogenise»),
documentado para M16 por la fase 40. Cada commit lleva el prefijo `m15:`, sus
tests y su entrada en `docs/changelog.md`. Añade un «Avance» a este documento
y lo no resuelto a `docs/bugs.md`.
