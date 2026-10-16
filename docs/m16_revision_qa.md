# Dynasty — M16: revisión crítica del plan (QA)

Fecha: 2026-10-05. Texto revisado: `plan/historico/m16_plan_v1.md`.
Resultado: `plan/m16_plan.md` (versión 2), que incorpora todo lo marcado como
"adoptado".

La revisión se hizo contra el código de `master` en `cf903f7`, no solo contra
el texto. Cada hallazgo dice qué se comprobó.

## Veredicto

La versión 1 no era ejecutable tal cual. Tenía cinco fallos que habrían roto
el trabajo a mitad de camino, y la mitad final del plan eran títulos sin
pasos. Hay 36 hallazgos: 8 bloqueantes, 14 altos, 10 medios y 4 bajos.

## Bloqueantes

| # | Hallazgo | Comprobado en | Adoptado en la versión 2 |
|---|---|---|---|
| 1 | **Las lecciones no caben en `Beliefs`.** El almacén tiene 48 entradas y expulsa la más débil. Añadir penurias, remedios y amenazas por banda desalojaría las creencias de comida y rendimiento que ya se usan. | `ai/Beliefs.ts`: `BELIEF_CAPACITY = 48` | Almacén propio (`ai/Lessons.ts`); `Beliefs` no se toca (fase 4.1) |
| 2 | **Cada interruptor nuevo invalida todos los mundos guardados.** El checkpoint rechaza una configuración con campos de más o de menos. La versión 1 añadía un campo por fase y a la vez apoyaba las pruebas en mundos guardados. | `persistence/CheckpointRecords.ts`: "unknown or missing fields" | Mundos de partida con receta y clave de caché que incluye el esquema; se regeneran solos (fase 1.4). Un interruptor por bloque, no por fase |
| 3 | **Estado nuevo que no se guarda.** Las personas se serializan como grafo con clases registradas. Una clase nueva en `Person` sin registrar se pierde o falla al cargar, y con ella la agenda. Además, el cargador avisa de que recalcular cachés antes de la siguiente frontera diaria cambia la simulación. | `persistence/EntityRecords.ts` (`constructorEntries`); `docs/m15_phase28_loader.md` | Regla del protocolo: toda clase nueva se registra y lleva prueba de ida y vuelta; los valores diarios se guardan, no se recalculan al cargar |
| 4 | **"Retirar `planBuildings`" dejaba edificios que nadie construiría jamás.** El planificador no pide solo techo y almacén: también hogar, puestos de trabajo, montón de compost, campo, trampa, cercado y pozo. La versión 1 decía "y luego el resto" sin remedio para ninguno. Este proyecto ya tuvo ese fallo (la casa larga y el granero). | `BandSystem.planBuildings`, nueve ramas `wanted =` | Inventario explícito, retirada en dos tiempos (4.6 y 6.7) y prueba `every-design-has-a-proposer` |
| 5 | **La vista previa de "usar autoridad" es imposible con una tirada al azar.** Las órdenes actuales se resuelven con un sorteo de obediencia. No se puede enseñar "quién aceptaría" si luego se tira un dado. | `Simulation.command` ("compliance draw") | En asamblea la respuesta es determinista, por umbral. Decisión D-1 para el autor |
| 6 | **Puertas medidas sobre un mundo que ya está muerto.** `lean` tiene un 4 % de supervivencia y 20/20 colapsos; la matriz tiene 108 fallos. "Más techo que apagado a 20 semillas" no mide nada ahí, y un mundo `tras_primer_invierno` necesita que alguien sobreviva al primer invierno sin saber nada. | `bugs.md`, "M15 equipamiento" | Puertas por contador de mecanismo y semillas pareadas, sobre un mundo normal; la receta del mundo de partida falla en alto si la población no llega al mínimo |
| 7 | **Se duplicaban mecanismos que ya existen.** Ya hay voto para mudar el campamento, partidas de incursión con instigador, sometimiento y tributo, guerra y paz, y persuasión uno a uno. La versión 1 creaba una asamblea y unas "respuestas a la desventaja" al lado, sin tocarlos. | `BandSystem`: `considerRelocation`, `considerRaid`, `considerNeedRaid`, `considerStance`, `considerSubmission` | Fase 5.0 de inventario; la asamblea sustituye el paso de reunir y votar de esos mecanismos (5.7); las respuestas alimentan los decisores existentes (7.3) |
| 8 | **Los bloques V a IX eran una lista de títulos.** Un modelo menos capaz habría inventado el diseño. | lectura | Todas las fases con pasos, pruebas, valores iniciales y criterio de hecho |

## Altos

| # | Hallazgo | Comprobado en | Adoptado |
|---|---|---|---|
| 9 | **Umbrales sin valor.** "Supera un umbral", "con coste de relación": el ejecutor pondría números al azar y luego los afinaría para aprobar. | lectura | Valor inicial para cada constante, en `Config`, con la nota "no ajustar hasta el bloque 10" |
| 10 | **Sin prueba de que apagado es igual que antes.** Es la única garantía de que una fase no rompe lo que ya había. | lectura | Regla: con el interruptor apagado, tres semillas dan el mismo checkpoint que la línea base |
| 11 | **Ya existe una memoria de penuria.** `Person.chronic` acumula presión crónica por impulso y la usa la mudanza de campamento. La versión 1 creaba otra. | `entities/Person.ts`, `BandSystem.considerRelocation` | La penuria por estación se calcula a partir de `chronic` (4.1) |
| 12 | **Sustituir escenarios rompe la línea base.** Cambiar un escenario por su variante corta hace incomparable el antes y el después. | lectura | Las variantes se añaden al lado; los originales se conservan como nivel completo hasta el cierre |
| 13 | **`Brain.ts` (4.500 líneas) lo tocan casi todas las fases.** Con varios agentes a la vez, conflictos seguros; y cada acción puntuable nueva cambia todos los mundos. | `ai/Brain.ts`; `bugs.md`, "Two single-seed checks flip when `sabotage` is added" | Lógica en módulos nuevos, `Brain` solo recibe ganchos; carriles de trabajo en paralelo definidos |
| 14 | **Coste de rendimiento sin presupuesto.** Un paso cuesta 20,8 ms con 300 personas y `Brain.score` es lo más caro; el LOD no existe. | `bugs.md`, "Sueño animal pendiente y costes con 300 humanos" | Tope del 10 % por bloque medido con `profile:systems`; lo diario se calcula una vez al día |
| 15 | **Construir sobre creencias ya costó caro una vez.** Elegir según creencias de rendimiento bajó `lean` unos 14 puntos, y la ruta de sed 32. | `bugs.md`, "M15 fase 2a"; `next-steps.md`, "M15 fase 2f" | Riesgo anotado; ensayo de viabilidad barato antes de invertir (4.0) |
| 16 | **La pantalla de la asamblea lee la mente de extraños.** Enseñar la postura y el motivo de cada oyente incumple la regla de no leer el estado privado de quien no se conoce. | `AGENTS.md`; `social/Knowledge.ts` | El motivo solo se ve de quien se conoce lo bastante; del resto, solo la reacción visible (5.6) |
| 17 | **"Ninguna necesidad interrumpe" choca con una regla del proyecto** (toda acción larga comprueba interrupciones) y dejaba sin definir lo que sí debe parar: manos llenas, recurso agotado, suelo que cede. | `AGENTS.md`; `ActionSystem` (motivos de parada) | Se exime solo de las necesidades y solo al jugador en "Tú diriges"; los impedimentos físicos siguen parando (3.1) |
| 18 | **El aviso de ataque puede hacer daño.** Parpadeo rojo a pantalla completa y vibración sin opción de reducirlos. No hay ningún ajuste de movimiento en el juego. | `ui/Settings.ts` | Pulso lento, tope de frecuencia y opción "Reducir destellos y vibración" (3.2) |
| 19 | **La red ya enseña las rutas.** Un nodo con sus requisitos cumplidos muestra su nombre y qué ingredientes faltan. "Señales de cercanía" ya existe en parte, y el descubrimiento no está oculto como suponía el diseño. | `ui/TechWeb.ts`: estados `understood` y `conceivable` | Fase 8.0: decidir qué enseña la red antes de construir nada encima. Decisión D-4 |
| 20 | **Experimentar se puede forzar por fuerza bruta.** Si cada intento da una pista del ingrediente que falta, repetir la acción revela todas las recetas: es el cuaderno que el autor descartó. | diseño | Pista vaga, una por técnica y día, coste de tiempo y material (8.1) |
| 21 | **Los NPC experimentadores serían adivinos.** Para "ir a por el ingrediente que falta" tendrían que leer la tabla oculta de rutas. | diseño | Prueban con lo que conocen y no han probado; no leen la tabla (8.2) |
| 22 | **La habilidad como llave puede dejar al mundo sin casas.** Si cada trabajador necesita el nivel, o si nada sin llave entrena esa habilidad, nadie construye; y la banda que pierde a sus constructores ya no se recupera hoy. | `bugs.md`, "Winter still kills the unlucky" y "The longhouse was never buildable" | Basta un maestro presente; quien ayuda aprende; prueba `every-gate-is-reachable`. Decisión D-2 |

## Medios

| # | Hallazgo | Adoptado |
|---|---|---|
| 23 | Demasiados interruptores: 25 combinaciones imposibles de probar | Uno por bloque (cinco), con orden de encendido y decisión final de cada uno en 10.5 |
| 24 | Sin línea de corte: 45 fases para "una beta" | Tres tramos; el primero ya es una beta jugable |
| 25 | El histórico para el blog se dejaba para el final, cuando ya se ha olvidado | Diario de fase obligatorio (`docs/m16_diario.md`) con antes y después |
| 26 | Faltaban el idioma y el "di por qué": todo texto nuevo pasa por `t()` con su español, y toda negativa se explica | En el protocolo |
| 27 | Modos de partida: cambiar la población por defecto movería todos los mundos de prueba (un solo flujo reparte recursos, manadas y personas) | Los modos son configuraciones nuevas de partida; la de las pruebas no se toca (9.2) |
| 28 | Los modos duros dependen de un fallo antiguo: quien se casa fuera nunca cambia de banda | 9.1 va antes que los modos y lleva decisión D-5 |
| 29 | "Sentarse delante" no tiene dibujo: no hay pose de sentado y el arte se genera con su propia prueba | Se usa la pose de descanso; la pose nueva queda como tarea de arte aparte |
| 30 | Las pruebas "acude más de la mitad" son estadísticas y fallarán a ratos | Pruebas de mecanismo en mundos montados a mano, sin azar; las proporciones solo como informe |
| 31 | El triaje se copiaba a mano entre dos ficheros | Un solo fichero en el repo tras 0.2 |
| 32 | Dependencias con M15 dadas por supuestas ("un par de días" no dice qué fases entran) | 0.1 anota qué fases de M15 entraron y reescribe la tabla; cada fase dependiente tiene su rama "si no existe" |

## Bajos

| # | Hallazgo | Adoptado |
|---|---|---|
| 33 | `AGENTS.md` exige prefijo `m15:` en los commits | 0.4 lo cambia a `m16:` |
| 34 | "Adolescente" no existe como etapa con ese nombre | 4.4 lo define con las edades que ya usa el código y manda comprobarlas |
| 35 | Guardar para el invierno sin deterioro de comida: acumular no tiene coste | Anotado; secar y ahumar esperan a la fase 15 de M15 |
| 36 | El plan no decía qué hacer si algo no coincide con el código | Regla de parada: no inventar, anotar en `docs/m16_dudas.md` y seguir con otra fase |

## Lo que la revisión no pudo comprobar

- **Tiempos reales.** No se pudieron instalar las dependencias en esta
  sesión; ningún comando se ha ejecutado. Los repartos van por pasos.
- **El estado al cerrar M15.** Todo se revisó en `cf903f7`.
- **Nombres exactos de funciones** en zonas no leídas (`ActionSystem` casi
  entero, `KnowledgeSystem`, `Hud`). El plan manda comprobarlos con `grep`
  antes de editar.
- **Que el ensayo de viabilidad salga bien.** Si con el planificador apagado
  las bandas se extinguen casi siempre, el bloque 4 necesita rediseño antes
  de seguir; el plan lo trata como puerta, no como trámite.

## Decisiones que la revisión deja al autor

Están en la fase 0.3 del plan, cada una con su propuesta por defecto.

---

# Segunda revisión (2026-10-13)

Texto revisado: `docs/m16_plan.md` (versión 2 más la Parte D del 11-10) y
`docs/m16_bugs.md`, contra `master` en `b88309f` (`0.15.138-alpha`) y contra
`notes_for_m15.txt` con las notas añadidas hasta hoy. Se leyó código; no se
ejecutó nada (la instrucción de M15 sobre verificación pesada sigue vigente).
Lo adoptado ya está en el plan y en el triaje.

## Veredicto

La Parte D reparte bien las funcionalidades, pero varios agentes no podían
ejecutarla a la vez: no decía cómo se fusiona, dejaba fuera de los ficheros
compartidos los cuatro más grandes, y chocaba con dos reglas de `AGENTS.md`
(versión y changelog en cada commit). El triaje se había quedado en el 05-10:
unas 1.450 líneas nuevas de `bugs.md` sin triar, entre ellas un bloqueante de
la fase 1.4. Y leyendo el código salen causas concretas para varias notas que
el plan trataba como «sin reproducir», más ocho fallos que no estaban en
ningún documento. 28 hallazgos: 4 bloqueantes, 11 altos, 9 medios y 4 bajos.

## Bloqueantes

| # | Hallazgo | Comprobado en | Adoptado |
|---|---|---|---|
| 37 | **La fusión no tenía protocolo.** Nueve carriles, una rama cada uno, y nada sobre a dónde se fusiona, en qué orden ni quién fija la línea base. `fixtures/switches-off.json` es un solo fichero que toda fase que cambia el mundo regenera: sin orden, cada fusión invalida la huella de las demás y no se sabe a quién atribuir un cambio | lectura del plan | D7: rama de integración, orden de fusión (primero lo que no cambia el mundo, luego de una en una con `baseline:pin`), cola en `docs/m16_cola.md` |
| 38 | **La versión y el changelog se editan en cada commit** (`AGENTS.md`). Con carriles en paralelo, conflicto seguro en cada fusión | `AGENTS.md`, «Versioning» | D-20: fragmentos en `docs/changelog.d/` y versión subida por quien integra. Necesita el sí del autor (cambia una regla de `AGENTS.md`) |
| 39 | **Mundos de partida imposibles con `hearths`.** La receta `banda_con_refugio` arranca de un escenario cuyo `setup` mete claves que el codec de checkpoint rechaza | `bugs.md`, «M15 fase 29c», auditoría del 06-10 | «Cuidado» en 1.4: comprobar `toCheckpointRecord` sobre cada escenario antes de escribir las recetas |
| 40 | **El triaje no cubría nada posterior al 05-10.** 0.2 lo dejaba para el ejecutor («recorre los apartados con fecha posterior»), que es justo el trabajo largo que un agente hace mal con prisa | `git diff cf903f7 HEAD -- docs/bugs.md` (+1.454 líneas) | `m16_bugs.md` §9: 23 entradas E con etiqueta, carril y fase; cifras de calibración vigentes |

## Altos

| # | Hallazgo | Comprobado en | Adoptado |
|---|---|---|---|
| 41 | **Los ficheros calientes no estaban en la lista de compartidos.** `Simulation.ts` (7.419 líneas), `ActionSystem.ts` (7.246), `main.ts` y `Renderer.ts` no figuraban; `Brain.ts` solo se ofrecía a CEREBRO, pero 6.3 (CARGA), 6.5 (OBRAS) y 2.14 (FAUNA) necesitan puntuar | `wc -l`; Parte D | R25 y la tabla de secciones de D7; `BrainHooks` y `VerbRegistry` creados vacíos en 0.5 |
| 42 | **Bordes del mapa que son orilla.** `isShore` trata fuera de límites como agua: todas las casillas del perímetro están en `shoreTiles`; se cava barro en el borde; un pozo «toca el agua» en el borde. Solo había un aviso del 08-10 sin seguir a los consumidores | `World.isShore`, `findShores`, `Earth.isWetSubsoil`, `Simulation.touchesShore` | K1; 2.19 con el predicado `outsideIsSea`, isla clásica bit a bit igual |
| 43 | **Orillas de agua dulce fantasma.** `hasWaterOfKind` indexa sin comprobar límites; en mapas, el borde este «ve» el agua del borde oeste una fila más abajo. Candidata directa a N44 (bucle de buscar agua) | `World.hasWaterOfKind`, `World.index` | K2; 2.17 no escribe conducta nueva hasta descartarlo |
| 44 | **N46 tiene causa visible.** `candidatesAt` devuelve «suelo» en cualquier clic sobre agua antes de mirar personas, y redondea distinto que `World` | `main.ts` | 2.23 |
| 45 | **N16 y N40 son, casi seguro, uno.** `doBuild` abandona con `site_needs_materials` si el trabajador no lleva nada útil; no hay rama de ir a buscar. La hoguera pide palos y sílex | `ActionSystem.doBuild`, `BUILDINGS.hearth` | §1d y 2.15 |
| 46 | **N8 tiene causa visible** y otra al lado: límite por objeto del hatillo = 1, menú que pregunta por la cuenta agregada, y `takeFromPile` que corta con `break` | `Carry.itemCapacityFor`, `ActionCatalog`, `Simulation.takeFromPile` | §1d; K3, K4; 2.4 |
| 47 | **N12 ya estaba documentado como «dejado a propósito»** (`FogReveal`), y el plan lo atribuía a `PlaceMemory` | `bugs.md`, «M15 paso 0 (D)» | 2.3 corregida; D-17 |
| 48 | **Bebés que se visten.** Las puertas de vestir comparan la edad en días con 1 | `Brain.ts` (3 sitios), `ToolEquipment.ts` | E9; 2.27; D-18 |
| 49 | **Peticiones del autor sin fase:** peces proporcionales al agua, marisqueo y caña, bioma de desierto, agua en el desierto (08-10), y materiales de prototipo fieles a la historia (32c) | `next-steps.md`, `bugs.md` | 15.3 y 16.4 |
| 50 | **Sin regla de migración de `Config`.** Cada interruptor nuevo es una clave nueva y rompe los guardados del jugador; el plan solo protegía los mundos de prueba | `bugs.md`, «lo que sigue cuadrático», punto 5 | R23 |
| 51 | **Línea base mal descrita.** R21 hablaba de «108 fallos de matriz»; hoy hay cinco fallos unitarios conocidos y cuatro checks rojos en `band` que un agente tomaría por regresiones suyas | `bugs.md`, entradas del 13-10 | R21 reescrita; E12, E13; 2.28 |

## Medios

| # | Hallazgo | Adoptado |
|---|---|---|
| 52 | Seis verbos sin etiqueta salen en inglés (`propose` entre ellos), y `t(variable)` escapa al test de idioma | K5; prueba `m16-every-verb-has-a-label` |
| 53 | Muebles y estaciones con banderín de banda (N45); no existe la clase «mueble de exterior» | 2.22; D-16 |
| 54 | 12.1 añadía `weight` a cada fila de `ITEMS`: conflicto seguro con TECNICA y MUNDO, que añaden filas | tabla aparte `ItemWeights.ts` |
| 55 | Dos agentes no pueden correr e2e a la vez en el mismo puerto; y en M15 los worktrees se quedaron sin dependencias y usaron las del checkout principal | puertos por carril (R26) y `npm ci` por worktree (D7) |
| 56 | Dos cohortes a la vez en la misma máquina se estorban (y `perf-budget` es de reloj) | R27, cola |
| 57 | 16.2 y 17.1 se escribieron como si curar y huir no existieran; ya existen en parte (milenrama en `tend`, `fleeX`) | punto de partida en cada fase |
| 58 | La isla clásica es mar en el borde y el resto de mundos no: una regla global sobre `biomeAt` movería todas las semillas | explicado en §10 de `m16_bugs.md` |
| 59 | El orden de olas no tenía camino crítico; CEREBRO lo es | D5 |
| 60 | La forma posicional de `sim:seeds` es la que escondió el fallo T8 | A6 usa banderas |

## Bajos

| # | Hallazgo | Adoptado |
|---|---|---|
| 61 | Rutas `plan/…` y `diseno/…` que no existen en el repositorio | cabecera corregida; los dos documentos de diseño, si existen, van a `docs/` |
| 62 | El plan llamaba «beta» al final del tramo 1, contra la regla de versiones | A1, A2 |
| 63 | D-7 seguía abierta aunque M15 ya trae migración real | resuelta en D3 |
| 64 | `Hearth` y `Fireplace` se traducen ambos con «Hogar…»; renombrar solo uno deja el otro raro | D-11 ampliada en §1d |

## Lo que esta revisión no pudo comprobar

- **Nada se ejecutó.** Todas las causas de §1d y §10 de `m16_bugs.md` son
  lectura; la ola 1 (pruebas de funcionalidad) confirma o tumba cada una.
- **N36:** la hipótesis de `initialGeographicStart` necesita seguir el camino
  de la exploración; hay varias reinstalaciones del hogar con el inicio
  anterior que pueden ser o no la causa.
- **N20** (objetos que desaparecen al recoger): `takeFromPile` parece
  conservativo; la pérdida puede estar en el reajuste de carga posterior o en
  la ruta de recogida de `ActionSystem`. La prueba de conservación decide.
- **N39:** sin semilla, sigue sin causa.
- **El estado de cierre de M15:** la tabla de 0.1 se rellenó con lo leído el
  13-10, y M15 sigue abierto.
