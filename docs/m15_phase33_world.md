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
