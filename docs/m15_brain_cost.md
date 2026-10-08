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

## Avance — 2026-10-08, A1: distancia antes de elegibilidad

Entregado el corte geométrico de `SpatialHash.findNearest` antes del filtro.
Conserva recorrido, exclusión del radio límite y primer ganador de empates.
Los llamadores de `queryRadius` ya reciben el corte geométrico: no se añade
otra optimización sin una medición que la justifique.

Pruebas: 8/8 casos de SpatialHash y TypeScript pasan. El perfil de 480 pasos,
30 y 300 humanos, conserva el hash completo de referencia, sin exclusiones:
`c5c71a33580e563d` y `75b5a676015c85ce` (prefijos); instrumentado/control iguales
y control negativo detectado. Evaluaciones de `nodeWorth` por paso: 179,8 →
55,0 (30), 1.829,5 → 482,3 (300). Mínimos de tres controles: 0,937 → 0,937 ms
(30) y 14,747 → 15,243 ms (300); la suite simultánea contamina el tiempo, por
lo que no se afirma mejora global con esta muestra. Evidencia en
`artifacts/verification/m15-brain-cost-20261008/{baseline,a1}*`.

### A2: valor de alimento por pensamiento

`score` comparte un `Map<itemId, number>` local entre comida ordinaria y
proteína; memoriza también cero. Desaparece al terminar la llamada, de modo
que no añade estado ni puede contaminar a otra persona o al siguiente turno.
Prueba focal y TypeScript pasan; el control sin caché falla con tres cálculos
en lugar de uno. También se comprueban otra persona, ceros y un pensamiento
posterior tras cambiar antojo/creencia. Hash completo sin exclusiones idéntico
a referencia a 30 y 300; instrumentación igual al control y negativo detectado.
`nodeWorth` por paso: 55,0 → 14,4 (30), 482,3 → 168,1 (300). Mínimos de tres
controles: 0,937 → 0,930 y 15,243 → 14,538 ms/paso, con suite simultánea;
no bastan para concluir el tiempo global. Evidencia `a2*` en el directorio
anterior. Suite completa de referencia: 216 archivos, 1.641 pasan, una omisión
y un fallo heredado de `people-knowledge` (0,81 frente a <0,6); no está verde.

### A3: cuatro categorías, un recorrido local

Comida ordinaria dentro/fuera de alcance y proteína dentro/fuera comparten
`findNearestMany`. Cada categoría conserva distancia, orden y empate estricto;
los fallbacks a recuerdos siguen siendo condicionales y se ejecutan en el orden
original, con sus mismos efectos en los conjuntos de objetivos y la telemetría.
Se extrae `findRememberedNode` para compartir ese fallback. Las consultas simples
conservan su camino sin asignar los arrays de categorías: la variante que hacía
pasar también las simples por `many` dio 14,366 ms/paso a 300, frente a 13,237
con el camino simple independiente; a 30 la diferencia es ruido (0,923/1,063).
Se conserva una prueba comparativa con consultas simples y búsqueda exhaustiva,
800 posiciones con RNG, 120 consultas y bordes de celda/radio. Espacial+caché:
10 pruebas pasan, TypeScript limpio. Hash íntegro a 30/300 igual al original,
sin exclusiones, e instrumentación/control iguales con negativo detectado.
La muestra final (tres repeticiones) da 1,063/13,237 ms/paso, medianas
1,302/13,522; original 0,937/14,747 (referencia bajo suite concurrente), así
que se observa ahorro a 300 sin afirmar una mejora estable a 30. Evidencia:
`artifacts/verification/m15-brain-cost-20261008/{a3,exact-final}*`.

Hito visual de A1+A2, antes de A3: gira `tour` 1/1 pasando, trece capturas en
`artifacts/screenshots/m15-brain-exact-2026-10-08T-01/`. No cambió la UI.

### Instrumento de B: reorientaciones y llamadas reales

`profile:step --decisions=true --methods=brain` observa `Brain.think` sin
escribir en la simulación y obliga a verificar hashes incluso con `--hash=false`.
El JSON incluye llamadas/tiempo de cada método, cambios de acción y retargets
por persona/día real, arranques desde idle y elecciones nulas por separado.
Las posiciones de un objetivo con identidad no cuentan como retarget al moverse.
Las tasas incluyen denominador explícito: todos los vivos y NPCs autónomos,
con días fraccionarios de exposición, excluyendo órdenes del segundo.
No mide terminaciones/arranques dentro de execute; es una medida directa de
reorientaciones del planificador, no de toda actividad. Seis controles focales
pasan y el perfil final de A3 demuestra hash igual y negativo detectado.
Referencia B (480 pasos): 30, 2.169 score calls, 137 cambios y 5 retargets,
58 NPC-días; 300, 21.631 calls, 1.856 cambios y 398 retargets, 597,967 NPC-días.
A 300 son 3,104 cambios + 0,666 retargets por NPC-día autónomo.

### B: elegir una necesidad y conservar el viaje

Entregada la retención de rutas autónomas. Una necesidad con presión ≥0,16
elige entre sus respuestas con objetivo válido; empates a ≤0,02 usan
`choiceRng`, sin añadir ni reordenar forks. La variedad sigue cambiando la
comida apetecible, no el motivo del viaje. Sin necesidad dominante queda el
scorer habitual, incluyendo trabajo; cuidado y peligro conservan sus opciones.
El compromiso guarda acción normalizada, motivo, presión inicial y destino
por identidad. En marcha, una comparación de siete presiones sustituye al
scorer: otra necesidad debe aventajar en 0,08. Daño, ataque, urgencia familiar
y hambre/sed críticas despiertan antes de la cadencia; dos necesidades críticas
casi iguales no provocan alternancia. El trabajo con timer conserva sus
interrupciones existentes. `observePlaces` mantiene su cadencia y las órdenes
del jugador conservan su prioridad.

Los abandonos de una ruta autónoma pasan por `onStopped`; no generan órdenes
reanudables. La UI los muestra para el NPC conocido seleccionado o comandado,
con traducción completa y sin revelar necesidades privadas de desconocidos.
El checkpoint conserva compromiso y RNG; registros antiguos sin compromiso
migran a null, y un AI config íntegramente antiguo adopta 0,16/0,08/0,02.
Un config parcialmente incompleto o compromiso malformado se rechaza. B cambia
intencionalmente las decisiones futuras también al cargar un guardado antiguo;
la identidad bit a bit de A no se reclama para B.

Perfil sin suite concurrente, 480 pasos, tres controles:

| Humanos | score calls A → B | Cambios A → B | Retargets A → B | Mínimo/mediana ms A → B |
|---|---|---|---|---|
| 30 | 2.169 → 1.601 | 137 → 110 | 5 → 0 | 1,063/1,302 → 0,830/1,071 |
| 300 | 21.631 → 14.526 | 1.856 → 1.039 | 398 → 7 | 13,237/13,522 → 11,290/11,536 |

A 300: score calls −32,8%; cambios/retargets por NPC-día autónomo
3,104/0,666 → 1,738/0,012 (597,967 NPC-días en ambos). A 30 son
2,362/0,086 → 1,897/0 (58 NPC-días). Instrumentación/control coinciden y
el negativo se detecta; los hashes nuevos son distintos a A por diseño.
Las cifras miden reorientaciones en think, no finales de execute ni FPS.
Evidencia: `artifacts/verification/m15-brain-cost-20261008/commitment*`.

La semilla band de 3.000 pasos conserva 30 vivos y 31 acciones, antes 29.
Forage 15.532 → 14.546; talk 3.629 → 5.744; hunt 132 → 272; build
912 → 985; ponder 631 → 771, pickup/discuss aparecen y prototype no. Al día 17,
fruit 661 → 674, cold 0,2 → 0,0, store 108 → 92. Son observaciones de
un mundo divergente, no mejoras económicas. Siguen dieta y presupuesto de
rendimiento (848 pasos/s frente a suelo 1.724). La primera versión B tuvo un fallo de
`moods-move-choices`, 3,8% talk en pertenencia baja vs 4,4% alta, antes
4,0%/2,4%. El incentivo de pertenencia en score no cambia; el check observa
acciones longitudinales tras selección y no establece la causa. Cinco ideas
antes y cero después dejan checks de descubrimiento n/a en esta muestra.
Tras los arreglos de recogida/cuidado, el informe final pasa moods-move-choices
(7,2%/3,8%); no se ha establecido la causa del fallo inicial. Se registra el
contraste y los n/a para M16; no se relaja ningún check ni se retocan pesos.
Cohortes, century/generations y matriz completa diferidos por la prioridad M15.

La revisión de la primera suite detectó dos regresiones corregidas antes de
cerrar B: la selección por hambre debe admitir comida caída (`pickup`), y un
viaje de cuidado debe conservar la presión del hambre visible/recordada de su
destinatario. Guarda motivo null con esa presión de referencia, sin consultar
el estado privado de alguien fuera de vista. La recogida se prueba de forma
autónoma, sin forzar después el executor con un compromiso obsoleto.
La excepción de llanto comprueba alimento y destinatario: un regalo de piedra
no cuenta como alimentar. Al empezar trabajo con timer se borra el compromiso
antes de consultar el llanto, para que Simulation no consuma la señal que
ActionSystem debe recibir ese mismo tick. La observación del llanto conserva
su límite de avisos y las interrupciones existentes de los trabajos.

Verificación visual final: e2e completa 121/121 antes de los ajustes internos;
los avisos pasan de nuevo 2/2 con el runtime final. Capturas EN/ES revisadas:
`artifacts/screenshots/m15-brain-commitment-2026-10-08T-02/` (T-01 se conserva).
Typecheck final limpio. Focales pickup/feeding/transmission/nursing 35/35 antes
de reforzar el control de llanto; nursing final 12/12 con un nodo real y un
control negativo de señal ya consumida. No se relajó la prueba de alimentación;
la de pickup ahora observa una recogida autónoma real. La lectura fallida en
la primera suite completa se mantiene como hallazgo sin causa confirmada;
su archivo pasa 14/14 sin modificarlo. Perfil/informe definitivos en
`commitment-final*`; suite completa final: 219 archivos, 1.666 pasan, uno omitido y dos fallos.
El de people-knowledge es heredado (0,81 frente a <0,6); el nuevo es
compact-correspondence craft/delta, diferencia de hambre 23,401 frente a ≤15.
Recogida, alimentación y lectura pasan en esta repetición. Se registra el
desajuste con el modelo compacto para M16 sin modificar tabla ni tolerancias.
La suite no está verde; las cohortes para recalibrar siguen diferidas.
