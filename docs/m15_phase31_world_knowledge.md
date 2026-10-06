# M15 fase 31 — `WorldKnowledge`: qué comarcas conoce una persona

Contrato de la mitad simulada del globo (M14 fase 13c). La vista es la 31b
(ver más abajo y en `m15_plan.md`).

## Qué es

`src/sim/social/WorldKnowledge.ts`: el `PlaceMemory` a escala de mundo. Por
**persona** (decisión 20: la niebla es la de tu personaje), un mapa de comarcas
globales → `{ day, source: 'seen' | 'told', peoples? }`.

- **seen**: la persona estuvo en la comarca o la tuvo a la vista. Guarda el día
  en que la vio por última vez y los pueblos (otras bandas) que encontró allí,
  banda → día.
- **told**: alguien se la describió. Guarda **la fecha del que la contó** (lo
  vieja que es la noticia) y nada más: un rumor no trae pueblos.
- **desconocida**: no hay entrada. La vista no revela nada de ella.

*Seen* gana a *told* y nunca se vuelve atrás: oír hablar de un sitio donde has
estado no te lo hace olvidar, y un rumor no pisa un avistamiento.

## Cómo se escribe (los tres canales que ya existen)

| Canal | Dónde | Notas |
| --- | --- | --- |
| Ver | `Simulation.observeWorld`, desde `observePlaces` | La comarca bajo cada esquina del cuadrado de visión. Los fundadores, con `foundersKnowRadius`. Otras bandas vistas: `meetOnGlobe`. |
| Contar | `ActionSystem` (conversación) | Desde `chat`: cada uno cuenta al otro hasta `CONVERSATION_MODES[mode].stories` comarcas que el otro no tiene, las más recientes primero (empate por clave). Solo el lugar y su fecha. |
| Heredar | `Simulation.registerBirth` | El hijo oye el mapa de su madre y de su padre, como rumor. |

Un cuarto canal —quien llega de fuera trae el mapa de su casa (matrimonio,
captura) y el explorador que vuelve— existe como API (`tellAllTo`) pero **no
tiene llamador**: sin salida de la comarca (fase 34) no hay forastero que lo
use. Se deja dicho aquí y en `bugs.md`, no se declara como hecho.

## Reglas que cumple

- **Sin RNG.** Todo es función pura de dónde está cada uno y con quién habla;
  ni toca `forestRng` ni añade una bifurcación.
- **Ausente, no vacío, en el mundo clásico.** `Person.worldKnowledge` es un
  `declare` opcional: solo un mundo con globo lo crea, así que el estado
  persistido de toda semilla clásica es el de antes. Medido: la matriz
  `sim:check:all` da los mismos checks y los mismos fallos que antes del cambio,
  y `world-knowledge.test.ts` fija que `'worldKnowledge' in person` es falso.
- **El marco, no la geografía.** El motor suelta la geografía tras construir
  (`geographicStart = null`). Para saber en qué comarca está un tile guarda solo
  `Simulation.worldFrame` (origen, tamaño en comarcas y tamaño del globo); lo
  fija el constructor, y `WorldState.fromRestored` lo devuelve a un mundo
  restaurado.
- **Persistencia.** `WorldKnowledge` está registrada en los dos códecs
  (`EntityRecords`, `WorldObjectRecords`); `world-knowledge.test.ts` hace la
  ida y vuelta por checkpoint y por `PersonRecord`.

## Lo que no hace

- No hay «fauna vista» en la comarca: el plan de origen la nombra, pero
  ningún lector la usaría todavía. Un campo declarado e inerte es lo que
  `no-declared-but-inert-content` prohíbe; se añade cuando haya quien la lea.
- No hay migración ni exploración: eso es la fase 34.

---

# 31b — La vista: `WorldMapView`

`src/ui/WorldMapView.ts`. Un icono de globo (`◍`) abajo a la izquierda, sobre
la línea de ayuda, y la tecla `O`; en pantalla estrecha el mismo mando vive en
la fila de herramientas de la barra superior («Mundo»).

- **Lo que muestra.** Solo lo que *tu personaje* ha visto o le han contado,
  siempre por `Knowledge.ts` (`knowledgeOfWorld`). El globo es el del jugador
  aunque haya otra persona seleccionada: abrirlo sobre un extraño no tiene
  sentido, así que no hay ruta por la que leer el mapa de otro.
- **Tres estados.** *Vista*: color pleno, día en que se vio, pueblos
  encontrados con su nombre y cuándo. *De oídas*: color apagado y borde
  discontinuo (no solo color), «así estaba hace N días», sin pueblos.
  *Desconocida*: oscura, y la tarjeta no dice ni el terreno ni si es mar.
- **Dos niveles de zoom.** El mundo, en regiones (96×48), y una región, en
  sus comarcas (10×10). Un paso más es la comarca misma, que es el juego.
  «Mirar de cerca», doble toque, o la rueda; `←` / `Escape` vuelven. Una región
  sin nada conocido no se abre: no habría nada que dibujar y la tarjeta ya ha
  dicho por qué.
- **Reglas del proyecto que cumple.** `[hidden] { display: none; }` en
  `.worldmap`; un digest (`signature`) y el redibujo solo cuando cambia, de
  modo que el lienzo persistente nunca se reconstruye bajo el puntero; todo
  texto por `t()` con su español en `src/i18n/es/world.ts`; táctil desde el
  principio (eventos `pointer`, ninguna acción exige hover, botón de 40 px en
  móvil, `touch-action: manipulation`).
- **La caja del lienzo es el dibujo.** `cellAt` convierte el puntero en celda
  con el tamaño de la caja; un lienzo estirado por CSS enviaba el clic a otra
  celda. Se fija `aspect-ratio` y `max-width` desde el cuadrícula. Visto en la
  primera captura, no en un test.
- **Isla clásica.** No hay globo y lo dice («Esta es la isla clásica…»), en
  vez de un icono muerto: la regla de la casa es que lo que se rechaza se
  explica.

## Cómo se llega a un mundo con globo

`?world=random` (con `?seed=`) arranca sobre un globo aleatorio: `findGlobeStart`
(`WorldTerrain.ts`) busca, desde el centro del mapa hacia fuera y en orden
fijo, una región de país templado con tierra firme alrededor, y el mapa local
es de 4×4 comarcas. **No es el ajuste de partida**: «Mundo: una comarca / mapa
del mundo» es de la fase 33; hasta entonces el navegador es clásico por
defecto y esta URL es la única puerta, usada por `e2e/globe.spec.ts`.

## Verificación

- `e2e/globe.spec.ts` (3 pruebas, en `npm run e2e`): isla clásica con su mensaje
  y devolviendo el juego; globo aleatorio con región desconocida que no revela
  nada, región vista, zoom, comarca de oídas, comarca oscura dentro de una
  región conocida, `Escape` en dos tiempos sin abrir el menú de pausa y clic
  posterior que llega al juego; español.
- `globe-start.test.ts`: la salida es determinista, cae en terreno templado y
  el mundo poblado resultante sabe dónde está.
- Capturas: `artifacts/screenshots/m15-phase31-globe-2026-10-06/`.
- Móvil: una prueba con viewport de 390 px y toque emulado (`hasTouch`) abre
  el globo desde «Mundo», comprueba que cabe, elige una región con un toque y
  la abre con el segundo (capturas 05 y 06). Se vio así un tinte azul de
  selección del navegador sobre todo el lienzo; `user-select: none` lo quita.
- `smoke.spec.ts` esperaba cuatro herramientas móviles y ahora hay cinco: era la
  premisa del spec, no el juego (regla de `AGENTS.md`); actualizado y ampliado.
- **No verificado:** un dispositivo táctil real; solo emulación.
