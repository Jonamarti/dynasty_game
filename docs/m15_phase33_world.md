# M15 fase 33 — Poblar el mundo y guardar la partida

2026-10-07. Dos funcionalidades, cada una con su commit: **33a** siembra el mundo entero de pueblos al crear una partida con mapa; **33c** guarda y carga la partida entera (comarca detallada + mundo de pueblos) en IndexedDB, con exportar e importar a fichero.

## 33a-1. El modelo se muda a `src/` (commit «el mundo de pueblos, sembrado desde el juego»)

`tools/people-world-model.ts` (fase 32c) era la siembra «del lado de las herramientas». Ahora el modelo vive en `src/sim/world/PeopleWorld.ts` y el fichero de `tools/` es un envoltorio que conserva su constructor (un `raster` y una semilla) y su siembra tal como se midió. **Comprobado que no cambia nada:** con la versión de HEAD y la nueva, `sim.snapshot()` de dos semillas (`cohort-0`, `cohort-3`, 20 años sobre la Tierra) es idéntico byte a byte, así que `world:cohort` y `world:bench` siguen midiendo lo mismo.

Lo nuevo, todo detrás de `options.game` (apagado en las herramientas):

- **Cualquier geografía.** `gridFromGeography` saca las regiones habitables del mapa que el juego tenga: la Tierra (clases de Köppen, como antes) o el mapa generado (`?world=random`: la temperatura y la lluvia normalizadas del mapa son el clima, y el bioma da la productividad: `BIOME_PRODUCTIVITY`, suposiciones). La isla clásica devuelve `null`: no tiene mapa y nadie vive más allá.
- **Densidad por capacidad.** `densityOf(productividad)`: los rangos de la cohorte (1-2 pueblos, 24-48 fundadores) escalados por lo que una comarca alimenta. Un desierto da un pueblo pequeño; un valle fértil, dos grandes. Suposición de diseño; solo el factor de productividad viene de la curva medida.
- **Cultura propia.** Cada pueblo recibe normas (`VARIABLE_NORMS`, los mismos rangos que las bandas detalladas) y `strangerRegard` (gaussiana alrededor de `STRANGER_REGARD_MEAN`) de su propio stream `${seed}:people-cultures`. Va aparte de `${seed}:people-world` para que añadir cultura no mueva quién se funda dónde. Las medias de rasgos quedan en 0 (neutras): nada ha medido el temperamento de un pueblo.
- **La región del jugador es del nivel detallado.** `reserved`: ahí no se siembra ni se asienta ninguna hija.
- **Ninguna técnica por guion.** Todos empiezan con el mismo equipo (`STARTING_TECHS`), test.

Ningún stream es un `fork` de `Simulation.rng` ni toca `spawnRng`: con o sin pueblos, la comarca detallada es la misma (el ajuste en `WorldState` está en el commit siguiente). No hay fila nueva en `AGENTS.md`.

**Repertorio de nombres: no se hace todavía.** El plan lo nombra, pero un pueblo solo tiene nombres cuando alguien lo mira de cerca y se materializa en personas con nombre (fases 34-36); declararlo ahora sería contenido inerte (regla del propietario). Queda en `docs/bugs.md`.

## El registro (`PeopleWorldRecord`)

`PeopleWorld.toRecord()/fromRecord()`: el `PeopleSimRecord`, la región de cada pueblo, los contadores y el libro de conocimiento (`KnowledgeLedger.snapshot()`, nuevo: sin él un guardado olvida las técnicas a medio aprender y repetiría exposiciones ya vistas). Las regiones no se guardan: salen de la geografía. Test de ida y vuelta: guardar, cargar y avanzar 1, 10 y 60 años da el mismo registro que no haber guardado.

## 33a-2. El mundo de pueblos cuelga de `WorldState` y avanza con el reloj

- `WorldState.peoples` (`PeopleWorld | null`): se siembra en el constructor si la partida tiene mapa (`peoples: false` en el arranque lo apaga: un test que solo quiere la comarca no paga mil pueblos). La isla clásica no tiene mapa, no tiene pueblos.
- La región donde cae el inicio (`regionOfStart`) se reserva: es del nivel detallado.
- `WorldState.advancePeoples()` lo llama quien da los pasos (el bucle del navegador, tras `sim.step()`) y solo hace algo una vez por día de juego: `PeopleSim.advanceTo` recorre a todos los pueblos y una actualización estacional toca solo unas pocas veces al año. El calendario depende solo de los pasos, así que llamarlo cada tick, cada día o cada año da el mismo mundo (test).
- **Comprobado:** con y sin pueblos, la comarca detallada es idéntica (mismas personas, mismos sitios, mismos nombres, antes y tres días después). El stream de siembra y el de cultura no son forks de `Simulation`.
- Por ahora la única puerta es `?world=random`; el ajuste de partida del navegador («Mundo: una comarca / mapa del mundo») es lo que falta de la fase 33.

## 33c-1. El guardado como un solo texto (`persistence/SaveFile.ts`, `WorldStateRecord` v2)

- **`WorldStateRecord` pasa a v2** y gana `peoples` (el `PeopleWorldRecord` de 33a, o `null` en la isla clásica). El lector sigue aceptando v1 (un mundo guardado antes de que existieran los pueblos carga sin ellos). `WorldState.fromRestored` recibe el registro y reconstruye el `PeopleWorld` contra la misma geografía; las regiones no se guardan, salen del mapa.
- **`SaveFile.ts`** pone un sobre mínimo (`format`, `version`, un `summary` con semilla, tick, etiqueta del reloj, vivos, pueblos y fecha) alrededor del registro del mundo: es lo que se ve en una lista de partidas sin cargarlas. Es JSON a propósito: es la frontera de persistencia que ya cruzan todos los tests de continuación (canonicaliza `-0`). La fecha la pasa quien llama; el fichero no toca el DOM ni el reloj, así que vive en `src/sim/` y el arnés lo puede usar.
- **Rechazos con motivo** (`SaveError`): `not_json`, `not_a_save`, `newer_version`, `corrupt` (lo que los lectores de registros no entienden: un pueblo en una región que el mapa no tiene, una semilla que no es semilla). Nunca queda medio mundo cargado: o se construye entero o se lanza.
- **Prueba de ida y vuelta** (`world-state-peoples.test.ts`): una partida con mapa y jugador, 4 días, guardar, cargar; luego 1, 5 y 20 días más en las dos; después de cada tramo, comarca y pueblos son iguales. Cruza la frontera de estación (los pueblos hacen sus actualizaciones en el lado cargado). Los pueblos son exactos; ver el hallazgo siguiente para el grafo de objetos.

### Hallazgo: el cargador no restaura la compartición de objetos

Tras 29 días el grafo de objetos del mundo (`objects.graph`) de la partida cargada tiene **un nodo más** que el de la original (3127 frente a 3126). Se expandió cada grafo escribiendo cada objeto compartido donde se usa: **son iguales**. Lo que cambia es la compartición: algo que en la original es un solo objeto (un `SocialEvent` visto por varios) en la cargada son dos iguales. El resto del registro (reparto, ejecución, terreno, libros, pueblos) es idéntico bit a bit. No se ha visto que cambie una decisión en 29 días, pero no se ha demostrado que no pueda: si una mutación llega a un objeto que antes compartían, la copia ya no la ve. El test compara el grafo por contenido expandido y lo dice; el hallazgo está en `docs/bugs.md`. No se arregla aquí (es del cargador de la fase 28).
