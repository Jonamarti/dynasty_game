# M12 — La tribu antes del mapa

Escrito el 2026-09-24, al procesar `docs/notes2.txt`. **El mapa del mundo pasa
a ser M13.** El propietario pidió «un plan a más largo plazo antes de pasar al
world map», y la razón está en la nota que más pesaba: el juego degeneraba en
una lucha de todos contra todos —dentro de la propia tribu, contra los propios
niños— en cuanto pasaba el primer año. Un mapa con muchas casillas habitadas
sólo multiplicaría ese defecto. M12 es el tramo del arco del juego que va de **bandas igualitarias
que se conocen** a **sociedades que se estratifican y chocan por la tierra y
los recursos**, con un orden interno creíble antes de que el conflicto entre
pueblos escale.

La fase 1 ya está construida (este mismo pase). El resto es plan.

---

## 0. Las notas del 2026-09-24 y su destino

| # | nota (resumida) | destino |
|---|---|---|
| 1 | Al dejar/coger de un depósito: acercarse primero, ver su contenido, ventana de traspaso con los dos inventarios, sliders y capacidad restante de depósito y de carga; no se puede superar | M12 fase 3a |
| 2a | Al elegir un edificio en el menú de construcción no aparece la sombra | **Arreglado** en fase 1 (la sombra sale al instante, también en táctil) |
| 2b | Botón para cancelar una construcción y recuperar los materiales | M12 fase 3b |
| 3 | Menú radial agrupado: hablar / confrontar (amenazar, atacar, robar) / conocimiento (pedir que enseñe, enseñar, discutir) | **Hecho** en fase 1 |
| 4 | Algunos NPCs no se defienden ni huyen al ser atacados | **Arreglado en parte** en fase 1 (defensa propia); lo que quede, fase 2c |
| 5 | Sin penalización con tu tribu por atacar a un extranjero que dañaba sus edificios, atacaba a su gente o les robaba | **Hecho** en fase 1 (`Restraint.partiality`, `hadItComing`) |
| 6 | Relación 86 con un NPC y sólo deja saludar | **Arreglado** en fase 1 (la familia siempre puede hablar largo) |
| 7 | Mostrar en la ficha del NPC *por qué* hay buena o mala relación | M12 fase 3c |
| 8 | Los niños pueden ser tomados cautivos, y eso enfurece a los de su tribu que lo vean | M12 fase 4a |
| 9 | Los cautivos se atan a árboles o edificios y no escapan salvo que otro los desate | M12 fase 4b |
| 10 | Los miembros de la tribu se pelean demasiado; a los niños se les corrige; atacar/robar a la propia tribu ~1 de cada 100; el miedo debería frenar ataques | **Hecho** en fase 1 |
| — | (hablado) Distribución gaussiana de agresividad; la mayoría no roba ni ataca | **Hecho** en fase 1 (`IN_GROUP_TAIL`, `inheritTraits` ya no estrecha la campana) |
| — | (hablado) Los de la tribu se conocen desde el principio; miedo nulo a la familia, muy bajo a la tribu, algo mayor a otras tribus; que se queden en su zona | **Hecho** en fase 1 (`FOUNDING_ACQUAINTANCE`, `Fear.wariness`, radio de acción acotado) |
| — | (hablado) El conflicto entre tribus debe nacer de la tierra y los recursos, o de agravios que se cuentan | M12 fases 5 y 6 |

---

## Fase 1 — Paz dentro de la banda (construida, 2026-09-24)

Detalle y cifras en `changelog.md`. Resumen del diagnóstico: de 1.018 ataques
elegidos en `century`, **534 iban contra un niño** y 277 contra alguien de la
propia banda. La ruta depredadora no disparó nunca: todo era *venganza*, así
que los rencores eran reales y el fallo estaba en qué los producía y en qué
se les dejaba producir.

- **Juicio parcial** (`Restraint.partiality`): lo que uno de los nuestros hace
  a uno de los suyos pesa un cuarto; nada si el extranjero «se lo había
  buscado». La travesura de un niño pesa 0,15 con su banda.
- **Los niños se corrigen, no se golpean**: acción `correct`, `conscience`
  que dura toda la vida.
- **La cola de la campana**: contra los tuyos sólo por encima de
  `IN_GROUP_TAIL` (0,9, ≈1/75) o por desesperación de hambre; la herencia de
  rasgos ya no estrecha la distribución.
- **Defensa propia** siempre permitida; **el pavor** a alguien frena el golpe
  que se le guarda.
- **Se conocen de antemano**; **recelo al extranjero** que nunca es cero;
  radio de trabajo acotado alrededor del campamento.
- Interfaz: menú radial en tres familias, sombra de construcción inmediata,
  conversación larga con la familia.

**Checks nuevos**: `peace-within-bands` y `children-are-not-struck`, los dos
fallan en la build anterior.

---

## Fase 2 — El orden interno: de la corrección a la justicia

Hoy, dentro de una banda, un agravio entre adultos acaba en chisme, facción o
destierro (M11 fase 5), y ahora casi nunca en golpes. Falta **el paso
intermedio que las sociedades reales ponen entre el rencor y la violencia**:

- **2a. Compensación.** Quien roba a uno de los suyos y es descubierto puede
  *devolver* lo robado o compensar (la *wergild* germánica, el *bride-price*
  inverso). Un verbo `make_amends` que el culpable elige cuando el rencor de la
  víctima supera un umbral y tiene con qué pagar; restaura opinión. Da a la
  riqueza un uso social además del material (enlaza con el `gift` que hoy apenas
  dispara, `bugs.md`).
- **2b. El jefe como juez.** Una víctima puede *llevar el agravio al jefe*
  (conocimiento por testimonio, regla del propietario). El jefe decide:
  compensación, vergüenza pública (un `shame` que baja el renombre del hogar) o
  destierro. Es el primer uso de la autoridad para algo que no sea mandar a
  trabajar, y la semilla de la ley escrita que M13 pide para civilización.
- **2c. Huir o defenderse, siempre.** **Construida** (2026-09-24, detalle en
  `changelog.md`). Tres causas: dos lecturas de «bajo ataque» que hacían
  bucle con `Brain`; ocho verbos con temporizador a los que ningún golpe
  llegaba; y huir hacia el borde del mapa. De paso, el mismo bucle en
  `talk`/`warn` con sed: 12.173 de 14.589 conversaciones cortadas al tick
  siguiente. Check `the-struck-respond`: 1 de 91 golpes sin respuesta, frente
  a más del 80% antes.
- **2d. Normas que se aprenden.** **Construida** (2026-09-24, detalle en
  `changelog.md`). Un eje cultural nuevo por banda, el **respeto al
  extraño** (`Band.strangerRegard`, en su propio stream `cultureRng`): cuánto
  le importa a un pueblo el daño que uno de los suyos hace a un extraño. Lo
  leen el juicio de los adultos (`partiality`), la corrección de los niños
  (`noteMischief`, sólo para daños a extraños; contra los propios se corrige
  siempre) y dos conciencias en vez de una (`conscience`,
  `conscienceAbroad`). Un pueblo que tiene al extraño por presa lícita cría
  saqueadores. Check `upbringing-follows-culture`.

> **Aviso sobre 2a y 2b (2026-09-24).** Las dos partían de que dentro de una
> banda hay robos y golpes que compensar o juzgar. La fase 1 los acabó:
> medido en tres `century`, **ningún** robo ni golpe dentro de una banda; lo
> único que queda dentro es la calumnia (139, 109 de ellas de niños). Tal como
> están escritas, las dos serían casi inertes. Lo que sí abunda es el daño
> *entre* pueblos (1.041 amenazas, 211 palizas, 3.004 sabotajes de adultos en
> esos tres mundos), que es donde la compensación histórica (el *wergild*)
> tenía su sentido. Pendiente de decisión del propietario: ver
> `changelog.md`, fase 2d.

**Puerta:** `peace-within-bands` sigue en verde con la compensación activa; la
media de renombre por hogar diverge (estratificación) sin que suba la
violencia interna.

---

## Fase 3 — La interfaz que el propietario ha pedido

Tres notas de interfaz que no tocan la simulación y pueden ir en paralelo:

- **3a. Ventana de traspaso con un depósito** (nota 1). Caminar al depósito,
  *mirar dentro* (hasta entonces su contenido es desconocido: se guarda en la
  memoria del personaje lo último que vio, regla de `Knowledge.ts`), y abrir un
  panel con los dos inventarios lado a lado. Cada objeto con un slider; junto a
  cada uno, la capacidad restante del depósito y la de carga del personaje,
  que se ponen en rojo y bloquean el traspaso si se superan. `QuantityPicker`
  ya existe y es la pieza de partida.
- **3b. Cancelar una construcción** (nota 2b). Botón en la ficha de una obra
  sin terminar: la obra se borra y lo entregado (`Building.delivered`) cae al
  suelo como montón (`ItemPile`) en el sitio, de donde cualquiera puede
  recogerlo. Sólo la banda dueña; si lo hace la IA, `abandon` con motivo.
- **3c. Por qué te quiere o no te quiere** (nota 7). En la ficha de otra
  persona, los tres o cuatro hechos que más pesan en la opinión: los recuerdos
  del *observador* sobre el sujeto (`Memory.about`), su parentesco y la
  familiaridad. Pasa por `Knowledge.ts`: nunca muestra lo que el personaje no
  vio ni le contaron.

---

## Fase 4 — Cautivos de verdad

Las dos decisiones que M11 dejó al propietario (`bugs.md`, «Captivity is
rare, and never lasts») ya están tomadas en las notas 8 y 9:

- **4a. Los niños pueden ser tomados cautivos.** Es, históricamente, el caso
  más común. Un evento nuevo `abduction`, con peso de agravio muy alto y
  salience máxima: cualquier miembro de la tribu del niño que lo vea (o a quien
  se lo cuenten) sube su hostilidad hacia el captor y hacia su banda. Es un
  motor de enemistad entre pueblos más fuerte que el robo, y el primer paso
  hacia la adopción forzosa y la esclavitud que el arco pide.
- **4b. Atado a un árbol o a un edificio.** `bind` gana un destino: el captor
  arrastra (`drag` ya existe para cadáveres) al cautivo hasta un árbol o un
  edificio de su banda y lo amarra. Un cautivo amarrado **no puede escapar**;
  sólo otra persona puede desatarlo (`untie`, un verbo nuevo para rescatadores
  de su pueblo o para un captor que lo suelta). La regla del propietario se
  mantiene: el rescate funciona si nadie de la banda captora lo ve.
- **4c. Qué se hace con un cautivo.** Trabajo forzado (el cautivo obedece
  órdenes de su captor con una penalización de ánimo), rescate a cambio de
  bienes, o adopción al cabo del tiempo. Aquí empieza la estratificación por la
  vía que la historia siguió: el primer grupo sin derechos dentro de una banda.

**Puerta:** `captives-are-kept` (un cautivo sigue siéndolo tras N días en la
cohorte), `children-are-taken-and-missed` (cada rapto de niño deja rencor en
su banda).

---

## Fase 5 — La tierra: de «mi zona» a «mi territorio»

El propietario: «según vayan descubriendo tecnologías, establecen que este
terreno es mío … y eso da lugar a enfrentamientos por los recursos: si en mi
territorio no tengo comida y en el tuyo sí, voy al tuyo y te lo quito».

- **5a. Territorio con límites.** Hoy una banda tiene un centro y un radio
  (`TERRITORY_RADIUS`). Con una tecnología de marcado (mojones, `marking` ya
  existe) la banda reclama casillas concretas; el territorio crece donde
  trabaja y se ve en el mapa.
- **5b. Entrar sin permiso.** Recolectar, cazar o talar en tierra ajena es un
  `trespass` de tierra, no sólo de edificio, sujeto a la misma regla: sólo
  cuenta si alguien de la banda dueña lo ve.
- **5c. Pedir permiso, pagar por paso.** El vecino puede *pedir* recolectar en
  tu tierra (un `ask` entre bandas), y la respuesta depende de la relación y
  de la abundancia. La alternativa pacífica a la incursión, y el origen del
  tributo.
- **5d. La incursión por necesidad.** La incursión por lo que falta (M11 fase
  14) se reescribe sobre el territorio: se elige *dónde* está lo que falta, no a
  quién se odia.

**Puerta:** la violencia entre pueblos sube cuando la comida escasea en un
territorio y la del vecino no, y baja cuando se comercia o se da permiso — la
correlación, medida en la cohorte `lean`.

---

## Fase 6 — Agravios que se cuentan: enemistad entre familias

La otra vía del propietario: no por recursos, sino porque «uno de otra tribu
me ha atacado», se comenta y la relación va bajando.

- **6a. La enemistad se hereda.** El `feud` de `m11_plan.md`: un campo en
  `Household` que `linkFamily` propaga, de forma que «la casa que mató a mi
  abuelo» sea una relación de generaciones. Es la semilla del archienemigo
  multigeneracional que el propietario quiere a largo plazo.
- **6b. La venganza se organiza.** Un agravio grave contra un miembro de la
  familia lleva a los parientes a buscar al culpable (con `investigate`, que ya
  existe), no a golpear al primer extranjero que pasa.
- **6c. La paz también se hace.** Un matrimonio entre las dos casas, un regalo
  grande o una compensación entre jefes (fase 2a a escala de pueblo) cierran
  la enemistad. Sin salida, la enemistad sólo sabe crecer, que es el fallo que
  la fase 1 acaba de arreglar dentro de la banda.

---

## Fase 7 — Estratificación y oficios

El arco: «con el tiempo la sociedad se estratifica y aparecen trabajos
distintos por la división del trabajo». Los mimbres existen (renombre de
hogar, jefes, `division_of_labour`, trabajos). Falta:

- Riqueza heredada que se acumula por hogar y compra posición (regalos,
  compensaciones, dote).
- Especialistas que viven de su oficio y *intercambian* dentro de la banda
  (hoy nadie tiene excedente, `bugs.md`).
- Una élite (el hogar del jefe y sus aliados) con acceso preferente al
  granero: la primera desigualdad institucional, y la primera causa de rebelión
  que no es personal.

**Puerta:** el renombre y la riqueza por hogar dejan de ser planos (Gini por
encima de un umbral en la cohorte `century` a 4 años), sin que la paz interna
se rompa.

---

## Después: M13, el mapa del mundo

El boceto de `m11_plan.md` («M12 — el mundo más allá de la isla») pasa a ser
M13 sin cambios de fondo: casillas, icono de globo, migración, civilización
como tribu con gobierno, caravanas. Sigue necesitando antes un LOD de
simulación y romper la suposición «una `Simulation` = una isla». M12 le deja
lo que necesita encontrar al llegar: bandas con orden interno, territorio
propio, enemistades con historia y una sociedad ya estratificada que pueda
convertirse en Estado.

---

## Verificación

Igual que M11: `typecheck`, `test`, `sim:check:all`, `e2e`, y **toda fase que
mueva el mundo se mide con `npm run sim:seeds -- --seeds 20`**, cuya línea
`VIOLENCE` (añadida en la fase 1) cuenta golpes dentro de la banda y contra
niños. `npm run violence -- --scenario century` desglosa quién golpea a quién
y por qué ruta de `Brain`. Ningún fork de RNG nuevo previsto; si hace falta
uno, va después de `hearthRng` (ver `AGENTS.md`).
