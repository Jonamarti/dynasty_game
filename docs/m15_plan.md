# M15 — El plan maestro: de las manos vacías al Estado

Escrito el 2026-09-26, al procesar `docs/notes5.txt` con el propietario. Es el
**único plan vigente** del proyecto a partir de hoy.

Reúne en un solo orden todo lo que quedaba sin hacer:

1. **Las siete notas de `notes5.txt`**: ropa escalonada con su propia red,
   sal y conservación, interiores con tejado que se aparta y muebles, redes de
   tecnología por tema, antorchas y manos que sostienen cosas, gráficos más
   reales, y altura, excavación y profundidad del agua.
2. **Lo que queda de M13** ([m13_plan.md](m13_plan.md)): el arreglo de la
   supervivencia que las fases 2-6 dejaron por debajo de su límite, y las
   fases 7-14 (creencias que viajan, la hoguera y el asado, descubrir por
   necesidad, los motivos que no son del cuerpo, obras por persuasión,
   incursiones por propuesta, el campamento que se muda y la calibración
   contra la historia).
3. **Todo M14** ([m14_plan.md](m14_plan.md)) salvo su fase 1, que se entregó y
   sigue abierta: el cuerpo, la fauna, el mapa del mundo, el LOD, la
   migración, el transporte, el comercio, el Bronce y la civilización.
4. **M8.4, el hierro** ([m8_plan_the_ages.md](m8_plan_the_ages.md)), que M14
   dejaba para «después».
5. **Lo que `next-steps.md` y los planes anteriores dejaron sin fase**; el
   inventario completo está en el §0c.

**M13 y M14 dejan de ser milestones separados.** Sus documentos se conservan
como **referencia de detalle**: cuando una fase de M15 dice «detalle en
`m13_plan.md` fase 8», el texto de allí manda en todo lo que M15 no cambie
explícitamente. Lo que M15 cambia se dice en la fase, en un apartado «Qué
cambia respecto al plan de origen». Los mensajes de commit llevan el prefijo
`m15:` desde el primer commit de este plan.

**Para quién está escrito.** Para un agente que no estuvo en la conversación
con el propietario y tiene que ejecutar fases sin romper el proyecto. Cada
fase dice qué problema resuelve, de dónde viene, qué archivos y funciones toca,
qué tests y checks añade, cómo se mide, cuánto puede costar y cuándo hay que
parar y preguntar. El plan cita **nombres** (funciones, constantes,
comentarios de sección como `// --- Hunt ---`) y no números de línea, porque
cambian con cada edición: búscalos. Si el plan contradice al código, manda el
código: compruébalo y anota la discrepancia en `docs/bugs.md` antes de seguir.

**Lee antes, en este orden:** `AGENTS.md` (entero), `docs/architecture.md`,
el §3 de este documento (reglas de trabajo) y el §3 de `m13_plan.md`, que
este plan hereda entero.

**Terminología.** Tres escalas de lugar, de menor a mayor:

- Una **casilla** es una baldosa del mapa local (`World`).
- Una **comarca** es un mapa local entero, lo que simula una `Simulation`
  detallada: el territorio que recorre una banda, unos 40 km de lado. La isla
  de hoy es una comarca.
- Una **región** es una celda del mapa del mundo, de unos 400 km, y contiene
  muchas comarcas (10 × 10 por defecto).

**Esto cambia la terminología de M14**, que llamaba «comarca» a la celda del
mapa del mundo porque suponía que cada celda era un mapa local. El propietario
pidió un mapa del mundo lo bastante fino para que la península ibérica tenga 4
a 6 zonas (§0d). A esa escala, una celda son cientos de kilómetros y no puede
ser un mapa local. Donde `m14_plan.md` dice «comarca» hablando del mapa del
mundo, léase **región**. El bloque VII lo explica.

**Ojo con otra «región»:** `World.region` (y la «reparación incremental de
regiones» de la fase 16a) es otra cosa: el índice de zonas **conectadas a
pie** dentro de una comarca, lo que separa una isla de otra. Cuando puede
confundirse, este documento la llama **región de paso**.

Una **red** es un grafo de tecnologías que se ve en su propia pantalla; la
**red principal** es la de hoy, y una **sub-red** es la que abre una **técnica
puerta** (cocina, ropa, armas…). Un **pueblo** es un grupo humano del modelo
abstracto de nivel 2 (fase 32): una población con cultura, técnicas y
relaciones, sin personas con nombre.

---

## 0. Qué hay en la mesa

### 0a. Las notas de `notes5.txt` y su destino

| # | nota (resumida) | destino |
|---|---|---|
| 1 | No toda la ropa es igual: unas prendas solo piden piel y un hacha (capas), otras hilo, botones, más técnicas. Quizá la ropa necesite su propia red cuando se descubra | **Fase 14** (la ropa por capas), sobre la **fase 13** (sub-redes) |
| 2 | Sal para conservar: carne y pescado salados duran más que frescos o cocinados | **Fase 15** (la sal y la conservación: se enciende la descomposición) |
| 3 | Vista interior: el tejado desaparece para ver dentro; dos plantas, más adelante. Muebles fabricables y colocables (camas, estantes…). Dormir en el suelo de casa es mejor que al raso, y en una cama, mejor aún. Tener en cuenta `m6_plan_households_sleep.md` | **Fase 16** (interiores, muebles y dónde se duerme); las dos plantas, en el §«Fuera de M15» |
| 4 | En vez de una red gigantesca, agrupar técnicas parecidas: recetas de hoguera y de horno, armas, ropa, agricultura, doma y pastoreo | **Fase 13** (sub-redes) |
| 5 | Antorchas de palos, grasa y fuego contra el frío, equipables: los NPC sostienen cosas en una mano o en las dos (antorcha en una, hacha en la otra). Hogueras para cocinar y calentarse | **Fase 11** (las manos), **fase 12** (la noche y la luz; la antorcha) y **fase 3** (la hoguera y el asado) |
| 6 | Mejores gráficos: brazos, cabeza unida al cuerpo, más reales; sin ropa, taparrabos, y las mujeres con una banda de pecho | **Fase 17** (el arte, pre-renderizado y guardado en el repo) |
| 7 | No toda el agua tiene la misma profundidad; cavar hoyos y zanjas; altura en el mapa (bajar cavando, pendientes, la costa; subir en montañas o apilando tierra). Después, el mar con profundidades: entrar hasta cierta profundidad y pescar dentro del agua | **Fases 25** (la altura), **26** (cavar y apilar) y **27** (la profundidad del agua), en el orden de la nota |
| 8 | Recuperar los planes de `next-steps.md` y de los demás planes sin hacer, y hacer un plan único grande en M15 | **Este documento** (fase 0) |

Tres peticiones más del propietario, hechas de palabra al revisar la primera
versión de este plan (2026-09-26):

| # | petición | destino |
|---|---|---|
| 9 | El mapa del mundo puede ser **aleatorio** o **la Tierra real**, elegido de una lista pregenerada; lo bastante fino para que España tenga 4 a 6 zonas (lusitanos, celtíberos…); con tribus y civilizaciones que se desarrollan en todo el mundo a distinta velocidad, para que al hacerte civilización haya otras civilizaciones con las que luchar, y un análisis de si el proceso lo aguanta | **Bloque VII** entero, con su §«Escala y coste», y las **fases 29** (mapa aleatorio y real), **32** (el modelo de pueblos) y **38-39** (las otras civilizaciones) |
| 10 | La grasa animal sirve para antorchas que duran más y para otras técnicas | **Fase 12d** (la antorcha de grasa), y la lámpara (16d), el pemmican (15b), el curtido (14c) y el jabón (21, opcional) |
| 11 | Niebla de guerra: los NPC no conocen el mapa al principio y lo descubren; lejos, recuerdan dónde vieron cada cosa por última vez, y lo lejano se ve oscuro bajo la niebla | **Fase 2** (el mapa de cada uno y la niebla), junto con las creencias que viajan, porque saber dónde está algo es otra creencia |

### 0b. Las decisiones del propietario, tomadas el 2026-09-26

Se hicieron en la conversación que produjo este plan. Son el criterio contra el
que se juzga cada fase; cambiarlas es cosa del propietario.

1. **Un plan maestro único.** M15 absorbe lo que queda de M13, M14 entero
   (salvo la fase 1 entregada), M8.4 y `notes5.txt`.
2. **Orden de los bloques:** recuperar → motivación → las cosas → el cuerpo →
   lo salvaje → el terreno → el mapa → entre comarcas → civilización y hierro.
3. **La descomposición se enciende**, a la vez que sus remedios (salar, secar,
   ahumar, `preserving`, el secadero) y una razón para dejar la comida en el
   almacén. El coste se declara antes de medir.
4. **Las sub-redes son conocimiento propio.** Cada receta, prenda o arma de una
   sub-red es un nodo que se concibe, se prueba, se enseña, se observa y se
   hereda con la maquinaria de hoy, aunque más fácil que una técnica de la red
   principal. Así se consigue la amplitud de Evolve.
5. **Equipo: dos manos, ropa por capas y espalda.** Al principio no hay ropa,
   así que no hay bolsillos ni cesta y **solo se lleva lo que cabe en las
   manos**. Con la cuerda se pueden atar cosas en un hatillo (palos, por
   ejemplo). Con ropa que tenga bolsillos se lleva en ellos. Escalera
   aprobada: un **puñado** por mano (4 bayas, 1 piedra, 2 palos), una
   **brazada** con las dos (unos 6 palos o una presa pequeña), una presa grande
   o un tronco al hombro, y se come donde se recoge. Después, **hatillo**
   (`cordage`), **bolsa de piel** (`leatherwork`), **cesta** (`basketry`),
   **bolsillos y cinturón** (ropa cosida), **angarillas** y **carro**.
6. **El efecto buscado de las manos**, en palabras del propietario: como no se
   pueden mover muchos materiales de golpe, **la construcción tarda más**,
   porque entre un viaje y otro hay que parar a comer, como ahora. **Las
   chispas de las ideas no pueden depender de sostenerlo todo a la vez**: un
   material cuenta si está en la mano, a los pies o si se manejó hace poco.
7. **La noche ciega.** De noche baja la vista (testigos, caza, detección de
   robos), el trabajo fino va más lento y los depredadores se acercan. La
   antorcha y la hoguera devuelven la luz en un radio, dan calor y ahuyentan a
   los animales. La pantalla se oscurece.
8. **Solo abriga lo que se lleva puesto.** Saber `clothing` deja de abrigar: la
   técnica permite fabricar. Cada prenda tiene su calor, su protección por
   parte del cuerpo, su desgaste y su valor de estatus.
9. **El arte se genera una vez y se guarda en el repo como PNG**, por capas,
   con **4 direcciones** (de frente, de espaldas, de perfil y su espejo). Se
   quita trabajo en cada arranque y el arte se puede ir mejorando por
   separado. El propietario piensa usar un agente para producirlo.
10. **Tejados: automático + tecla.** El tejado se aparta cuando entra tu
    personaje o el seleccionado, o al pasar el cursor por encima. Una tecla
    oculta todos los tejados.
11. **Terreno completo.** Altura visible, pendientes que frenan, vista desde lo
    alto, excavar y apilar (hoyos, zanjas, fosos, silos, montones,
    terraplenes), agua que llena una zanja conectada (canales, fosos, riego) y
    mar y lagos con profundidad. Incluye la reparación incremental de regiones,
    compartida con los muros de las chozas.
12. **Vadear sí, nadar poco.** En lo somero se entra y se pesca a pie. En lo
    hondo se nada despacio, poco trecho y sin nada en las manos, con frío y
    riesgo de ahogarse, con una habilidad `swim` que se entrena. Un brazo de mar
    o un lago grande siguen exigiendo barca.
13. **Muebles: la escalera completa, y los colocan todos.** Para dormir, de
    peor a mejor: el suelo al raso, al raso junto al fuego, el suelo de la
    casa, un lecho y una cama. Los muebles son lecho, cama, estante, hogar
    interior, cuna, asiento y banco, y secadero. Los colocan el jugador y los
    NPC, estos por el motivo del confort del hogar.
14. **Primero se arregla la supervivencia** que dejó M13 (fase 1). Después,
    cada fase declara su coste antes de medir; si lo supera, para y pregunta.
15. **La hoguera se funde y se amplía:** un solo hilo del fuego (hoguera
    exterior, asado, antorcha, luz y calor en un radio, hogar interior,
    ahumado y horno), que conserva el aprendizaje por creencias de M13.
16. **Se aprueban todas las decisiones abiertas de M13 y M14** con su
    recomendación:
    - concebir exige cualquier techo, paravientos incluido, y no el raso;
    - la crianza no baja la supervivencia media de `century` más de 8 puntos a
      20 semillas;
    - en el modo mapa, la comarca de partida es continental; el modo clásico
      conserva la isla;
    - ~~el mundo tiene 24 × 16 comarcas~~: **sustituida** por el §0d (el
      mapa del mundo en regiones, mucho más fino);
    - hay guardado de partida;
    - el campamento puede mudarse;
    - las madres con hijos pequeños trabajan cerca del campamento;
    - el fuego se descubre en al menos la mitad de los mundos de `century`;
    - el rasgo de «ir a su bola» es derivado y no nuevo;
    - el antojo no depende de la personalidad;
    - los umbrales de los objetivos históricos son los de la tabla de
      `m13_plan.md`.

    **Una excepción**, porque el propietario ya la había corregido: M14
    recomendaba que un pueblo bien alimentado no tomara partido sin causa.
    El 2026-09-25 el propietario dijo lo contrario, y eso manda: **las tribus
    tienen que poder enfrentarse por malas relaciones, rencillas, ambición
    territorial o deseo de dominar, aunque estén bien alimentadas.** Ver fase 1d.

### 0c. Lo que quedó sin hacer, y adónde va

Cada cosa que algún documento dio por planeada y que ninguna fase terminó:

| origen | qué | fase de M15 |
|---|---|---|
| `bugs.md`, «M13, fases 4-6» y siguientes | `lean` a 50,6% frente a 65,9% de base; `nights-are-slept`, `cravings-steer-the-diet` y `children-keep-close` en rojo; `DemographyWatch` cuenta cero muertes | **1** |
| `m14_plan.md` fase 1 (abierta) | Clasificar la matriz roja; diagnosticar `bands-take-sides` | **1** |
| `m13_plan.md` fase 6, pendientes | Los rendimientos aprendidos no los lee ninguna acción; no hay presentación al jugador | **2** |
| `m13_plan.md` fases 7-14 | Creencias que viajan, hoguera y asado, necesidad que inventa, motivos del alma, persuasión, incursiones, mudanza, calibración | **2-10** |
| `m14_plan.md` fase 2 | Las órdenes pesan lo que piden, y se ve | **7** |
| `next-steps.md` §6 (M7) | Muros, interiores, camas; reparación incremental de regiones | **16** (muros, interiores, camas y reparación) y **26** (excavar la reutiliza) |
| `next-steps.md` §7 | Casillas dinámicas: palas, canales, tierra movida, zanjas defensivas, roca apilada | **26** |
| `next-steps.md` §0b | Descomposición apagada; `preserving` y el secadero retenidos | **15**. Las manos resuelven la causa medida: la pérdida estaba en las mochilas, y con las manos casi no hay mochila |
| `bugs.md`, «Nobody ever picks anything up off the ground but the player» | Solo el jugador recoge del suelo | **11d**: con las manos, soltar y recoger es cotidiano |
| `bugs.md`, «The tech web's arrangement shifted…» y `next-steps.md` «What M11 leaves out» | Fijar el trazado del árbol tecnológico | **13c**, donde se rehace la red |
| `next-steps.md` §6, último punto | Revivir la cuarta ruta de chispa de `tracking` (`wander` en `lately`) | **4**, con las chispas por necesidad |
| `next-steps.md` §6 | Costes de terreno en el movimiento | **25** (las pendientes) |
| `next-steps.md` §7b N1 | Los puntos de pesca en el agua | **27** (pescar dentro del agua somera) y **30** (ríos y lagos) |
| `m14_plan.md` fases 4c, 5, 6, 7, 8c | Concebir bajo techo, embarazo, crianza, anatomía y enfermedad, crudo que enferma | **18-22** |
| `m14_plan.md` fase 6e | Cuna y camas | La **cama** en la **16**; la **cuna**, en la **20**, como mueble de la 16 |
| `m14_plan.md` fases 9-10 | Ecosistema; plantar | **23-24** |
| `m14_plan.md` fases 3, 11-17 | Identidad, mapa, agua dulce, globo, LOD, poblar, migrar, transporte | **28-35** |
| `m14_plan.md` fase 15c (decisión 6) | Guardado de partida | **33** |
| `m14_plan.md` fases 18-21 | Comercio y caravanas; Bronce; Estado | **36-39** |
| `m8_plan_the_ages.md` M8.4 | Hierro: `bog_iron`, `bloomery`, `forging`, `carburising`, `iron_tools`, `ploughshare` | **40** |
| `next-steps.md` «What M11 leaves out» | La fiesta de `brewing`; otros lectores de `conspiracyAgainst`; la velocidad de `the_wheel` | **38a**, **39c**, **35** |
| `next-steps.md` «What M11 leaves out» | El zoom de `FamilyTree` en el móvil | **31** |
| `next-steps.md` §1 | Frenar la natalidad bajo presión | **20c** (la amenorrea de la lactancia) |
| `m9_6_plan.md` fase 4 | El canal de ánimo `comfort` | **16d** (lo escribe dónde se duerme); `belonging` y `purpose`, en la **5** |
| `bugs.md`, «Nobody carries a spare, so `gift` barely fires» | Nadie lleva excedente | **38a**; con las manos es aún más cierto, y el banquete es la salida |
| `BandMaps.ts` («la semilla del mapa del mundo», M12) | Un mapa grueso **por banda**, que sabe lo que vio cualquier miembro sin que nadie se lo cuente | **2e**: pasa a ser el mapa de **cada persona**; la incursión por necesidad lee el mapa del instigador (fase 8) |

**Lo que se deja fuera, a propósito**, está en el §«Fuera de M15» al final.

### 0d. La segunda ronda: el mundo real, la grasa y la niebla (2026-09-26)

Decisiones del propietario al revisar la primera versión de este plan. Tienen
el mismo peso que las del §0b.

17. **Dos clases de mapa del mundo:** uno **aleatorio**, generado de la
    semilla, y otros **reales**, elegidos de una **lista pregenerada** a partir
    de datos reales de relieve, clima, costas y ríos, y guardados en el repo,
    como el arte. El primero de la lista es la Tierra entera.
18. **Resolución: que España tenga 4 a 6 zonas.** Así cabe simular algo como
    los pueblos históricos de la península (lusitanos, celtíberos…). Da celdas
    de unos 3,75° (unos 400 km): una rejilla de **96 × 48 regiones** para la
    Tierra, de las que unas 1.400 son tierra firme. Cada región contiene
    comarcas (las `Simulation` locales), generadas cuando hacen falta. El
    mapa aleatorio usa la misma rejilla.
19. **El resto del mundo también se desarrolla.** Tribus y, con el tiempo,
    civilizaciones de todo el mundo avanzan en técnica, comercio y guerra con un
    **modelo simplificado**, a velocidades distintas que salen de la geografía
    y del contacto, no de un guion. Así, cuando tu tribu llegue a
    civilización, **habrá otras civilizaciones con las que luchar**, y no solo
    tribus. El propietario pidió **analizar si el proceso lo aguanta**: el
    análisis está en el §«Escala y coste» del bloque VII, y la fase 29 lo
    comprueba con una medición antes de construir nada encima.
20. **La niebla de guerra es la de tu personaje.** En pantalla se ve lo que tu
    personaje ha visto y lo que le han contado (marcado «de oídas»). Al
    heredar, el heredero trae su propio mapa. Es la regla del proyecto: nadie
    sabe nada salvo por verlo o que se lo cuenten.
21. **Los NPC deciden solo con lo que saben.** No conocen el mapa al principio
    y lo descubren. Van solo a lo que ven o recuerdan, y el recuerdo puede estar
    desfasado (el arbusto ya agotado, la manada que se fue). Explorar pasa a
    ser algo que se hace por un motivo, y contarse dónde hay comida, un canal
    más. Es un cambio grande de comportamiento y se mide (fase 2).
22. **La grasa tiene usos:** antorchas que duran más que las de palo y paja, y
    otras técnicas (la lámpara de grasa, el pemmican, el curtido de las pieles y,
    más tarde, el sebo y el jabón).

---

## 1. Lo que el código asume hoy y M15 rompe

Verificado contra el código el 2026-09-26. Cada punto es una obra en sí.

1. **Todos cargan 40 desde que nacen.** `Person.carryCapacity` es
   `40 × vigour × carryFactor`, y `carryFactor` (en `knowledge/Tech.ts`)
   multiplica por `cordage`, por una cesta que esté en el inventario y por un
   carro. `Inventory` es una sola bolsa sin huecos: no hay manos.
2. **La ropa abriga por saberla.** `warmthFrom` suma `0,3 × techPower(person,
   'clothing')` sin exigir ninguna prenda. Las prendas (`fur_coat`, `cloth`,
   `wool_cloth`) abrigan por estar en el inventario, no por llevarse puestas.
3. **La noche no ciega.** `BrainContext.sightRadius` es un número único para
   todo el mundo (12), igual de día y de noche; `KnowledgeSystem` observa a
   `WATCHING_RANGE` (5); los testigos de `social/` usan sus propios radios.
   `TimeManager.daylight` y `TimeManager.isNight` existen, pero ningún radio de
   visión los lee.
4. **Una sola red de tecnología.** `TechWeb.ts` dibuja los ~51 nodos de `TECHS`
   en una sola pantalla con ocho dominios (`DOMAINS`), y el trazado se mueve al
   añadir un nodo (`bugs.md`).
5. **La comida no se estropea.** `needs.spoilRate` es 0 en `DEFAULT_CONFIG`; la
   maquinaria (`Inventory.spoil`, `BuildingDef.preserves`) existe y solo
   `fishers` la enciende.
6. **Los edificios no tienen interior.** Una choza es un rectángulo de 3×3 que
   da `shelter` a quien está en su huella; no hay muros, puerta ni muebles.
   `World.walkable` no cambia nunca después de generar el mundo.
7. **`World.region` es inmutable.** Se rellena una vez en el constructor de
   `World`, y el pre-chequeo de región de `Pathfinder` depende de ello.
8. **Las personas se dibujan en tiempo de ejecución.** `render/Sprites.ts`
   rasteriza en el arranque un atlas procedural (`CELL = 96`) con una sola
   vista de frente. Los brazos se dibujan detrás del torso y la cabeza flota
   separada.
9. **La altura existe y nadie la lee.** `World.elevation` (`Float32Array`) se
   calcula en `World.generate` y solo sirve para clasificar biomas. `BIOMES`
   es `water, beach, grass, forest, hills, rock`. Toda el agua es igual, no se
   camina por ella y `World.shoreTiles` es toda casilla caminable que la toca.
10. **Nadie nada.** `World.sameRegion` prohíbe cruzar agua por construcción.
11. **Los NPC saben dónde está todo.** `Brain.findNode` y las búsquedas de
    agua, árboles, presas y compañía consultan los hashes espaciales del
    mundo real (`resourceHash`, `treeHash`, `peopleHash`…) dentro de
    `sightRadius` o más allá: nadie tiene que haber visto un arbusto para ir a
    por él. `BandMaps.ts` guarda un mapa grueso **por banda**, que sabe lo
    que vio cualquier miembro sin que nadie se lo cuente. Y la pantalla lo
    enseña todo: no hay niebla.

---

## 2. La arquitectura a la que se llega

M15 no cambia el principio del proyecto: **un puntuador de utilidad** (`Brain`)
que, desde M13, lee motivos y creencias, y **sistemas deterministas** que
aplican lo que se elige. Sobre él añade cinco piezas nuevas:

```
  CARGA       Carry.ts        qué cabe en cada hueco: manos, espalda, cinturón, hombro
  EQUIPO      Equipment.ts    qué lleva puesto y en qué mano; desgaste por hueco
  LUZ         Light.ts        cuánto ve cada uno aquí y ahora (sol + fuentes)
  REDES       Tech.ts         la red de cada técnica (`web`) y quién abre cada sub-red (`opens`)
  TERRENO     World.ts        altura mutable, profundidad y reparación de regiones
```

### Glosario (se usa así en todo el plan y en el código)

| término | significado | dónde vive |
|---|---|---|
| **hueco** (`Slot`) | un sitio del cuerpo donde va algo: `left`, `right` (manos), `back`, `belt`, `shoulder`, y los de ropa `hips`, `torso`, `legs`, `feet`, `head`, `cloak` | `src/sim/entities/Equipment.ts` (nuevo, fase 11) |
| **puñado** / **brazada** | lo que cabe de un objeto en una mano / en las dos juntas | `ItemDef.hand` (fase 11) |
| **contenedor** | un objeto que, puesto en un hueco, deja llevar más: hatillo, bolsa, cesta, bolsillo, angarillas, carro | `ItemDef.container` (fase 11) |
| **manejado** | un material que alguien tuvo en la mano o trabajó hace poco; cuenta para las chispas | `Person.handled` (fase 11b) |
| **luz** | 0-1 en un punto: el sol (`TimeManager.daylight`) y las fuentes de luz cercanas | `src/sim/core/Light.ts` (nuevo, fase 12) |
| **vista** | el radio al que ve una persona: la base por la luz, más la altura | `Light.sightOf` (fase 12; altura en la 25) |
| **red** / **sub-red** | un grafo de técnicas en su propia pantalla; una sub-red la abre una técnica puerta | `TechDef.web`, `TechDef.opens` (fase 13) |
| **prenda** | un objeto que se lleva en un hueco de ropa, con calor, protección, desgaste, bolsillo y estatus | `ItemDef.garment` (fase 14) |
| **mueble** | un objeto grande que se coloca en una casilla del interior de una casa | `BuildingDef.furniture` (fase 16) |
| **altura** / **profundidad** | la cota de una casilla, la del terreno más lo excavado o apilado; en el agua, cuánto queda por debajo del nivel | `World.heightAt`, `World.depthAt` (fases 25-27) |
| **mapa personal** | qué trozos de su comarca ha visto una persona y cuándo | `src/sim/social/PlaceMemory.ts` (nuevo, fase 2e) |
| **recuerdo** | dónde vio una persona una cosa por última vez, cuándo y cómo estaba; puede estar desfasado | `PlaceMemory` (fase 2e) |
| **niebla** | lo que la pantalla oscurece porque tu personaje no lo ve ahora (lo recordado) o no lo ha visto nunca (negro) | renderer, por `Knowledge.ts` (fase 2i) |
| **región** / **pueblo** | la celda del mapa del mundo / un grupo humano del modelo abstracto de nivel 2 | `src/sim/world/` (fases 29 y 32) |

Los términos de `m13_plan.md` (motivo, presión, sensibilidad, ancla, alcance,
creencia, proponente, partidario) se usan igual aquí.

### Los parámetros van a la configuración

Igual que en M13 (`Config.motivation`), cada bloque nuevo tiene su sección:
`Config.carry` (fase 11), `Config.light` (fase 12), `Config.terrain` (fases
25-27). Cada campo lleva un comentario con el origen del número. `config.test.ts`
comprueba que la configuración por defecto es coherente.

---

## 3. Reglas de trabajo para este plan

Las de `AGENTS.md` y las once del §3 de `m13_plan.md` siguen mandando (commit
de instrumento bit-idéntico y después commit de comportamiento medido; cómo se
demuestra bit-idéntico; coste declarado antes de medir; ninguna tirada nueva si
se puede evitar; `Brain.score` no escribe estado; creencias privadas; la
interfaz dice por qué; `t()`; nada declarado e inerte; la cercanía domina el
puntuador; changelog, bugs, next-steps y una línea «Avance del AAAA-MM-DD» bajo
la fase). Se sustituye `m13` por `m15` en los nombres de artefacto:
`artifacts/m15-<fase>-<escenario>-{before,after}.txt`. Además:

12. **Un bloque se puede dejar a medias sin romper nada.** El orden de M15 es
    largo. Cada fase deja el juego jugable y la matriz explicada, porque el
    propietario puede reordenar lo que queda en cualquier momento.
13. **Una fase importada no se reescribe de memoria.** Antes de empezar una
    fase que viene de M13 o M14, lee su texto de origen entero. M15 solo
    anota lo que cambia.
14. **Lo que se toca con la mano se prueba con la mano.** Cada fase con
    interfaz nueva (equipo, sub-redes, muebles, tejados, arte) añade un e2e con
    `?skipIntro=1`, y la cámara se fija antes de hacer clic (`AGENTS.md`).
    Cada overlay nuevo lleva `[hidden] { display: none; }` y un digest si se
    redibuja.
15. **El arte no pasa por `src/sim/`.** Nada del arte, de las direcciones de
    la mirada ni de los tejados escribe estado de la simulación. La dirección
    de un personaje la deduce el renderer de su movimiento y de su objetivo.
16. **Los costes de supervivencia se miden contra la base recuperada de la
    fase 1**, no contra la de M13 fase 0. La fase 1 fija esa base y la escribe
    en su «Avance».

---

# Bloque 0 — El plan

## Fase 0 — Este documento y el triaje

`notes5.txt` procesado y borrado, como `notes2`-`notes4`. `next-steps.md` con
la cabecera al día, su tabla de milestones y un §7k con la tabla del §0a.
`m13_plan.md` y `m14_plan.md` con un aviso al principio: absorbidos por M15.
`docs/README.md` con este plan en el índice. Entrada en `changelog.md`.
**Hecho con este plan.**

---

# Bloque I — Recuperar

## Fase 1 — La supervivencia que dejó M13, y la matriz

**Por qué va primero.** Las fases 2-6 de M13 dejaron `lean` en 50,6% de
supervivencia media a 20 semillas (4/20 colapsos), frente a 65,9% de su base:
15,3 puntos por debajo, con un límite declarado de 5. Las fases 3 y 5 dejan
sus propios checks en rojo (`nights-are-slept` 20,4% frente a 55%;
`cravings-steer-the-diet` 8,0% frente a 39,9%), y `children-keep-close`
falla en catorce escenarios. Todo lo que viene detrás (las manos sobre todo)
va a cargar la misma economía de la comida. Medir un cambio nuevo sobre un
mundo que ya no se entiende no se puede leer.

**Lo que no se hace aquí:** subir coeficientes hasta que salga el número, ni
tocar `Config.needs` para compensar (regla 3 de M13).

### 1a. Arreglar el instrumento

`DemographyWatch` registra cero muertes en las cohortes en las que el
ejecutor de semillas cuenta cientos (`bugs.md`, «M13 phase 0»). Sin él, la
fase no puede separar las causas. Reproducirlo con un test pequeño (un mundo
con una muerte forzada) antes de tocar nada. Es probable que `finish` reciba un
registro en el que los muertos ya no están, o que la muerte se anote en un
camino (`Simulation` → `LifeSystem`) que el observador no escucha. Bit-idéntico:
el observador no escribe estado ni tira dados (su test de no interferencia ya
existe).

### 1b. Interruptores de ablación (commit de instrumento, bit-idéntico)

Un interruptor en `Config.motivation` por cada regla que M13 añadió y que puede
costar vidas, **encendido por defecto**, de modo que el mundo por defecto no
cambie:

| interruptor | regla | fase de M13 |
|---|---|---|
| `reachFilter` | el filtro de alcance (`Anchor.reachOf`) | 2e |
| `homePressure` | la presión de querencia y `go_home` | 2c-2d |
| `nightSleep` | la presión de sueño nocturno | 3b |
| `infantsStill` | los menores de un año no se mueven | M14 6a parcial |
| `urgentNursing` | la madre interrumpe para amamantar | M14 6b parcial |
| `motherOnlyFeeds` | solo la madre alimenta al bebé | posterior a M13 fase 3 |
| `babyToHouse` | la madre deja al bebé en la casa | posterior a M13 fase 3 |
| `kinDefence` | niños que huyen, familiares que defienden | 4 |
| `cravings` | el antojo de macros | 5 |
| `beliefChoice` | elegir comida por lo que se espera | 6c |

`tools/seeds.ts` gana `--set ruta=valor` (lo que M13 fase 14 pedía; se
adelanta aquí porque es lo que hace posible la ablación sin tocar código).

### 1c. La ablación

Cohortes de 20 semillas en `lean`, `century` y `crowded`: el build completo,
cada interruptor apagado uno a uno y todos apagados. Una tabla en
`docs/m15_recovery.md` con la supervivencia, los colapsos, `DEMOGRAPHY` (causa
de muerte por edad), `HOME` y `KIN` de cada fila. **Todos apagados tiene que
reproducir la base de 65,9% dentro del ruido**; si no, hay un cambio sin
interruptor y hay que encontrarlo antes de seguir.

### 1d. Arreglar mecanismos, no números

Con la tabla delante, por cada regla que cueste más de 2 puntos, buscar el
mecanismo que mata. Los candidatos ya anotados en `bugs.md` son estos:

- **El bebé se queda donde nació** mientras la madre trabaja lejos. Si la
  ablación lo señala, se adelanta de la fase 20 el llevarlo en brazos (sin
  portabebés), que es la solución de fondo, en vez de inventar otra.
- **Dormir de noche** con una presión base de 0,3 pierde contra todo
  (`nights-are-slept` 20%). Hay que leer con `npm run why` qué gana a `sleep`
  a medianoche y por qué, antes de subir nada.
- **El antojo no encuentra proteína** porque no hay proteína al alcance o
  porque no se puede recoger: `bugs.md` pide revisar la disponibilidad local
  antes que los pesos.
- **«Eight timed verbs still ignore thirst, hunger and cold»** (`bugs.md`, M12
  2c): una acción larga sin interrupción por sed es la clase de bug que
  `AGENTS.md` llama de los peores del proyecto.
- **`children-keep-close`** falla en escenarios cortos y pasa en `century`: se
  comprueba si es el mundo o el check (umbral medido sobre muy pocos días).

Cada arreglo es un commit medido con su coste o su ganancia.

**Diagnóstico de `bands-take-sides`** (lo que queda de M14 fase 1b). El
criterio del propietario (§0b, excepción del punto 16): las tribus pueden
enfrentarse sin necesidad material. Se diagnostica si el mecanismo actual
(`BandRelations` y sus cuatro motores) permite esas causas (agravios, feudos
de hogar de M12 fase 6, ambición territorial, estatus) y si el check mide el
comportamiento pretendido. Si falta una causa, se anota aquí y se construye en
la fase 8 (incursiones por propuesta), que es donde encaja. **No se rebaja el
umbral por estar bien alimentados.**

**Clasificación de la matriz** (lo que queda de M14 fase 1a): cada check rojo
de `sim:check:all` tiene una línea en `bugs.md` que dice si falla el mundo o
el check, con la cohorte que lo prueba.

### 1e. Puerta

- `lean` a 20 semillas **≥ 60,9%** (5 puntos de la base) y `century` a 20
  semillas **≥ su base de M13 fase 0 menos 5 puntos**, con las reglas de M13
  encendidas.
- `DEMOGRAPHY` cuenta muertes y coincide con el ejecutor.
- Cada rojo de la matriz, clasificado.

**Si la puerta no se alcanza** después de arreglar los mecanismos que la
ablación señala: parar y llevar al propietario la tabla de `m15_recovery.md`
con la regla que cuesta y lo que se ha probado. Él decide si se acepta la
pérdida (y queda como base nueva) o si una regla se retira.

La base que salga de esta fase es **la base de M15** (regla 16).

**Commits:** `m15: contar las muertes` (1a); `m15: interruptores de
ablación y --set` (1b); uno por arreglo de mecanismo (1d); `m15: clasificar
la matriz` (docs).

---
# Bloque II — Motivación (lo que queda de M13)

Todo este bloque ocurre en el mapa local, como M13. Las reglas de M13 siguen
mandando: **ninguna tirada nueva**, una familia de términos del puntuador cada
vez, `ai-uses-many-actions` leído como distribución y 20 semillas por commit
de comportamiento en `century`, `lean` y `crowded`.

## Fase 2 — Lo que uno sabe del mundo: creencias que viajan, y el mapa de cada uno (M13 fase 7; petición 11)

Dos mitades de la misma regla del propietario: **nadie sabe nada salvo que lo
haya visto o se lo hayan contado.** La primera mitad (2a-2d) es **qué** merece
la pena; la segunda (2e-2k), **dónde** está. Van juntas porque viajan por los
mismos canales (ver, contar, heredar) y porque el mapa de cada uno cambia lo
que el puntuador puede elegir, así que tiene que existir antes que cualquier
otra cosa que se mida sobre él.

### Qué merece la pena (2a-2d)

**Detalle en `m13_plan.md` fase 7.** Nadie sabe qué merece la pena salvo que
lo haya probado, visto o se lo hayan contado.

- **2a. Cerrar la fase 6.** Los rendimientos aprendidos (cosecha, pesca, fruta
  y caza por tick; `bugs.md` cuenta miles de muestras) no los lee ninguna
  acción. Se conecta un lector por familia: el término de rendimiento de
  `forage`, `fish`, `pick` y `hunt` en `Brain` pasa a multiplicar por
  `expect('yield:<verbo>:<recurso>')` normalizado a 1 con la creencia de
  instinto (así la media no se mueve). Se añade la presentación al jugador que
  la fase 6d pedía: en la pestaña Self, «Lo que espera», solo para el
  personaje propio y para quien `Knowledge.knowsBeliefs` permita.
- **2b. Visto** (7a). Ya existe la mitad (`KnowledgeSystem.tryObserve`
  comparte una creencia `seen` mientras el vecino ejecuta la actividad). Se
  añade el ver comer en `ActionSystem.doEat`, con el `alphaSeen` del plan de
  origen.
- **2c. Contado y heredado** (7b, 7c). En `SocialSystem.converse`, una
  creencia en `chat` e `interests`, dos en `deep` y ninguna en `greet`, la que
  más sorprendería al oyente. Al nacer, `child.beliefs` hereda las de la madre
  atenuadas (0,6).
- **2d. El valor de lo que no se sabe** (7d). `techAppeal(person, tech)`, y sus
  lectores en `ask` y `teach`. Al aprender una técnica se reciben las
  creencias de sus productos.

**Qué cambia respecto al plan de origen:** 2a es nuevo (lo pendiente de la fase
6). Las sub-redes de la fase 13 harán que `techAppeal` se evalúe sobre muchos
más nodos: escríbelo por receta (producto frente a ingrediente) y no por
técnica, para que valga igual cuando cada receta sea un nodo.

**Checks de 2a-2d:** `word-travels` (≥ 50% de adultos con una creencia
`seen`, `told` o `inherited`). **Coste declarado:** ≤ 3 puntos.

### Dónde está cada cosa: el mapa de cada uno y la niebla de guerra (2e-2k)

**Objetivo** (petición 11). Hoy todo NPC sabe dónde está cada arbusto de la
isla (§1, punto 11). Con esta fase, cada persona **descubre** su comarca,
**recuerda** dónde vio cada cosa por última vez (y el recuerdo envejece), **va
solo a lo que ve o recuerda**, **explora** cuando lo que sabe no le basta y
**cuenta** a los demás dónde hay comida. La pantalla muestra el mapa de tu
personaje, con lo lejano oscuro bajo la niebla.

#### 2e. El mapa personal y los recuerdos (instrumento, bit-idéntico)

**`src/sim/social/PlaceMemory.ts`** (nuevo), un objeto por persona:

- **Lo explorado:** una rejilla gruesa de la comarca, en celdas de 4 × 4
  casillas (32 × 32 en el mapa de 128), con el **día** en que se vio cada celda
  por última vez (`Uint16Array`, 0 = nunca). Son 2 KB por persona. Se escribe
  en cada turno de pensar (`Brain.think`, nunca en `Brain.score`) con las
  celdas que caen dentro de la vista de la persona (`sightRadius` hoy;
  `Light.sightOf` desde la fase 12, y con la altura desde la 25).
- **Los recuerdos:** lo que vio, por **tipo** (arbusto de bayas, frutal,
  sílex, agua, manada, edificio, montón, persona), cada uno con posición, día y
  estado (cantidad en tramos: lleno, a medias, agotado). Acotado a
  `Config.knowledge.placeMemoryPerKind` (48) por tipo: cuando se llena, se
  olvida el más viejo y más pobre. Los recursos casi no se mueven, así que el
  recuerdo vale mientras nadie los agote; las manadas y las personas se
  recuerdan donde se vieron.
- **Rendimiento:** la regla de `AGENTS.md` es que toda búsqueda de proximidad
  pasa por un hash espacial. Los recuerdos de un tipo son pocos y están
  acotados, pero si el perfil muestra coste, cada tipo guarda sus entradas
  ordenadas por celda gruesa y se consulta por anillos, como un hash pequeño.
  `perf-budget` es la alarma.
- **Punto de partida** (decisión 21): los fundadores conocen su **campamento y
  un radio alrededor** (`Config.knowledge.foundersKnowRadius`, 20 casillas),
  lo que una banda que lleva generaciones allí conoce de verdad. El resto de la
  comarca está por descubrir. Un recién nacido no conoce nada y aprende
  siguiendo a quien lo cuida (el ancla de M13).
- En este commit **nadie lee** el mapa personal: solo se escribe y se mide
  (telemetría de la fracción explorada por banda y de la edad media de los
  recuerdos).

#### 2f. Decidir con lo que se sabe (medido; el commit grande)

- `Brain.findNode` y sus hermanos (agua, frutales, leña, material, presas,
  compañía y almacén) pasan a buscar **en la unión de lo que se ve ahora** (el
  hash del mundo, dentro de la vista) **y lo que se recuerda** (`PlaceMemory`,
  a cualquier distancia). Un candidato recordado puntúa con la cantidad que
  **se recuerda**, no la que tiene.
- **Llegar y encontrarlo agotado** actualiza el recuerdo y hace re-planear: es
  el coste realista de saber poco. Si la orden venía del jugador, la razón se
  ve (`remembered_wrong`: «el arbusto ya estaba pelado»), como pide la regla de
  la interfaz.
- **Lo que siempre se sabe:** el camino a casa y el agua que se ha visto. La
  sed no puede convertirse en un segundo mecanismo de muerte porque alguien no
  recuerde un arroyo que tiene al lado: el agua **vista una vez** no se
  olvida.
- `BandMaps.ts` (§0c) deja de ser un mapa de la banda: la incursión por
  necesidad (M12) lee el mapa **de quien la propone** (fase 8). La cabecera
  de `BandMaps.ts` que la llama «la semilla del mapa del mundo» se corrige.
- **Coste declarado: ≤ 5 puntos.** Es de los cambios grandes del plan. Si se
  pasa, las primeras palancas son de mecanismo: el radio que conocen los
  fundadores, que se cuente dónde hay comida (2h) y que se explore a tiempo
  (2g). Nunca «que vuelvan a verlo todo».

#### 2g. Explorar

Verbo **`explore`**: ir a una celda poco conocida o vieja del borde de lo
explorado, mirar y volver. Se puntúa con:

- la **presión de hambre** cuando lo que se recuerda no alcanza (los recuerdos
  de comida están agotados o lejos);
- la **sensibilidad de curiosidad** (una fila de `Temperament.ts`; la fase 5e
  la convierte en el motivo curiosidad, que la sustituye);
- y dentro del **alcance** de M13 (`Anchor.reachOf`): explorar no puede
  deshacer lo que la fase 2 de M13 arregló (la gente que acababa en la otra
  punta de la isla).

`wander` se queda como paseo sin objetivo. `explore` va a lo desconocido.

#### 2h. Contar dónde está (medido)

- **Visto:** quien acompaña a otro ve lo mismo, así que caminar juntos ya
  comparte el mapa. Los niños aprenden el mapa siguiendo a quien los cuida.
- **Contado:** en `SocialSystem.converse`, en los modos `chat`, `interests` y
  `deep`, se cuenta **un lugar**: el recuerdo de comida o agua más valioso que
  el oyente no tiene, o que tiene más viejo. El oyente lo recibe marcado
  **de oídas** (`told`), con el día en que lo vio quien lo cuenta, no el de
  hoy. Así un rumor viejo es un rumor viejo. Es la misma historia de tipo
  `place` que `m14_plan.md` fase 13c proponía para el mapa del mundo, a escala
  de comarca.
- **Quien llega de fuera trae su mapa** (un cónyuge de otra banda o un cautivo):
  el suyo, no el de su banda.
- Test: un recuerdo sembrado en una persona llega a la mayoría de su hogar en N
  días de charla.

#### 2i. La niebla de guerra en la pantalla (renderer; bit-idéntico; e2e)

La pantalla muestra **el mapa de tu personaje** (decisión 20), con tres
estados por celda:

- **en vista ahora:** normal, con las entidades de verdad;
- **explorado, pero no a la vista:** el terreno oscurecido y velado, y las
  entidades **donde tu personaje las recuerda**, con el aspecto que tenían
  (un arbusto que para él sigue lleno aunque ya no lo esté; una manada que ya
  se fue). Al pasar el cursor: «visto hace N días», o «de oídas» si se lo
  contaron;
- **nunca visto:** negro.

Detalles:

- **El terreno de las celdas exploradas** se dibuja como es ahora, salvo lo
  que cambia el terreno (obras de tierra, fase 26; edificios nuevos), que solo
  se ve al volver a verlo. Para eso, el renderer guarda por celda una versión
  de lo que tu personaje vio.
- **Todo pasa por `Knowledge.ts`**: el selector de entidades (`EntityPicker`),
  los clics, el menú radial y los paneles no pueden alcanzar nada que tu
  personaje no vea ni recuerde. Es la misma regla que ya protege el nombre de
  un desconocido.
- **Al heredar**, la niebla pasa a ser la del heredero, que trae su propio
  mapa.
- Una opción de ajustes **«Sin niebla (modo observador)»** para depurar y para
  quien prefiera jugar así, apagada por defecto.
- `[hidden] { display: none; }` y el digest donde haga falta; la niebla se
  compone en una capa aparte que solo se recalcula cuando cambia el mapa del
  personaje, no en cada fotograma.
- e2e con `?skipIntro=1`: lo nunca visto no se puede seleccionar; lo
  recordado muestra su antigüedad; tras la sucesión, la niebla cambia.

#### 2j. La noche, la altura y el mundo (enlaces con otras fases)

- La fase 12 reduce la vista de noche: **de noche se descubre menos**, y se
  recuerda lo que se vio de día.
- La fase 25 añade la vista desde lo alto: **subir a una colina descubre
  más**, el uso más viejo de una atalaya.
- La fase 31 (`WorldKnowledge`) es este mismo mapa a escala de regiones, y usa
  los mismos canales.

#### 2k. Checks y medición

- `people-act-on-what-they-know`: el 100% de los objetivos de `forage`,
  `pick`, `drink`, `hunt` y `chop` estaban a la vista o en la memoria de quien
  fue. Es un invariante, y **hoy falla** (el puntuador va a lo que no ha visto
  nunca).
- `the-map-grows`: la fracción explorada media por banda crece durante la
  partida y no llega al 100% en `century` (si llega, el mundo es demasiado
  pequeño o se explora demasiado).
- `word-of-food-travels`: hay recolecciones en recursos conocidos **de
  oídas**.
- `stale-memories-cost`: hay viajes a recuerdos agotados. Se informa, no se
  exige un umbral: es el coste realista, y su tamaño es un dato de la cohorte.
- `children-keep-close`, `nights-are-slept` y la línea `HOME` no pueden
  empeorar: explorar no deshace la querencia.
- **Coste declarado de 2f-2h:** ≤ 5 puntos en `lean` y `century` frente a la
  base de la fase 1. Si se supera, **para y pregunta**.

**Commits:** `m15: rendimientos que se leen` (2a); `m15: lo que se ve comer`;
`m15: lo que se cuenta y lo que se hereda`; `m15: pedir que te enseñen lo que
vale la pena`; `m15: el mapa de cada uno, medido` (2e); `m15: decidir con lo
que se sabe` (2f); `m15: explorar`; `m15: contar dónde hay comida`;
`m15: la niebla de guerra` (2i).

## Fase 3 — El fuego, primera parte: la hoguera y el asado (M13 fase 8; nota 5)

**Detalle en `m13_plan.md` fase 8.** El caso de prueba del propietario: la
carne asada se prefiere porque alguien la probó y se corrió la voz, no por un
coeficiente.

- **3a. La hoguera** (`BUILDINGS.hearth` al final de la tabla; `firemaking`;
  palos y sílex; 1×1): calor en un radio (`hearthWarmth` combinado con el
  techo por `max`), estación de cocina (`recipe.station: 'hearth'`) y creencia
  `warm:hearth` aprendida al descansar cerca con frío. La banda la planea
  cuando alguien espera calor de ella, no por saber `firemaking`.
- **3b. El asado.** `roast_meat` y `roast_fish` al final de `ITEMS` y
  `RECIPES`. **`cooking` deja de multiplicar toda la comida** y multiplica solo
  lo cocinado. Quien sabe `cooking` y lleva carne cruda cerca de una hoguera
  puntúa asar por la ganancia **que espera**: 0 hasta que lo prueba o se lo
  cuentan.
- **3c. Escenario `hearths`** (2 bandas de 12, `firemaking` para todos y
  `cooking` para un fundador por banda mediante `startingTechFew`).

**Qué cambia respecto al plan de origen** (decisión 15, «fundir y ampliar»):

- La hoguera nace con **un campo `light` de radio** en su `BuildingDef`, que
  **no se declara todavía**: lo añade la fase 12 junto con su primer lector
  (regla «nada inerte»). Aquí solo da calor y cocina.
- El asado es **la primera receta de la futura sub-red de cocina**. En esta
  fase sigue siendo una receta de `cooking`; la fase 13 la convierte en nodo
  de la sub-red sin cambiar su efecto.
- La carne cruda sigue sin enfermar hasta la fase 22.

**Checks:** `the-hearth-warms`, `roast-wins` (≥ 60% de la carne y el pescado
que come quien sabe `cooking`, asado), `cooking-spreads` (en `hearths`,
`cooking` al menos se triplica). **Coste declarado:** ≤ 3 puntos en `century` y
`craft`.

## Fase 4 — Descubrir por necesidad (M13 fase 9)

**Detalle en `m13_plan.md` fase 9.** `Person.chronic` (media móvil de cada
presión), un ingrediente de chispa `wanting` y `TechDef.answers` en las
técnicas cuyo efecto calma de verdad un motivo, con sus lectores
(`workableIdea`, `ponder` y `discuss` con menos comodidad si la idea responde a
una carencia crónica).

**Qué cambia respecto al plan de origen:**

- Se revive aquí la **cuarta ruta de chispa de `tracking`** (`wander` en
  `person.lately`, `next-steps.md` §6), en su propio commit y medida con
  `conceived_tracking`, porque es la misma familia: ideas que nacen de lo que
  uno hace.
- `answers` se escribe pensando en las sub-redes: una receta puede tener su
  `answers` propio (el asado → `hunger`, `variety`), y la fase 13 lo lee igual.

**Checks:** `fire-is-found` (≥ 50% de semillas de `century`, decisión
aprobada), `discovery-is-situated` en verde, `ideas-are-conceived` bajo su
techo. **Coste declarado:** ≤ 3 puntos; `known` y `pastRoots` no bajan.

## Fase 5 — Los motivos que no son del cuerpo (M13 fase 10)

**Detalle en `m13_plan.md` fase 10.** Seis motivos, uno por commit medido:
seguridad, pertenencia, propósito, estatus, curiosidad y posesión, cada uno con
su escritor, su presión, su fila en `Temperament.ts`, sus lectores y los
coeficientes del Apéndice A de M13 que sustituye.

**Qué cambia respecto al plan de origen:** el canal `comfort` del ánimo no se
toca aquí. Lo escribe la fase 16d (dónde se duerme), cuando los muebles
existen, y su lector es el motivo `comfort` de esa misma fase. Así se cumple lo
que `m9_6_plan.md` dejó escrito: el término de la cama no se escribe hasta que
exista una cama.

**Check:** `moods-move-choices`. **Coste declarado:** ≤ 3 puntos por subfase.

## Fase 6 — Obras por persuasión (M13 fase 11; `notes4.txt`)

**Detalle en `m13_plan.md` fase 11.** `Building.sponsorId` y `backers`; nadie
trabaja en una obra sin ser su proponente, su partidario o sin que se lo hayan
mandado; `social/Persuasion.ts` y el verbo `propose`; «Pedir ayuda con…» en el
menú radial; el jefe manda solo en las obras que quiere.

**Qué cambia respecto al plan de origen:** nada en el mecanismo. Anota en la
fase 11 que, con las manos, **cada partidario vale más**: una obra con cuatro
personas acarreando puñados acaba mucho antes que una con una sola. Esa es
parte de la razón histórica para convencer, y la fase 11 la mide.

**Checks:** `building-starts-small`, `projects-find-backers` (≥ 70%).
**Coste declarado:** ≤ 3 puntos; mirar las muertes por frío.

## Fase 7 — Las órdenes pesan lo que piden (M14 fase 2; nota 9 de `notes3`)

**Detalle en `m14_plan.md` fase 2.** Va aquí porque es de la misma familia que
convencer: pedir y mandar.

- **7a. Que se vea** (interfaz, bit-idéntico). La razón de `standingOver`
  añade un tramo por el coste de la orden («es poca cosa», «es mucho pedir»,
  «le pides que arriesgue la vida»), y el menú radial muestra la probabilidad
  estimada en palabras antes de dar la orden. Todo por `t()`.
- **7b. Que se mida.** Contadores `order_<verbo>_obeyed/refused` y una línea
  `ORDERS` en la cohorte. Si la saturación de la autoridad (0,98) aplana la
  diferencia entre recolectar y atacar, el `0.6` único pasa a ser una
  pendiente que crece con el coste.

**Puerta:** con el mismo mandante, la obediencia a `gather` supera a la de
`attack`. Test unitario con cinco verbos.

## Fase 8 — Incursiones por propuesta, y guerras que empiezan y acaban (M13 fase 12)

**Detalle en `m13_plan.md` fase 12.** Un instigador cuyo ánimo de incursión
supera `motivation.raidUrge` propone al jefe; si el jefe no la aprueba, puede
ir con quienes convenza; el cansancio de la guerra resta ánimo y suma a
`parley` y `make_peace`; y, si hace falta, el sabotaje suelto necesita una
razón.

**Qué cambia respecto al plan de origen:** la fórmula del ánimo de incursión
incluye **las causas sociales** que la fase 1d haya encontrado ausentes
(agravio heredado de hogar, ambición territorial, estatus), porque son el
criterio del propietario para los pueblos bien alimentados. `bands-take-sides`
se vuelve a medir aquí, con su umbral intacto.

Además, la incursión por necesidad de M12, que hoy lee `BandMaps` (el mapa de
toda la banda), pasa a leer **el mapa del instigador** (fase 2e): solo se
asalta lo que alguien sabe que existe, porque lo vio o se lo contaron.

**Checks:** `peaceShare ≥ 50%` en `lean` a 20 semillas; `bands-take-sides` en
`farmers`, `herders` y `stewards`.

## Fase 9 — El campamento se mueve (M13 fase 13; aprobado)

**Detalle en `m13_plan.md` fase 13.** Cuando la comida al alcance se agota
durante `motivation.relocateAfter` días, o tras una guerra perdida, el adulto
con más hambre crónica y miedo propone mudarse a la banda entera. El destino es
el mejor punto **que conoce quien lo propone** (su mapa personal, fase 2e) en
la misma región de paso, sin RNG. Quien no conoce un sitio mejor, primero
explora (2g). Si se
convencen más de la mitad, `band.homeX/Y` cambia; quien no se convence puede
quedarse, y **la banda se parte**.

**Check:** `camps-move-when-the-land-fails` en `lean`.

## Fase 10 — Calibrar contra la historia, primera pasada (M13 fase 14)

**Detalle en `m13_plan.md` fase 14 y su tabla «Objetivos históricos»**
(aprobada). `--set` ya existe desde la fase 1b. Se añade el escenario
`generations` (quince años de juego, 144.000 pasos) y se sigue el protocolo:
un parámetro cada vez, 20 semillas por valor y la tabla en
`docs/m15_calibration.md`.

**Qué cambia respecto al plan de origen:** es **la primera de dos pasadas**.
Los bloques III-VI cambian la economía (manos, descomposición, noche, cuerpo,
fauna), así que la calibración se repite en la fase 41, antes de cerrar M15, y
se revisa antes del LOD (fase 32), que tiene que calibrarse contra una
demografía estable. Esta primera pasada fija los valores de
`Config.motivation` con los que empieza el bloque III.

---
# Bloque III — Las cosas (`notes5.txt`, notas 1-6)

La cultura material: con qué se carga, qué se lleva puesto, con qué se ve de
noche, qué se sabe hacer y dónde se duerme. Es el bloque que más cambia la
economía después de M13, así que **cada fase declara su coste antes de medir
contra la base de la fase 1** y para si lo supera.

Orden interno y por qué:

1. **Las manos (11)** van primero porque todo lo demás se sostiene con ellas:
   la antorcha, la ropa con bolsillos, los muebles que se acarrean y la tierra
   que se cava.
2. **La luz (12)** necesita las manos, porque la antorcha va en una.
3. **Las sub-redes (13)** van antes que la ropa, porque la ropa es la primera
   sub-red grande.
4. **La ropa (14)**, **la sal (15)** y **los interiores (16)** son contenido
   sobre esas tres piezas.
5. **El arte (17)** cierra el bloque porque dibuja lo que las cinco anteriores
   definen (manos, prendas, muebles). Su contrato de capas se fija en la fase
   11 para que **un agente pueda producir arte en paralelo** desde entonces.

## Fase 11 — Las manos: equipo y carga (notas 5 y decisión 5)

**Objetivo.** Hoy cualquiera carga 40 unidades desde que nace. En la
historia, un grupo sin ropa ni recipientes lleva lo que cabe en las manos, y
cada contenedor (la cuerda que ata un hatillo, la bolsa de piel, la cesta, la
bolsa cosida, las angarillas, el carro) es un salto de productividad. El
propietario lo quiere así, con este efecto: **las obras tardan más**, porque
entre viaje y viaje hay que parar a comer, y la gente **come donde recoge**.

### 11a. El modelo, inerte (bit-idéntico)

- **`src/sim/entities/Equipment.ts`** (nuevo). `SLOTS`: `left`, `right`,
  `back`, `belt`, `shoulder`, y los de ropa (`hips`, `torso`, `legs`, `feet`,
  `head`, `cloak`), que no se usan hasta la fase 14 y **no se declaran
  todavía** (regla «nada inerte»: entran con su lector en la 14).
  `Person.equipment: Partial<Record<Slot, EquippedItem>>`, con
  `EquippedItem = { item: string; count: number; wear?: number; lit?: number }`
  (`wear` entra en la 14 y `lit` en la 12, con sus lectores).
- **`ItemDef.hand`**: `{ perHand, perArms, hands: 1 | 2, shoulder?: number }`.
  `perHand` es el puñado, `perArms` la brazada y `shoulder` lo que se lleva al
  hombro (un tronco, una presa). Todo objeto de `ITEMS` lo lleva; un test lo
  exige. Números de partida, aprobados en su forma (§0b, 5) y ajustables en
  `Config.carry`:

  | objeto | puñado | brazada | hombro | nota |
  |---|---|---|---|---|
  | bayas, frutos secos, bellotas, grano, harina | 4 | 10 | — | «4 bayas» (propietario) |
  | manzanas, peras, ciruelas | 2 | 6 | — | |
  | sílex, arcilla (`mud`) | 1 | 3 | — | «1 piedra»; el barro se lleva en cesta |
  | palos, paja | 2 | 6 | — | «2 palos; brazada de 6» |
  | madera (`wood`) | 0 | 1 | 2 | un tronco con los dos brazos |
  | carne, pescado | 2 | 5 | 8 | una pieza al hombro |
  | piel | 1 | 2 | 4 | |
  | hueso, tendón | 2 / 4 | 6 / 10 | — | |
  | herramientas, armas, flauta | 1 | 1 | — | `hands: 1`; el arco, `hands: 2` al disparar |

  Los niños y los viejos llevan menos por el mismo `vigour` de hoy (redondeo
  hacia abajo, mínimo 1).
- **`ItemDef.container`**: `{ slot, capacity, accepts }`, donde `accepts` es
  una lista de clases de objeto (`small`, `long`, `bulky`, `food`).
  `ItemDef.class` asigna una clase a cada objeto.
- **`src/sim/core/Carry.ts`** (nuevo): `capacityFor(person, item)`,
  `canTake(person, item, n)` y `stow(person, item, n)`, que decide qué hueco
  recibe cada cosa (una mano libre, las dos, el hombro o un contenedor
  compatible). **`Person.inventory` no desaparece**: sigue siendo la suma de
  todo lo que se lleva, así que los cientos de lectores de
  `inventory.has(...)` siguen funcionando. Lo que cambia es **cuánto cabe**, y
  eso lo decide `Carry`.
- **Interruptor `Config.carry.legacyPack` (por defecto `true` en este
  commit)**: con él encendido, `capacityFor` devuelve la fórmula de hoy
  (`40 × vigour × carryFactor`) y `stow` rellena los huecos solo para la
  interfaz. Así el commit es bit-idéntico.
- **Interfaz** (bit-idéntica): la pestaña Kit dibuja una silueta con las dos
  manos, el hombro, la espalda y el cinturón, y lo que hay en cada uno.
  `QuantityPicker` recorta por la capacidad del hueco elegido.

### 11b. Las chispas cuentan lo manejado (decisión 6; medido)

**Antes de recortar la carga**, porque si no las ideas dejan de nacer (lo vio
el propietario). `knowledge/Synthesis.ts` usa el ingrediente
`{ kind: 'holding', item }`.

- `Person.handled: Map<string, number>` guarda el último tick en que cada
  objeto se tuvo en la mano o se trabajó. Se escribe en `ActionSystem` al
  recoger, coger, fabricar, construir con un material y acarrear a una obra;
  **nunca** en `Brain.score` (regla 5 de M13).
- `KnowledgeSystem.notice` rellena `Notice.holding` con tres fuentes: lo que
  lleva encima; lo que hay a `Config.carry.handledReach` (2) casillas en un
  montón, un almacén de su banda o una obra (por los hashes espaciales, nunca
  recorriendo arrays); y lo manejado en los últimos
  `Config.carry.handledDays` (3) días. El nombre `holding` se conserva en los
  datos (sería mucho cambio sin ganancia) y su comentario explica que ahora
  significa «manejado».
- **Medido** a 20 semillas: `ideas-are-conceived` no puede pasar de su techo
  de tres ideas por persona-año (si lo pasa, se baja `handledDays`, no
  `conceptionBase`), y `known` y `pastRoots` no bajan.

### 11c. Solo las manos, y la escalera (medido; el commit grande)

`legacyPack` pasa a `false`. **Nunca las manos solas**: la escalera de
contenedores sale en este mismo commit.

| contenedor | hueco | técnica | receta | capacidad | nota histórica |
|---|---|---|---|---|---|
| hatillo (`bundle`) | hombro | `cordage` | cuerda 1 | 12 de lo largo (palos, paja), 4 pieles o 2 maderas | «con la cuerda podrán atar cosas» (propietario) |
| bolsa de piel (`hide_bag`) | cinturón | `leatherwork` | piel 1, cuerda 1 | 12 de lo pequeño | la bolsa de cinturón de Ötzi |
| cesta (`basket`, ya existe) | espalda | `basketry` | la de hoy | 24 de lo pequeño o de comida, barro incluido | la carga de tierra y arcilla de todo el Neolítico |
| bolsa cosida en la prenda | la prenda | fase 14 | fase 14 | 4-8 de lo pequeño | llega con la ropa |
| angarillas (`sledge`) | las dos manos (arrastre) | `sledge` (nuevo, Mesolítico: `carpentry`, `cordage`) | madera 2, cuerda 2 | 30 de todo, a 0,8 de paso | las rastras del Mesolítico; la fase 35 les añade el viaje entre comarcas |
| carro (`cart`, ya existe) | las dos manos | `the_wheel` | la de hoy | 60 de todo | |

- `carryFactor` se retira: su papel lo hacen los contenedores. Sus tres
  lectores (`cordage`, la cesta y el carro) pasan a ser la tabla. `cordage`
  conserva su efecto de receta (la cuerda) y gana el hatillo. **La regla del
  doble candado se mantiene**: un contenedor cuenta si está **puesto en su
  hueco**, no solo en el inventario.
- **Se come donde se recoge.** `forage` y `pick` con el hambre por encima de
  `Config.carry.eatAtSourceAt` comen del arbusto o del árbol en vez de
  guardar, hasta calmarla, y después guardan lo que quepa. Es un cambio en
  `ActionSystem.doForage` y `doPick`, no un verbo nuevo.
- **La presa se queda donde cae.** `doHunt` ya suelta en un montón lo que no
  cabe (`ctx.dropAt`); ahora eso es lo normal. Quien mata carga lo que puede y
  los demás pueden ir a por el resto (11d). Compartir en el lugar de la caza es
  lo histórico y sale solo.
- **Las obras se hacen a puñados.** `haul` y `gather_for_site` ya guardan el
  progreso en la obra (`Building.progress`). No cambian: cada viaje lleva menos,
  hay más viajes y, entre medias, la gente come. Es el efecto que pidió el
  propietario, y se mide (abajo).
- **Las chispas de contenedores ya existen:** `Synthesis.ts` tiene el evento
  `hands_full` («run out of hands»). Con las manos se disparará mucho más, y
  **eso es lo que debe inventar la cesta y la bolsa**. Se verifica con el
  contador por ruta, no se añade un peso.

### 11d. Lo que hace un NPC con las manos (medido)

- **Elegir herramienta.** `ActionSystem` gana `equipFor(person, action)`: el
  hacha para `chop`, la lanza para `hunt` y las manos vacías para `forage`.
  Pasar algo de la espalda o del cinturón a la mano cuesta
  `Config.carry.equipTicks` (3). Si hay que soltar algo para coger otra cosa,
  se suelta en un montón a los pies.
- **Recoger del suelo.** Hoy solo el jugador recoge (`bugs.md`, «Nobody ever
  picks anything up off the ground but the player»). `pickup` gana su
  puntuador en `Brain`: un montón al alcance con algo que el motivo actual
  quiere (comida con hambre, material de una obra de la que es partidario,
  una herramienta de su oficio). **Es un filtro de propiedad**: un montón
  ajeno se rige por las reglas de M11 fase 4 (se puede, si nadie de la banda
  dueña lo ve).
- **Razones visibles** (`abandon(…, razón)` con su frase por `t()`):
  `hands_full` («tiene las manos llenas»), `no_free_hand` («no tiene una mano
  libre»), `needs_both_hands` («hacen falta las dos manos»),
  `too_heavy` («pesa demasiado para cargarlo»).
- **El jugador:** en el menú radial, «Coger con la mano izquierda/derecha»,
  «Pasar a la espalda», «Soltar». Arrastrar entre huecos en la pestaña Kit.

### 11e. Checks, escenario y medición

- Escenario **`porters`**: dos bandas en la misma semilla, una con `cordage`,
  `leatherwork` y `basketry` y la otra sin ellas (`startingTechByBand`), el
  mismo truco que `scribes`.
- `hands-limit-loads`: nadie lleva nunca más de lo que caben sus huecos (un
  invariante). **Falla con `legacyPack: true`.**
- `containers-carry-more`: en `porters`, lo que se lleva por viaje a una obra o
  un almacén es mayor en la banda con contenedores. Con `legacyPack` las dos son
  iguales, y falla.
- `builds-take-trips`: mediana de viajes por obra terminada; se informa y se
  compara antes y después. La puerta es que **`bands-decide-to-build` y
  `shelter-answers-cold` sigan en verde**: las chozas se acaban, más tarde,
  pero antes del invierno.
- `spares-are-found`: hay recogidas de NPC (`npc_pickup > 0`). Hoy falla.
- **Coste declarado: ≤ 5 puntos** de supervivencia media en `lean` y `century`
  frente a la base de la fase 1. Si se supera, **para**. Las primeras palancas
  son de mecanismo: que la chispa de la cesta dispare (contador `hands_full`),
  que se coma en el sitio y que los montones de la caza se recojan. No se toca
  el puñado hasta preguntar.

**Commits:** `m15: huecos y carga, inertes`; `m15: las ideas nacen de lo
manejado`; `m15: solo las manos, y los contenedores`; `m15: elegir
herramienta y recoger del suelo`; `m15: el escenario porters`.

**Contrato de arte (para la fase 17)**, en el mismo commit que 11a: la lista de
objetos que se dibujan en mano (`HeldItemKind`, que hoy existe en
`Sprites.ts`, crece hasta cubrir todo `ITEMS` con `hands`), los de espalda y
hombro, y los puntos de anclaje que el arte tendrá que dar (mano izquierda,
mano derecha, hombro, espalda). Se escribe en `docs/m15_art_contract.md`.

## Fase 12 — La noche y la luz; la antorcha (nota 5; decisión 7; el fuego, segunda parte)

**Objetivo.** Que la noche importe: se ve menos, se trabaja peor, se roba más
fácil y los animales se acercan. El fuego es la respuesta, fija (hoguera, y en
la fase 16 el hogar interior) o en la mano (la antorcha).

### 12a. La luz, medida e inerte (bit-idéntico)

- **`src/sim/core/Light.ts`** (nuevo). `lightAt(x, y)`: el máximo entre
  `TimeManager.daylight` y las fuentes cercanas, cada una con su radio y su
  caída. Las fuentes son los edificios con `light` (la hoguera, desde aquí) y
  las personas con una antorcha encendida. Se consultan por hash espacial.
- `sightOf(person) = Config.light.baseSight × max(nightFloor, lightAt)`, con
  `nightFloor` 0,35: el ojo acostumbrado a la oscuridad no está ciego.
- Instrumento: telemetría de la luz media de las muestras nocturnas.
  `BuildingDef.light` se declara en este commit **solo si** el commit de
  lectores (12b) va detrás sin otro en medio; si no, entra con 12b.

### 12b. Quien lee la luz (medido)

- **`Brain`**: `BrainContext.sightRadius` (un número para todos) pasa a ser
  `sightOf(person)`, calculado **una vez por turno de pensar** (el
  rendimiento; `perf-budget` es la alarma).
- **Los testigos**: cada función que decide quién vio algo (robo, agresión,
  intrusión, cuerpo hallado, observar para aprender; búscalas por
  `WATCHING_RANGE`, `sightIntruders`, los radios de `social/Witness`,
  `Investigation` y `Corpse`) usa la vista del observador en ese momento. **Es
  la regla «nadie se entera por arte de magia» aplicada a la oscuridad**: de
  noche se ve menos, y el puntuador de `steal` ya lee quién podría verlo, así
  que robar de noche debería salir solo. Se mide, no se programa.
- **El trabajo fino** (`craft`, tallar, coser, escribir) va a
  `Config.light.fineWorkDark` (0,5) de ritmo sin luz. El trabajo grueso
  (acarrear, talar) no cambia. Es lo que hará valioso el hogar interior.
- **La caza** falla más sin luz: un término en la probabilidad de acierto.

### 12c. La pantalla se oscurece (renderer, bit-idéntico)

Una capa de noche encima del mundo, con la opacidad de `1 − daylight`, en la
que cada fuente de luz visible abre un degradado radial
(`globalCompositeOperation = 'destination-out'`). Solo se dibujan las fuentes
en pantalla. `perf-budget` no mide el renderer (`bugs.md`), así que se mide
con la traza de `npm run shots` y se anota en el changelog.

### 12d. La antorcha (medido)

- **`fat`**, al final de `ITEMS`: la grasa. Sale de destripar ciervo y jabalí
  (1-2; la liebre no da), en `doHunt` junto a la piel. **Se come** (nutrición
  18, macros casi todo grasa), así que entra en el antojo de M13 fase 5: se
  mide. **Y tiene otros usos** (decisión 22), así que comerla o guardarla
  es una elección con coste. Cada uso llega en su fase y con su efecto:

  | uso | fase | qué hace |
  |---|---|---|
  | antorcha de grasa | **12d** (aquí) | dura el triple que la de palo y paja |
  | lámpara de grasa (`fat_lamp`) | **16d** | luz fija y larga dentro de casa: las lámparas de piedra de Lascaux |
  | curtir la piel (`hide_dressing`) | **14c** | las prendas de piel curtida con grasa se gastan más despacio |
  | pemmican (`pemmican`) | **15b** | carne seca machacada con grasa: la comida que más dura y más alimenta, la provisión de viaje de la fase 35 |
  | caldo | **13d** | `stone_boiling` acepta grasa además de hueso |
  | sebo y velas (`tallow`) | **37** | sub-red Fuego, Edad del Bronce: luz más limpia y más larga |
  | jabón (`soap`) | **21**, opcional | grasa y ceniza (Babilonia, hace ~4.800 años): menos infección de heridas |

- **Dos antorchas**, al final de `ITEMS` y `RECIPES`, bajo `firemaking`, y se
  fabrican apagadas:
  - **`torch`**: palos 1 y paja 1. Arde `Config.light.torchTicks` (20 pasos,
    unas dos horas de juego). Es la que puede hacer cualquiera.
  - **`fat_torch`**: palos 1 y grasa 1. Arde `Config.light.fatTorchTicks` (60
    pasos, unas seis horas, lo que dura una tarea de noche). Es la que pide la
    grasa de la caza, y la razón para guardarla en vez de comérsela.
- **Verbo `light_torch`**: junto a una hoguera encendida, pasa la antorcha a
  una mano con `lit` igual a su duración. Arde en la mano y al llegar a 0 se
  consume. Una antorcha que se apaga se puede volver a encender si aún le
  queda. `abandon` con `no_fire_near`, `no_free_hand` o `torch_burnt_out`.
- **Efectos, cada uno con su lector en este commit**: luz en un radio (4) en
  `Light.lightAt`; calor personal en `warmthFrom` (un término más, 0,2, por la
  regla de rendimientos decrecientes que ya usa); y en `WildlifeSystem` la
  distancia de huida de un animal ante una persona con antorcha se dobla. Los
  depredadores la leerán en la fase 23 con el mismo campo.
- **Quién la enciende.** Un NPC la puntúa por lo que **espera** de ella
  (creencias de M13): `warm:torch` si tiene frío y `light:torch` si tiene que
  trabajar o caminar de noche. El ejemplo del propietario, el que tiene frío
  y tiene que talar, sale de eso: la antorcha en una mano y el hacha en la
  otra (`equipFor` de 11d respeta la mano ocupada).

### 12e. El fuego abriga donde está (medido)

Hoy `warmthFrom` da `0,45 × techPower(person, 'firemaking')`: saber hacer
fuego calienta en cualquier parte. Con la hoguera (fase 3) y la antorcha,
**ese término se retira** y el calor del fuego pasa a ser solo el de las
fuentes cercanas. Es el mismo principio que la decisión 8 para la ropa.
Commit propio, porque **es el que más puede costar en muertes por frío**. Coste
declarado: ≤ 4 puntos. Si se supera, antes de nada se mira si las hogueras se
construyen a tiempo (`the-hearth-warms`).

### 12f. Checks y escenario

- Escenario **`nights`**: invierno duro, dos bandas que saben `firemaking`.
- `darkness-hides`: la fracción de hechos con testigo es menor de noche que de
  día. Falla con 12a solo.
- `torches-are-carried`: en `nights` hay antorchas encendidas en las noches de
  invierno.
- `light-lets-work`: de noche, el trabajo fino ocurre más cerca de una fuente
  de luz que lejos de ella.
- `VIOLENCE` y la línea de robos de la cohorte, antes y después: la noche
  puede subir el robo, y eso **no es un fallo** si sale del puntuador. Sí lo
  es si rompe `inBandKillRate`.
- **Coste declarado:** ≤ 3 puntos (12b y 12d); 12e, el suyo.

**Commits:** `m15: la luz, medida`; `m15: la noche ciega`; `m15: la noche en
pantalla`; `m15: la antorcha`; `m15: el fuego abriga donde está`.

**Fuera de esta fase, a propósito:** la luna. Un ciclo lunar en un año de 40
días no tiene escala histórica que imitar; ver «Decisiones».

## Fase 13 — Sub-redes de tecnología (nota 4; decisión 4)

**Objetivo.** La amplitud de Evolve sin una red ilegible: la red principal
tiene las técnicas y cada técnica puerta abre la suya, con recetas, prendas y
armas como nodos propios que se descubren, se enseñan y se heredan.

### 13a. Datos y reubicación (bit-idéntico)

- `TechDef.web: WebId` (por defecto `'main'`) y `TechDef.opens?: WebId`. Tabla
  `WEBS` en `knowledge/Tech.ts`: `id`, etiqueta, técnica puerta y color.
- **Reubicar lo que ya es receta**: técnicas existentes que por su naturaleza
  son una variante de su puerta cambian solo de `web`. La simulación no lee
  `web`, así que el commit es bit-idéntico. Las sub-redes y su contenido, por
  fase:

  | sub-red | puerta | nodos que ya existen y se mudan | nodos nuevos, y en qué fase | se abre en |
  |---|---|---|---|---|
  | Cocina | `cooking` | el asado (fase 3), `bread`, `brewing` | `stone_boiling` y `flatbread` (13d); ahumado (15) | **13** |
  | Armas | `spear` | `bow`, `atlatl` | `fire_hardened_spear` (13d); `sling` (13d) | **13** |
  | Campo | `farming` | `composting`, `sickle`, `calendar` | `irrigation` (26); `arboriculture` (24) | **13** |
  | Doma | `taming` | `herding`, `dairying`, `wool` | `dog` (23); `pack_animals`, `horse_riding` (35) | **13** |
  | Ropa | `clothing` | `tailoring`, `spinning`, `weaving` | todas las prendas y `hide_dressing` (14); `sling`, el portabebés (20) | **14** |
  | Conservación | `preserving` | — | `smoking`, `saltmaking`, `salting`, `pemmican` (15) | **15** |
  | Fuego | `firemaking` | `torch` y `fat_torch` (12) | `fireplace` y `fat_lamp` (16); `charcoal` y `tallow` (37) | **16** |
  | Tierra | `earthworks` | — | `ditch`, `moat`, `terracing` (26) | **26** |
  | Metal | `native_copper` | — | los de M8.3 (37) y M8.4 (40) | **37** |

  **Regla de la tabla:** una sub-red se abre en la fase en la que tiene al
  menos dos nodos con efecto. Antes, sus nodos viven en la red principal.
- Tests en `tech.test.ts`: toda puerta está en `main`; todo nodo de una
  sub-red requiere su puerta (directa o transitivamente), así que nadie lo
  conoce antes; ninguna sub-red se abre vacía.

### 13b. El nodo de receta (medido)

`TechDef.tier: 'technique' | 'craft'`. Un nodo `craft`:

- tiene `difficulty` multiplicada por `Config.knowledge.craftDifficulty`
  (0,4): se prueba rápido;
- sus chispas son sobre todo de hacer (`doing`) y de lo manejado (11b): la
  receta del caldo nace de quien asa y tiene huesos a mano;
- se enseña también en el modo `chat` de la conversación (hoy solo en los
  modos largos): se aprende charlando;
- se refina, se olvida y se hereda como cualquier técnica, con la maquinaria
  de hoy (`KnowledgeSystem`, `Synthesis`, `hearthLesson`).

**Trampa de determinismo:** si `KnowledgeSystem` tira un dado por técnica
candidata, cada técnica nueva añade tiradas y mueve el stream de
`knowledgeRng`. Es un commit de comportamiento y se mide, pero **13a no puede
añadir técnicas**, solo moverlas de red.

### 13c. La pantalla (interfaz; e2e)

- La red principal (`G`) dibuja solo los nodos de `main`. Una puerta que el
  personaje del jugador conoce lleva una marca de puerta con «conocidos /
  total». Un clic la abre: la misma superposición (`TechWeb`), filtrada por
  `web`, con una miga de pan («Red principal › Cocina»), y `Escape` vuelve.
- **Una sub-red cuya puerta el personaje no conoce no se ve** (la regla de
  `Knowledge.ts`: el jugador sabe lo que sabe su personaje). La nota lo pide
  así: «su propia red una vez descubierta».
- **El trazado se fija** (`bugs.md`, «The tech web's arrangement shifted…»; el
  pendiente de M11 y de M14 13d). `layOutWeb` pasa a ser incremental: los
  nodos ya colocados de una red no se mueven, y solo se relajan los nuevos,
  en el orden de `TECHS`, que es determinista. Un digest para no redibujar en
  cada fotograma (la regla de `TechWeb`). `[hidden] { display: none; }`.
- e2e: abrir la red, entrar en una sub-red, volver y comprobar que no se traga
  los clics; una sub-red de una puerta desconocida no aparece.

### 13d. Contenido que estrena las sub-redes (medido)

Cada nodo con su efecto en el mismo commit y su `age` y `firstKnown`:

| nodo | sub-red | edad | requiere | efecto |
|---|---|---|---|---|
| `stone_boiling` | Cocina | Paleolítico superior | `cooking`, `leatherwork` | receta `broth` en la hoguera: hueso 2 (o hueso 1 y grasa 1) y agua → caldo (grasa y proteína). Primer uso de comida para el hueso, que hoy solo sirve para herramientas |
| `flatbread` | Cocina | Epipaleolítico (Shubayqa 1, hace ~14.400 años) | `cooking`, `grinding` | harina en la piedra de la hoguera, sin horno. Pan antes del horno de `bread` |
| `fire_hardened_spear` | Armas | Paleolítico inferior (Clacton, hace ~400.000 años) | `spear`, `firemaking` | la lanza endurecida al fuego pega más fuerte en `doHunt` y `doAttack` (un término en el daño de la lanza, vía `techPower`) |
| `sling` | Armas | Neolítico | `spear`, `cordage` | arma a distancia con piedra de munición (sílex): caza menor a distancia |

**Checks:** `sub-webs-are-climbed` (en `hearths` y `craft`, al final hay al
menos N nodos de sub-red conocidos; en el build de antes no hay sub-redes y
falla). **Coste declarado:** ≤ 3 puntos.

**Commits:** `m15: redes y puertas`; `m15: la receta como conocimiento`;
`m15: la red se abre y no se mueve`; `m15: caldo, torta, lanza endurecida y
honda`.

## Fase 14 — La ropa por capas (nota 1; decisión 8)

**Objetivo.** «No toda la ropa es igual.» Una capa de piel pide piel y una
lasca; una túnica cosida pide aguja, tendón y saber coser; unos alamares piden
hueso trabajado. Y la ropa **se lleva puesta**: abriga, protege, se gasta y
dice quién eres.

### 14a. La prenda (bit-idéntico hasta 14b)

- Los huecos de ropa de `Equipment.ts` (`hips`, `torso`, `legs`, `feet`,
  `head`, `cloak`) entran aquí, con sus lectores (14b).
- `ItemDef.garment`: `{ slot, warmth, pocket?, status?, wearPerDay }`. La
  **protección** por parte del cuerpo no se declara todavía: la añade la fase
  21 con las heridas, que es su lector.
- Verbos `wear` y `take_off` (pocos pasos). `mend` (aguja y tendón o hilo)
  devuelve el desgaste a 0; sin `tailoring`, solo se remienda con cuerda y a
  medias. Una prenda con `wear = 1` se rompe y desaparece, y la crónica lo
  cuenta si era de alguien que el jugador conoce.

### 14b. Solo abriga lo puesto (medido)

`warmthFrom` pierde el término `0,3 × techPower(person, 'clothing')` y los de
llevar `fur_coat`, `cloth` y `wool_cloth` en el inventario. Queda
`1 − Π(1 − warmth_i)` sobre las prendas **puestas**, con los rendimientos
decrecientes que la función ya justifica en su cabecera, más el fuego cercano
(fase 12e). `cloth` y `wool_cloth` pasan a ser **materiales**, no prendas: se
convierten en túnica y manto (14c). **Es el commit más caro del bloque en
muertes por frío**; coste declarado: ≤ 5 puntos.

### 14c. Las prendas (sub-red Ropa; medido)

La nota pide escalones: «unas solo piel y un hacha, como las capas; otras
hilos, botones…». Cada prenda es un nodo `craft` de la sub-red Ropa (13b),
salvo las que dan las técnicas ya existentes:

| prenda (id) | hueco | nodo | requiere | materiales · herramienta | calor | bolsillo | historia |
|---|---|---|---|---|---|---|---|
| taparrabos (`hide_loincloth`) | cadera | `clothing` (puerta) | — | piel 1 · lasca o `handaxe` | 0,02 | — | Paleolítico medio |
| capa de piel (`hide_cape`) | capa | `clothing` | — | piel 2, cuerda 1 · `handaxe` | 0,25 | — | «solo piel y un hacha» |
| falda de fibra (`fibre_skirt`) | cadera | `fibre_skirt` | `clothing`, `cordage` | paja 3 | 0,03 | — | la Venus de Lespugue (~25.000) |
| envoltura de pies (`foot_wraps`) | pies | `foot_wraps` | `clothing`, `cordage` | piel 1, cuerda 1 | 0,08 | — | |
| túnica cosida (`sewn_tunic`) | torso | `tailoring` | — | piel 3, tendón 2 · aguja | 0,30 | 4 | agujas de hueso (~40.000) |
| polainas (`leggings`) | piernas | `leggings` | `tailoring` | piel 2, tendón 1 · aguja | 0,15 | — | Ötzi |
| mocasines (`moccasins`) | pies | `moccasins` | `tailoring`, `foot_wraps` | piel 1, tendón 1 · aguja | 0,12 | — | Areni-1 (~5.500) |
| gorro de piel (`fur_hat`) | cabeza | `fur_hat` | `tailoring` | piel 1 · aguja | 0,10 | — | el gorro de oso de Ötzi |
| parka (`fur_coat`, ya existe) | torso | `tailoring` | — | la de hoy | 0,40 | 2 | |
| parka con alamares (`toggled_coat`) | torso | `toggles` | `tailoring`, `bone_working` | parka 1, hueso 2 | 0,48 | 4 | los «botones» de la nota: cerrar la prenda abriga |
| túnica de lino (`linen_tunic`) | torso | `linen_tunic` | `weaving` | `cloth` 2, hilo 1 · aguja | 0,20 | 4 | Neolítico |
| manto de lana (`wool_cloak`) | capa | `wool_cloak` | `wool` | `wool_cloth` 2 | 0,35 | — | |
| armadura de piel (`hide_armour`, ya existe) | torso | la de hoy | — | la de hoy | 0,10 | — | pasa a ser prenda; su protección, en la 21 |
| piel curtida (`hide_dressing`, un nodo que mejora prendas) | — | `hide_dressing` | `leatherwork` | grasa 1 por prenda de piel | — | — | la piel untada y trabajada con grasa: las prendas de piel de quien lo sabe hacer se gastan a la mitad (`wearPerDay`). Es el lector de la grasa en esta fase |

- **Bolsillos** (decisión 5): una prenda con `pocket` es un contenedor de lo
  pequeño en su hueco. Es la bolsa cosida o atada a la ropa (la de Ötzi): el
  bolsillo como tal es muy posterior, y así se documenta en el `firstKnown`.
- **Quién hace ropa y quién se la pone.** El puntuador de `craft` puntúa una
  prenda por el calor que **espera** de ella (`warm:<prenda>`, creencia de
  M13) por su presión de frío; `wear` se puntúa igual y se quita con calor. Se
  aprende al llevarla puesta con frío y se ve en los demás (2b).

### 14d. Estatus (medido; opcional dentro de la fase)

`garment.status` suma al motivo de estatus (fase 5d) de quien la lleva y a la
primera impresión que causa (`firstImpression`, M11 fase 7). Nodos: `beads`
(cuentas de hueso y concha, Paleolítico superior; hueco `head`, calor 0) y
`dyeing` (tinte de ocre, requiere `ochre`). Es la estratificación que se ve.
Si cuesta, se aparta sin bloquear nada.

### 14e. Checks y escenario

- Escenario **`tailors`**: invierno duro; fundadores con `clothing`, `cordage`,
  `bone_working` y `tailoring`.
- `clothes-are-worn`: en invierno, la fracción de muestras frías con alguna
  prenda puesta. Hoy no hay prendas puestas y falla.
- `the-clothed-are-warmer`: el frío medio de quien lleva ropa es menor que el
  de quien no. Se verifica contra un build en el que `garment.warmth` no se lee.
- `garments-wear-and-mend`: hay prendas gastadas y remendadas.
- **Contrato de arte:** cada prenda nombra su capa (`art/garment/<id>`) en
  `m15_art_contract.md`.

**Commits:** `m15: la prenda y sus huecos`; `m15: solo abriga lo puesto`;
`m15: la red de la ropa`; `m15: vestir para que te vean` (14d);
`m15: el escenario tailors`.

## Fase 15 — La sal y la conservación (nota 2; decisión 3)

**Objetivo.** Que conservar la comida importe. La descomposición lleva
apagada desde M8.1 porque costaba unos 3,4 puntos, y la pérdida caía en las
mochilas: «people carry a larder» (`next-steps.md` §0b). **Con las manos (fase
11) la mochila casi no existe**, así que la causa medida desaparece. Esta
fase la vuelve a encender con sus remedios.

### 15a. Medir antes (instrumento)

La medición de M8.1 repetida sobre el build actual: `needs.spoilRate` entre
0,35 y 1, con 20 semillas en `lean`, `century` y `fishers`, y dónde se pierde
la comida (en la mano, en el almacén o en el montón). Artefactos
`m15-15a-*.txt`. **Si la pérdida sigue en las manos**, se para y se pregunta.

### 15b. La sub-red Conservación (medido)

`preserving` (Mesolítico), retenido desde M8.1, sale por fin como puerta, con el
secadero que `m8_plan_the_ages.md` ya tenía escrito:

| nodo | edad | requiere | efecto |
|---|---|---|---|
| `preserving` (puerta) | Mesolítico | `cooking`, `cordage` | el secadero (`drying_rack`, fuera o dentro de casa): carne y pescado a `dried_meat` y `dried_fish`, que se estropean diez veces más despacio |
| `smoking` | Mesolítico | `preserving`, `firemaking` | el secadero junto a una hoguera o un hogar ahuma: `smoked_meat`, `smoked_fish`, más duraderos y más nutritivos que lo seco |
| `saltmaking` | Neolítico (Poiana Slatinei, hace ~8.000 años: salmuera hervida en vasijas) | `preserving`, `pottery` | edificio `salt_pan` en la orilla del mar: agua salada, fuego y vasijas dan `salt`. La sal tiene el `baseValue` más alto de la comida: es moneda en la fase 36 |
| `salting` | Neolítico | `saltmaking` | recetas `salted_meat` y `salted_fish` (2 de carne o pescado + 1 de sal), las que más duran |
| `pemmican` | Mesolítico | `preserving` | receta `pemmican`: carne seca 2 + grasa 1, machacadas. Casi no se estropea y alimenta mucho: la provisión de viaje de la fase 35 y la comida que más vale por puñado cuando solo se llevan manos |

Todos los objetos, al final de `ITEMS`; los edificios, al final de `BUILDINGS`.

- **Aprender que la comida se estropea.** Cuando algo se pudre en tu mano o en
  tu almacén, aprendes `spoils:<item>` (creencia `own`); los que lo ven, `seen`.
  El puntuador de secar, ahumar y salar lee esa creencia: **conserva quien ha
  visto perderse la comida**. No hay un coeficiente de «conserva en otoño».
- La sal en la comarca clásica sale del mar: `legacyIsland` conserva el agua
  potable por una ficción que su cabecera explica, pero el mar sigue siendo
  sal para la salina. Los manantiales salados y la sal gema llegan con el mapa
  (fase 30) y la minería (fase 37).

### 15c. Encender (medido)

`needs.spoilRate` con el valor que 15a mida como más barato, por defecto.
`BuildingDef.preserves` (el pozo de almacenaje fresco y el granero) sigue como
está.

### 15d. Checks y escenario

- Escenario **`salters`**: costa, dos bandas en la misma semilla, una con
  `pottery`, `preserving`, `saltmaking` y `salting` y otra sin ellas.
- `preserved-food-lasts`: fracción de las comidas de invierno que son comida
  conservada, en la banda que sabe. En un build sin `preserving` es 0 y falla.
- `spoilage-is-answered`: la pérdida por descomposición de la banda que conserva
  es menor que la de la que no. **Ojo:** en M8.1 salió al revés (la banda que
  podía conservar sobrevivía peor). Este check se escribe y **se verifica que
  detecta** antes de confiar en él; si no discrimina, se borra, como los dos
  checks del granero (`AGENTS.md`).
- **Coste declarado:** ≤ 4 puntos.

**Commits:** `m15: medir la comida que se pierde`; `m15: secar y ahumar`;
`m15: la sal`; `m15: la comida se estropea`; `m15: el escenario salters`.

## Fase 16 — Interiores, muebles y dónde se duerme (nota 3; decisiones 10 y 13)

**Objetivo.** Una casa con dentro: muros, puerta, un tejado que se aparta
para ver, muebles que se fabrican y se colocan, y un sueño que es mejor en una
cama que en el suelo, y mejor en el suelo de casa que al raso (la nota, que
pide tener en cuenta `m6_plan_households_sleep.md` §7, «Sleep, as distinct from
sheltering»).

### 16a. La reparación incremental de regiones (bit-idéntica; sin llamadores)

La deuda que M7 dejó escrita: `World.region` se calcula una vez. Muros (aquí)
y excavación (fase 26) cambian lo que se camina, así que se construye **una
vez** y la usan las dos.

- `World.setWalkable(x, y, walkable)` es el único sitio que cambia `walkable`.
- **Al bloquear** una casilla: se busca, con relleno acotado desde sus
  vecinos caminables, si la región se ha partido. Si se ha partido, el trozo
  pequeño recibe un id nuevo (`nextRegionId`) y `regionSizes` se actualiza.
- **Al desbloquear:** las regiones vecinas distintas se funden en la mayor y
  la menor se re-etiqueta.
- El pre-chequeo de región de `Pathfinder` no cambia. `MovementSystem.needsRoute`
  ya tiene el gancho de «el siguiente punto dejó de ser caminable».
- **Test de propiedad:** secuencias de cambios con semilla fija, comparadas con
  un recálculo completo. La partición tiene que coincidir, aunque las
  etiquetas sean otras.
- **Determinismo:** los ids de región se usan en la aparición inicial
  (`randomWalkable`, la región más grande), antes de cualquier cambio. Nada
  itera por id de región después. Compruébalo al escribirlo, con un `grep`.

### 16b. Muros y puerta (medido)

- `BuildingDef.interior?: { door: 'toward_camp' }`. Las viviendas crecen para
  tener dentro: `mud_hut` y `wattle_hut` pasan de 3×3 a 4×4 (2×2 dentro),
  `stone_house` a 5×5 (3×3 dentro) y `longhouse` de 6×3 a 8×4. El
  `windbreak` no tiene muros.
- Al completarse, el perímetro deja de ser caminable salvo la puerta, que da
  al campamento de la banda (determinista). Al arruinarse (`durability` 0,
  M11 11b), los muros caen y vuelve a ser caminable. Todo pasa por
  `setWalkable`.
- `shelterAt` lee las casillas de dentro. Dormir en casa es ir a una casilla
  libre del interior.
- **Coste:** casas más grandes piden más material, y con las manos se tarda
  más. Se vigila que la choza se acabe antes del invierno
  (`shelter-answers-cold`) y `bands-dont-overbuild`.

### 16c. El tejado se aparta (renderer; bit-idéntico; e2e)

`Renderer.drawBuilding` separa suelo, muros y tejado. El tejado se desvanece
cuando está dentro el personaje del jugador o la persona seleccionada, o
cuando el cursor pasa sobre la huella. **La tecla `V`** (libre; hoy se usan
`b c f g h k m p r t`, la barra espaciadora, `Escape` y `1`-`6`) oculta todos
los tejados. Entra en la ayuda de teclas, por `t()`. e2e: la tecla y el paso del
cursor.

### 16d. Los muebles (medido)

Un mueble es un objeto grande (`hands: 2`) que se fabrica, se acarrea y se
coloca con el verbo `place` en una casilla libre del interior de una casa de
tu hogar. Al colocarse es un `Building` de 1×1 con `hostId` (la casa) y
`furniture: true`, del hogar de la casa, y **caminable**: un mueble no parte
regiones. Las reglas de propiedad de M11 fase 4 valen igual: usarlo sin permiso
es posible si nadie del hogar lo ve.

| mueble | técnica | materiales | efecto (su lector, en el mismo commit) |
|---|---|---|---|
| lecho (`bedding`) | ninguna | paja 4 o piel 2 | dormir a 1,0 (16e). El lecho de hierba de Sibudu tiene ~77.000 años |
| cama (`bed`) | `carpentry` | madera 3, lecho 1 | dormir a 1,1 (16e) |
| estante (`shelf`) | `carpentry` | madera 2 | 20 de almacén del hogar: el que `Household.homeBuildingId` ya señala |
| hogar interior (`fireplace`) | `fireplace` (sub-red Fuego) | barro 4, sílex 2 | calor y luz dentro de la casa (`Light`), estación `hearth` para cocinar, y ahumar con un secadero al lado |
| lámpara de grasa (`fat_lamp`) | `fat_lamp` (sub-red Fuego; Paleolítico superior, las lámparas de piedra de Lascaux) | sílex 1 y grasa 2 por carga | luz sin calor, de radio pequeño y larga duración: coser y tallar de noche en casa (el lector del trabajo fino de la fase 12b). Se recarga con grasa |
| asiento y banco (`bench`) | `carpentry` | madera 2 | descansar sentado dentro recupera más; hablar sentados dentro suma pertenencia (fase 5b) |
| secadero (`drying_rack`) | `preserving` | palos 4, cuerda 1 | fase 15; se puede poner dentro |
| cuna (`cradle`) | `cradle` | fase 20 | **se declara en la fase 20**, con su lector |

- **Quién coloca.** El jugador, con «Colocar…» en el menú radial dentro de su
  casa, con una silueta del mueble antes de confirmar y las razones
  `not_inside`, `no_room` y `not_your_home`. Los NPC, por el motivo `comfort`
  (16e): un adulto con el confort bajo y un mueble en el almacén de su hogar lo
  coloca, y fabrica uno si espera confort de él (creencia `rest:<mueble>`,
  aprendida al dormir en uno o al ver a otro dormir en él).
- **La sub-red Fuego se abre aquí**: `firemaking` → la antorcha (12) y el
  hogar interior.

### 16e. Dónde se duerme, y el confort (medido)

`sleepQuality(person, place)`:

| sitio | calidad |
|---|---|
| suelo al raso | 0,7 (el valor de M13 fase 3) |
| al raso, en el radio de una hoguera | 0,8 |
| suelo de casa | 0,9 |
| lecho | 1,0 |
| cama | 1,1 |

- La recuperación del sueño se multiplica por la calidad.
- **`mood.comfort` por fin se escribe** (`m9_6_plan.md` fase 4; M14 4b): al
  despertar, según la calidad, el frío de la noche (`Snow.ts`) y la seguridad
  (campamento propio, dormir apiñados, el guardia y la casilla reclamada, los
  cuatro términos que M14 4b pedía).
- **El motivo `comfort`** entra en `Drives.ts` con su lector: `go_home` al
  atardecer pesa más si en casa hay cama, colocar y fabricar muebles (16d), y
  elegir dónde dormir. Sensibilidad 1 (ningún rasgo lo modula todavía; si hace
  falta, se añade con su fila).
- La concepción (fase 18) lee **la misma muestra de medianoche**.

### 16f. Checks y escenario

- Escenario **`homes`**: fundadores con `carpentry`, `wattle_daub`,
  `firemaking` y `cordage`.
- `beds-are-slept-in`: de las muestras de sueño nocturno de los hogares que
  tienen lecho o cama, al menos el 60% están en él. Hoy no hay camas y falla.
- `walls-hold`: nadie acaba un paso en una casilla de muro;
  `nobody-walled-in` y `paths-are-found` siguen en verde.
- `furniture-is-placed`: hay muebles colocados por NPC en `homes`.
- **Coste declarado:** ≤ 3 puntos.

**Commits:** `m15: reparar regiones`; `m15: muros y puerta`; `m15: el tejado
se aparta`; `m15: muebles`; `m15: dormir mejor en casa, y el confort`;
`m15: el escenario homes`.

**Dos plantas:** fuera de M15 (la nota dice «cuando llegue, lo pensamos»); ver
«Fuera de M15».

## Fase 17 — El arte: personas pre-renderizadas por capas (nota 6; decisión 9)

**Objetivo.** Personas que parezcan personas: la cabeza unida al cuerpo por
el cuello, brazos delante del torso con manos que sostienen, la ropa que
llevan dibujada por capas y, sin ropa, un taparrabos (y en las mujeres una
banda de pecho). El arte se genera **una vez**, se guarda en el repo como PNG
y se mejora por separado. El propietario piensa usar un agente para
producirlo.

### 17a. El contrato (escrito desde la fase 11)

`docs/m15_art_contract.md` y `public/art/people/manifest.json`:

- **Capas:** cuerpo (clase de tamaño de `Sprites.ts`, sexo y tono de piel);
  cabeza con pelo y barba (las variantes de hoy) y cara (las expresiones de
  `EXPRESSIONS`); taparrabos y banda de pecho **por defecto**, que se ocultan
  cuando hay prenda en `hips` o `torso`; una capa por prenda (fase 14); una
  por objeto en mano (fase 11); espalda y hombro; y el bebé en brazos o en el
  portabebés (fase 20).
- **Direcciones:** 4. De frente (S), de espaldas (N) y de perfil (E), con el
  oeste como espejo del perfil: tres dibujos por pose y por capa.
- **Poses:** quieto; andar (4 fotogramas); trabajar por familia (talar, cavar,
  recolectar, fabricar, pelear); dormir tumbado; sentado; cargar a brazos;
  amamantar; nadar (fase 27).
- **Anclajes por fotograma:** mano izquierda, mano derecha (posición y
  ángulo), hombro, espalda y cabeza. Así un objeto en la mano cae donde está la
  mano.
- Celda de 96 px (el `CELL` de hoy, por encima del zoom máximo de 80 px por
  casilla).

### 17b. La tubería (bit-idéntica; no toca `src/sim/`)

- Fuentes vectoriales editables en `art/src/people/…` (SVG), que un agente o
  una persona pueden retocar.
- `npm run art:build` → `tools/art/build.ts`, que rasteriza el SVG en hojas PNG
  con el Chromium de Playwright (ya es dependencia de desarrollo por los e2e;
  no se añade ninguna) y escribe el manifiesto.
- **Se commitean las fuentes y los PNG.** El juego solo carga los PNG.
- Un test comprueba que el manifiesto cubre todo `HeldItemKind`, toda prenda
  con `garment` y toda pose que el renderer pida.
- **Trabajo en paralelo:** desde la fase 11, el arte solo toca `art/`,
  `public/art/` y `tools/art/`, así que puede ir en su propio worktree. Ojo
  con la regla de `AGENTS.md` sobre enlaces a `node_modules` desde un
  directorio temporal.

### 17c. El renderer

- `Sprites.ts` deja de rasterizar en el arranque: precarga las hojas (una
  pantalla de carga breve antes del primer fotograma) y compone por capas como
  hoy. Guarda en caché el resultado por (aspecto, dirección, pose y
  fotograma), para mantener bajo el número de `drawImage`.
- **La dirección la deduce el renderer**, nunca la simulación (regla 15): del
  desplazamiento del `Interpolator` si anda, y del objetivo de su acción
  (`targetX/Y`, solo lectura) si trabaja o pelea. Quieto, conserva la última.
- El radio de clic sigue saliendo de `hitRadiusOf`: el arte nuevo no puede
  cambiar a quién se selecciona sin querer.
- El bebé tumbado (pendiente de M14 6a, `bugs.md`) y en brazos.

### 17d. Los edificios (recomendado, dentro de la fase)

La misma tubería para viviendas (suelo, muros y tejado por separado, lo que la
fase 16c necesita) y para muebles. Si la fase se alarga, se aparta.

**Puerta:** la matriz bit-idéntica; `npm run shots` con la gira de capturas
actualizada; e2e de selección con el arte nuevo; y **revisión visual del
propietario** sobre las capturas de `artifacts/`.

**Commits:** `m15: contrato de arte` (con 11a); `m15: tubería de arte`;
`m15: personas por capas` (puede ser uno por tanda de capas); `m15: casas y
muebles dibujados`.

---
# Bloque IV — El cuerpo (M14 bloque II; notas 3, 4, 6 y 10 de `notes3`)

Va antes que el mapa por la razón que M14 dio y el propietario aprobó: el LOD
de la fase 32 tiene que reproducir la natalidad, la mortalidad infantil y la
enfermedad del mundo detallado, y eso no se puede calibrar antes de que
existan.

**Stream nuevo: `healthRng`, el fork n.º 18**, después de `cultureRng` y
antes del bloque de `spawnResources`, **en el commit de su primer lector**
(19d, el aborto espontáneo, si se sigue este orden) y con su fila en la tabla
de `AGENTS.md` en el mismo commit.

## Fase 18 — Concebir bajo un techo (M14 fase 4c)

**Detalle en `m14_plan.md` fase 4c.** `LifeSystem.tryConceive` exige que la
pareja haya dormido bajo el mismo techo esa noche, leyendo la muestra de
medianoche de `shareTheHearth`.

**Qué cambia respecto al plan de origen:** la decisión está tomada (cualquier
refugio, paravientos incluido; no el raso), y la muestra es la misma que
escribe la calidad del sueño de la fase 16e, así que no hay un segundo
muestreo.

**Check:** `conception-needs-a-roof` (0 concepciones sin techo compartido;
falla en el build anterior).

## Fase 19 — El embarazo (M14 fase 5)

**Detalle en `m14_plan.md` fase 5.** Tres tercios: nada, luego paso 0,85, y
luego paso 0,7 con veto a las tareas pesadas (`Pregnancy.ts`, una propiedad
de `ActionDef` que leen `Brain`, `ActionCatalog` y el menú). Se rechaza con
`too_heavy_with_child`. La ficha lo muestra por `Knowledge.ts`, el sprite
tiene vientre, y hay aborto espontáneo y parto complicado con `healthRng`.

**Qué cambia respecto al plan de origen:** el veto del tercer tercio incluye
**cargar al hombro** y las brazadas de lo voluminoso (fase 11): una
embarazada lleva puñados. La capa de arte del vientre entra en el contrato de
la fase 17.

**Check:** `the-pregnant-are-spared`.

## Fase 20 — La crianza (M14 fase 6)

**Detalle en `m14_plan.md` fase 6.** El bebé no anda el primer año, mama
varias veces al día, la madre gasta más, la lactancia espacia los nacimientos
(la palanca de `next-steps.md` §1), una nodriza puede criarlo si la madre
muere, y llega el destete.

**Qué cambia respecto al plan de origen**, que es mucho, porque las manos lo
cambian todo:

- **20a. En brazos** (`carriedBy`). Un bebé en brazos **ocupa las dos manos**
  de quien lo lleva (fase 11): la madre que lo lleva no puede talar ni
  recolectar a puñados. Es la versión física y visible del coste de criar.
  Sustituye la regla actual (el bebé se queda en el suelo, o en la casa del
  hogar), que la fase 1 habrá medido.
- **20b. El portabebés** (`sling`), nodo nuevo de la sub-red Ropa (Paleolítico
  superior; requiere `leatherwork` o `cordage`; piel 1, cuerda 1). Pone al bebé
  en el hueco `back` y **libera las manos**. Es exactamente la clase de
  invento que las manos ocupadas deben provocar: su chispa lee `hands_full`
  con un bebé en brazos.
- **20c. La amenorrea de la lactancia**, como en el origen, medida contra
  `birthSpacingDays`.
- **20d. La nodriza** (`wet_nurse`), como en el origen.
- **20e. La cuna** (`cradle`), como **mueble de la fase 16** que se declara
  aquí con su lector: dejar al bebé en la cuna, dentro de casa, libera a la
  madre mientras vuelva a amamantarlo. El destete conecta con el ancla del
  cuidador que M13 ya calcula.
- La capa de arte del bebé en brazos y a la espalda entra en el contrato de la
  fase 17.

**Puerta:** `DEMOGRAPHY` antes y después a 20 semillas; la supervivencia media
de `century` no cae más de **8 puntos** (decisión aprobada). Check
`infants-are-carried`: ningún bebé a más de un paso de quien lo lleva, salvo
en una cuna.

## Fase 21 — Anatomía, heridas y enfermedad (M14 fase 7)

**Detalle en `m14_plan.md` fase 7.** Seis partes del cuerpo con daño y estado
de herida; las heridas pesan (pierna, brazo, torso, cabeza);
`Person.conditions` con grados (intoxicación, herida infectada, fiebre);
plantas medicinales y una baya tóxica en su propia pasada de aparición, y
`plant_lore` que las distingue; y todo visible y contado.

**Qué cambia respecto al plan de origen:**

- **21f. La ropa protege.** `garment.protects: Partial<Record<BodyPart,
  number>>` se declara aquí, con su lector en el daño de un golpe o una
  mordedura sobre la parte cubierta. La armadura de piel deja de ser un
  término aparte en `armourOf` y pasa a ser una prenda más. Las prendas de la
  fase 14 reciben su protección en este commit.
- **21g. Jabón (opcional).** `soap` (grasa 1 y ceniza de la hoguera 1;
  Edad del Bronce, Babilonia): lavar una herida con jabón baja su probabilidad
  de infectarse. Es otro uso de la grasa (decisión 22). Si la fase se alarga,
  se aparta.
- **Un brazo herido ocupa una mano** (fase 11): quien tiene el brazo roto
  lleva un puñado menos y no usa herramientas de dos manos.
- La oscuridad (fase 12) y el cansancio agravan el riesgo de herida en el
  trabajo con herramientas, si la fase lo mide como barato. Si no, se deja.

**Check:** `wounds-fester-untended`, verificado contra un build en el que
`tend` no cambia nada.

## Fase 22 — Crudo y podrido enferman (M14 fase 8c)

**Detalle en `m14_plan.md` fase 8c.** Comer carne o pescado crudos tiene una
probabilidad baja de intoxicación; antes de `firemaking` no hay alternativa, y
después quien puede asar y no asa se arriesga.

**Qué cambia respecto al plan de origen:** con la descomposición encendida
(fase 15), **la comida que se ha pasado** también enferma, más que la cruda. Lo
seco, lo ahumado y lo salado no. La creencia `sick:<item>` (M13) se aprende al
enfermar y se cuenta: un pueblo aprende qué no comer.

**Check:** `raw-meat-sickens` (intoxicaciones solo tras comer crudo, podrido o
tóxico; ninguna tras asado o conservado).

---

# Bloque V — Lo salvaje (M14 bloque III; notas 5 y 8 de `notes3`)

**Stream nuevo: `ecologyRng`, el fork n.º 19**, después de `healthRng`, en el
commit de su primer lector (la pasada de aparición de los depredadores, 23e),
con su fila en `AGENTS.md`.

## Fase 23 — Un ecosistema en la comarca (M14 fase 9)

**Detalle en `m14_plan.md` fase 9.** La hierba como capa (`World.grass`), segar
para paja y cuerda, herbívoros que pastan y se reproducen con un techo que sale
del pasto, depredadores (lobo en jauría, oso, lince) en su propia pasada,
animales que atacan a personas (el carnívoro hambriento, el herbívoro que se
defiende, el oso sorprendido), memoria animal, `dog`, y fauna que entra y sale
por los bordes.

**Qué cambia respecto al plan de origen:**

- **Los depredadores leen la luz** (fase 12): se acercan de noche, cuando
  `lightAt` es bajo, y **evitan el radio de una hoguera, de un hogar interior
  y de una antorcha**. El campo `light` y la antorcha ya existen, así que el
  único código nuevo es el lector en el cazador. El miedo a los lobos de noche
  es un motivo para el fuego y la guardia que sale solo.
- **La hierba alimenta la casa:** segar da paja, que ya sirve para cuerda, y
  desde la fase 16 también para el lecho.
- **`dog`** entra en la sub-red Doma. Su aviso de extraños y de depredadores
  suma a la vista del guardia (`Light.sightOf`), que es el lector.
- La memoria de quien hirió al animal la usan también los que cazan a oscuras,
  que fallan más (12b): el ciervo herido y huido recuerda.

**Checks:** `herds-follow-the-grass`, `predators-hunt`,
`a-hunted-out-land-stays-empty` (escenario `wilds`), cada uno contra el build
que lo rompe; y `fire-keeps-wolves-off` (los ataques de depredador dentro de un
radio de luz son una fracción pequeña de los que hay fuera; falla sin el lector
de la luz).

## Fase 24 — Plantar (M14 fase 10)

**Detalle en `m14_plan.md` fase 10.** `arboriculture` (requiere `farming` y
`calendar`) y el verbo `plant`: frutales cerca del poblado, la primera
inversión a una generación vista.

**Qué cambia respecto al plan de origen:** es un nodo de la sub-red Campo
(fase 13). Si el bloque se alarga, se aparta sin bloquear nada.

---

# Bloque VI — El terreno (`notes5.txt`, nota 7)

La nota, en su orden: primero la altura (se baja cavando, por una zanja
natural, una pendiente o la costa, y se sube por una montaña o apilando
tierra); **después** la profundidad del mar, para entrar hasta cierta
profundidad y pescar dentro del agua. Este bloque usa la reparación de
regiones de la fase 16a y **no añade ningún fork**: cavar, apilar, llenarse de
agua y ahogarse son deterministas.

## Fase 25 — La altura

**Objetivo.** Que el mapa tenga relieve que se vea y que pese: subir cuesta,
desde lo alto se ve más lejos, y la altura es la que luego dirá por dónde va el
agua.

### 25a. Exponer la altura (bit-idéntico)

- `World.heightAt(x, y) = elevation + offset`, donde `offset` es un
  `Float32Array` a cero (lo escribe la fase 26). `Config.terrain.metresPerUnit`
  convierte a metros para la interfaz.
- El renderer sombrea el relieve en `prerenderTerrain` (luz del noroeste,
  pendiente del gradiente de `elevation`) y, opcionalmente, dibuja curvas de
  nivel. El panel de una casilla dice su altura.

### 25b. Las pendientes frenan (medido)

- `MovementSystem`: el paso cuesta arriba se divide por
  `1 + Config.terrain.slopeCost × Δh` (en metros); cuesta abajo, un poco.
- `Pathfinder`: el mismo término en el coste de cada arista. **La heurística
  octil sigue siendo admisible**, porque el coste nunca baja del de hoy. Es lo
  que M7 dejó como «costes de terreno».
- `Brain.proximityBonus` sigue midiendo en línea recta: la distancia por camino
  en el puntuador sigue siendo demasiado cara (`next-steps.md` §6).
- Vigilar `paths-are-found`, `walkers-do-not-grind` y `perf-budget`: habrá más
  expansiones de búsqueda.

### 25c. Desde lo alto se ve más (medido)

`Light.sightOf` suma `Config.terrain.heightSight × max(0, h − h̄)`, donde `h̄`
es la altura media alrededor en un radio pequeño (precalculada por trozo
`World.chunkIndex`, que M7 dejó sin llamadores). Lo leen el guardia
(`sightIntruders`), el cazador y la vista del puntuador.

**Checks:** `slopes-slow` (la velocidad media cuesta arriba es menor que en
llano; falla antes de 25b) y `hills-see-farther` (hay avistamientos desde lo
alto más allá del radio base). **Coste declarado:** ≤ 2 puntos.

**Commits:** `m15: el relieve se ve`; `m15: subir cuesta`; `m15: desde lo alto
se ve más`.

## Fase 26 — Cavar y apilar

**Objetivo.** El terreno se puede cambiar: hoyos, silos, zanjas, fosos con
agua, montones, terraplenes y canales. Es lo que `next-steps.md` §7 lleva
planeado desde M6 («palas, canales, tierra movida, zanjas defensivas, roca
apilada»).

### 26a. La tierra como material (bit-idéntico hasta tener lector)

- `World.dig(x, y, amount)` y `World.pile(x, y, amount)` escriben `offset`. Si
  el cambio altera lo que se camina (un hoyo más hondo que
  `Config.terrain.pitDepth`, o agua que entra; 26d), pasa por
  `World.setWalkable` (16a).
- Objeto **`earth`** (tierra), al final de `ITEMS`, de clase voluminosa:
  puñado 1, brazada 3, cesta 10. **La cesta es lo que hace posible mover
  tierra**, como en todo el Neolítico.
- `Soil.ts`: cavar quita la capa fértil de la casilla y deja el subsuelo; la
  tierra apilada lleva la fertilidad que tenía. Donde el subsuelo es húmedo,
  cavar da `mud` (arcilla) en vez de tierra: cavar es también una fuente de
  barro.

### 26b. Herramientas y técnicas

| herramienta o nodo | edad | requiere | efecto |
|---|---|---|---|
| palo de cavar (`digging_stick`) | Paleolítico inferior | — (palos 1) | cavar a 1× |
| pico de asta (`antler_pick`) | Mesolítico | `bone_working` (hueso 2) | 2× |
| pala de madera (`spade`) | Neolítico | `carpentry` (madera 1) | 3× |
| `earthworks` (puerta de la sub-red Tierra) | Neolítico (los recintos de fosos interrumpidos) | `ground_stone`, `basketry` | diseños de zanja, foso y terraplén |
| `ditch` · `moat` · `terracing` | Neolítico · Neolítico · Bronce | `earthworks` (el foso, además, un borde de agua) | los diseños de 26c |
| `irrigation` (sub-red Campo) | Neolítico final (Mesopotamia) | `earthworks`, `farming` | el canal que riega (26e) |

Los hoyos y los silos no necesitan técnica: cavar un agujero es muy antiguo.
Las herramientas de bronce y hierro (fases 37 y 40) llegan a 5× y 6×.

### 26c. Diseños y verbos (medido)

- Diseños que se colocan como un campo (`Field` es el patrón): `pit`, `ditch`
  (línea), `moat`, `mound`, `embankment`, `canal` y `terrace`. El progreso
  **se guarda en la casilla** (`EarthworkTile.progress`), por la regla de
  `AGENTS.md` sobre las acciones largas.
- Verbos `dig` y `pile`, con su llamada a `this.interruption(person, ctx)`, y
  sus razones: `no_digging_tool`, `ground_too_hard` (roca), `hands_full` y
  `nowhere_to_put_the_earth`.
- **Quién cava.** El jugador, desde el menú. La banda, por **persuasión**
  (fase 6): el proponente de una zanja defensiva es quien tiene la presión de
  seguridad más alta después de una incursión; el de un canal, quien tiene el
  campo más seco. No hay regla «cava cuando…».
- **`storage_pit`** pasa a exigir cavar: es el silo de verdad. Se mide aparte,
  porque cambia una obra que ya existe.

### 26d. El agua sigue a la zanja

Tras cada paso de cavar: si la casilla queda por debajo del nivel del agua y
toca agua, se llena, y el llenado sigue por las casillas cavadas conectadas y
por debajo del nivel (relleno acotado, sin RNG). Se actualizan `walkable` (vía
16a), `shoreTiles` y `shoreHash`, que para eso ganan una actualización local
(`World.updateShore(x, y)`) en vez de recalcularse. Un canal desde agua dulce
lleva agua a beber junto al campamento: un valor que la banda descubre sola.

### 26e. Qué hace cada obra (los lectores)

- **Zanja:** cruzarla cuesta (la pendiente de 25b), y si es honda no se
  cruza. Las incursiones la rodean o buscan el paso.
- **Foso:** zanja con agua; no se camina.
- **Montón y terraplén:** más altura, y por tanto más vista (25c), y quien sube
  a atacar va más lento (25b). Es la defensa que la fase 38 convierte en
  muralla.
- **Canal y riego:** las casillas de un campo a menos de 3 de agua dulce de un
  canal crecen más (un término en `Field` o `Soil`, con `irrigation`).
- **Bancal:** un campo en pendiente que no pierde fertilidad por la ladera.

### 26f. Checks y escenario

- Escenario **`diggers`**: una banda que cultiva, con `earthworks`,
  `basketry` y `carpentry`.
- `regions-stay-true`: **al final de cada escenario, las regiones
  incrementales coinciden con un recálculo completo.** Es el invariante que
  protege a todo el bloque, y se añade a la matriz entera.
- `water-follows-the-trench`: una zanja conectada al agua se llena. Test
  unitario y check.
- `earthworks-are-dug`: hay obras de tierra terminadas en `diggers`.
- **Coste declarado:** ≤ 3 puntos.

**Commits:** `m15: la tierra se mueve`; `m15: herramientas de cavar`;
`m15: zanjas, fosos y terraplenes`; `m15: el agua sigue a la zanja`;
`m15: regar`; `m15: el silo se cava`; `m15: el escenario diggers`.

## Fase 27 — La profundidad del agua: vadear, pescar dentro y nadar (decisión 12)

**Objetivo.** El agua tiene fondo. Cerca de tierra es somera y se entra en
ella; más adentro hay que nadar, y más allá, una barca.

### 27a. La profundidad (bit-idéntica)

`World.depthAt(x, y) = max(0, waterLevel − heightAt)`. La caída radial de la
isla ya hace la costa más somera cerca de tierra, como pide la nota. Tres
clases en `Config.terrain`: **somera** (`< wadeDepth`), **de nado**
(`< swimDepth`) y **honda**. El renderer colorea el agua por profundidad.

### 27b. Vadear (medido; cambia el mundo clásico)

- El agua somera **se camina**, a 0,4 de paso (`wade`), y moja:
  `Person.wet` (ticks) sube el frío hasta secarse, y se seca antes junto a un
  fuego (lector de la luz y del calor de 12).
- Al ser caminable, **cambia `World.walkable` en la generación** y con él las
  regiones: islotes unidos por bajíos, gente que aparece en otras casillas.
  **Todo el mundo clásico se mueve**, y se mide a 20 semillas en toda la
  matriz, no solo en tres escenarios. Ver «Decisiones», 4.
- Se bebe desde donde se está, si se está en el agua. `shoreTiles` se redefine
  como «casilla caminable que toca agua o está en agua somera», con la
  cautela de que es lo que leen `Brain.findWater` y el menú de beber.

### 27c. Pescar dentro del agua (N1; medido)

Los bancos de peces se colocan en agua somera, **con el mismo `fishRng`** de
hoy (cambian las casillas y no el orden de forks). El pescador entra en el
bajío y pesca de pie, así que el problema de «estar en una casilla para
trabajar otra» que N1 describía **desaparece** para lo somero: la casilla del
pez es caminable y tiene región. Con una lanza en la mano, rinde más (arponear);
con red o nasa, como hoy.

### 27d. Nadar (medido)

- Habilidad **`swim`**, al final de `SKILLS`. **Trampa de determinismo:**
  `SKILLS` se recorre al fundar, heredar, envejecer y crear el personaje. Si la
  fundación tira un dado por habilidad, añadir una mueve todo lo que venga
  detrás en `spawnRng`. Compruébalo al escribirlo. La solución recomendada es
  que `swim` empiece en 0 sin tirada y se entrene nadando.
- **Modos de paso**: `PassMode = 'walk' | 'swim' | 'boat'`, con
  `World.region` (andar, que ya incluye lo somero) y `World.swimRegion`
  (andar y nadar), las dos reparadas por 16a. `Pathfinder` recibe el modo;
  una casilla de nado cuesta 6 veces más, así que la ruta prefiere tierra.
- Se nada **solo con las manos vacías** (lo del hombro y las manos fuera; la
  cesta a la espalda sí). Frío ×3 y cansancio.
- **Ahogarse**, sin dados: en una casilla de nado, con el cansancio o el frío
  por encima de `Config.terrain.drownAt`, se muere, con causa `drowned` y
  cuerpo que el agua deja en la orilla más cercana (los cuerpos de M11 fase 16
  ya existen).
- El puntuador solo nada si el destino lo merece y las manos están vacías; el
  jugador puede ordenarlo. Razones: `hands_not_empty`, `too_deep` y
  `too_cold_to_swim`.
- Lo hondo sigue exigiendo barca (`logboat`, fase 35, que añade el modo
  `boat`).

### 27e. Checks y escenario

- Escenario **`shallows`**: una costa con bajíos e islotes (un parámetro de
  generación que sube el nivel del agua).
- `nobody-drowns-in-the-shallows`: ninguna muerte `drowned` en agua somera
  (invariante).
- `fish-are-caught-in-the-water`: hay capturas desde casillas de agua somera.
  Hoy no hay ninguna y falla.
- `swimmers-cross`: en `shallows`, hay cruces por casillas de nado.
- `paths-are-found`, `people-on-land` (a redefinir: en tierra **o en lo
  somero**; el check tiene que seguir detectando a alguien en lo hondo) y
  `regions-stay-true` en verde.
- **Coste declarado:** ≤ 3 puntos.

**Commits:** `m15: el agua tiene fondo`; `m15: vadear`; `m15: pescar dentro
del agua`; `m15: nadar y ahogarse`; `m15: el escenario shallows`.

---
# Bloque VII — El mapa del mundo (M14 bloques I, IV, V y VI; peticiones 9 y 11)

El principio de M14 se conserva: **una sola comarca se simula en detalle**, la
del personaje del jugador; el resto vive en modelos abstractos; el mundo es un
objeto **por encima** de `Simulation`, y los forks de su constructor no se
tocan. Los streams del mapa, de los modelos abstractos, de los viajes y de las
caravanas **se derivan de la semilla** en `WorldState` (`deriveSeed`), no son
forks.

**Lo que cambia respecto a M14 es la escala** (decisiones 17-19). M14 suponía
un mundo de 24 × 16 celdas en el que cada celda era una comarca, un mapa local.
El propietario quiere que la península ibérica tenga 4 a 6 zonas, lo que da
celdas de unos 400 km. Una celda así no puede ser un mapa local de 128
casillas: cada casilla mediría 3 km, y una persona cruzaría la península en
una semana. De ahí las **tres escalas** de la terminología:

```
  región   (celda del mapa del mundo, ~400 km)      96 × 48 en la Tierra; ~1.400 de tierra firme
    └─ comarca (un mapa local, ~40 km)               10 × 10 por región, generadas cuando hacen falta
         └─ casilla (una baldosa de `World`)          128 × 128 por comarca, ~300 m
```

Una comarca **no existe hasta que alguien la necesita**: se genera de la semilla
derivada y del perfil de su región, y solo se guarda su libro si alguien la ha
cambiado. Una región entera son cien comarcas en potencia, y casi ninguna se
genera nunca.

**Tres niveles de detalle**, uno por escala:

| nivel | dónde | qué se simula | cada cuánto |
|---|---|---|---|
| **0** | la comarca del personaje del jugador | la `Simulation` de hoy, persona a persona | cada paso |
| **1** | las comarcas cercanas con bandas que importan: la región del jugador y las vecinas donde su gente tiene parientes, enemigos o comercio | bandas de personas **con nombre** (`PersonRecord`), en `ComarcaSim` | una vez al día |
| **2** | el resto del mundo | **pueblos** sin nombres propios: población, cultura, técnicas, relaciones, comercio y guerra, en `PeopleSim` | una vez por estación, repartido entre los pasos |

Un pueblo de nivel 2 que se acerca (por contacto, comercio, guerra o porque el
jugador llega) **se materializa** en bandas de nivel 1 con nombre, de forma
determinista y conservando su población, sus técnicas y su cultura. Una banda
de nivel 1 que queda lejos se funde de vuelta en su pueblo. Hay histéresis
para que nada parpadee entre niveles.

## Escala y coste: ¿aguanta el proceso tantos pueblos?

El propietario pidió este análisis explícitamente. Estas cifras son
**estimaciones de diseño**. La fase 29 construye `npm run world:bench` para
medirlas, y **ninguna fase posterior empieza si la medición las contradice**.

**Cuántos.** La Tierra en 96 × 48 regiones da 4.608 celdas, de las que unas
1.400 son tierra firme y unas 1.100 habitables. Hace unos 12.000 años vivían
entre 4 y 10 millones de personas. Con 1 a 4 pueblos por región habitable, hay
**entre 2.000 y 4.000 pueblos** al empezar. Más tarde se fusionan en Estados y
se dividen al crecer.

**Nivel 2, por actualización de un pueblo:** crecimiento de la población (una
decena de operaciones); qué técnicas nuevas puede concebir (las que tienen los
requisitos cumplidos y los recursos en su región, que son 5-20 candidatas
sobre un conjunto de bits de unas 150 técnicas: 5 palabras de 32 bits);
difusión con sus 6-8 vecinos (comparar conjuntos de bits); relaciones,
comercio y guerra con esos vecinos. Son unas **500 operaciones simples** por
pueblo. Para 4.000 pueblos, unos 2 millones de operaciones: **2-5 ms por
actualización completa** en JavaScript. Una por estación (10 días, 2.400
pasos), repartida entre los pasos, son **unos pocos pueblos por paso: menos de
20 µs**.

**Nivel 1:** 20-40 bandas de unas 25 personas, es decir 500-1.000
`PersonRecord` actualizados una vez al día a unos pocos µs cada uno: unos 5 ms
por día, **unos 20 µs por paso** repartidos.

**Nivel 0:** el de hoy, que es con mucho el caro: el suelo de `perf-budget` es
100 µs por paso más 16 µs por persona, **unos 900 µs por paso** con 50
personas.

**Conclusión:** los niveles 1 y 2 juntos cuestan **menos del 5%** de lo que ya
cuesta la comarca detallada. **El procesador no es el límite.** Los límites de
verdad son otros tres:

1. **La memoria y el guardado.** Nivel 2: ~4.000 pueblos × ~300 bytes, algo más
   de 1 MB. Nivel 1: ~1.000 registros × ~3 KB (con el mapa personal
   comprimido), unos 3 MB. Más los libros de las comarcas visitadas. Una
   partida guardada pasa de **5 a 20 MB**, más de lo que cabe en
   `localStorage` (unos 5 MB). **El guardado va a IndexedDB** (fase 33c).
2. **La calibración.** Un pueblo de nivel 2 tiene que crecer, inventar y
   guerrear **como lo harían sus bandas en nivel 1**, y estas como en el nivel
   0. Si no, cada materialización es un salto que el jugador ve. Por eso hay
   dos puertas encadenadas en la fase 32.
3. **El determinismo.** Repartir la actualización entre los pasos tiene que
   dar el mismo resultado se juegue a la velocidad que se juegue: el reparto
   depende del número de paso, nunca del reloj.

**Por qué los pueblos avanzan a distinta velocidad** sin que nadie lo
programe: por lo que ofrece su región (plantas y animales domesticables,
metales, sal, clima y capacidad de carga), por su **conexión** (una isla
aprende sola; un valle de paso aprende de todos) y porque la difusión es más
fácil entre climas parecidos (el eje este-oeste de Eurasia frente al
norte-sur de América, la hipótesis de Diamond, que aquí es un **banco de
pruebas y no un guion**). La **invención** crece con la población y los
contactos (el modelo de Kremer), con los mismos `requires` y las mismas
técnicas que el nivel 0. Y cada pueblo tiene su azar derivado. Con eso
deberían aparecer, sin escribirlos, una agricultura que nace donde hay trigo
silvestre y se extiende, pueblos que se quedan atrás y **Estados que llegan
antes o después y chocan entre sí y con el del jugador**.

## Fase 28 — Identidad que sobrevive a su comarca (M14 fase 3)

**Detalle en `m14_plan.md` fase 3.** `IdSpace` en lugar de los diez contadores
de módulo; `PersonRecord`, `HouseholdRecord` y `BandRecord`; ida y vuelta con
test. Bit-idéntico.

**Qué cambia respecto al plan de origen:** los registros guardan también lo
que M15 añadió: el equipo y el desgaste de cada prenda (11, 14), las
creencias de mayor confianza (M13), las condiciones y heridas (21), los muebles
de cada casa (en el libro de la comarca, fase 32c) y las obras de tierra (26).

## Fase 29 — El mundo por encima de la comarca: aleatorio o la Tierra real (M14 fase 11; petición 9)

**Detalle en `m14_plan.md` fase 11**, leyendo «región» donde dice «comarca»
del mapa del mundo. `WorldMap` en `src/sim/world/`, con elevación, latitud,
lluvia, tipo, ríos como grafo, agua dulce, fauna, flora y minerales por
región; `WorldState`; y `main.ts` hablando con él en un commit propio sin
cambios de comportamiento.

**Qué cambia respecto al plan de origen**, que es casi todo lo que no es
fontanería:

### 29a. La rejilla de regiones y el perfil de comarca

- **96 × 48 regiones** para la Tierra (unos 3,75° de lado; la península ibérica
  queda en 5 o 6 regiones de tierra), y la misma rejilla para el mapa
  aleatorio. Es un ajuste de la partida nueva, no una constante.
- Cada región tiene **10 × 10 comarcas** en potencia. El perfil de una comarca
  (`ComarcaProfile`, el `TileProfile` de M14) sale del de su región y de su
  posición dentro de ella: la altura se muestrea de **una función de altura
  continua en todo el mundo** (la de la región interpolada, más detalle
  fractal de la semilla derivada), así que dos comarcas vecinas coinciden en el
  borde sin tener que casarlas. Lo mismo con los ríos: el grafo de ríos del
  mundo fija dónde entra y sale cada río de cada comarca.
- El perfil da además el nivel del agua y la pendiente de la costa (de las que
  salen los bajíos de la fase 27), las **fuentes de sal** (15), las **orillas
  de arcilla** (26) y el **hierro de pantano** (40).
- `legacyIsland` sigue siendo un perfil de comarca suelto que reproduce el
  mundo de hoy: **la matriz clásica, bit-idéntica**.
- Decisión aprobada: en el modo mapa la comarca de partida es **continental**;
  el modo clásico conserva la isla.

### 29b. El mapa aleatorio

Un generador de regiones a partir de `deriveSeed(seed, 'worldmap')`:
continentes con ruido y cordilleras en sus bordes, latitud y corrientes que
dan temperatura y lluvia, biomas por clima y ríos por la altura. Recursos por
bioma, con la misma escasez que en la Tierra: **el cereal silvestre solo en
estepas templadas y cálidas, y el estaño en muy pocas regiones**, para que la
historia tenga la misma forma sin ser la misma.

### 29c. Los mapas reales: una lista pregenerada

- **`tools/worlddata/build.ts`** construye **una vez** cada mapa real a partir
  de datos públicos y escribe un fichero compacto (`public/world/<id>.bin` y su
  manifiesto JSON). **Se commitea**, como el arte (decisión 9): el juego solo
  lo lee, sin red.
- **Fuentes**, cada una con su licencia en `public/world/SOURCES.md`:
  - relieve y fondo del mar: ETOPO 2022 (NOAA, dominio público);
  - costas, lagos y ríos: Natural Earth (dominio público);
  - clima: la clasificación de Köppen-Geiger de Beck y otros (2018, CC BY 4.0,
    con su atribución en los créditos);
  - tablas escritas a mano, cada fila con su fuente bibliográfica: dónde
    crecían los antepasados silvestres de las plantas domesticadas (trigo y
    cebada en el Creciente Fértil, arroz en el Yangtsé, mijo en el río
    Amarillo, maíz en Mesoamérica, patata en los Andes, sorgo en el Sahel…),
    los de los animales (uro, oveja y cabra en los Zagros, caballo en la
    estepa póntica, llama en los Andes…), la fauna por ecozona, y los
    yacimientos de sílex y obsidiana, cobre (Chipre, Anatolia, Río Tinto, los
    Alpes, el Sinaí), estaño (Cornualles, Galicia y el norte de Portugal, los
    Montes Metálicos, Malaca, Yunnan), oro y sal (Hallstatt, Wieliczka, el mar
    Muerto).
- **La lista inicial:**
  1. **La Tierra hace unos 12.000 años**, con el mar 60 m más bajo que hoy: el
     Doggerland entre Gran Bretaña y el continente, Beringia entre Asia y
     América, Sahul (Australia y Nueva Guinea unidas). Es el mundo que
     encontraron los pueblos del Mesolítico, **y el recomendado** para una
     partida que empieza en el Paleolítico.
  2. **La Tierra de hoy.**
  3. Más adelante, **mapas regionales** más finos (la península ibérica o el
     Mediterráneo a 1°, por ejemplo) con la misma herramienta. No se hacen en
     esta fase, pero el formato los admite.
- **La pantalla de partida nueva** gana «Mundo: una comarca (clásico) / mapa
  aleatorio / la Tierra…» con la lista, y **elegir dónde empieza tu pueblo**
  (en la Tierra, por ejemplo, la península ibérica). Los demás pueblos se
  siembran en todo el mundo (fase 33).
- **Nombres:** cada pueblo recibe nombre de un **repertorio por región** (en la
  Tierra, por gran familia lingüística de la zona; en el aleatorio,
  fonologías generadas). **No se colocan pueblos históricos por guion**: no
  aparecen «los lusitanos» porque sí. Lo que se simula es algo **como** ellos:
  pueblos distintos en zonas distintas de la península, con culturas que
  divergen (memoria del propietario: surgir, no programar). Ver
  «Decisiones», 10.

### 29d. Medir el coste antes de construir encima

`npm run world:bench`: siembra la Tierra con sus pueblos y corre el nivel 2
**doscientos años de juego** sin interfaz. Mide el tiempo por actualización,
el coste por paso repartido y la memoria. **Puerta:** menos del 10% del suelo
de `perf-budget` por paso, y el tamaño estimado de un guardado. Si no se
cumple, se baja la frecuencia del nivel 2 o el número de pueblos **antes** de
seguir, y se anota. Aquí se comprueba el §«Escala y coste». El nivel 2 todavía
no existe en esta fase: el banco mide un `PeopleSim` mínimo con la forma y las
operaciones de la fase 32c, y se vuelve a pasar al cerrar la 32.

**Puerta de la fase:** la matriz clásica bit-idéntica con `legacyIsland`; las
comarcas vecinas coinciden en altura y ríos; el mapa aleatorio es función pura
de la semilla; los mapas reales cargan y su `SOURCES.md` está completo; y
`world:bench` dentro de presupuesto. **`docs/architecture.md` se actualiza al
cerrar esta fase**: «una `Simulation` es una isla» deja de ser verdad.

## Fase 30 — El agua dulce y la sal (M14 fase 12; nota 7 de `notes3`; N2)

**Detalle en `m14_plan.md` fase 12.** Ríos, lagos y manantiales; bioma `river`
al final de `BIOMES`; `freshShore` y `saltShore`; el agua de la fruta
(`ItemDef.water`); y sin agua dulce no se vive.

**Qué cambia respecto al plan de origen:**

- **Los ríos bajan por la altura** de la fase 25, del borde de entrada al de
  salida o al mar, y los lagos llenan las hondonadas del mismo campo.
- **Los vados son agua somera de río** (fase 27): no hace falta un concepto
  aparte. Un río parte la comarca en regiones de andar, pero no de nadar, y la
  garantía de vados de M14 se conserva con la profundidad.
- La pesca en río y lago ya funciona por la fase 27; 12d de M14 queda cubierta.
- `legacyIsland` conserva el mar potable, y lo dice en su cabecera. La salina
  de la fase 15 sigue funcionando en él.
- Los canales (fase 26) llevan el agua de su origen: dulce desde un río y
  salada desde el mar.

**Puerta:** escenario `frontier`; `nobody-drinks-the-sea` y
`rivers-are-crossed`; la matriz clásica bit-idéntica.

## Fase 31 — El globo (M14 fase 13)

**Detalle en `m14_plan.md` fase 13.** El icono de globo abajo a la izquierda,
`WorldMapView` a pantalla completa (con su `[hidden]` y su digest), lugares
conocidos, de oídas y desconocidos, todo por `Knowledge.ts`, y
`WorldKnowledge`.

**Qué cambia respecto al plan de origen:**

- **Dos niveles de zoom:** el mundo, con sus regiones, y una región, con sus
  comarcas. Un paso más es la comarca misma: el juego de siempre.
- **La niebla es la de tu personaje** (decisión 20), como la de la fase 2i en la
  comarca: `WorldKnowledge` es **por persona**, con los mismos canales (ver,
  contar, heredar y lo que trae quien llega de fuera). Una región de la que te
  hablaron es «de oídas», con el día en que la vio quien te lo contó. Los
  pueblos y civilizaciones que tu personaje conoce se pintan con su nombre y
  lo último que se supo de ellos.
- Fijar el trazado del árbol ya se hizo en la fase 13c. Queda de esta pasada de
  interfaz **el zoom de `FamilyTree` en el móvil** (`bugs.md`). El globo se
  diseña táctil desde el principio.

## Fase 32 — Los modelos abstractos: bandas con nombre y pueblos (M14 fase 14; decisión 19)

**Detalle en `m14_plan.md` fase 14** para el nivel 1 (allí `RegionSim`; aquí
**`ComarcaSim`**, porque simula comarcas): las personas con nombre siguen
existiendo, el libro (`TileLedger`) de cada comarca, de abstracto a detallado y
vuelta, y el LOD de fauna.

### 32a. Recalibrar antes

Los bloques III a VI han cambiado la economía (manos, descomposición, noche,
mapa personal, ropa, cuerpo, fauna y terreno). Antes de escribir los modelos se
repite el protocolo de la fase 10 en `generations` y en `century`, y **se
congela la línea `DEMOGRAPHY`** contra la que se calibran. Sin eso, se
calibrarían contra una demografía que ya no existe.

### 32b. Nivel 1: `ComarcaSim`

Como en M14 fase 14, con estos añadidos:

- modela la **cultura material** en agregado (la carga que permiten los
  contenedores que la banda sabe hacer, la conservación de la comida, el calor
  de la ropa y del fuego), porque si no, una banda abstracta sin cestas
  comería como una con cestas;
- conserva el **mapa personal** comprimido (fase 2e: lo explorado como bits y
  los recuerdos más valiosos);
- el libro guarda muebles, obras de tierra, la altura cavada o apilada
  (`offset`, comprimido) y las prendas que quedaron en los almacenes.

**Puerta:** `lod-matches-detail` (±15% de población final media y la misma
tendencia tecnológica a 20 semillas, nivel 0 frente a nivel 1).

### 32c. Nivel 2: `PeopleSim`, el mundo que avanza a su ritmo

**Nuevo** (petición 9). `src/sim/world/PeopleSim.ts`. Un **pueblo** tiene:

- población, y las comarcas que ocupa en su región (en número, no en casillas);
- modo de vida (proporción de caza y recolección, cultivo y pastoreo), que sale
  de sus técnicas y de lo que ofrece la región;
- **técnicas** como conjunto de bits sobre `TECHS` (las mismas, con los mismos
  `requires`);
- **cultura**: normas, `strangerRegard` y la media de los rasgos de su gente,
  que derivan despacio;
- **nivel de organización**: banda, tribu, jefatura o Estado, con la misma
  definición derivada que la fase 38c usa para la civilización;
- **relaciones** con sus vecinos (el `BandRelations` en agregado), rutas de
  comercio y guerras en curso;
- excedente y almacén, en agregado.

Una actualización por estación, repartida entre los pasos, hace:

1. **Crecer o menguar** según la capacidad de carga de su región, multiplicada
   por sus técnicas y restando la guerra y la enfermedad, con las tasas que
   `DEMOGRAPHY` midió.
2. **Inventar**, con una probabilidad por candidata que crece con la población
   y los contactos (el modelo de Kremer), y **solo si la región tiene lo que
   hace falta**: sin trigo silvestre no se inventa la agricultura, se aprende
   de un vecino.
3. **Aprender de los vecinos** según el contacto (comercio, matrimonio, guerra
   y cercanía) y lo parecido de su clima.
4. **Comerciar** su excedente por `baseValue` (fase 36).
5. **Guerrear** cuando la hostilidad, la ambición (estatus) y la ventaja lo
   empujan, y **hacer la paz** por cansancio, con las mismas causas que la fase
   8 da a las bandas.
6. **Dividirse** cuando crece por encima de lo que su organización sostiene (el
   pueblo hijo ocupa comarcas o regiones vecinas), y **unirse** por conquista,
   tributo o alianza.

Ningún dado sale de fuera de su stream derivado en `WorldState`.

**Materializar.** Cuando el jugador entra en contacto con un pueblo (lo ve,
comercia con él, lo combate o llega a su comarca), las bandas de ese pueblo en
las comarcas cercanas pasan a nivel 1, con personas con nombre generadas de su
población, sus técnicas (repartidas para que la banda conozca lo que su pueblo
conoce), su cultura y su repertorio de nombres. Al revés, al quedar lejos, se
funden en su pueblo sin perder población ni técnicas.

**Puertas**, encadenadas:

- `peoples-match-bands`: el mismo escenario, dos años en nivel 1 y dos en nivel
  2, a 20 semillas: población final media dentro de ±15% y la misma tendencia
  tecnológica. **Si no se cumple, el bloque no sigue.**
- `world:bench` otra vez, ya con el `PeopleSim` de verdad, dentro de su
  presupuesto.
- En la **cohorte del mundo** (la Tierra, 10 semillas, 200 años de juego):
  - `the-world-is-uneven`: al final, los niveles de técnica de los pueblos
    tienen dispersión (ni todos iguales ni todos parados);
  - `farming-spreads`: la agricultura aparece donde hay antepasados silvestres
    y se extiende a pueblos vecinos que no los tienen;
  - `states-arise`: en al menos la mitad de las semillas aparece algún Estado;
  - **nada por guion:** un test sobre `PeopleSim` comprueba que ninguna técnica
    se concede por fecha, por nombre ni por región concreta.

## Fase 33 — Poblar el mundo y guardar la partida (M14 fase 15 y decisión 6)

**Detalle en `m14_plan.md` fase 15.** Pueblos en otras partes del mundo, con su
cultura desde el principio, y el ajuste de partida del mundo (29c).

**Qué cambia respecto al plan de origen:**

- **33a. Sembrar el mundo entero.** Al crear una partida con mapa, además de
  las bandas de la comarca de partida, `PeopleSim` recibe **pueblos en todas
  las regiones habitables** (fase 32c), con una densidad que sale de la
  capacidad de carga de cada región para la técnica de partida. Cada uno
  recibe sus normas, su `strangerRegard` y su repertorio de nombres del stream
  del mundo, porque son culturas distintas desde el principio.
- **33c. Guardado de partida** (decisión aprobada). Con los registros (28), los
  libros (32) y el estado de `PeopleSim` es poco más que serializar la comarca
  detallada al amanecer: el `WorldState`, los niveles 1 y 2, la `Simulation`
  actual y el estado de cada `RNG`. **Va a IndexedDB, no a `localStorage`**,
  porque una partida con el mundo entero pesa entre 5 y 20 MB (§«Escala y
  coste»). Se puede exportar e importar a fichero. Test de ida y vuelta:
  guardar, cargar, avanzar N pasos y comparar con no haber guardado (**tiene
  que ser bit-idéntico**).

## Fase 34 — Salir de la comarca (M14 fase 16)

**Detalle en `m14_plan.md` fase 16.** Los bordes se cruzan (`leave_region`,
que aquí se llama **`leave_comarca`** para no confundirlo con la región);
el jugador migra y se lleva a quien lo siga (`follow_me`); `scout`; la IA migra
por sed, hambre, un vecino más fuerte, sobrepoblación o destierro; y lo que se
deja atrás se queda en el libro.

**Qué cambia respecto al plan de origen:**

- **Lo que se lleva depende de con qué se carga** (fase 11). Una banda sin
  cestas ni angarillas deja atrás casi todo, y eso pesa en la decisión de
  migrar (un término de lo que se pierde).
- La decisión de migrar **se propone** (fase 6), como la mudanza de la fase 9,
  de la que es la versión entre comarcas: el mismo `propose` con otro tema.
- La decisión de banda sigue sin tiradas nuevas en `BandSystem` (su `rng` es
  `forestRng`).
- **Cruzar un borde lleva a la comarca vecina**, casi siempre de la misma
  región. Ir a otra región es cruzar varias comarcas, y un viaje largo se
  resuelve en abstracto (fase 35, 17d). Migrar lejos es cosa de generaciones,
  como en la historia.
- **El destino se elige con el mapa de quien lo propone** (fases 2e y 31):
  nadie migra a un lugar que nadie de su gente haya visto o del que no le
  hayan hablado. Sin ninguno conocido, primero se explora (`scout`).

**Puerta:** escenario `drought`; `the-thirsty-leave`; `fission-happens` en la
cohorte con mapa.

## Fase 35 — Llegar más lejos: transporte (M14 fase 17)

**Detalle en `m14_plan.md` fase 17**, con su tabla (`logboat`, `sledge`,
`pack_animals`, `horse_riding`, la velocidad de `the_wheel` y `sail`).

**Qué cambia respecto al plan de origen:**

- **`sledge` ya existe** desde la fase 11 como angarillas locales. Aquí gana el
  viaje entre comarcas (más carga por persona y, en nieve, más rápido). Es el
  mismo nodo, no un segundo.
- **`logboat` añade el modo de paso `boat`** (fase 27): cruzar lo hondo **dentro
  de la comarca** (lagos, brazos de mar) además del viaje por la costa. Con
  `World.boatRegion` reparada por 16a.
- `pack_animals` y `horse_riding` son nodos de la sub-red Doma; un animal de
  carga es un contenedor más (la tabla de 11c) que va a pie al lado.
- **17d cambia de sentido.** M14 quería reencender la descomposición para las
  provisiones del viaje; ya está encendida desde la fase 15. Aquí solo se mide
  que las provisiones del viaje se hagan con comida conservada (el pemmican
  de 15b, sobre todo), y se añade
  ese término a la decisión de partir.

**Puerta:** un check por nodo contra el build sin el nodo; la cohorte
`migrants` a 20 semillas.

---

# Bloque VIII — Entre comarcas y regiones (M14 bloque VII)

## Fase 36 — Noticias, comercio y caravanas (M14 fase 18)

**Detalle en `m14_plan.md` fase 18.** Las noticias viajan con la gente;
`trade` (el nodo de M8.2 que nunca llegó a `TECHS`, práctica neolítica que
requiere `marking`); caravanas que se pueden asaltar; incursiones que llegan
por el borde; y la casa rival que no se pierde al cambiar de comarca.

**Qué cambia respecto al plan de origen:**

- Hay por fin cosas que vale la pena comerciar: **la sal** (el `baseValue` más
  alto de la comida, fase 15), la ropa fina y los adornos (14d), la comida
  conservada, las herramientas de cavar y, desde la fase 37, el estaño. El
  trueque lee `baseValue` como estaba previsto.
- **El comercio y las noticias cruzan los tres niveles.** Una caravana de un
  pueblo de nivel 2 que llega a la comarca del jugador se materializa en el
  borde (nivel 1, luego nivel 0) con su gente con nombre; una caravana del
  jugador que se aleja pasa a ser una ruta de `PeopleSim`. Lo mismo las
  noticias: un pueblo lejano sabe del jugador solo si alguien que lo vio, o a
  quien se lo contaron, llegó hasta él (la regla del propietario, ahora a
  escala de mundo).
- Las rutas de comercio de nivel 2 son también **rutas de difusión** (32c):
  el estaño viaja, y con él las técnicas.

## Fase 37 — El Calcolítico y el Bronce (M14 fase 19; M8.3)

**Detalle en `m14_plan.md` fase 19 y `m8_plan_the_ages.md` §M8.3.** Los diez
nodos (`charcoal`, `mining`, `native_copper`, `smelting`, `bellows`, `casting`,
`alloying`, `bronze_tools`, `bronze_arms` y `goldwork`), el mineral según el
perfil de la comarca en su propia pasada (stream derivado del mundo, o un fork
nuevo si se hace en `Simulation`, con su fila en `AGENTS.md`), `smith` por fin
entrenada y `armourOf` por `techPower`.

**Qué cambia respecto al plan de origen:**

- **La sub-red Metal se abre aquí**, con `native_copper` como puerta. `charcoal`
  va a la sub-red Fuego.
- Las herramientas de bronce **cavan a 5×** (26b) y talan más rápido.
- **La fíbula** de bronce (sub-red Ropa) cierra la capa y el manto: más calor.
- **La sal gema** sale de la mina: tercera fuente de sal (15).
- **El sebo** (`tallow`, sub-red Fuego): la grasa fundida y colada da velas
  que alumbran más y más tiempo que la lámpara de grasa (decisión 22).
- La armadura de bronce es una prenda con protección (21f).
- `bronze-needs-a-trader` sigue siendo la puerta: casi ninguna banda sin
  estaño en su comarca funde bronce sin haber comerciado o asaltado.

---

# Bloque IX — Civilización y hierro (M14 bloque VIII; M8.4)

## Fase 38 — De la jefatura al Estado (M14 fase 20)

**Detalle en `m14_plan.md` fase 20.** El banquete (la mitad pendiente de
`brewing`, y la salida a «Nobody carries a spare»); los nodos del Estado en
orden histórico (`city_walls`, `redistribution`, `accounting`, `taxation`,
`law_code`, `standing_army` y `kingship`); y la civilización como campo
derivado, que el juego nunca obliga a alcanzar.

**Qué cambia respecto al plan de origen:**

- **Las otras civilizaciones existen** (decisión 19). Los pueblos de nivel 2
  llegan a Estado por su cuenta y a su ritmo (32c), con la misma definición
  derivada de la 20c, así que cuando la tribu del jugador se convierte en
  civilización **ya hay otras**, más adelantadas o más atrasadas, con las que
  comerciar, pactar o luchar. El globo (fase 31) las pinta cuando tu personaje
  sabe de ellas.
- **`city_walls` ya tiene toda su maquinaria**: los muros de la fase 16 (el
  perímetro que deja de ser caminable, con su puerta), la reparación de regiones
  (16a) y los terraplenes (26). Una muralla es una línea de muro con puertas.
- El banquete usa la comida conservada (15) y el pan y la cerveza, y reúne a la
  banda **sentada** alrededor del hogar (el banco de 16d).
- El impuesto lo recoge el estante y el granero del templo: el almacén del
  hogar ya existe (16d).

## Fase 39 — Lo que un Estado puede hacer (M14 fase 21)

**Detalle en `m14_plan.md` fase 21.** Declarar la guerra y la paz
(`BandRelations` gana `war`, `peace` y `tributary`, que solo fija un gobierno);
la esclavitud como institución, con su rechazo, su fuga y su rebelión; conspirar
contra el rey, el segundo lector de `conspiracyAgainst`; y tratados y tributo.

**Qué cambia respecto al plan de origen:**

- **La guerra y la paz, el tributo y los tratados valen igual entre niveles.**
  El Estado del jugador puede declarar la guerra a un Estado de nivel 2 y al
  revés. Mientras el choque ocurre lejos, se resuelve en `PeopleSim`. Cuando un
  ejército llega a la comarca del jugador, se materializa en el borde con sus
  guerreros con nombre, y la batalla es la de siempre (fase 36, 18d).
- **La esclavitud, el tributo y la conquista mueven población** entre pueblos
  de nivel 2 igual que entre bandas: un pueblo conquistado paga tributo o se
  funde en el Estado que lo venció.
- La noche (12) es el momento natural de la fuga y del golpe, y eso tiene que
  salir del puntuador, no de una regla.

## Fase 40 — El hierro (M8.4)

**Detalle en `m8_plan_the_ages.md` §M8.4.** Seis nodos de la sub-red Metal:

| nodo | requiere | efecto |
|---|---|---|
| `bog_iron` | `mining`, `smelting` | mineral de hierro en tierra húmeda: en los humedales del mapa (29); en `legacyIsland`, en la playa a través de `shoreHash`, como planeaba M8 |
| `bloomery` | `bog_iron`, `bellows` | la lupia |
| `forging` | `bloomery` | yunque y martillo; hierro forjado en herramientas |
| `carburising` | `forging`, `charcoal` | acero: el mejor filo del juego |
| `iron_tools` | `forging` | el metal que **todos** pueden tener (el mineral es común): efecto en toda la economía, no solo en la élite. Cavar a 6× |
| `ploughshare` (sub-red Campo) | `iron_tools`, `farming`, `herding` | el arado de reja tirado por bueyes: el excedente al que todo lo demás esperaba |

La era de Hierro entra en `ERAS` en el mismo commit que su primer nodo
alcanzable. **Checks:** uno por nodo, cada uno contra el build sin el nodo.

## Fase 41 — Calibración final y cierre de M15

- La segunda pasada completa del protocolo de la fase 10 en `generations`,
  `century`, `lean` y los escenarios con mapa, con la tabla en
  `m15_calibration.md`.
- Lo que quede fuera de objetivo va a `bugs.md` con la métrica, el valor y la
  hipótesis, y se lleva al propietario.
- Documentos: `next-steps.md` reescrito (no enmendado) como se hizo al cerrar
  M11; `architecture.md` al día (el modelo de carga, la luz, las redes, las
  regiones mutables, el mundo por encima de `Simulation` y la tubería de arte).

---

## Determinismo

| # | fork | fase | dónde |
|---|---|---|---|
| 18 | `healthRng` | 19d (o su primer lector, si el orden cambia) | después de `cultureRng`, antes de `spawnResources` |
| 19 | `ecologyRng` | 23e | después de `healthRng` |

- **Ningún otro fork.** Los bloques II, III y VI son deterministas sin dados:
  el mapa personal y la niebla, la carga, la luz, las redes, la ropa, la
  conservación, los muebles, la excavación, el agua que llena la zanja y el
  ahogarse. El mapa del mundo, los niveles 1 y 2, los viajes y las caravanas
  usan streams derivados en `WorldState`.
- **Los mapas reales son datos, no azar.** `public/world/<id>.bin` se lee tal
  cual; el detalle fractal de cada comarca sale de `deriveSeed`. Cambiar un
  fichero de datos cambia todos los mundos generados con él: el fichero lleva
  versión en el nombre (`earth-lgm.v1.bin`) y una versión nueva es un fichero
  nuevo, nunca una sobrescritura.
- **El nivel 2 se reparte por número de paso**, nunca por reloj: el mismo
  mundo a velocidad 1 o 5 da el mismo resultado.
- **Cada fork añadido gana su fila en la tabla de `AGENTS.md` en el mismo
  commit**, detrás del último que exista al llegar. Si una fase acabara
  necesitando uno antes que `healthRng`, se sube en uno la numeración de esta
  tabla.
- **Las tablas crecen por el final:** `ITEMS`, `RECIPES`, `BUILDINGS`,
  `TECHS`, `SPECIES`, `BIOMES`, las listas de chispas de cada técnica y
  `SKILLS`. Nunca en el `plan` de `spawnResources` ni en `spawnHerds`, que
  comparten `spawnRng` y el test de determinismo no lo detecta.
- **Trampas conocidas de este plan:**
  - **`SKILLS` (fase 27d):** si la fundación tira un dado por habilidad,
    `swim` mueve todo lo que venga detrás en `spawnRng`. Que empiece en 0 sin
    tirada.
  - **`TECHS` (fase 13):** si `KnowledgeSystem` tira por técnica candidata,
    cada nodo nuevo añade tiradas. La reubicación (13a) no añade técnicas; el
    contenido (13d en adelante) se mide.
  - **Los peces en el agua (fase 27c)** usan el mismo `fishRng` y cambian de
    casilla: el mundo cambia y el orden de forks no.
  - **Vadear (fase 27b)** cambia `walkable` en la generación y, con ello,
    dónde aparece la gente. Se mide en toda la matriz.
  - **Las casas más grandes (fase 16b)** cambian dónde caben las obras.
- **Ninguna tirada nueva en `BandSystem`** (su `rng` es `forestRng`): la
  mudanza, la migración y los proponentes son deterministas.
- **Nada del renderer escribe la simulación** (regla 15): la dirección de la
  mirada, los tejados y la oscuridad en pantalla son solo del renderer.

## Libro de commits: qué debe salir bit-idéntico

| commits | expectativa |
|---|---|
| 0 documentos | — |
| 1a instrumento · 1b interruptores y `--set` | **bit-idéntico** |
| 1d arreglos · 2-10 motivación | medidos, 20 semillas |
| 2e mapa personal (sin lectores) · 2i niebla en pantalla | **bit-idéntico** |
| 2f decidir con lo que se sabe · 2g explorar · 2h contar lugares | medidos; 2f es de los grandes |
| 7a interfaz de órdenes | **bit-idéntico** |
| 11a huecos (con `legacyPack`) | **bit-idéntico** |
| 11b-11d manos | medidos; 11c es el grande |
| 12a luz medida · 12c noche en pantalla | **bit-idéntico** |
| 12b, 12d, 12e | medidos, uno a uno |
| 13a redes y reubicación · 13c pantalla | **bit-idéntico** |
| 13b, 13d | medidos |
| 14a prenda | bit-idéntico hasta que 14b la lea |
| 14b-14d | medidos; 14b es el caro |
| 15a instrumento | **bit-idéntico** |
| 15b-15c | medidos; 15c enciende la descomposición |
| 16a reparar regiones · 16c tejados | **bit-idéntico** |
| 16b, 16d, 16e | medidos |
| 17 arte | **bit-idéntico** (no toca `src/sim/`) |
| 18-22 cuerpo | uno a uno, medidos contra `DEMOGRAPHY`; 21a bit-idéntico salvo el stream |
| 23-24 fauna, plantar | medidos; `wilds` nuevo |
| 25a relieve · 26a tierra · 27a profundidad | **bit-idéntico** |
| 25b-c, 26b-f, 27b-d | medidos; 27b mueve el mundo clásico entero |
| 28 identidad · 29 mapa con `legacyIsland` | **bit-idéntico**; los mapas reales y el aleatorio, con sus tests de función pura y `world:bench` |
| 30 agua | bit-idéntico en la matriz clásica; medido en `frontier` |
| 31 globo | interfaz, e2e |
| 32 niveles 1 y 2 · 33 poblar y guardar | puertas `lod-matches-detail` y `peoples-match-bands`; cohorte del mundo; guardado bit-idéntico en su ida y vuelta |
| 34-40 | medidos en escenarios con mapa, 20 semillas |

Un commit «bit-idéntico» se demuestra con `sim:check:all` sin una sola cifra
cambiada fuera de las líneas de tiempo (regla 2 de M13), no con un test verde.
Antes de añadir un check, se verifica que falla en el build roto.

## Escenarios nuevos

De M13: `hearths` (3) y `generations` (10). De M14: `nursery` (bloque IV),
`wilds` (23), `frontier` (30), `drought` (34), `migrants` (35), `caravans` (36)
y `polity` (38). De este plan: `porters` (11), `nights` (12), `tailors` (14),
`salters` (15), `homes` (16), `diggers` (26) y `shallows` (27), más la
**cohorte del mundo** (`world:bench` sobre la Tierra, fase 32c). Todos usan el
truco de `craft` y `scribes`: fundadores que ya saben lo que el escenario
tiene que ejercitar, porque llegar desde cero cuesta años.

## Verificación

```bash
npm run typecheck
npm test
npm run sim:check:all
DYNASTY_PORT=5399 npm run e2e              # si el puerto 5173 está reservado
npm run sim:seeds -- --scenario lean --seeds 20
npm run sim:seeds -- --scenario century --seeds 20 --set motivation.nightSleep=false
npm run why -- --person 0 --from 1700 --to 1760
npm run violence -- --scenario lean        # fases 8, 12 y 23
npm run art:build                          # fase 17 en adelante
npm run world:build -- --map earth-lgm     # fase 29: regenera un mapa real (necesita red y los datos fuente)
npm run world:bench                        # fase 29 en adelante: coste del nivel 2 y cohorte del mundo
npm run shots                              # interfaz y arte
```

---

## Riesgos

- **Las manos como segundo mecanismo de hambre.** Es el cambio de economía
  más grande desde M7. Por eso sale con la escalera completa, después de que
  las chispas cuenten lo manejado, con el coste declarado y con las palancas
  de mecanismo (comer en el sitio, recoger los montones, la chispa de la cesta)
  antes que las de número.
- **El frío por partida doble.** 12e (el fuego abriga donde está) y 14b (solo
  abriga lo puesto) quitan calor que hoy es gratis. Van en commits separados y
  cada uno mide las muertes por exposición en `DEMOGRAPHY`.
- **La noche y la violencia.** Ver peor puede disparar el robo y la agresión.
  Si rompe `inBandKillRate` (≤ 1 por 1.000 personas-año) o la memoria del
  temperamento en campana, es un defecto aunque salga del puntuador.
- **Las regiones mutables.** Un error en 16a deja a gente «encerrada» o
  cruzando agua. `regions-stay-true` en toda la matriz es la red.
- **El vadeo mueve todos los mundos.** Después de 27b, ninguna cifra anterior
  es comparable. Se anota en el changelog como se hizo con M7.
- **La tubería de arte.** Si el arte llega tarde, la fase 17 no bloquea nada:
  el renderer conserva el atlas procedural hasta que el manifiesto esté
  completo.
- **El mundo de nivel 2 que diverge.** Si `PeopleSim` crece o inventa distinto
  que las bandas de nivel 1, cada contacto es un salto de población o de
  técnica que el jugador ve. `peoples-match-bands` bloquea el bloque.
- **Un mundo que se vuelve un guion.** Es fácil que la «historia» del mundo
  real salga igual en todas las semillas (el Creciente Fértil gana siempre) o
  que alguien la fuerce para que salga. La cohorte del mundo mide la
  dispersión, y la regla es la de siempre: se ajustan parámetros, nunca se
  concede nada por fecha o por lugar.
- **Los datos reales.** Construir un mapa real exige descargar datos públicos
  una vez, con sus licencias. Si una fuente cambia o desaparece, el fichero ya
  commiteado sigue sirviendo; `SOURCES.md` dice qué versión se usó.
- **El tamaño del plan.** Cuarenta y una fases. Por la regla 12, cada una deja
  el juego jugable, y el propietario puede reordenar lo que quede. **El orden
  entre bloques es una decisión suya; el orden dentro de un bloque tiene
  dependencias reales**, que cada bloque explica.
- **`century` es caótico.** Todo se juzga a 20 semillas.

---

## Decisiones para el propietario

Las del §0b están tomadas. Estas son nuevas, salieron al escribir el plan y cada
una tiene una recomendación que el plan da por tomada hasta que el propietario
diga otra cosa:

1. **La luna.** *Recomendado:* no. Un ciclo lunar en un año de 40 días no tiene
   escala que imitar, y la noche ciega ya da la variación que importa.
2. **La sal como necesidad de la dieta** de los pueblos que comen sobre todo
   cereal (histórico: los cazadores la sacan de la carne, los agricultores no).
   Daría un antojo de sal y una razón para comerciarla. *Recomendado:* sí, como
   fase 15e opcional, **solo si la 15 queda dentro de su coste**.
3. **La grasa se come.** *Recomendado:* sí, con sus macros; entra en el antojo.
4. **El vadeo en el mundo clásico.** *Recomendado:* sí, en todos los mundos, y
   medido. La alternativa es un interruptor de perfil que solo lo encienda en
   escenarios nuevos, lo que dejaría la costa de la isla sin bajíos.
5. **Las casas crecen** (4×4, 5×5, 8×4) para tener dentro. *Recomendado:* sí.
   La alternativa, muebles en una rejilla más fina que la casilla, es más
   trabajo de pathfinding para menos.
6. **Duración de las antorchas:** la de palo y paja, unas dos horas de juego
   (20 pasos); la de grasa, unas seis (60 pasos). *Recomendado:* así,
   ajustable.
7. **El «bolsillo» prehistórico es la bolsa cosida o atada a la ropa** (el
   bolsillo cosido por dentro es muy posterior). *Recomendado:* así, con la
   verdad histórica en `firstKnown`.
8. **La ropa como estatus** (14d). *Recomendado:* sí, apartable si cuesta.
9. **`swim` empieza en 0 para todos**, sin tirada. *Recomendado:* sí.
10. **Nombres de los pueblos:** repertorios por región, sin pueblos históricos
    colocados por guion. *Recomendado:* así. La alternativa, poner el nombre
    histórico (lusitanos, celtíberos…) a un pueblo cuando ocupa su zona en su
    época, es cosmética, pero empuja a esperar que la historia se repita.
    Si se quiere, sería un ajuste de partida y no el comportamiento por defecto.
11. **El mapa real por defecto es la Tierra de hace 12.000 años**, con el mar
    60 m más bajo. *Recomendado:* así, fijo durante la partida. Hacer subir el
    mar a lo largo del juego (el Doggerland que se hunde) es histórico, pero el
    tiempo del juego no está a escala de milenios, así que no hay una velocidad
    honesta para ello.
12. **Escala:** 96 × 48 regiones y 10 × 10 comarcas por región. *Recomendado:*
    así, ajustable. `world:bench` puede pedir menos.
13. **Quién pasa a nivel 1:** las bandas de la región del jugador y de las
    vecinas con las que su gente tiene relación. *Recomendado:* así; si
    `world:bench` lo permite, un radio mayor.

---

## Fuera de M15

Cosas que se han pedido o planeado y que **no** entran, cada una con su motivo:

- **Edificios de dos plantas.** La nota: «cuando se llegue a dos plantas, ya
  pensaremos cómo mostrarlo». La propuesta para entonces es que la planta
  visible sea la del personaje, con teclas para subir y bajar, y el tejado de
  la fase 16c como modelo.
- **Las ciudades de cientos de personas.** Necesitan un LOD **dentro** de la
  comarca, que es otro problema (M14 ya lo dejaba fuera).
- **El archienemigo multigeneracional como sistema propio.** La memoria del
  proyecto pide explícitamente no construirlo antes de tiempo; M15 solo evita
  que la enemistad de hogar se pierda entre comarcas (fase 36).
- **Poner la estación `kiln` a la receta `pot`.** Sigue siendo la trampa que
  `next-steps.md` §4 describe (dejaría el granero sin construir); no se hace
  sin extender las condiciones de `craft` y volver a verificar
  `pots-reach-a-granary`.
- **La distancia por camino en el puntuador**, **el pathfinding de los
  animales** y **la penalización por cercanía al agua** (M7 los midió y los
  descartó por coste; siguen descartados).
- **Los mapas regionales finos** (la península a 1°, por ejemplo). La
  herramienta de la fase 29c los admite, pero la primera lista es la Tierra
  entera, en dos épocas.
- **El mar que sube durante la partida** («Decisiones», 11).
- **El arte a mano en píxeles.** La tubería de la fase 17 lo permite más
  adelante (se sustituyen los PNG), pero no es el plan.

---

## Documentación al cerrar cada fase

`docs/changelog.md` con la fecha y el porqué de cada cambio; `docs/bugs.md` con
lo encontrado y no arreglado; `docs/next-steps.md` con la fila de la fase; una
línea **«Avance del AAAA-MM-DD»** bajo la fase en este documento; `AGENTS.md`
con cada fork nuevo, y también con las reglas nuevas que este plan crea y que
un agente no puede adivinar:

- el modelo de carga (fase 11: `inventory` es la suma y `Carry` decide cuánto
  cabe);
- `World.setWalkable` como único sitio que cambia lo que se camina (fase 16a);
- la tubería de arte (fase 17: se edita el SVG y se regenera, nunca se toca el
  PNG a mano sin su fuente).

`docs/architecture.md`, al cerrar las fases 11, 16a, 17 y 29.
