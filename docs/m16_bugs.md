# Dynasty — M16: triaje de fallos, pendientes y notas

> **2026-10-16.** El plan vigente es [m16/README.md](m16/README.md), con una
> ficha por fase en `m16/phases/` (los números de fase de esta tabla siguen
> valiendo). Las menciones a `m16_plan.md` (Parte D, sección D3) y a
> `m16_revision_qa.md` apuntan a borradores retirados, guardados en git en
> `99a2ec5`; las decisiones D-x ya resueltas están en la sección 2 del README.

Fecha: 2026-10-05. Hecho sobre `master` en `cf903f7`. **Se repasa en la fase
0.2**, cuando cierre M15: lo que aquí figura como abierto puede estar ya
resuelto, y habrá entradas nuevas.

Fuentes recorridas enteras: `docs/bugs.md` (4.043 líneas, 120 apartados),
`docs/next-steps.md` (1.518 líneas) y `notes_for_m15.txt` (11 notas, la copia
subida por el autor el 2026-10-05; la de GitHub solo tiene las 3 primeras).

**2026-10-11:** la sección 1b añade las notas N12 a N44 (notas posteriores al
plan) y la sección 8 las pruebas de funcionalidad con que se verifican o
cierran. Los carriles de trabajo para agentes en paralelo están en la
Parte D de `m16_plan.md`.

**2026-10-13 (revisión crítica, sobre `master` en `b88309f`, `0.15.138-alpha`):**
- sección **1c**: notas nuevas N45 y N46, y la N39 ampliada por el autor;
- sección **1d**: causas **leídas en el código** (no reproducidas) que
  sustituyen a la «causa probable» de 1b donde la contradicen o la concretan;
- sección **9**: entradas de `bugs.md`, `next-steps.md` y `m16_notes.md`
  posteriores al triaje del 05-10 (unas 1.450 líneas que nadie había triado);
- sección **10**: fallos nuevos encontrados leyendo el código;
- sección **11**: pruebas de funcionalidad añadidas para lo anterior.

La crítica que lo motiva está en `m16_revision_qa.md`, «Segunda revisión».
La fase 0.2 del plan sigue siendo obligatoria: lo de aquí está leído, no
reproducido.

## Cómo leer esta tabla

| Etiqueta | Significa | Se trata en |
|---|---|---|
| **A** | fallo de corrección, independiente de lo nuevo | Bloque 2 (o Bloque 1 si es de herramientas de prueba) |
| **B** | lo resuelve una funcionalidad de M16 | la fase indicada; no se arregla aparte |
| **C** | balance o calibración | Bloque 10 |
| **D** | fuera de M16: depende de M15, es decisión de diseño aparte, o no compensa | se deja anotado |
| **V** | hay que verificar si sigue vigente | fase 0.2 |

"Dónde" cita el título del apartado de `bugs.md` para buscarlo con `grep`.
Los números de línea cambian; no te fíes de ellos.

## 1. Notas del autor (`notes_for_m15.txt`)

| ID | Nota (resumida) | Etiqueta | Fase |
|---|---|---|---|
| N1 | Reunir a los que oyen y quieran hacer caso para enseñar una técnica a varios; se sientan delante | B | 5.2, 5.5 |
| N2 | En un ataque, volver a casa pesa menos que no abandonar a los compañeros; si huyen, desánimo y retirada | B | 7.1 |
| N3 | Emigrar sin consenso: con todos, con unos pocos o solo; menú de qué llevarse | B | 5.8 |
| N4 | La zanja influye en el camino como el río o la colina: rodear o cruzar; si es muy empinada, cavar para allanar (cuesta mucho más) | B | 6.6 |
| N5 | Para construir hay que quitar antes árboles, piedras grandes y cultivos del solar | B | 6.1 |
| N6 | Los edificios planeados no deben verse en la niebla; un edificio recordado que ya no existe se sigue viendo aunque se haya visto que no está; revisar otras entidades | A | 2.3 |
| N7 | La imagen del edificio con tejado y sin tejado no encaja (las paredes no coinciden; la vista con tejado parece horizontal y no oblicua) | A | 2.6 |
| N8 | La ropa, el hatillo, etc. tienen que equiparse. Error "manos llenas" al recoger un hatillo con las manos vacías y otro hatillo en el inventario | A + B | Cerrado en 2.4 (motivo real: ya hay un hatillo en el hombro); 6.3 (equipar) |
| N9 | ¿Los edificios planeados se cancelan solos, o los cancelan otros NPC? | A | 2.2 (respuesta abajo; obras del jugador protegidas en M15, verificar la regresión) |
| N10 | El nivel de habilidad permite o bloquea edificios y tareas; hay que practicar; la división del trabajo sale de la destreza natural y de la práctica | B | 6.5 |
| N11 | Los NPC ven el hatillo y no lo usan ni lo investigan. Quien conoce la técnica lo coge y se lo equipa; quien no, lo investiga y hace ingeniería inversa poco a poco. También con objetos de otra tribu | B | 6.3, 6.4 |

**Respuesta a N9 (verificada en 2026-10-18, M16 2.2).** Una obra NPC sin
progreso ni materiales durante seis días se retira por el planificador; deja un
aviso en el lugar y una entrada en la crónica de quien la propuso. Una obra
marcada por el jugador (`playerPlaced`) no se retira automáticamente. La prueba
`m16-player-sites-not-dropped` avanzó diez días: la obra del jugador siguió en
pie, la obra NPC desapareció con el motivo y sus tres palos entregados quedaron
en un montón del suelo. Esto ya estaba corregido en M15; no se cambió código.

**N8 verificado en M16 2.4.** `m16-pickup-second-bundle` confirma que con un
hatillo en el inventario y otro en el suelo, la acción no dice «manos llenas»:
la negativa explica que ya hay uno en el hombro. El menú consulta el mismo
motivo por objeto. No se permite llevar un segundo hatillo.

## 1b. Notas posteriores al plan (`notes_for_m15.txt`, "NUEVAS NOTAS TRAS PLAN M16")

Añadido el 2026-10-11. Numeradas N12 a N44 por orden de aparición en el
fichero (las 33 líneas bajo ese encabezado). Etiquetas como en la tabla de
arriba, más **F** = funcionalidad nueva que el plan aún no tenía, y
**P** = hay que escribir primero una prueba de funcionalidad (ver sección 8):
puede estar ya corregido, y no se cierra sin mirar.

"Carril" es el carril de trabajo de la Parte D de `m16_plan.md`. "Causa
probable" es lectura de código sin reproducir: no es un hecho hasta que la
prueba falle.

### Fallos (A / P)

| ID | Nota (resumida) | Et. | Causa probable | Carril | Fase |
|---|---|---|---|---|---|
| N12 | La memoria del mapa fuera del círculo de visión no se actualiza bien: hay trozos recordados y otros negros, quizá donde el NPC actuó | A, P | Se recuerda lo que `observePlaces` toca al actuar, no lo visto al pasar. Comprobar si la memoria de casillas se escribe solo desde acciones | Percepción | 2.3 (se amplía) |
| N16 | Trabajar en construir el hogar no avanza: se queda en 0 % | A, P | M16 2.15 comprobó la hoguera con materiales en el suelo: reúne lo que falta, reanuda y llega al 100 % con progreso monótono | Obras | cerrado 2.15 |
| N18 | No se puede equipar armadura de piel; la bolsa de piel se equipa sola en la cadera y no se puede quitar | A, P | `equipContainer` coloca por `container.slot`; el desequipado del jugador y la armadura (`armourOf`) pueden no tener ruta desde la pestaña de equipo (6.3 paso 2) | Capacidad y equipo | 2.16 |
| N20 | Con hatillo y bolsa de piel equipados el inventario dice que hay hueco, el personaje "recoge", y el objeto desaparece del mundo y no aparece | A, P | La prueba `m16-pickup-conserves-items` verifica suelo + inventario antes = después para todos los objetos de tipo contenedor o equipo; pasa en la ruta existente. El reporte no se reprodujo y la causa queda desconocida | Capacidad y equipo | verificado, sin cambio de juego en 2.4 |
| N21 | Mucha hambre, nada de comida alrededor, y no busca más lejos | A, P | M15 corrigió elecciones de comida accesible y el primer paso de exploración; sigue abierta la búsqueda sin fuente alcanzable (véase la medición del 15-10 en `bugs.md`) | IA | 2.17 |
| N32 | No se distingue qué casillas de orilla dan barro; el menú dice "cavar aquí" / "cavar barro de la orilla" sin que se vea el yacimiento | A | Falta una capa visual o un motivo (R6) que diga por qué esa casilla sí/no | Interfaz | 2.18 |
| N34 | Al llegar al borde del mapa sale "el agua era demasiado profunda para nadar" | A, P | **Reproducido y cerrado en 2.19:** el mapa no considera agua fuera de sus límites; la isla clásica sí conserva el mar exterior | Mundo | cerrado 2.19 |
| N36 | Tras explorar al este, el árbol de tribu y de familia salen vacíos ("todos muertos"); el río generado en la comarca nueva hace que la vuelta diga "la comarca vecina está bajo el mar" | A, P | **No se reprodujo en 2.19:** la prueba de viaje al este y vuelta confirma identidad activa y personas vivas en ambos árboles; ya corregido en M15 (`124c0a7`), sin cambio de código | Mundo | verificado M15, cerrado 2.19 |
| N38 | No se puede quitar ni usar la cama; la eligen los NPC | A | Falta ruta de jugador para `bedding` (usar / quitar) | Obras | 2.20 |
| N39 | La primera noche el suelo cambia de color y la segunda vuelve; en algunas partidas, pasado el segundo día aparece mucha agua que sustituye tierra por río y deja atrapados a personas y animales | A, P | Color: probable capa de iluminación nocturna aplicada al terreno. Agua: sospechoso el relleno por inundación (`World.FLOOD_LIMIT`, zanjas y pozos) o el generador de ríos (M15 fases 29–31). Hace falta semilla que lo reproduzca | Mundo | 2.21 |
| N40 | «Trabajar en…» una obra a la que faltan materiales: el NPC debería ir a buscarlos y apilarlos, y solo entonces construir | A, P | M16 2.15 añadió cobertura del NPC y del personaje jugador dirigido; este conserva la orden explícita durante la recogida y la entrega | Obras | cerrado 2.15 |
| N44 | En una zona con agua donde se camina entre dos masas grandes, la tribu entra en un ciclo "sin nada que hacer" / "buscando agua" hasta morir | A, P | Búsqueda de agua restringida al agua alcanzable a pie; sin ruta, no hay alternativa ni aviso. Reproducir con un mapa fijo | IA | 2.17 |

### Funcionalidades nuevas (F)

| ID | Nota (resumida) | Carril | Fase |
|---|---|---|---|
| N13 | Agrupar las acciones de pensar… en otro submenú | Interfaz | 11.2 |
| N14 | Muchos materiales quedan en el suelo sin guardarse en el silo cercano; por personalidad (ordenados) o ánimo (malestar por el desorden) | IA | 6.2 (se amplía) |
| N15 | Una banda ajena empieza una obra: además de colaborar, poder atacarla/destruirla y robar los materiales llevados | Bandas | 7.6 |
| N17 | Poner en cola varias acciones del jugador (recolectar, ir, beber…) | Interfaz | 11.1 |
| N19 | Los objetos pesan; el peso acarreable depende de fuerza, edad y salud; si se supera, no se mueve y debe soltar | Capacidad y equipo | 12.1 |
| N22 | Opción al inicio: poder jugar como otro NPC o limitarse a la familia inicial; activa en fácil y normal, desactivada en los difíciles | Modos | 9.2 (se amplía) |
| N23 | Edificio desbloqueable del árbol de técnicas: punto de reunión/centro (como bandera o estandarte) al que vuelven los NPC; mudarlo traslada el centro de la tribu | Bandas | 13.1 |
| N24 | Permitir destruir los edificios de la tribu desde el menú construir | Obras | 14.1 |
| N25 | Permitir rotar el edificio al elegirlo en el menú construir | Obras | 14.2 |
| N26 | Clima: lluvia, sol, nubes, tormenta, granizo; con efectos en NPC, cosechas, arbustos y edificios; con lluvia o granizo aparece barro en tierra | Mundo | 15.1 (amplía `m16_room_temp_plan.md`) |
| N27 | La choza de barro abriga más que el cortavientos y menos que lo mejor; más pequeña; sin madera, más palos, menos barro; y un edificio nuevo sin barro | Obras | 14.3 |
| N28 | La doma de perros no se puede aprender si no hay lobos en el mapa (ni gatos u otros) | Técnica | 16.1 |
| N29 | Descubrir el pastoreo "construyendo pastoreo" no tiene sentido; debe salir de intentar domar un animal salvaje de esa especie | Técnica | 16.1 |
| N30 | Separar la vista de la tribu de la de otras bandas; vista aparte con las relaciones entre bandas | Interfaz | 11.3 |
| N31 | Vista de familia: casilla para mostrar todos los antepasados, con desplazamiento | Interfaz | 11.4 |
| N33 | La orilla de ríos y mares más gradual: marisma, arena, barrizal, piedras; de ahí se saca arena, piedras pequeñas, agua | Mundo | 15.2 |
| N35 | Rótulo del objetivo de la acción: «cavando barro», «recogiendo grosellas», «proponiendo choza de barro»; y traducir `propose` | Interfaz | 11.5 |
| N37 | La relación con los bebés de la propia tribu empieza más alta (15) y sube 1 por cada vez que se juega con ellos | Bandas | 13.2 |
| N41 | Los animales huyen o atacan si un humano se acerca, según especie y si están domados | Animales | 17.1 |
| N42 | Curar a un herido exige plantas medicinales y algo con que vendar o cataplasma | Técnica | 16.2 |
| N43 | Antes del enmangado, ni edificios ni herramientas usan madera (no se puede talar sin hacha). Primeras obras: cortavientos y una choza individual de barro y ramas, de dos plazas y poco abrigo; hay que controlar cuánta gente hay en cada edificio | Obras | 14.3 |

**Choques de diseño a decidir antes de implementar (nuevas D-11 a D-14):**
`m16_plan.md`, sección D3.

## 1c. Notas añadidas el 2026-10-13

Las dos últimas líneas de `notes_for_m15.txt` (numeradas a continuación) y la
ampliación de N39.

| ID | Nota (resumida) | Et. | Causa | Carril | Fase |
|---|---|---|---|---|---|
| N45 | Los muebles no deben llevar la bandera de la tribu. Los de interior solo se colocan dentro de un edificio de la tribu; los de exterior, solo dentro de su territorio | A (bandera) + F (regla de exterior) | **Leída:** `Renderer.drawBuildingArt` dibuja el anillo de color de banda en todo edificio con arte, y `drawBuildingSprite` el banderín, sin mirar `def.furniture` ni `def.station`. Lo llevan cama, lecho, banco, estante, alfombra, lámpara, hogar interior y las once estaciones. El interior ya está bien: `Simulation.furniturePlacementRefusal` exige el hogar propio, completo y estar dentro. No existe la clase «mueble de exterior»: las estaciones (`station: true`) se colocan como edificios y no consultan `territoryOwnerAt` | PERCEPCION (bandera), OBRAS (regla de exterior) | cerrado por M16 2.22 (`63bc104`) |
| N46 | No se puede seleccionar a los NPC que están en la costa | A | **Cerrado por M16 2.23:** `candidatesAt` ahora recoge primero las entidades y el suelo se mapea con `World.tileOf`, igual que `World.index`. La e2e selecciona personajes en agua somera y playa; un control rojo confirmó el error de redondeo y agua abierta conserva «beber». Ver `docs/changelog.md` y las capturas de 2.23 | UI | cerrado M16 2.23 |
| N39 (ampliada) | «En algunas partidas, **pasado** el segundo día, aparece mucha agua que sustituye tierra por un río» | A, P | Que el agua aparezca días después y no al generar apunta al rellenado de 26d (zanjas, silos, fosos que se llenan desde la orilla: `World.updateShore`, `Simulation` ~7115) o a la reinstalación de la comarca tras un viaje (fase 34), no al generador de ríos. Preguntar al autor si en esas partidas se cavó o se viajó; la prueba `m16-no-sudden-flood` registra la causa de cada casilla que cambia | MUNDO | 2.21 |

## 1d. Causas leídas en el código (2026-10-13)

Lectura de `master` en `b88309f`. **No es reproducción**: la prueba de
funcionalidad de la sección 8/11 sigue decidiendo. Donde esta tabla
contradice la columna «Causa probable» de 1b, manda esta.

| ID | Qué se leyó | Conclusión | Consecuencia para la fase |
|---|---|---|---|
| N9 | `BandSystem.dropStaleSites` (~l. 1987) | M15 ya conservaba las obras `playerPlaced` y avisaba al proponente cuando retira una obra NPC; M16 2.2 comprobó ambas rutas y la recuperación de materiales con `m16-player-sites-not-dropped` | verificado ya corregido en M15; sin cambio de juego |
| N16, N40 | `ActionSystem.doBuild`, `Brain` y `Simulation` | El planificador ya elegía `gather_for_site`; la orden manual del jugador no continuaba después de recoger o entregar. M16 2.15 reutiliza esa selección solo para el jugador con orden explícita de construir. Las pruebas NPC y jugador alcanzan el 100 % y el caso sin fuente muestra `site_material_unavailable` | cerrado en M16 2.15; los NPC mantienen el flujo anterior |
| N8 | `Carry.itemCapacityFor`, `ITEMS.bundle`, `ActionCatalog` (`case 'pile'`) | El hatillo declara `hand: {perHand 1, perArms 1}`, va al hueco `shoulder` y solo acepta `long`. Con uno ya poseído, `itemCapacityFor('bundle')` da `max(1, ⌊1·vigor⌋ + 0 + 0)` = 1 y `canTake` niega el segundo. M16 2.4 comparte entre menú y acción el rechazo «ya hay un hatillo en el hombro» | cerrado en 2.4; no se permite llevar un segundo hatillo |
| N8 (2) | `Simulation.takeFromPile`, rama «todo» | Usaba `break` cuando un montón no cabe, por lo que un hatillo impedía probar los objetos siguientes | cerrado en 2.4: `continue`; prueba `m16-pickup-rest-of-pile`; `baseline:pin` idéntico |
| N20 | `Simulation.takeFromPile`, `Inventory.transferTo` | La prueba de conservación pasa para cada objeto con `container` o `hand`, incluso al recoger tras equipar hatillo y bolsa. No se encontró ni reprodujo la pérdida; no se afirma causa | cerrado como verificado, sin cambio de juego en 2.4; el reporte original sigue sin reproducir |
| N34 | `World.biomeAt`, `isWater`, `depthAt`, `isShallow`, `MovementSystem.nudge` | Confirmado: fuera de límites `biomeAt` devuelve `'water'`; `depthAt` 0, luego `isShallow` es **verdadero** fuera del mapa; `isWalkable` falso → `nudge` devuelve `too_deep` | 2.19: el borde no es agua para el movimiento del jugador. **No** cambiar `biomeAt` globalmente sin leer K1: en la isla clásica el borde sí es mar |
| N35 | `Floaters.actionLabel` | `t(ACTION_LABELS[action] ?? action)`: un verbo sin entrada sale con su id en inglés, y `t(variable)` escapa al test de `i18n` (lee claves por regex). Seis verbos de `ActionSystem` no tienen etiqueta: `ask_permission`, `dress_hide`, `plant`, `propose`, `refuel_lamp`, `untie` | 11.5: etiquetas y una prueba que recorra los `case` del despacho de `ActionSystem` |
| N12 | `bugs.md`, «M15 paso 0 (D): la niebla de un personaje recién tomado no se guarda» | Cerrado en 2.3: `FogReveal` se guarda con observador y cuadrícula; se revela cualquier celda tocada por el radio y las celdas vistas fuera de alcance permanecen atenuadas (`m16-fog-saved`, `m16-fog-dimmed`) | cerrado 2.3 |
| N36 | `WorldState.currentIdentity`, `installCurrent`, `travelRefusal` | «Bajo el mar» sale de `destinationIsLand` sobre la comarca vecina de `currentIdentity`, que se lee de `initialGeographicStart`. Ese campo lo renueva `installCurrent`, pero hay ramas que reinstalan el hogar con el inicio anterior (~l. 369, 453, 518, 743). Si la exploración deja `initialGeographicStart` en la comarca de origen, «al oeste» se calcula desde la de origen: mar. **Hipótesis**, sin reproducir | 2.19: la prueba `m16-scout-roundtrip` debe afirmar también `currentIdentity` tras cada viaje |
| N44 | `World.findShores`, `isShore`, `freshShore`, `hasWaterOfKind`; `Brain` ~l. 4509 | Ver K1 y K2: hay orillas de agua dulce **fantasma** en el borde del mapa. Candidata a causa del bucle «buscando agua» / «sin nada que hacer»: la IA elige una orilla visible sin agua, llega, no puede beber y vuelve a empezar | 2.17: antes de escribir conducta nueva, reproducir con un mapa de río que toque el borde oeste |
| N41 | `WildlifeSystem` (`fleeX`/`fleeY`), `Animal.temperament` | Los animales **ya** huyen (y los depredadores ya muerden); `temperament` existe | 17.1 empieza por inventariar qué dispara la huida hoy; amplía ese mecanismo, no crea otro |
| N42 | `ITEMS.herbs`, `ActionSystem.doTend`, `Body.dress`/`soothe` | `tend` **ya** gasta milenrama para un envenenamiento o una herida que supura. Falta el vendaje y exigirlo para heridas | 16.2: objeto nuevo `bandage` (o cataplasma) con receta y efecto en el mismo pase (regla de no declarar contenido inerte) |
| N16 (nombre) | `src/i18n/es/data.ts` | D-11 verificado en M16 2.15: `Hearth` → «Hoguera» y `Fireplace` → «Hogar». Los ids no cambian |

## 2. Fallos de herramientas de prueba (Bloque 1)

| ID | Dónde en `bugs.md` | Qué pasa | Etiqueta |
|---|---|---|---|
| T1 | "M15 fase 21: lo que queda abierto" | Cerrado el 2026-10-16: `tools/headless.ts` ya corrigió el reenvío posicional en `21c9af5`. La prueba `headless-cli.test.ts` falla al restaurar el parseo roto (0 pasos frente a los 2.000 de `tiny`) y pasó dos veces con el código vigente | cerrado en M15; prueba de regresión M16 |
| T2 | "Timeout de Vitest en GitHub Actions" | Corregido el 2026-10-16: los pasos Unit tests de CI y Deploy ya usan el resultado de `npm test` como resultado del job, sin `continue-on-error` | cerrado en M16 1.2 |
| T3 | "Tres tests de simulación exceden el límite fijo de cinco segundos" | Verificado el 2026-10-16 en aislamiento: `band` (caso de órdenes por rango 10,41 s) y `grazing` (inanición durante 30 días, 23,42 s) superan 5 s; ambos ya usan timeout explícito de 60 s y ahora explican el coste medido. `herding` (2,56 s de tests) y `determinism` (3,93 s) no necesitan ajuste. Las cuatro suites pasan aisladas | resuelto; timeouts por caso |
| T4 | "M12 health report" y "M15 fase 28: checkpoint compuesto" | Cerrado en M16 1.2 (`c4c14c2`): Playwright arranca Vite en `globalSetup` y conserva el handle para cerrarlo; dos pasadas E2E completas seguidas dieron 186/186 y el puerto 5399 quedó sin listener. Una primera corrida tuvo un fallo intermitente de `boundingBox()`; se registra en `docs/bugs.md` | cerrado; queda seguimiento de intermitencia |
| T5 | "La gira de capturas espera un selector antiguo" y "The screenshot tour had quietly stopped showing" | Corregido el 2026-10-16: cada una de las 41 capturas espera a que su superficie prevista esté visible. La gira detectó que el equipo ya tiene 11 ranuras (5 de carga y 6 de ropa), no 5; también valida la opción radial visible del bebé. `npm run shots` pasó 18/18 y guardó la evidencia en `artifacts/verification/m16-1.2/shots/` | resuelto; giro 18/18 |
| T6 | "`perf-budget` is a wall-clock check and it flakes hard" | oscila un 21 % según la carga de la máquina; el presupuesto de rendimiento está sin decidir | A + decisión |
| T7 | "Ten seeds cannot resolve a change of under about ten points" | las cohortes no distinguen cambios pequeños | regla, ver protocolo |
| T8 | "M15 fase 10 — `sim:seeds --scenario X --seeds N`" | corregido; las medidas de M15 anteriores al 29-09 con esa forma son sospechosas | regla |
| T9 | "Seis e2e de `smoke.spec.ts` fallan" | Verificado ya resuelto el 2026-10-16: la línea base M16 ejecutó las 186 specs sin fallos; salida en `artifacts/verification/m16-baseline/e2e.log` | cerrado en M15; regresión cubierta por `smoke.spec.ts` |
| T10 | "Suite base observada durante M15 fase 6a" | Verificado ya resuelto el 2026-10-16: Vitest pasó 320 archivos, 2.339 pruebas; no reaparecieron los fallos de `herding.test.ts`. Salida en `artifacts/verification/m16-baseline/unit-tests.log` | cerrado en M15; suite completa |

## 3. Fallos de corrección (Bloque 2)

| ID | Dónde en `bugs.md` | Qué pasa | Etiqueta | Fase |
|---|---|---|---|---|
| A1 | "SeasonLore aprende «estéril» de un arbusto recogido" | se aprende que una especie no da en su propia temporada porque la banda la dejó pelada | cerrado en M15 `19cd284`; verificado de nuevo en M16 2.1 el 2026-10-20 (test 8/8; sin cambio de código) | 2.1 |
| A2 | nota N9 | obras del jugador protegidas y aviso en retirada de obras NPC | verificado ya corregido en M15, capability test M16 2.2 | cerrado |
| A3 | "M15 fase 20, tercera ronda" y nota N6 | la niebla conserva recuerdos de cosas que ya no están; obras planeadas visibles en la niebla | A | 2.3 |
| A4 | nota N8 | "manos llenas" al recoger un hatillo | A | 2.4 |
| A5 | "The radial menu's \"Pick up\" has no reach test" | Verificado ya corregido en M15 `3b8a57b`; `m16-pickup-reach` confirma el paseo antes de transferir | cerrado 2.5 (2026-10-20) |
| A6 | nota N7 | arte de edificios con y sin tejado desalineado | A | 2.6 |
| A7 | "Sueño animal pendiente" | el signo de alarma animal sigue tras expirar | cerrado por M16 2.7 (2026-10-20) | 2.7 |
| A8 | "M15 fase 26c: lo que las obras de tierra no hacen" | un foso que se llena aísla casillas pendientes y deja la obra a medias | A | 2.8 |
| A9 | "Two effects bypass `techPower`" | Verificado ya corregido en M15: `armourOf` pasa por `techPower` (37i), `doHunt` usa el alcance del arma y el rendimiento del hacha se escala por `hafting`; `combat.test.ts`, `craft-nodes.test.ts` y pruebas de metales cubren los consumidores actuales | cerrado en M15; pruebas de combate y herramientas |
| A10 | "The catalogue reads a stranger's knowledge" | Reproducido por lectura del flujo vigente: `personActions` consulta `other.knownTech` y `other.skills` para habilitar y describir `teach`/`discuss`; `Knowledge.ts` no media esa consulta | A | 2.10 |
| A11 | "A sixth of all conversations are broken off for thirst" | `talk` no consulta si la sed ya aprieta antes de empezar | A | 2.11 |
| A12 | "Floaters do not follow the entity" | los rótulos se quedan atrás | A, baja | 2.12 |
| A13 | "M15 equipamiento: matriz roja y cobertura perdida" | 15 fallos nuevos y 12 pérdidas de aplicabilidad sin causa establecida | A | 0.1, 2.13 |
| A14 | "M15 fase 23e/f" | a quien muerde un depredador nadie lo defiende | A (conducta) | 2.14 |

## 4. Los absorbe una funcionalidad (no arreglar aparte)

| ID | Dónde en `bugs.md` o `next-steps.md` | Qué pasa | Fase |
|---|---|---|---|
| B1 | "M15 fase 20, tercera ronda"; `next-steps` "Guardar para el invierno sin programarlo" | nadie prevé el invierno; `lean` se extingue | 4.3–4.5 |
| B2 | "`harsh-winter` no termina refugios" | la obra se valora con el frío de hoy y llega tarde | 4.4, 5.3 |
| B3 | "M15 fase 26c" | la banda no propone obras de tierra; falta "la razón medible" y un registro de incursiones | 7.2, 7.3 |
| B4 | "M15 fase 26c: el silo cavado" | una obra larga ocupa uno de los dos huecos de `MAX_SITES` | 4.6 |
| B5 | "Nobody carries a spare, so `gift` barely fires" | no hay excedente deliberado | 4.5 |
| B6 | "Nobody fetches materials for something they want for themselves" | solo se fabrica lo que casualmente ya se lleva encima | 6.2 |
| B7 | "Crafting is interrupted often, and NPC crafts are not resumed" | el NPC empieza de cero tras una interrupción | 4.4 |
| B8 | "A trap is sited from where the band was founded" | el planificador sitúa desde el punto de fundación | 6.7 |
| B9 | "A head keeps asking, is refused four times in five" | el jefe no recuerda que le han dicho que no | 5.4 |
| B10 | "A job does not protect someone from the chief's own labour draft" | el reparto de obra ignora el oficio | 5.4 |
| B11 | "The player is not told when a chief is refused" | las negativas entre NPC son invisibles | 5.6 |
| B12 | "A people's culture never changes" | el trato a extraños se sortea al fundar y no se mueve | 7.4 |
| B13 | "M15 bloque IX": la guerra y la paz se saben sin mensajero | | 7.2 (completo solo con la fase 36 de M15) |
| B14 | "Band membership is never reassigned on marriage" | quien se casa fuera sigue siendo forastero para todo | 9.1 |
| B15 | "Nobody ever picks anything up off the ground"; `next-steps` 11d | materiales y herramientas del suelo sin recoger; soltar una herramienta no da motivo para recuperarla | 6.2, 6.3 |
| B16 | "`farm` and `smith` are real skills with nothing that trains or reads them" | | 6.5 |
| B17 | "M15 fase 25": `proximityBonus` mide en línea recta | una presa tras una cresta puntúa como cercana | 6.6 |
| B18 | "A character looking after itself will not run away" | en "Se mantiene vivo" no huye de un ataque | 3.2 |
| B19 | "The top bar has no room left" | no cabe otro control arriba, y los avisos nuevos van ahí | 3.1 |
| B20 | "Winter still kills the unlucky" | la banda que pierde a sus constructores no se recupera | 4.8, 6.5 |
| B21 | `next-steps` fase 20: enseñar el saber de las estaciones al contarlo | | 4.2 |
| B22 | "M15 fase 10 — `answered` muy por debajo" | las agresiones casi nunca reciben respuesta | 7.1 (parcial), 10 |

## 5. Balance y calibración (Bloque 10)

| ID | Dónde | Qué pasa |
|---|---|---|
| C1 | "M15 equipamiento", "Checks sin ocasión necesaria" | `lean`: 4 % de supervivencia media, 20/20 colapsos. Era 91 % al cierre de M11 y 65,9 % al empezar M13 |
| C2 | "M15 fase 2a" | elegir según creencias de rendimiento cuesta unos 14 puntos en `lean` (`beliefChoice`) |
| C3 | `next-steps` "M15 fase 2f" | la ruta de sed y exploración cuesta 32 puntos en `lean` |
| C4 | "M15 fase 20" (tres apartados) | la madre lactante muere a 2–3 veces la tasa de un hombre; los huérfanos de pecho mueren casi todos |
| C5 | "M15 fase 23e/f" | depredadores: −11 puntos |
| C6 | "M15 fase 25" | relieve: −2,9 puntos |
| C7 | "M15 fase 26c: el silo cavado" | −24 % de lo almacenado |
| C8 | "M15 fase 1c", "M13, fases 4-6" | rojos crónicos: dieta según antojo, noches dormidas, niños cerca, opiniones, ánimo |
| C9 | "M15 bloque IX" | justicia, conjura, tributo y servidumbre apenas se ejercitan; `polity` falla cuatro checks ajenos |
| C10 | "M15 fase 10 — `recovered` en 0/7" | las caídas de población no se recuperan en quince años |
| C11 | "A world that reaches herbalism never tends anybody" | nadie cuida a los heridos |
| C12 | "The predation route never fires", "Exile has nothing left to fire on", "Captivity is rare" | rutas que no se disparan |
| C13 | "A relationship, once made, can never be forgotten" | las relaciones nunca se borran; coste de rendimiento creciente |
| C14 | "Sueño animal pendiente y costes con 300 humanos" | 20,8 ms por paso con 300 personas; `Brain.score` es lo más caro |
| C15 | "M15 fase 21" | las heridas casi no se ejercitan |

## 6. Fuera de M16

| ID | Dónde | Por qué fuera |
|---|---|---|
| D1 | "LOD de simulación ausente" | fase 32 de M15 |
| D2 | "M15 29", "M15 bloque VII" | mapa global, ríos, paleoclima: fases 29–31 de M15 |
| D3 | "M15 fase 23e/f": luz, antorchas | fase 12 de M15 |
| D4 | `next-steps` "0b. Spoilage is built and switched off" | conservación: fase 15 de M15. Guardar para el invierno funciona sin ella, pero secar y ahumar no tienen sentido hasta entonces |
| D5 | "A child's wrongs are owed by nobody", "Killings are owed nothing yet", "Only wrongs done to somebody's face are owed" | justicia: decisiones de diseño aparte |
| D6 | "The dead's goods on somebody else are not evidence" y vecinos | investigación de muertes |
| D7 | "Captivity…": solo se captura a adultos | decisión del autor |
| D8 | "An animal that has been fed forgets nobody", "`heel` has no stuck handling" | segunda pasada de fauna |
| D9 | "`FamilyTree` never got the mobile zoom", "The tech web's arrangement shifted" | rediseño de la red, fuera de M16 |
| D10 | "Found shipping the Spanish translation" (tres apartados) | detalles de idioma |
| D11 | "la boca de `Sprites.ts` está invertida" | dibujo de respaldo |
| D12 | "`basketry` does not make stores cheaper", "`ORDER_COST` prices all four conversations the same" | menores |
| D13 | `next-steps` "Nobody plants a tree" | encaja con el horizonte de linaje, pero no en M16 |
| D14 | `next-steps` fase 20: cuna y lecho; adultos NPC jugando con bebés | fase 16 de M15 |
| D15 | "Station crafting still refuses when watched", "A warning to a foreign child is still a `threaten`" | propiedad y trato a extraños |

## 7. Reglas que salen del historial (van al protocolo del plan)

- **Un solo flujo `spawnRng` reparte recursos, manadas y personas.** Cambiar
  la población inicial o añadir un recurso mueve todos los mundos. Los modos
  de partida (Bloque 9) son configuraciones nuevas; no se toca la
  configuración por defecto que usan las pruebas.
- **Añadir una acción puntuable a `Brain` cambia todos los mundos**, porque
  cambia cuántos candidatos entran en el sorteo final. Todo "antes y después"
  se mide por mecanismo (contadores de telemetría) y con semillas pareadas,
  no por un check que cambia de lado.
- **Veinte semillas no resuelven menos de unos diez puntos.** Para decidir
  algo menor: 40 semillas o un contador de mecanismo.
- **Antes de fiarte de un check nuevo, comprueba que falla en la versión sin
  el cambio.**
- **`n/a` no es aprobado.** Si un check pasa de PASS a `n/a`, lo más probable
  es que la conducta haya desaparecido.
- **Un fallo no se cierra sin una prueba de la funcionalidad** (sección 8).
  "Ya no lo veo" no es un cierre; "la prueba que describe lo que el jugador
  espera pasa" sí.

## 8. Pruebas de funcionalidad (verificar antes de cerrar o corregir)

Añadido el 2026-10-11. Varias de las notas pueden estar ya corregidas por
trabajo de M15 posterior a las notas. En vez de darlas por cerradas o por
abiertas, cada una lleva una **prueba de funcionalidad**: describe lo que el
jugador espera ("la hoguera se puede construir"), no el síntoma. Se escribe
**antes** de tocar nada y el resultado decide:

| Resultado sobre `master` | Qué se hace |
|---|---|
| La prueba **pasa** | Se deja como prueba de regresión, se cierra la entrada con el nombre de la prueba y se anota «ya corregido, verificado el <fecha>». No se toca código |
| La prueba **falla** | Es un fallo vigente: se confirma la causa (columna "Causa probable" de la sección 1b) y se corrige en su fase. La prueba es la que debe pasar al final |
| La prueba **no se puede montar** | R0: duda en `docs/m16_dudas.md` |

Cada prueba va en un fichero propio `src/sim/__tests__/m16-<id>-<tema>.test.ts`
(o, para interfaz, `e2e/m16-<id>-<tema>.spec.ts` con `?skipIntro=1`), de modo
que agentes distintos no editen el mismo fichero. Montan el mundo a mano, sin
azar (hallazgo 30 de `m16_revision_qa.md`), con el `Simulation` mínimo de los tests existentes
(`carry.test.ts`, `garment-pockets.test.ts`, `place-memory.test.ts` son
buenos modelos). Su nombre dice la capacidad, no el fallo.

| Prueba | Notas | Aserción (lo que debe cumplirse) |
|---|---|---|
| `m16-hearth-buildable` | N16 | un grupo con los materiales de la hoguera, la coloca, trabaja en ella y llega al 100 % en un número acotado de pasos; `Building.progress` sube monótono. Variante: igual con la obra colocada por el jugador sin materiales apilados (cubre N40) |
| `m16-work-on-fetches-materials` | N40 | «trabajar en» una obra sin materiales: el NPC acarrea los que faltan al montón de la obra y solo entonces `progress` avanza; contador `gather_for_site` > 0 |
| `m16-pickup-second-bundle` | N8, N20 | persona con manos libres, un hatillo en el inventario y otro en el suelo: o lo recoge, o la negativa dice la causa verdadera, nunca `hands_full` |
| `m16-pickup-conserves-items` | N20 | con hatillo y bolsa de piel equipados, recoger N unidades de cada tipo: suelo + inventario antes == después, para todos los objetos del catálogo con `container` o `hand` |
| `m16-equip-unequip-all` | N8, N18 | para cada objeto de `ITEMS` con hueco de equipo (contenedores, prendas, armaduras): el jugador puede equiparlo y quitarlo; si no, la negativa tiene motivo (R6) |
| `m16-npc-equips-bundle` | N11 | un NPC que sabe hacer hatillos y ve uno suelto de su banda, sin tener uno, lo coge y lo equipa; uno que no sabe, no |
| `m16-player-sites-not-dropped` | N9 | obra del jugador intacta 10 días sigue en pie; una obra de NPC retirada deja aviso con motivo |
| `m16-fog-forgets-removed` | N6, N12 | un árbol talado a la vista y luego abandonado no se vuelve a dibujar; una casilla vista de paso queda en la memoria; una obra sin terminar no sale en la niebla |
| `m16-map-edge-silent` | N34 | `nudge` hacia el borde del mapa no devuelve `too_deep` ni deja rótulo |
| `m16-scout-roundtrip` | N36 | explorar al este y volver al oeste: el árbol de tribu y de familia siguen con los vivos; la vuelta no dice «bajo el mar» si la comarca de origen es tierra |
| `m16-no-sudden-flood` | N39 | 5 días en un mundo fijo con la semilla que lo reproduzca: ninguna casilla de tierra pasa a agua sin una causa registrada (zanja, pozo, lluvia) |
| `m16-water-between-lakes` | N44 | banda en una franja de tierra entre dos aguas grandes, sin agua alcanzable a pie: no queda en el ciclo `idle`/`seek_water`; se mueve, o avisa de que no hay agua |
| `m16-hungry-searches-farther` | N21 | hambre > 70 y ninguna comida a la vista ni recordada: la persona se desplaza en busca, no se queda quieta |
| `m16-bedding-player-use` | N38 | el jugador puede usar y quitar una cama de su banda |
| `m16-mud-shore-markers` | N32 | las casillas de orilla con barro tienen una señal visible distinta de las que no; el menú explica por qué no se puede cavar |
| `m16-hearth-name` | N16 | todos los textos visibles llaman «hoguera» a lo que hoy dice «hogar» en español; el id interno no cambia |

Las pruebas de la lista que dependan de un cambio de diseño (D-11 a D-14) se
escriben contra la decisión por defecto de `m16_plan.md`, sección D3.

## 9. Entradas posteriores al 05-10 sin triar (añadido 2026-10-13)

`bugs.md` creció ~1.450 líneas y `next-steps.md` ~330 desde el triaje
original; ninguna de estas entradas estaba en este fichero. "Dónde" cita el
título del apartado para buscarlo con `grep`. Etiquetas como en la sección 1,
más **H** = herramienta o instrumento de prueba.

### Fallos (A) y de herramientas (H)

| ID | Dónde | Qué pasa | Et. | Carril | Fase |
|---|---|---|---|---|---|
| E1 | `bugs.md` «M15 fase 33: lo que el mundo de pueblos…», punto `World.index` | `index(x,y)` envolvía coordenadas fuera del mapa a la fila vecina; K1 y K2 reproducen y cierran las rutas de orilla/agua dulce | cerrado 2.19 | MUNDO | 2.19 |
| E2 | `bugs.md` «M15 terreno: `go_home` puede ganarle al hambre máxima» | `go_home` puntúa solo por distancia a casa; con hambre 90–100 y comida bajo los pies, la persona no come en 1.200 ticks | A | CEREBRO | 2.17 (con N21) |
| E3 | ídem fase 33, «Una banda con camino largo al agua aún puede morir de sed» | la IA no mide la distancia al agua conocida antes de alejarse | A | CEREBRO | 2.17 (con N44) |
| E4 | `bugs.md` «M15 paso 0 (D): la niebla…no se guarda» | ver N12 en 1d | A | PERCEPCION | 2.3 |
| E5 | `bugs.md` fase 33, «El cargador no restaura la compartición de objetos» | guardar, cargar y avanzar 29 días da un nodo más en `objects.graph`: un objeto compartido pasa a dos copias. No se sabe si una mutación posterior diverge | A | HERR (persistencia) | 2.24 |
| E6 | `bugs.md` «Compacto de raciones: `RangeError`…» y «Seguimiento de raciones aparcadas» | `RangeError: compact ration callback returned relief outside its request` al aparcar una comarca con `peoplePerBand` alto; **sigue abierta**. Otra exploración a 400 ticks dio `too many interruption notices` (se arregló un mecanismo; el caso largo no se atribuye) | A | MUNDO (frontera) | 2.25 |
| E7 | `bugs.md` «M15 fase 35: avance de origen en bloque cruza el reloj de llegada» y «viaje de grupo no simula la comarca de destino» | M15 fase 35 alineó el avance por lote al reloj de llegada; verificar round trip y guardado con la capability test de 2.25 | atendido en M15, verificar | MUNDO (frontera) | 2.25 |
| E8 | `bugs.md` «combustible de antorcha y transferencias sociales automáticas» | las rutas sociales automáticas (reparaciones, exigencias) retiran directamente de `Inventory` sin metadatos de combustible: la llama se pierde y puede quedar una ranura sin dueño | A | CARGA | 2.26 |
| E9 | `m16_notes.md` (14c) y código | `Person.age` está en **días**, pero `Brain` (vestir, curtir, quitarse por calor: `person.age >= 1`) y `ToolEquipment` (`age < 1` → `too_young_to_wear`) comparan con 1. Un bebé de dos días puede recibir la orden de ponerse una armadura | A | CARGA | 2.27 → cerrado por M16 2.27 (`c25b967`) |
| E10 | `bugs.md` «fase 29c: semillas y fuentes», auditoría del 06-10 | los escenarios clásicos `hearths`, `porters`, `scribes` y `conquest` meten claves de configuración que el codec estricto de checkpoint **no admite** | resuelto → cerrado por M16 1.4 (`9e567c5`) | HERR | 1.4 |
| E11 | `bugs.md` «M15 paso 0: lo que sigue cuadrático», punto 5 | toda clave nueva de `SimConfig` hace que los guardados anteriores no carguen salvo migración explícita (se hizo una vez, para `otherBandThinkInterval`) | **H, regla** | todos | R23 del plan |
| E12 | `bugs.md` «M15 final fast verification…», «full test rerun…», «verificación actual en `0.15.127-alpha`» | cerrado por M16 1.9 (`a40a6dc`): las cinco suites focales pasan en `0.15.160-alpha`; sus correcciones/premisas aparecen en los commits M15 y en `bugs.md` (diario M16 1.9) | resuelto; cerrado M16 1.9 | HERR | 1.9 |
| E13 | ídem | En `band`, tres checks pasan 3/3 corridas; `perf-budget` falla 3/3 a 508–591 pasos/s (suelo 1.678). Sigue abierto y medido aparte de la matriz. Ver `bugs.md` M16 1.9 y diario | H (línea base) / C; no cerrado | HERR | 1.9 |
| E14 | `bugs.md` «M15 full test rerun…», último párrafo | `npm run art:sheet` no termina: la sección `dig` dibuja un lienzo vacío (`InvalidStateError`) | verificado ya corregido el 2026-10-20; no se cambió código, `art:sheet` terminó con 0 y `contact-dig.png` se revisó | PERCEPCION (arte) | 2.29 |
| E15 | `next-steps.md` «Estado vigente — 2026-10-13», E2E | Cerrado en M16 1.2 (`c4c14c2`): dos pasadas E2E completas consecutivas, 186/186 cada una, salida 0 y ningún listener residual en 5399 | resuelto; gate final 1.2 | HERR | 1.2 (T4) |
| E16 | `bugs.md` «fase 40b — regresión de difusión», segundo párrafo | La repetición focal de la spec original con `--repeat-each=50` pasó 50/50 en 6m24s; no reprodujo que `.newgame-option` pasara de 3 a 0. Se mantiene como intermitente histórico sin causa confirmada | no reproducido; queda registrado | HERR | 1.2 |
| E17 | `bugs.md` fase 32b-2/32b-3/32c y fase 34 | el modelo compacto no registra al recién nacido, no aborta ni complica partos, no tiene frío, y `KnowledgeLedger` no entra en la instantánea de `PeopleSim` | D (LOD) | — | fuera; ver Parte C |

### Funcionalidad que el autor pidió y no tiene fase (F)

| ID | Dónde | Qué pidió | Carril | Fase |
|---|---|---|---|---|
| E18 | `next-steps.md`, «2026-10-08: pendientes del propietario sobre agua, pesca y biomas duros» | peces proporcionales al agua (ancho del río, cuánto mar); el pescado no se recoge como una piedra: marisqueo en la orilla a mano, y pesca de verdad con zonas de concentración y **caña** (técnica nueva) encajada con `fishing`, red y nasa | MUNDO + TECNICA | 15.3 |
| E19 | ídem | bioma de desierto en el mapa local (hoy un desierto se pinta con hierba y conserva 17 manadas); tundra más dura; agua en el desierto (pozos, plantas) | MUNDO | 15.3 |
| E20 | `bugs.md` «M15 fase 32c: puertas de la cohorte», punto «Materiales del prototipo de `writing`» | `writing` usa `flint`; regla del autor: replicar cómo lo hicieron los primeros humanos. Más materiales (piedras de distinto tipo, arcilla, papiro…) y revisar los prototipos de `TECHS` con ese criterio, **en vez de tocar tasas** | TECNICA | 16.4 |
| E21 | `bugs.md` «"begin anywhere": una región "costera" a veces no tiene tierra alcanzable» | la tarjeta «Costa: empezarás en la orilla» promete lo que 13 de 24 regiones muestreadas no pueden dar. Decisión pendiente del autor | UI | D-19 |
| E22 | `bugs.md` «M15 29c/33: la malla de comarcas no anticipa hidrología local» | sin pronóstico de agua por celda antes de elegir; decisión pendiente | UI | D-19 |
| E23 | `next-steps.md` «Estado vigente», fase 16 | en la cohorte doméstica «casi ningún NPC colocó muebles»; los NPC no consiguen grasa para las lámparas (`bugs.md` «partial hunt fat…») | CEREBRO | 6.2 (se amplía) |

### Calibración (C): actualización de cifras

Las entradas C de la sección 5 tienen cifras del 05-10. Las vigentes, para que
el bloque 10 no parta de números viejos:

| ID | Antes | Ahora (cohortes de 20 semillas, 12–13 oct.) | Lo que ya se descartó |
|---|---|---|---|
| C1 `lean` | 4 % | 4,5 %, colapso 20/20, 702 muertes por 2 nacimientos | depredadores (4,9 %), coste de lactancia (5,3 %). Bayas todo el año: 12,8 % → la estacionalidad de bayas es un coste real |
| C10 recuperación | 0/7 | `recovered` 0/42 (`century`), 0/59 (`generations`), todas censuradas | — |
| `century` | 72,9 % (fase 27) | 45,6 % y 54,8 % en dos cohortes no emparejadas | no hay build emparejado: no se puede atribuir |
| `generations` | — | 6,0 % / 14,7 %, extinción 9–10/20 | bayas todo el año: 16,8 % |
| B22 `answered` | muy bajo | 83,3 % (`century`), 81,8 % (`generations`); objetivo ≥ 90 %. El contador es un *proxy*: mide la acción en el instante del segundo golpe | el instrumento contaba mordiscos como golpes humanos; corregido el 13-10 |
| `firemaking` | — | 4/20 semillas (objetivo ≥ 50 %) | — |
| Coste de fase 27 | — | siete escenarios pierden más de 3 puntos: `conquest` −20,1, `stewards` −10,1, `feasts` −9,5, `scribes` −8,3, `labour` −7,3, `century` −4,7, `farmers` −4,3 | mecanismo sin aislar |
| Plantar (`orchard`) | — | −5,1 puntos con `arboriculture` | dentro del ruido de 20 semillas |
| Oficios | — | el puntuador de `craft` pierde contra el trabajo del campamento (fase 37); nadie sube a una sub-red en `hearths` ni `craft` (13d) | — |
| Conservas | — | `salters`: 0/3 comidas de invierno conservadas aunque el stock está en la mochila; causa de la no-selección abierta. 15c sigue apagado | el desempate por durabilidad no lo arregla |

## 10. Fallos nuevos leídos en el código (2026-10-13)

No estaban en ningún documento. Leídos, **no reproducidos**: cada uno lleva su
prueba en la sección 11 y la regla R22 manda.

| ID | Dónde | Qué pasa | Relación | Carril | Fase |
|---|---|---|---|---|---|
| K1 | `World.isShore`, `World.findShores`; `Earth.isWetSubsoil`; `Simulation.touchesShore` y `earthworkRefusal` | fuera de límites contaba como agua y **toda casilla transitable del perímetro era orilla**. La prueba de mapa sin agua confirma que el perímetro deja de formar orillas en 2.19; la isla clásica conserva su mar exterior | cerrado 2.19 | MUNDO | 2.19 |
| K2 | `World.hasWaterOfKind`, `freshShore` | en un mapa, la consulta de orilla dulce del borde envolvía índices y conectaba falsamente el oeste con el este. La prueba de río que toca el borde oeste confirma que no hay `freshShore` fantasma en el este tras 2.19 | cerrado 2.19 | MUNDO | 2.19 |
| K3 | `Simulation.takeFromPile` | ver N8 (2) en 1d: `break` en vez de `continue` | N8 | CARGA | cerrado 2.4 |
| K4 | `ActionCatalog` (`case 'pile'`, `animalActions`) | el menú decidía por la cuenta agregada; la ejecución, por objeto. Menú y acción no compartían la regla | N8 | CARGA | cerrado 2.4 |
| K5 | `Floaters.actionLabel` | seis verbos sin etiqueta salen en inglés en la partida en español | N35 | UI | 11.5 |
| K6 | `Renderer.drawBuildingArt` / `drawBuildingSprite` | anillo y banderín de banda en muebles y estaciones | N45 | PERCEPCION | cerrado por M16 2.22 (`63bc104`) |
| K7 | `main.ts`, `candidatesAt` | `Math.round` frente al truncado de `World.index`, y cortocircuito de agua | N46 | UI | cerrado M16 2.23 |
| K8 | `MovementSystem.nudge` y lectores de `isShallow` | fuera del mapa `isShallow` era verdadero (profundidad 0 de un agua que no existe). La prueba de borde confirma que devuelve falso en mapas geográficos tras 2.19 | cerrado 2.19 | MUNDO | 2.19 |

**Por qué K1 y K2 no se arreglan cambiando `biomeAt`:** en la isla clásica el
borde **es** mar, y el orden de `shoreTiles` es estado visible (lo recorren
los repartos de recursos). Cambiar la regla global mueve todas las semillas de
la isla. Arreglo propuesto: un predicado `outsideIsSea` en `World`, verdadero
en la isla clásica y falso en los mapas; `isShore` y `hasWaterOfKind` lo
consultan en lugar de `isWater` fuera de rango, y `hasWaterOfKind` comprueba
`inBounds` antes de indexar. Con eso la isla clásica queda bit a bit igual
(prueba R13) y solo cambian los mundos con mapa (`baseline:pin` para esos).

## 11. Pruebas de funcionalidad añadidas (2026-10-13)

Mismo formato y reglas que la sección 8 (fichero propio por prueba, mundo
montado a mano, nombre = capacidad).

| Prueba | Notas | Aserción |
|---|---|---|
| `m16-furniture-unbannered` | N45, K6 | el renderer no dibuja `banner/*` ni el anillo de banda para un edificio con `def.furniture` o `def.station`; sí para una choza (prueba de renderer con contexto falso, como las de `src/render/__tests__/`) |
| `m16-outdoor-furniture-territory` | N45 | una estación colocada donde `territoryOwnerAt` no es la banda se rechaza con motivo; dentro, se acepta. Depende de D-16 |
| `m16-select-on-shore` | N46, K7 | e2e (`?skipIntro=1`): un NPC en una casilla de vadeo y otro en la playa junto al agua se seleccionan con un clic sobre su dibujo; un clic en agua abierta sigue ofreciendo «beber» |
| `m16-edge-is-not-shore` | K1, K2, K8 | en un mundo con mapa de 32×32 sin agua: `shoreTiles` vacío, `isWetSubsoil` falso en el perímetro, `isShallow` falso fuera de rango. Con un río que toca el borde oeste: ninguna casilla del borde este está en `freshShore`. En la isla clásica, el checkpoint de las semillas 1–3 no cambia |
| `m16-pickup-rest-of-pile` | K3 | un montón con [hatillo, palos]: quien ya tiene un hatillo recoge los palos |
| `m16-pickup-menu-matches-action` | K4 | para cada objeto del catálogo, el menú habilita «Recoger» si y solo si `canTake(…, 1)` es verdadero; si no, el texto de negativa es el mismo que daría la acción |
| `m16-every-verb-has-a-label` | N35, K5 | todo `case` del despacho de `ActionSystem` tiene entrada en `ACTION_LABELS` y traducción |
| `m16-infants-cannot-dress` | E9 | un bebé de 2 días no recibe la orden de vestirse ni la decide; un adulto sí |
| `m16-scout-identity` | N36 | tras explorar al este y volver, `currentIdentity` es la comarca donde está el jugador en cada paso del viaje |
| `m16-load-keeps-sharing` | E5 | guardar, cargar y avanzar 20 días: `objects.graph` tiene el mismo número de nodos que sin guardar |
| `m16-block-advance-across-arrival` | E7 | avanzar en un solo lote más allá de la llegada deja origen y destino con el mismo reloj, o se rechaza con motivo; nunca un guardado inválido |
## 12. Entradas posteriores al 13-10 (actualizado 2026-10-16)

Las entradas de `docs/bugs.md` posteriores al triaje del 13-10 quedan ligadas
a una fase o a un gate ya existente. Los resultados de M15 se conservan como
línea base y evidencia; no se convierten en una afirmación de mejora de M16.

| Fecha / entrada en `bugs.md` | Etiqueta | Fase / destino | Resumen y estado |
|---|---|---|---|
| 14-10 — M15 12f: `lean` no muestra adopción de antorchas | C | 10.2 | 0/20 observaciones elegibles con luz activada y 0/20 en control; el mecanismo focal funciona, pero `lean` no ofrece oportunidad medida. Gate M15 abierto, sin ajuste. |
| 14-10 — M15 fase 41: `generations` no supera los gates; diagnóstico de concepción y sueño | C | 10.2; bloque 14 | Recuperación 0/57 censurada y `answered` 58/72 (80,6%); la evidencia de techo escaso motiva la escalera de refugios. No se atribuyen causas que el proxy no mide. |
| 15-10 — hambre crítica, exploración y `idle` | A + C | 2.17; 10.2 | M15 corrigió decisiones con comida accesible y probó el primer paso; aún no se identifica una fuente alcanzable cuando el hambre llega a 100. Conservar límites y mediciones como baseline. |
| 15-10 — exceso visual de peces en costas largas; 16-10 — efecto económico de la distribución gaussiana | B + C | 15.3; 10.2 | La agrupación reduce la alfombra visual, pero no se midió el efecto sobre acceso, consumo, agotamiento, hambre o supervivencia. La cohorte parcial no cuenta como resultado. |
| 16-10 — M15 32b: cadena agrícola no se ejercita en la muestra | C | 6.7; 10.2 | `farmers` no trabajó campos en las muestras de 40 y 100 días; la traza de `furrow` observó cereal recogido pero ninguna obra agrícola. Es una prioridad abierta del planificador, no una tasa cero medida. |
| 16-10 — M15 41: KO corregido; atribución de `answered` aún abierta | A + C | 2.14; 10.2 | Se corrigió el reintento autónomo contra un objetivo inconsciente. El registro histórico no permite atribuirle los casos restantes de `answered`; el gate sigue abierto. |

No aparece ninguna necesidad de fase nueva: cada entrada tiene un destino en la
secuencia vigente de `docs/m16/README.md` §7.
