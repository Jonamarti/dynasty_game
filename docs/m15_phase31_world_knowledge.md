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
