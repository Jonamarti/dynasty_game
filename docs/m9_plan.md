# Plan — Triaje de notes.txt y hoja de ruta del pase social e interfaz (M9)

## Contexto

M8.1 cerró el 2026-09-10 y `next-steps.md` da por siguiente a M8.2 (el Neolítico).
Pero `docs/notes.txt` acumula **13 apuntes del owner sin triar** — 8 de ellos
añadidos después del último triaje del 2026-09-09 — y casi todos son sobre lo
mismo: hablar, enseñar, elegir, y ver lo que hay en el suelo. Es decir, la capa
que el jugador toca, no el contenido.

El owner ha decidido que **el próximo hito es ese pase social y de interfaz**, por
delante del Neolítico, y que **esta sesión produce solo documentación**: triaje,
hoja de ruta y el plan del hito. Nada de código.

El resultado esperado: `notes.txt` vacío, cada apunte con destino y diagnóstico
verificado contra el código, un documento de hito ejecutable por fases, y
`next-steps.md` reordenado y corregido (hoy afirma cosas que el código no
sostiene).

Los documentos del proyecto se escriben **en inglés**, como todo el corpus
existente; este plan está en español porque es para el owner.

---

## Lo que la exploración confirmó, apunte por apunte

Cada línea de `notes.txt` fue verificada en el código. Esto es el material del
triaje, no una suposición.

| # | apunte | diagnóstico verificado |
|---|---|---|
| 1 | Con dos NPCs juntos solo ofrece uno | `candidatesAt` ([main.ts:582](src/main.ts#L582)) llama a `renderer.pickPerson` y hermanos, y todos son `findNearest` ([Renderer.ts:617-645](src/render/Renderer.ts#L617-L645)): **uno por tipo**. `SpatialHash.queryRadius` ([SpatialHash.ts:60](src/sim/core/SpatialHash.ts#L60)) ya existe y devuelve todos |
| 2 | Cultivar la relación con la tribu y el líder | `talk` se puntúa solo por soledad × regard × cercanía ([Brain.ts:433](src/sim/ai/Brain.ts#L433)). El único sesgo de grupo es `firstImpression`, estático: +18 casa, +6 banda, −6 fuera. Nadie *cultiva* un vínculo |
| 3 | El NPC controlado no bebe, come ni duerme solo | Deliberado: el jugador se puntúa pero no se dirige — `score()` en vez de `think()` ([Simulation.ts:1965-1974](src/sim/core/Simulation.ts#L1965-L1974)). Las necesidades sí le suben igual, así que puede morir de sed sin hacer nada |
| 4 | Pensar no es vagar | `ponder` exige una idea trabajable ([Brain.ts:900-911](src/sim/ai/Brain.ts#L900-L911)); sin idea, el cómodo cae a `wander` con score 0.02. Y las chispas salen de `tryConceive` ([KnowledgeSystem.ts:298-353](src/sim/systems/KnowledgeSystem.ts#L298-L353)), que **no mira si alguien ha estado pensando** |
| 5 | Modos de conversación | Es O1, ya diagnosticado: `TALK_TICKS = 45` sobre 240 ticks/día ([ActionSystem.ts:113](src/sim/systems/ActionSystem.ts#L113)) — cuatro horas y media por charla |
| 6 | Discutir y enseñar deberían dar relación | Confirmado: `doDiscuss` ([ActionSystem.ts:1902-1963](src/sim/systems/ActionSystem.ts#L1902-L1963)) **no toca ni relación ni `company`**. `doTeach` emite el deed `teach` (peso 7) pero tampoco toca `company` ni familiaridad. No hay "tipos de personalidad": hay `traits`, y el equivalente es `intelligence` |
| 7 | Palos, arcilla y sílex se confunden | Todo `ResourceNode` es **el mismo cuadrado**, escalado por `fullness`; solo cambia el color ([Renderer.ts:213-233](src/render/Renderer.ts#L213-L233), `RESOURCE_COLORS` [Renderer.ts:38-45](src/render/Renderer.ts#L38-L45)). `sticks` `#8b5a2b` y `clay` `#a97b5d` son los dos marrones — y los montones caídos son `#b08a52`, un tercer marrón |
| 8 | Dormir juntos acerca | `Building` no tiene ni ocupantes ni aforo. `NeedsSystem.shelterAt` comprueba contención por persona y por tick; nadie sabe quién comparte techo |
| 9 | Elegir cantidades | `handOver`, `storeItem`, `doStore`, `takeFromPile` y `drop` mueven la pila entera hasta donde quepa. `doTake` ([ActionSystem.ts:911-933](src/sim/systems/ActionSystem.ts#L911-L933)) coge **6 unidades fijas de un objeto que elige la simulación**. No hay ningún selector de cantidad en el juego |
| 10 | El menú debería anidar | `RadialMenu` es plano, un solo anillo ([RadialMenu.ts:53-109](src/ui/RadialMenu.ts#L53-L109)). `groundActions` mete **una opción por receta** ([ActionCatalog.ts:570-573](src/sim/ai/ActionCatalog.ts#L570-L573)). Y lo de "solo cordage" no es el menú: `personActions` solo considera **la idea actual** del actor ([ActionCatalog.ts:242](src/sim/ai/ActionCatalog.ts#L242)) |
| 11 | Pedir que te enseñen; ordenar enseñar | No existe verbo `ask`: enseñar solo lo inicia el maestro. `ORDER_COST` ([Authority.ts:47](src/sim/social/Authority.ts#L47)) es donde vive el coste de una orden |
| 12 | Guerra y esclavitud entre tribus | **No existe ningún estado entre bandas.** `Band` es id, nombre, `homeX/homeY`, `norms`, `chiefId`, `outcast` ([Simulation.ts:104-119](src/sim/core/Simulation.ts#L104-L119)). `BandSystem` es todo intra-banda. `steal` y `attack` ignoran la banda de la víctima |
| 13 | Ver y elegir qué coger de un montón | `ItemPile.label` ya existe y **nadie lo usa**: el picker dice "dropped goods" ([main.ts:721](src/main.ts#L721)) y el contenido solo aparece en el panel lateral tras seleccionar |

### Tres defectos nuevos encontrados de paso

1. **`give_item` elige al receptor solo y se come la negativa.** `handleItemAction`
   ([main.ts:400-405](src/main.ts#L400-L405)) coge al vecino más cercano sin
   preguntar, y aunque `Simulation.handOver` fija `lastRefusal` ("no puede cargar
   más"), esa rama nunca lo lee: dice "nobody to give it to" aunque sí hubiera
   alguien. Viola la regla permanente de que toda negativa llegue al jugador.
2. **`next-steps.md` afirma algo falso.** Dice que las bandas tienen "standing
   with each other" (sección de huecos abiertos, y O4 se apoya en ello). No lo
   tienen. O4 y O5 están planificados sobre una máquina que no existe.
3. **`NODE_LABELS` no está forzado por el compilador y `RESOURCE_COLORS` sí**
   — ya está en `bugs.md`, y el apunte 7 es la ocasión barata de cerrarlo.

---

## Entregable: seis ficheros, ningún cambio de código

### 1. `docs/m9_plan_words_and_hands.md` — nuevo

El plan del hito, con la estructura de `m8_plan_the_ages.md`: contexto, la
medición que ordena las fases, las fases con sus tablas, los mecanismos, los
gates y los riesgos. Seis fases:

**Fase 1 — Ver y señalar.** Apuntes 1, 7, 13. Cero cambios en la simulación, así
que `sim:check` debe quedar bit-idéntico y cualquier movimiento es un fallo.
- El picker plural: `candidatesAt` pasa a `queryRadius` + filtro `hitRadiusOf +
  GRAB_MARGIN`, ordenado por distancia, con tope (la columna del picker es DOM).
- Forma por tipo en `drawNode`: palos cruzados, sílex angular, arcilla montículo,
  juncos verticales, bayas puntos, pez cuña. `hitRadiusOf` vive al lado del
  dibujo justo para no divergir — se actualiza en el mismo commit.
- `ItemPile.label` al picker, etiqueta de contenido sobre los montones a pocos
  metros del personaje del jugador (no a cualquier distancia: eso es omnisciencia).
- De paso, `NODE_LABELS` tipado sobre `ResourceKind`.

**Fase 2 — Cantidades y destinatarios.** Apunte 9 y el defecto de `give_item`.
- Un selector de cantidad reutilizando `src/ui/SliderRow.ts`, que ya existe.
- `handOver` y `storeItem` aceptan un `count` como `drop` ya hace; `doTake` deja
  de coger 6 de lo que le apetezca y recibe objeto y cantidad de la orden.
- Dar pasa a elegir destinatario, y la rama lee `lastRefusal`.

**Fase 3 — Menús que anidan, y pedir.** Apuntes 10 y 11.
- `ActionOption` gana `children`; `RadialMenu` gana una pila de páginas con vuelta
  atrás. "Make…" agrupa las recetas; "Discuss tech with…" agrupa **todas** las
  ideas trabajables, no solo la actual.
- Eso obliga a que la orden lleve el `tech` elegido, como ya lleva `recipe`:
  `doDiscuss` hoy la vuelve a deducir con `workableIdea`.
- Verbo `ask`, el espejo de `teach` iniciado por el alumno, con la aceptación
  atada a `opinion(maestro→alumno)`; y ordenar enseñar vía `Simulation.command`
  con su entrada en `ORDER_COST`. Toda negativa a `lastRefusal`.
- **Esto es transmisión**, y `next-steps.md` §0 dice que la transmisión es lo que
  frena el árbol: se mide con `sim:seeds --seeds 20`, no con una tirada.

**Fase 4 — Una conversación que valga la pena.** Apuntes 5, 6, 2, 8 — y cierra
O1, O2 y O3 del listado del owner.
- Modos de conversación en `SocialSystem.converse`, elegidos por `familiarity` y
  `lastContact`, que ya están en `Relationship`: saludo, charla, preguntar por
  intereses, conversación profunda. Coste y enfriamiento propios por modo.
- `doDiscuss` y `doTeach` pasan por un asentamiento social compartido: familiaridad
  y una **rebaja** de `company` — no a cero, que es lo que vale una conversación
  entera. Escalado por `traits.intelligence`, que es el "intelectual" real.
- Un término de vínculo en el scorer de `talk`/`give`: hacia la banda y con fuerza
  hacia el jefe, escalado por `traits.loyalty` e invertido por el agravio, con la
  misma cuenta que `considerRebellion` ya usa (`grievance * (1 - loyalty)`).
- Un pase nocturno que agrupa a los que duermen bajo el mismo techo y añade algo
  de familiaridad. Diario, no por tick, y con tope por edificio.

**Fase 5 — Pensar.** Apunte 4, y va **sola y la última** de las fases de
simulación, porque es la más arriesgada: compite por los ticks de la comida y
toca la concepción de ideas.
- Un verbo `reflect` disponible sin idea previa, cuando hay comodidad, no hay
  fatiga, no hay obra ni orden. La HUD debe decir "pensando", distinto de vagar.
- Alimenta la concepción por dos vías: como ingrediente `doing` de las chispas en
  `Synthesis.ts`, y como factor del `chance` de `tryConceive`.
- `AGENTS.md` ya avisa: subiendo su peso una vez, pensar pasó a ser la sexta
  actividad del mundo por delante de construir y dormir, "y eso no es una edad de
  piedra". Se mide contra `ai-uses-many-actions` y 20 semillas, y **no se toca
  `conceptionBase`**, que es la palanca equivocada de siempre.

**Fase 6 — Que el personaje se cuide solo.** Apunte 3. Independiente del resto.
- Tres estados visibles y conmutables: manual (lo de hoy), "atiende lo urgente"
  (el cerebro solo actúa con una necesidad crítica y sin orden pendiente), y
  automático. Una orden explícita nunca se pisa.
- Es un cambio en la rama de [Simulation.ts:1965-1974](src/sim/core/Simulation.ts#L1965-L1974)
  y un ajuste en `Settings`; el comentario que hay ahí ("se le puntúa pero no se
  le dirige: el humano decide si hacer caso") explica la decisión original y hay
  que sustituirlo por el porqué del cambio, no borrarlo.

**Y una sección de diseño para M10, no para M9:** el apunte 12. Se documenta
entero — standing entre bandas, territorio desde `homeX/homeY`, presión por
escasez, un organizador de partidas en `BandSystem.daily`, cautivos como estado
de `Person` — y se programa **después de M8.2**, con el argumento que el propio
plan ya usa para O4 y O5: hoy una banda posee un hoyo de almacenaje; después del
Neolítico posee campos, un rebaño y un horno, y entonces asaltar significa algo.
El owner lo dice igual: al principio cooperan porque sobra, luego no.

### 2. `docs/bugs.md`

Añadir, con el formato del fichero (real y reproducible, con su porqué):
- El picker singular y sus seis `findNearest`.
- `give_item`: receptor impuesto y `lastRefusal` descartado.
- `doTake`: seis unidades fijas de un objeto que elige la simulación.
- Los tres marrones del mapa, y el cuadrado único de `drawNode`.
- `doDiscuss` no toca ninguna relación — hueco de diseño, no defecto.
- Sin registro de quién duerme bajo qué techo.
- `ponder` exige idea previa, así que el cómodo sin idea vaga.
- No existe estado alguno entre bandas, contra lo que `next-steps.md` afirma.

### 3. `docs/next-steps.md`

- La tabla de hitos: **M9 pasa a "next"**, M8.2 detrás, M10 (las tribus) después
  de M8.2, M7 sigue aterrizando solo.
- Corregir la línea falsa sobre el standing entre bandas, diciendo qué se
  comprobó y cuándo — la casa acostumbra a dejar dicho por qué.
- O1, O2 y O3 dejan de ser lista suelta: apuntan a las fases de M9. O4 y O5
  apuntan a M10.
- N3 (curiosidad como cuarto canal de transmisión) se funde con la fase 3, que es
  el mismo canal por el otro lado.
- Una sección 7c con el triaje de los trece apuntes y su destino.

### 4. `docs/notes.txt`

Vaciado. Los trece tienen destino.

### 5. `docs/changelog.md`

Entrada del 2026-09-10 con el pase de triaje: qué se verificó en el código, los
tres defectos nuevos, y por qué el orden del hito es este y no otro.

### 6. `docs/README.md`

La tabla de documentos gana la fila del plan de M9.

---

## Verificación

Es un pase de documentación, así que no hay nada que medir en el mundo — y eso
mismo es lo que hay que demostrar:

1. `npm run typecheck && npm test` — sin tocar código, deben pasar igual; sirve
   de línea base para quien ejecute M9.
2. `npm run sim:check` — anotar los números actuales (36/36 aplicables, 3.836
   pasos/s) **dentro del plan de M9**, para que la fase 1 tenga contra qué
   comparar su promesa de ser bit-idéntica.
3. Cada referencia `fichero:línea` del documento nuevo se comprueba una a una
   antes de cerrar: las de este plan salen de una lectura del 2026-09-10 y el
   propio `m8_plan_the_ages.md` fecha las suyas por la misma razón.
4. `grep` final sobre `notes.txt` para confirmar que está vacío y que los trece
   apuntes aparecen citados en `bugs.md` o en un plan.
