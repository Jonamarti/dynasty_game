# M14 — El mundo más allá de la comarca

Escrito el 2026-09-24, al cerrar M12 y procesar `docs/notes3.txt`.

> **Renumerado el 2026-09-25: este plan era M13.** El propietario puso delante
> un milestone nuevo, la motivación de los NPC ([m13_plan.md](m13_plan.md)),
> y pidió sumar uno a todo lo que venía después: este plan pasa a ser M14 y lo
> que aquí se llamaba M14 (el bloque VIII, el hierro) pasa a ser M15. La fase 1
> ya se había entregado con su nombre antiguo, «M13 phase 1» (commit
> `72b1240`); su informe es ahora [m14_phase1.md](m14_phase1.md), y los
> ficheros locales `artifacts/m13-*.txt` conservan su nombre.
>
> Tres cosas salen de aquí hacia M13, porque son motivación y no cuerpo ni
> mapa: los lectores y escritores de ánimo de las fases 4b y 4d (M13 fase 10),
> que un niño que ya anda se quede cerca de su madre y del campamento (la
> mitad de la fase 6e que no es la cuna; M13 fase 2) y la hoguera y el asado
> de las fases 8a y 8b (M13 fase 8). La fase 8c (comer crudo enferma) se queda
> aquí, porque necesita las enfermedades de la fase 7.

Reúne tres cosas que hasta hoy estaban dispersas:

1. **El mapa del mundo**, aplazado tres veces: de M12 en `m11_plan.md` («Para el
   futuro»), a M13 en `m12_plan.md` («Después») y a M14 al entrar la
   motivación delante. Casillas, icono de globo, migración, caravanas,
   civilización.
2. **Las diez notas de `notes3.txt`**: embarazo, lactancia, fauna, enfermedad,
   agua dulce, animales que entran y salen, órdenes según su tipo, cocina.
3. **Los planes que quedaron olvidados** en `next-steps.md`, `m9_6_plan.md`,
   `m8_plan_the_ages.md` y `m6_plan_households_sleep.md`: planeados, nunca
   construidos y sin fase asignada. El inventario completo está en el §0c.

Todo esto va en un solo plan porque son la misma obra. Las notas de agua y de
fauna piden clima, y el clima es un atributo de la comarca. Las de embarazo y
enfermedad cambian la demografía, y el modelo abstracto de las comarcas que
no se ven tiene que calibrarse contra esa demografía. Por eso tiene que llegar
**después** de ellas y no antes.

**Terminología de este documento.** Una **comarca** es una celda del mapa del
mundo, lo que las notas y los planes anteriores llaman «casilla del mapa» o «un
mapa»: la isla de hoy es una comarca. Una **casilla** es una baldosa del mapa
local, la de `World`. Mezclarlas sería fácil y confundiría cada fase.

---

## 0. Qué hay en la mesa

### 0a. Las notas de `notes3.txt` y su destino

| # | nota (resumida) | destino |
|---|---|---|
| 1 | Hacer las paces con quien hay mala relación: +50 si es familia, +30 si es de la tribu | **Hecho** antes de este plan (`fc68101`; `bugs.md`, «Follow-ups from notes3»). Además da +20 a alguien de otro pueblo |
| 2 | «Huyendo» no dice de qué ni de quién | **Hecho** (`fc68101`): nombra a la persona si el personaje la conoce; una amenaza desconocida sigue sin nombre, que es lo correcto según `Knowledge.ts` |
| 3 | Embarazo: concebir exige que los padres duerman juntos bajo el mismo techo; al avanzar, la embarazada anda más despacio y no hace tareas pesadas (cazar), sí ligeras (recolectar, artesanía) | **Fases 4c** (concebir) **y 5** (embarazo) |
| 4 | El recién nacido no anda: el primer año va en brazos de la madre, que le da el pecho varias veces al día y tiene que comer más; la cuna, cuando se invente, la libera | **Fase 6** |
| 5 | Carnívoros que cazan herbívoros; herbívoros que comen hierba; la hierba como entidad que se siega alta para hacer cuerda; reproducción animal; ataques a humanos (carnívoros hambrientos; herbívoros que se defienden, como el ciervo y no la liebre) | **Fase 9** |
| 6 | Enfermedades por carne o pescado crudos, bayas tóxicas desconocidas o heridas sin tratar; grados y tipos distintos; partes del cuerpo que los ataques dañan | **Fase 7** |
| 7 | Ríos de agua dulce y mar salado; sin agua dulce, fruta o manantiales; y si no hay nada, la tribu debe emigrar | **Fase 12** (el agua) y **fase 16** (la migración por sed) |
| 8 | Animales que entran y salen del mapa, poco a poco, para que se note cuando se ha cazado todo; fauna según el clima de la comarca | **Fase 9h** (los bordes), **fase 11** (el clima de la comarca) y **fase 14e** (la fauna de las comarcas vecinas) |
| 9 | El éxito de una orden debe depender también de su tipo: recolectar se obedece más que atacar | **Fase 2**. La fórmula ya lo hace: `ORDER_COST` resta 0,15 × 0,6 a recolectar y 0,9 × 0,6 a atacar, 45 puntos de diferencia. Pero **la interfaz no lo dice**: la razón que ve el jugador sólo lista la autoridad de quien manda. Se mide y se hace visible |
| 10 | La carne cruda se cocina en un fuego, que antes hay que descubrir; hasta entonces, comer carne o pescado crudos tiene una pequeña probabilidad de enfermar | **Fase 8** |

### 0b. Las referencias a M14, verificadas

- `m12_plan.md`, «Después: M14»: casillas, globo, migración, civilización como
  tribu con gobierno, caravanas; **antes hace falta un LOD de simulación y
  romper la suposición «una `Simulation` = una isla»**.
- `m11_plan.md`, «Para el futuro»: civilización = tribu con gobierno que puede
  declarar la guerra, cobrar impuestos (aunque sean 0) y comerciar; nodos de
  Estado con base histórica (templo y redistribución, tributo, contabilidad
  escrita, ley escrita, ejército permanente, murallas); migrar primero una
  casilla, más con animales de carga, caballo, carro, barca y vela; caravanas.
- `BandMaps.ts` se declara en su cabecera «la semilla del mapa del mundo»: una
  rejilla gruesa por banda (`MAP_CELL = 8`), escrita por la vista y leída sólo
  por la incursión por necesidad.
- `Justice.ts` se declara «la semilla de la ley escrita que M14 pide».
- `next-steps.md` sigue diciendo en su tabla que el siguiente es «M12 — the
  world beyond the island». Es una fila vieja y se corrige con este plan.

### 0c. Lo que quedó olvidado, y adónde va

Cada cosa que algún documento dio por planeada y que ninguna fase construyó:

| origen | qué | destino en M14 |
|---|---|---|
| `bugs.md`, «M12 health report» | La matriz sigue en rojo en doce escenarios tras M12; nadie ha separado lo que es efecto de M12 de lo que es caos | **Fase 1** |
| `next-steps.md`, cabecera | `bands-take-sides` en los mundos bien alimentados, pregunta de diseño pendiente para el propietario | **Fase 1** |
| `m9_6_plan.md` fases 4b-4d | Los canales de ánimo `comfort`, `belonging` y `purpose` sin quien los escriba ni los lea | **M13 fase 10** (movido el 2026-09-25; antes fase 4b-4d de este plan) |
| `m9_6_plan.md` fase 5 | Dormir al raso: hoy `sleep` exige un edificio | **M13 fase 3** (movido el 2026-09-25); la fase 4c de este plan lo da por hecho |
| `next-steps.md` §1 | «Frenar la natalidad bajo presión», la palanca más barata, nunca probada | **Fase 6c**: la lactancia la da sin tocar un coeficiente (la amenorrea de la lactancia) |
| `next-steps.md` §8 y `m6_plan` «Deferred» | Herbívoros que pastan, depredadores, animales que atacan a personas, animales que recuerdan quién les dio de comer o les hizo daño | **Fase 9** |
| `next-steps.md`, «Longer-standing gaps» | Nadie planta un árbol | **Fase 10** |
| `next-steps.md` §7b N2 | Agua de mar no potable; ríos; mapa más grande donde ponerlos | **Fase 12** |
| `next-steps.md` §7b N1 | Los puntos de pesca en el agua, con el pescador en la orilla | **Fase 12d** |
| `next-steps.md` y `optimizations.md` n.º 1 | **No hay LOD de simulación** | **Fase 14** |
| `optimizations.md` n.º 2 | LOD de fauna | **Fase 14e** |
| `next-steps.md` §6 (M7) | Barcas: `World.sameRegion` prohíbe cruzar agua por construcción | **Fase 17** (`logboat`) |
| `next-steps.md` §6 (M7) | Camas | **Fase 6e**, con la cuna |
| `next-steps.md` §6 y §7 (M7) | Muros, reparación incremental de regiones, casillas dinámicas | **Fase 20b** (murallas); la reparación de regiones sólo si una fase la necesita de verdad (ver riesgos) |
| `next-steps.md`, «What M11 leaves out» | La velocidad de `the_wheel` | **Fase 17** (el viaje es donde por fin importa) |
| `next-steps.md` §0b | Descomposición apagada; `preserving` y el secadero retenidos | **Fase 17d**: el viaje de varias comarcas es la primera razón real para conservar comida |
| `m8_plan_the_ages.md` M8.2 | El nodo `trade` (trueque entre bandas leyendo `baseValue`) figura en la tabla y **no está en `TECHS`** | **Fase 18b** |
| `m8_plan_the_ages.md` M8.3 | Calcolítico y Bronce: carbón, minería, cobre, fundición, aleación; la habilidad `smith`, que todavía nada entrena | **Fase 19**: el estaño escaso en unas pocas comarcas es el motor histórico del comercio a distancia |
| `m8_plan_the_ages.md` M8.4 | Hierro | **Después de M14** (M15); el hierro de pantano espera comarcas de humedal, que la fase 11 crea |
| `next-steps.md`, «What M11 leaves out» | La mitad festiva de `brewing`: un banquete que reúne a la banda y que el jefe ofrece para ganar posición | **Fase 20a** |
| `next-steps.md`, «What M11 leaves out» | Otros lectores de `conspiracyAgainst`: la facción que conspira para derrocar al jefe | **Fase 21c** |
| `m11_plan.md` y la memoria del propietario | El archienemigo multigeneracional | **Fase 18e**; M12 fase 6 ya hereda las enemistades y M14 sólo tiene que conservarlas entre comarcas |
| arco del propietario | Esclavitud: la cautividad de M12 fase 4c convertida en institución | **Fase 21b** |
| `next-steps.md`, «What M11 leaves out» | Fijar el trazado del árbol tecnológico; zoom de `FamilyTree` en el móvil | **Fase 13d**, la pasada de interfaz del globo |

Lo que **no** entra en M14, a propósito: la hierro-metalurgia (M8.4), la
reparación incremental de regiones como sistema general (sólo si una fase la
exige) y las ciudades como asentamientos de cientos de personas. Esto último
necesita un LOD *dentro* de la comarca, que es otro problema.

---

## 1. Lo que el código asume hoy y el mapa rompe

Verificado contra el código el 2026-09-24. Cada punto es una obra en sí:

1. **Una `Simulation` es una isla.** `World.generate` aplica una caída radial
   (`falloff`) que hace del mapa una isla rodeada de agua; no hay bordes por los
   que salir. `World.region` es un relleno por inundación hecho una vez.
2. **Los identificadores son contadores de módulo que el constructor pone a
   cero** (`resetPersonIds`, `resetResourceIds`, … diez en total, en el constructor
   de `Simulation`). Dos `Simulation` vivas a la vez, o una persona que
   pasa de una a otra, chocan de identificador. Relaciones, recuerdos,
   hogares, deudas, enemistades y `Knowledge.ts` guardan identificadores.
3. **No existe guardado de partida.** `localStorage` guarda ajustes y
   preferencias de interfaz, nada del mundo. Una comarca que se abandona tiene
   que dejar algo escrito en algún sitio, o al volver estará intacta.
4. **Todo el mundo se simula a pleno detalle.** El presupuesto de `perf-budget`
   es de 100 µs por paso más 16 µs por persona; una segunda comarca detallada lo
   duplica.
5. **El clima es uno solo.** `TimeManager.temperature` es una curva estacional
   y diurna sin latitud ni altitud.
6. **El agua es una sola.** `World.shoreTiles` es toda casilla caminable que
   toca agua. Se bebe del mar, no hay ríos, y `well` es la única fuente
   alternativa.
7. **La fauna es fija.** Tres especies (`deer`, `boar`, `hare`), ningún
   depredador, **ninguna reproducción en libertad** (`WildlifeSystem` no tiene
   nacimientos; sólo crían los corrales, `Simulation.workHerds`), y nada entra ni
   sale.

**El principio que ordena la solución:** una sola comarca se simula en detalle,
la del personaje del jugador. Las demás viven en un modelo abstracto diario. El
mundo que las contiene es un objeto *por encima* de `Simulation`, no dentro de
ella. Así `Simulation` sigue siendo lo que es, el motor de una comarca, y los
diecisiete forks de su constructor no se tocan.

---

# Bloque I — Cimientos

Nada de este bloque cambia el mundo por defecto salvo la fase 2b, que se mide.

## Fase 0 — Este documento y el triaje

`notes3.txt` vaciado; `next-steps.md` §7i con la tabla del §0a; la fila
obsoleta de «M12 — the world beyond the island» corregida; `README.md` de
`docs/` con `m12_plan.md` y este plan en el índice. **Hecho con este plan.**

## Fase 1 — La matriz después de M12 (en curso; instrumento 1c construido)

`bugs.md` («M12 health report after completion») deja constancia de fallos
dependientes del escenario en doce mundos y dice que la próxima investigación
tiene que separar el efecto de M12 del caos documentado. Es condición previa de
todo lo demás: el bloque II cambia la demografía, y un cambio demográfico medido
sobre una matriz que nadie entiende no se puede leer.

- **1a.** Cohorte de 20 semillas en `century`, `lean` y `crowded` en el commit
  anterior a M12 (`0dd2d9f`) y en el actual. Para cada check rojo: ¿se mueve la
  media o sólo la semilla? Lo que sea caos pasa a la línea TRIPWIRES del
  cohorte (política de 17d); lo que sea defecto se arregla o se anota.
- **1b.** `bands-take-sides` en los mundos bien alimentados: la pregunta de
  diseño lleva abierta desde M11 fase 14c. Se le presenta al propietario con los
  números: un pueblo bien alimentado ¿debe tomar partido contra su vecino? La
  memoria del proyecto (el arco va hacia el conflicto por la tierra y los
  recursos) sugiere que **no sin causa**, y entonces el check está mal escrito
  para esos escenarios. Pero lo decide el propietario.
- **1c.** Instrumento demográfico. Una línea `DEMOGRAPHY` en `sim:seeds`:
  nacimientos por mujer fértil, mortalidad antes del primer año y antes de los
  cinco, edad media al morir y causas de muerte agregadas. **Es la línea contra
  la que se calibra el bloque II y, sobre todo, el LOD de la fase 14.** Sin ella,
  «el modelo abstracto reproduce la demografía» no se puede comprobar.

**Puerta:** cada check rojo de la matriz tiene una línea en `bugs.md` que dice
si es el mundo o el check. `DEMOGRAPHY` impresa en las tres cohortes, y **bit-idéntico**.

**Avance del 2026-09-25:** construido el instrumento 1c, con denominadores
agrupados y seguimiento incompleto visible; la prueba confirma que observar no
cambia el mundo ni el estado del RNG. Las 20 semillas de `century`, `lean` y
`crowded` terminaron en ambos builds. La supervivencia mejoró en `lean` y
`century`, mientras bajaron los asesinatos y subieron las muertes por inanición;
todos los nacidos con seguimiento completo hasta los cinco años murieron antes
de esa edad. Hace falta separar las causas antes de empezar el bloque del
cuerpo. Los resultados y sus límites están en
[m14_phase1.md](m14_phase1.md). La matriz roja y la pregunta de `bands-take-sides`
siguen sin resolución; la fase 1 permanece abierta.

## Fase 2 — Las órdenes pesan lo que piden (nota 9)

- **2a. Que se vea.** La razón de `standingOver` (`because`) no menciona el
  coste de la orden; sólo añade una razón si la orden va contra otro pueblo.
  Se añade una razón por tramo de coste («es poca cosa», «es mucho pedir»,
  «le pides que arriesgue la vida»), y el menú radial muestra, antes de dar la
  orden, la probabilidad estimada en palabras («casi seguro», «puede que sí»,
  «difícilmente»). Pasa por `t()`. Renderer e interfaz: **bit-idéntico**.
- **2b. Que se mida.** Contadores `order_<verbo>_obeyed/refused` y una línea
  `ORDERS` en la cohorte. Si la diferencia real entre recolectar y atacar se
  queda por debajo de lo que el propietario espera (hoy es de 45 puntos en la
  fórmula, pero la suma de autoridad satura en 0,98), se sustituye el `0.6`
  único por una pendiente que crezca con el coste. Medido a 20 semillas: toca
  cuánto trabaja la gente mandada por su jefe.

**Puerta:** la tasa de obediencia a `gather` supera a la de `attack` por al menos
el margen que el propietario fije, con el mismo mandante. Test unitario con un
mandante fijo y cinco verbos.

## Fase 3 — Identidad que sobrevive a su comarca

Obra de fontanería, **bit-idéntica**, y la primera pieza del mapa.

- **3a. `IdSpace`.** Los diez contadores de módulo pasan a un objeto que
  `Simulation` recibe (o crea, si no se le pasa ninguno). En una partida de una
  sola comarca la secuencia es la misma de siempre, y por eso sale
  bit-idéntica. Cuando exista el mapa, el `IdSpace` es del mundo y dos comarcas
  no pueden repetir un identificador.
- **3b. Registros.** `PersonRecord`, `HouseholdRecord` y `BandRecord`: la forma
  compacta y serializable de una persona, un hogar y una banda cuando no están
  en una comarca detallada. Una persona conserva nombre, sexo, nacimiento,
  rasgos, habilidades, tecnologías conocidas, hogar, padres, cónyuge,
  embarazo, cautividad, las N relaciones más fuertes y los recuerdos con mayor
  peso. Una banda conserva normas, `strangerRegard`, jefe, territorio (como
  fracción, no casillas), `BandRelations` y enemistades.
- **3c. Ida y vuelta.** `toRecord` / `fromRecord`. El test, en un amanecer sin
  acciones en curso: convertir a registros, reconstruir, y comprobar que
  identificadores, parentescos, opiniones y tecnologías coinciden. Lo que se
  pierde (la acción en curso, la ruta, el ánimo de la hora) se enumera en la
  cabecera, a propósito.

**Puerta:** `determinism.test.ts` y la matriz entera bit-idénticas; test de ida y
vuelta.

---

# Bloque II — El cuerpo (notas 3, 4, 6 y 10)

Va antes del mapa por una razón medible: el LOD de la fase 14 tiene que
reproducir en abstracto las tasas de natalidad, mortalidad infantil y
enfermedad del mundo detallado. Calibrarlo antes de que la lactancia, la
enfermedad y los depredadores existan sería calibrarlo contra una demografía
que está a punto de cambiar.

Stream nuevo: **`healthRng`**, el fork n.º 18, añadido después de
`cultureRng` y antes del bloque de `spawnResources`, con su fila en la tabla de
`AGENTS.md` en el mismo commit.

## Fase 4 — Dormir, y concebir bajo un techo (nota 3; M9.6 fases 4b-4d y 5)

> **2026-09-25: 4a, 4b y 4d pasan a M13.** Dormir al raso es parte del ritmo
> del día de M13 fase 3 (la gente vuelve a casa de noche y duerme allí, con
> techo o sin él), y los escritores y lectores del ánimo son los motivos
> psicológicos de M13 fase 10. **Aquí queda sólo 4c**, que da por hecho que
> 4a ya existe. El texto de 4a, 4b y 4d se conserva abajo como referencia de
> lo que M13 tiene que entregar.

- **4a. Dormir al raso existe.** *(→ M13 fase 3)* `doSleep` exige un edificio y quien no tiene
  techo hace `rest` (`m9_6_plan.md` fase 5). `sleep` gana una rama exterior: un
  lugar en vez de un edificio, con motivo de despertar y lugar registrado.
  Así `shareTheHearth` muestrea de verdad dónde durmió cada uno. Medido: es un
  verbo que usan otros cinco.
- **4b. `comfort` y `security` al dormir.** *(→ M13 fase 10)* El suelo desnudo cuesta `comfort`,
  más con frío y nieve (`Snow.ts`), y también `security`. El campamento propio
  y dormir apiñados lo alivian (los dos sustitutos reales de `m9_6_plan.md`); el
  guardia de frontera (M11 15e) y la casilla reclamada (M12 5a) ya existen, así
  que **esta vez se añaden los cuatro términos**, no dos. En la misma pasada
  de medianoche, `belonging` se escribe al dormir bajo el techo de la familia
  y al hablar con parientes, y `purpose` sale de `person.noticed` (trabajo
  terminado frente a trabajo interrumpido), como proponía `m9_6_plan.md`.
- **4c. Concebir exige haber dormido juntos.** `LifeSystem.tryConceive` sólo
  exige hoy un cónyuge vivo y adulto. Pasa a leer el muestreo de medianoche de
  `shareTheHearth`: la pareja durmió bajo el mismo techo esa noche. *Decisión
  del propietario* (ver §Decisiones): ¿vale un paravientos (`windbreak`)? ¿Vale
  dormir juntos al raso? La nota dice «en la misma casa»; sin un sustituto al
  raso, una banda sin choza no tiene hijos. La recomendación es que valga
  cualquier refugio, paravientos incluido, y **no** el raso, porque así la
  choza es lo que hace crecer a una familia.
- **4d. Leer el ánimo** (M9.6 4c). *(→ M13 fase 10)* La tristeza empuja hacia compañía,
  descanso, `play` y la flauta. Medido, con `ai-uses-many-actions` leído como
  distribución.

**Puerta:** un check nuevo, `conception-needs-a-roof`. Cuenta concepciones cuya
pareja no compartió techo esa noche, tiene que dar 0, y **en el build anterior
tiene que fallar**. La supervivencia media a 20 semillas no cae más de lo que se
declare antes de medir.

## Fase 5 — El embarazo (nota 3)

- **5a. Tres tramos.** La gestación dura hoy `daysPerYear / 4` (10 días con el
  reloj por defecto). Se divide en tercios. En el primero no cambia nada. En el
  segundo, `MovementSystem` aplica un factor de paso (0,85). En el tercero el
  paso baja más (0,7) y **quedan vetadas las tareas pesadas**: `hunt`, `chop`,
  `build`, `attack`, `spar`, `sabotage`, `restrain` y `drag`. Siguen permitidas
  `forage`, `gather`, `pick`, `craft`, `talk`, `teach`, `sow` y `reap`. La
  lista vive en un solo sitio (`Pregnancy.ts`), como una propiedad de
  `ActionDef`, y la leen los tres consumidores que hoy filtran candidatos
  (`Brain`, `ActionCatalog` y el menú del jugador).
- **5b. Rechazo con motivo.** Ordenar a una embarazada en el tercer tramo que
  vaya a cazar se rechaza con `abandon(…, 'too_heavy_with_child')` y su frase en
  inglés y en español. Regla del propietario: la interfaz dice por qué.
- **5c. Se ve.** La ficha dice «embarazada (segundo trimestre)» a quien la
  conoce: a los desconocidos, sólo si el tercer tramo es visible. Pasa por
  `Knowledge.ts`. El sprite gana el vientre en el tercer tramo.
- **5d. Aborto espontáneo y parto.** Pequeña probabilidad (con `healthRng`) si
  la madre sufre hambre extrema, fiebre (fase 7) o un golpe en el torso. El
  parto puede complicarse con una probabilidad baja que reduce `herbalism`
  (la partera). Todo con motivo visible y entrada en la crónica.

**Puerta:** check `the-pregnant-are-spared`. En el tercer tramo, ninguna
embarazada empieza una tarea vetada. Se verifica contra un build que no aplica
el veto.

## Fase 6 — La crianza (nota 4)

El núcleo de la nota y la fase más cara del bloque.

- **6a. Un bebé no anda.** Durante su primer año (40 días con el reloj por
  defecto), un recién nacido tiene `carriedBy = madre`. Su posición es la de
  ella, no elige acciones propias (`Brain` lo salta, como hoy salta a los
  cautivos atados) y el renderer lo dibuja en sus brazos. Quien lo lleva
  anda algo más despacio (0,9), y ese factor se multiplica con el del embarazo
  si ya espera otro.
- **6b. Mamar.** El bebé tiene hambre y sed propias a un ritmo propio. Un verbo
  `nurse`, corto (unos 15 ticks) y que se repite varias veces al día, lo
  alivia. La madre lo elige por puntuación cuando el hambre del bebé sube; el
  jugador lo ve y puede ordenarlo. Mientras amamanta, la madre **gasta más**:
  un término en `NeedsSystem.exertionOf`, reutilizado y no duplicado, que
  también mueve `macroTarget` (M11 fase 8).
- **6c. La amenorrea de la lactancia.** Mientras amamanta, la probabilidad de
  concebir de la madre se multiplica por un factor bajo. **Es la palanca «frenar
  la natalidad bajo presión» de `next-steps.md` §1**, y llega con base
  histórica y sin tocar `conceptionChance`: una madre mal alimentada amamanta
  más tiempo, porque el bebé tarda más en destetarse, y concibe más tarde. Se
  mide contra `birthSpacingDays`, que podría retirarse si la lactancia ya
  produce el espaciado. Ese es un commit aparte y medido.
- **6d. Si la madre muere.** Otra mujer lactante de la banda puede criarlo
  (`wet_nurse`, un vínculo que baja al grafo de la tribu y a la crónica). Si no
  hay ninguna, el bebé muere de hambre en pocos días, con causa de muerte
  visible. Es duro, y es lo histórico.
- **6e. El destete y la cuna.** Pasado el año el niño anda, despacio, y se
  queda cerca de la madre o del campamento. *(Esa mitad, que el niño que anda
  no se aleje de quien lo cuida, la entrega M13 fase 2 con el motivo
  «querencia»; esta fase sólo tiene que conectar el destete con el cuidador que
  M13 ya calcula.)* **Tecnología nueva `cradle`**
  (práctica, Paleolítico superior; los portabebés de cuero y fibra son muy
  anteriores a la cuna de madera, y así se documenta en `firstKnown`; requiere
  `leatherwork` o `basketry`): con ella, la madre puede dejar al bebé en el
  campamento, en una cuna colocada en una choza, y trabajar sin él, siempre
  que vuelva a amamantarlo. Se entrega con su efecto en el mismo commit
  (regla del propietario). **Camas** (M7): la misma pasada añade el mueble
  `bed` a las chozas de `wattle_daub` y `masonry`, con su término de `comfort` en
  4b. `m9_6_plan.md` dejó escrito que el término de la cama no se escribiría
  hasta que una cama existiera; esta es esa pasada.

**Puerta:** `DEMOGRAPHY` (fase 1c) antes y después, a 20 semillas, con el coste
declarado **antes** de medir. La mortalidad infantil *debe* subir algo, porque
es lo que la nota pide. El límite lo fija el propietario (§Decisiones). Check
`infants-are-carried`: ningún bebé de menos de un año a más de un paso de quien
lo lleva, salvo en una cuna. Se verifica contra un build sin `carriedBy`.

## Fase 7 — Anatomía, heridas y enfermedad (nota 6)

- **7a. Partes del cuerpo, inertes.** `Person.body` con seis partes: cabeza,
  torso, dos brazos y dos piernas. Cada una lleva daño (0-1) y estado de herida
  (`none`, `fresh`, `tended`, `infected`, `healed`, `scarred`). `health`
  sigue siendo el número que lee todo el código y se calcula exactamente como
  hoy. Los golpes (`doAttack`, colmillos de la fase 9) eligen una parte con
  `healthRng`, que es un stream nuevo, así que **nada existente cambia**.
  Bit-idéntico salvo por el propio stream. Mismo patrón que
  `Building.durability` y `Person.mood`: primero el campo, después el efecto.
- **7b. Las heridas pesan.** Pierna: paso más lento, y con las dos dañadas no
  puede huir. Brazo: trabajo manual y pelea más lentos. Torso: sangra, y la
  salud baja hasta que alguien atiende la herida. Cabeza: puede dejar
  inconsciente, y el máximo de daño mata. **Nada de esto puede convertirse en un
  segundo mecanismo de muerte por hambre**; se vigila la supervivencia media.
- **7c. Enfermedades, con grados.** `Person.conditions`: una lista de
  `{ kind, severity: 'mild'|'moderate'|'severe', daysLeft, part? }`. Tipos de
  esta fase:
  - **Intoxicación alimentaria**: por carne o pescado crudos (con probabilidad
    baja; ver fase 8), por comida estropeada (cuando la descomposición esté
    encendida) o por **bayas tóxicas**. Vómitos: suben la sed y el hambre y
    bloquean el trabajo pesado unos días.
  - **Herida infectada**: una herida `fresh` que nadie atiende tiene una
    probabilidad diaria de pasar a `infected`, y la parte cuenta. Una pierna
    infectada no es una intoxicación: fiebre, cojera y, en grado severo, la
    muerte.
  - **Fiebre**: el estado sistémico que agravan las dos anteriores.
- **7d. Plantas medicinales y bayas desconocidas.** Dos especies nuevas de
  arbusto en su propia pasada de aparición (stream `healthRng` o uno propio;
  **nunca** en el `plan` de `spawnResources`, por la trampa de `spawnRng`):
  - una **baya tóxica** que se parece a la comestible;
  - una **hierba medicinal** (milenrama, sauce) que `herbalism` sabe usar.

  **`plant_lore` pasa a distinguirlas**: quien la conoce no recoge la tóxica, y
  quien no la conoce se arriesga. Es el primer efecto defensivo de una
  tecnología en todo el árbol. `tend` gasta hierbas y baja un grado la
  condición. La ficha muestra la enfermedad a quien la ve: los síntomas son
  visibles; la causa, sólo si el personaje la sabe.
- **7e. Se ve y se cuenta.** Las heridas, en la ficha y sobre la silueta del
  sprite (una venda en la parte). La crónica registra «se le infectó la herida
  de la pierna». Una muerte por infección deja al investigador de M11 fase 16
  una pista distinta de la de un golpe.

**Puerta:** un check `wounds-fester-untended`. Entre heridas atendidas y sin
atender, la tasa de infección difiere en la dirección esperada. Se verifica
contra un build en el que `tend` no cambia nada. La supervivencia media a 20
semillas dentro del coste declarado.

## Fase 8 — El fuego y la cocina (nota 10)

> **2026-09-25: 8a y 8b pasan a M13 fase 8**, donde son el caso de prueba de
> las creencias aprendidas: la carne asada tiene que ganarse la preferencia
> porque alguien la probó y se corrió la voz, no por un coeficiente. **Aquí
> queda sólo 8c**, que necesita las intoxicaciones de la fase 7 y da por hecho
> que la hoguera y el asado ya existen.

Hoy `cooking` es una práctica que multiplica la nutrición de **toda** comida en
`Macros.consumeFood`, y el fuego no existe como objeto: no hay hoguera.

- **8a. La hoguera.** *(→ M13 fase 8)* Edificio `hearth` bajo `firemaking`, barato (palos y
  piedras): calor en un radio (término en el frío de `NeedsSystem`), luz y, en
  la fase 9, un radio que los depredadores evitan. Es la primera estación de
  cocina (mecanismo 4 de M8).
- **8b. Carne asada.** *(→ M13 fase 8)* Recetas `roast_meat` y `roast_fish` en la hoguera, bajo
  `cooking`. El producto nutre más y **no enferma**. `cooking` deja de
  multiplicar todo lo que se come y pasa a multiplicar sólo lo cocinado; el
  plan de medición lo trata como un cambio de su efecto y no como un nodo
  nuevo. La trampa de `kiln_pot` aplica: el marcador de `craft` no tiene un
  término para «más sano», así que `bestFood` y el hambre de la banda tienen que
  preferir lo asado **por su nutrición mayor**, y eso se verifica con un script
  desechable antes del commit, como se hizo con el horno.
- **8c. Crudo, antes y después.** Comer `meat` o `fish` crudos tiene una
  probabilidad baja de intoxicación (fase 7c). Antes de `firemaking` no hay
  otra opción; después, quien puede asar y no asa se arriesga.

**Puerta:** `raw-meat-sickens` (intoxicaciones sólo tras comer crudo o tóxico;
ninguna tras asado), y la cohorte `hunters` a 20 semillas.

---

# Bloque III — La vida salvaje (notas 5 y 8; `next-steps.md` §8)

Stream nuevo: **`ecologyRng`**, fork n.º 19, después de `healthRng`.

## Fase 9 — Un ecosistema en la comarca

- **9a. La hierba.** No una entidad por mata, que no cabría en el
  presupuesto, sino una capa `World.grass: Float32Array` con la altura de 0 a 1
  en cada casilla de pradera y linde de bosque. Crece con
  `TimeManager.growthOfDay`, la fertilidad y la humedad, y se agosta en
  invierno; la nieve la entierra (`Snow.ts`) y el pastoreo y el pisoteo la
  bajan. **Sin tiradas**: una función pura, como el suelo. El renderer la tiñe.
- **9b. Segar.** Un verbo `cut_grass` sobre hierba alta (> 0,7) produce
  `thatch`, que `cordage` ya convierte en cuerda desde M11 15c. La nota pide
  exactamente eso, y la receta ya existe.
- **9c. Los herbívoros comen.** `Animal` gana hambre. Una manada busca hierba
  alta en vez de derivar al azar, se queda donde hay y la baja. Una manada sin
  pasto adelgaza, y el hambre extrema mata a sus miembros más débiles.
- **9d. Reproducción.** Nacimientos de primavera, proporcionales a lo bien
  comida que está la manada y a su tamaño, con un techo de capacidad que sale
  del pasto y no de una constante. Es la reproducción proporcional que ya usan
  los corrales (`workHerds`), aplicada en libertad. Una comarca cazada hasta
  quedar vacía **se queda vacía** hasta que entren animales por el borde (9h).
- **9e. Depredadores.** Especies nuevas con base histórica en la Europa del
  Holoceno: **lobo** (en jauría), **oso** y **lince**. Añadir especies a
  `SPECIES` mueve el índice de las existentes; aparecen en su propia pasada con
  `ecologyRng`, **nunca** en `spawnHerds`. Cazan herbívoros con el mismo
  mecanismo de persecución que `hunt`. Un depredador saciado no caza.
- **9f. Los animales atacan a personas.** Tres casos distintos, como pide la nota:
  - **el carnívoro hambriento**: un lobo o una jauría sin presa se acerca a
    personas solas, a niños y a bebés en la cuna, y más de noche. El fuego
    (8a) los mantiene lejos, igual que los perros cuando existan;
  - **el herbívoro que se defiende**: un campo `SpeciesDef.defends`. El ciervo
    (el macho, con las cuernas) y el jabalí devuelven el golpe al cazador; la
    liebre no. La herida cae en una parte del cuerpo (7a); el jabalí rasga
    piernas;
  - **el oso sorprendido**: ataca si alguien se le acerca demasiado.

  Todo ataque animal alimenta `Fear` (`security`) y se registra con motivo. El
  miedo a los lobos es un motivo de guardia nocturna, y la guardia ya existe.
- **9g. Memoria animal** (el gancho inerte de `Animal.fedBy`). Un animal
  alimentado recuerda a quien lo alimentó, y uno herido, a quien lo hirió.
  `taming` (que ya lee `temperament`) aprovecha el primero. Un lobo alimentado
  a menudo es el comienzo del perro: **tecnología `dog`**, Paleolítico superior
  (hace ~15.000 años), que requiere `taming`. Su efecto: un perro avisa de
  depredadores y de extraños (término en la vista de la guardia) y ayuda en la
  caza. Se entrega con su efecto.
- **9h. Entrar y salir por el borde** (nota 8). Cada borde de la comarca tiene
  una reserva abstracta de fauna. Con probabilidad baja y diaria, una manada
  sale por un borde o entra por él, desde la reserva y según su composición.
  Mientras no exista el mapa (bloque IV), la reserva es una constante por
  escenario. Con el mapa, es la fauna abstracta de la comarca vecina (fase 14e).
  Se ajusta para que **se note** haber cazado todo: la recuperación desde el
  borde tiene que ser más lenta que la caza de una banda que caza en serio.

**Puerta:** `herds-follow-the-grass` (la posición de las manadas se correlaciona
con la hierba alta), `predators-hunt` (hay presas muertas por depredadores),
`a-hunted-out-land-stays-empty` (en un escenario nuevo, `wilds`, una comarca
cazada hasta el final tarda más de N días en recuperar la mitad de su fauna).
Cada check se verifica contra el build que lo rompe.

## Fase 10 — Plantar (el hueco «Nobody plants a tree»)

Pequeña y opcional dentro del bloque. `Tree` y `ForestSystem` ya tienen toda la
maquinaria. Falta un verbo `plant` y una razón para usarlo. La razón histórica
es la **arboricultura** del Neolítico: olivo, higuera y avellano, plantados
cerca del poblado. Tecnología `arboriculture`, que requiere `farming` y
`calendar`: se plantan frutales en tierra propia. Es la primera inversión a una
generación vista, que es el tema del juego. Si el bloque se alarga, esta fase
se aparta y no bloquea nada.

---

# Bloque IV — El mapa del mundo (notas 7 y 8; el arco del propietario)

## Fase 11 — El mundo por encima de la comarca

- **11a. `WorldMap`**, fuera de `src/sim/core/Simulation.ts`, en
  `src/sim/world/`. Una rejilla de comarcas, 24 × 16 por defecto (ajuste en la
  partida nueva). Por comarca:
  - **elevación** y **latitud**, de las que salen la temperatura media y la
    amplitud estacional;
  - **lluvia**, de la que sale la humedad;
  - **tipo**: mar, costa, bosque templado, bosque boreal, tundra, estepa,
    matorral mediterráneo, desierto, humedal o montaña;
  - **ríos** como grafo que cruza comarcas (entra por el borde A y sale por el
    B), para que las comarcas vecinas coincidan;
  - **agua dulce**: ríos, lagos y manantiales, con su puntuación;
  - **fauna**: especies y abundancia según el clima (nota 8): reno y lobo en la
    tundra, uro y ciervo en el bosque templado, onagro y gacela en la estepa;
  - **flora**: bayas, avellano, roble, y **cereal silvestre sólo en estepas
    templado-cálidas**. Así la agricultura nace donde nació, y no en todas partes;
  - **minerales**: sílex común, arcilla junto a los ríos, cobre en las colinas,
    **estaño en muy pocas comarcas**, hierro de pantano en los humedales.
- **11b. Semillas sin tocar la tabla de forks.** El mapa se genera con un `RNG`
  **derivado** de la semilla (`deriveSeed(seed, 'worldmap')`), no con un fork de
  `this.rng`. La semilla de la `Simulation` de cada comarca es
  `deriveSeed(seed, cx, cy)`, **salvo la comarca de partida, que usa la semilla
  del mundo tal cual**. Así una partida de una sola comarca con el perfil
  clásico sale bit-idéntica y la tabla de `AGENTS.md` no gana ninguna fila por
  el mapa.
- **11c. `TileProfile`.** Lo que `World.generate` necesita saber de su comarca:
  bordes con tierra o con mar (la caída radial sólo mira hacia el mar), umbrales
  de bioma según el clima, ríos de entrada y salida, desplazamiento y amplitud de
  temperatura para `TimeManager`, y las tablas de fauna, flora y minerales para
  las pasadas de aparición. **El perfil `legacyIsland` reproduce el mundo de
  hoy** y es el que usan todos los escenarios existentes: bit-idéntico.
- **11d. `WorldState`.** El objeto que tiene el `WorldMap`, el `IdSpace`, los
  registros abstractos (fase 3b), el libro de cada comarca abandonada (fase 14)
  y la `Simulation` detallada del momento. `main.ts` pasa a hablar con
  `WorldState`, que le entrega la `Simulation` actual. El arnés sin interfaz
  sigue pudiendo crear una `Simulation` suelta, y los 19 escenarios lo hacen.

**Puerta:** la matriz entera **bit-idéntica** con `legacyIsland`; test de que
dos comarcas vecinas coinciden en ríos y bordes; test de que el mapa es una
función pura de la semilla.

## Fase 12 — El agua dulce y la sal (nota 7; N1 y N2)

- **12a. Ríos, lagos y manantiales en la comarca.** Con un perfil continental,
  `World.generate` traza los ríos del perfil cuesta abajo, del borde de entrada
  al de salida o al mar, con uno a tres de ancho. Llena los lagos en las
  hondonadas y siembra los manantiales en las laderas, en su propia pasada.
  Bioma nuevo **`river`**, añadido al final de `BIOMES` para no mover los
  índices: no se camina por él, salvo en los **vados**, casillas someras y
  caminables que la generación garantiza a cierta distancia. Así un río parte
  la comarca en regiones sin aislar a nadie.
- **12b. Dulce y salada.** `World.shoreTiles` se parte en `freshShore` y
  `saltShore`. `Brain.findWater`, el clic derecho «Beber», `waterWithinReach` y
  `shoreHash` leen sólo agua dulce. Beber del mar es posible para el jugador,
  pero sube la sed y hace daño, y la interfaz lo dice («el agua del mar es
  salada»). La IA nunca lo elige. **El perfil `legacyIsland` conserva el mar
  potable**, o todos los mundos de hoy morirían de sed. Está escrito en la
  cabecera del perfil.
- **12c. Agua de la fruta.** `ItemDef.water`: las bayas, las manzanas y la
  leche quitan algo de sed. Es la salida de la nota para una comarca con poca
  agua, y el puente hasta el pozo o la migración.
- **12d. Los puntos de pesca en el agua** (N1). Los peces se colocan en casillas
  de río, lago y costa con un vecino caminable. `findNode` comprueba la región
  de esa orilla y `Brain.setup` manda al pescador a ella. El «ajuste de
  objetivo» de `Pathfinder` (`findWalkableNear`), construido en M7 y sin usar
  desde entonces, es la mitad barata.
- **12e. Sin agua dulce, no se puede vivir.** Una comarca sin río, lago ni
  manantial deja sólo la fruta y el pozo (`well`, que ya existe). Es el
  **motivo de migración más fuerte** de la fase 16.

**Puerta:** escenario `frontier` (comarca continental con río). Checks
`nobody-drinks-the-sea` (cero tragos de mar de la IA; se verifica contra un
build que no distingue) y `rivers-are-crossed` (hay cruces por vados). La
matriz clásica, bit-idéntica.

## Fase 13 — El globo (el icono del propietario)

- **13a. El icono.** Un globo abajo a la izquierda abre `WorldMapView`, un
  overlay a pantalla completa con su `[hidden] { display: none; }` (la regla
  de `AGENTS.md`) y un digest que sólo redibuja cuando cambia lo que
  muestra (la regla de `TechWeb`).
- **13b. Sólo lo que tu gente sabe.** Cada comarca se pinta de tres maneras:
  **conocida**, porque alguien de tu banda estuvo en ella, con su tipo, su agua,
  su fauna vista y los pueblos encontrados; **de oídas**, porque alguien te lo
  contó, con menos detalle y marcada como rumor; y **desconocida**, a oscuras.
  Todo pasa por `Knowledge.ts`. Nada es omnisciente (regla del propietario).
- **13c. `WorldKnowledge`.** La versión de `BandMaps` a escala de mundo: por
  banda, qué comarcas conoce, cómo lo sabe y cuándo lo supo. Se escribe al estar
  en una comarca; al hablar (un tipo de historia `place` que viaja por
  `Conversation` como los chismes); al casarse con alguien de fuera o capturar a
  alguien, porque el que llega trae el mapa de su casa; y al volver un
  explorador (fase 16c).
- **13d. La deuda de interfaz.** Esta es la pasada de interfaz del milestone.
  Fijar el trazado del árbol tecnológico, para que no se mueva al añadir un nodo
  (M14 añade más de diez), y el zoom de `FamilyTree` en el móvil
  (`bugs.md`). El globo se diseña táctil desde el principio.

**Puerta:** e2e con `?skipIntro=1`: el globo abre, cierra y no se traga los
clics; una comarca desconocida no revela nada; una conocida por una historia
aparece «de oídas».

---

# Bloque V — Las comarcas que no se ven

## Fase 14 — El modelo abstracto (el LOD)

La pieza más arriesgada del milestone y la razón de los bloques I y II.

- **14a. `RegionSim`.** Un paso diario por comarca no detallada y por banda que
  viva en ella. Balance de comida a partir del perfil, la capacidad de carga, el
  tamaño y las tecnologías. Nacimientos y muertes con las **tasas medidas por
  `DEMOGRAPHY`** en el mundo detallado, según edad, hambre y enfermedad. Difusión
  tecnológica entre bandas que se tratan. `BandRelations` y enemistades que
  evolucionan con sus propios motores, en versión agregada. Stream propio,
  derivado de la semilla, en `WorldState`, **no** en `Simulation`.
- **14b. Las personas con nombre siguen existiendo.** Una banda abstracta es
  una lista de `PersonRecord`, no un número. Nace un niño con padres; muere
  alguien con causa; se casa una pareja. Así la familia rival sigue viva en otra
  comarca, y el árbol genealógico del jugador no se rompe cuando su hija se casa
  en la comarca de al lado.
- **14c. De abstracto a detallado.** Al entrar en una comarca se regenera el
  terreno desde su semilla y se aplica su **libro** (`TileLedger`): los edificios
  que quedaron, con el deterioro de `durability` según los días pasados; los
  campos; el suelo agotado; los árboles talados y recrecidos; los cuerpos
  convertidos en huesos, que la fase 16 de M11 ya sabe descomponer. Después se
  colocan las personas de cada banda en torno a su campamento.
- **14d. De detallado a abstracto.** Al salir se escribe el libro y cada persona
  pasa a registro (fase 3c).
- **14e. LOD de fauna** (`optimizations.md` n.º 2). La fauna de una comarca no
  detallada es un número por especie que sigue la misma ecuación de pasto,
  depredación y reproducción que la fase 9, agregada. Es la reserva de los
  bordes de la fase 9h, ya real.

**Puerta:** check `lod-matches-detail`. La misma banda, simulada dos años en
detalle y dos en abstracto, a 20 semillas, da una población final media dentro
de ±15% y la misma tendencia en número de tecnologías. **Si no se cumple, el
bloque VI no empieza.** Un LOD que diverge convierte cada migración en una
lotería.

## Fase 15 — Poblar el mundo

- **15a.** Al crear una partida con mapa, además de las bandas de la comarca de
  partida (las que diga el ajuste, como hoy), el mundo siembra **pueblos
  abstractos** en otras comarcas habitables. Su densidad baja con la distancia y
  la dureza del clima. Cada uno recibe sus normas y su `strangerRegard` (M12 2d)
  con el stream del mundo, porque son culturas distintas desde el principio.
- **15b.** Nuevo ajuste de partida: «Mundo: una comarca (clásico) / mapa del
  mundo». El modo clásico es el de hoy.

---

# Bloque VI — Migrar

## Fase 16 — Salir de la comarca

- **16a. Los bordes se cruzan.** Si el vecino de un borde es tierra, ese borde
  es una salida. Verbo `leave_region` hacia un borde. Si el vecino es mar o
  montaña infranqueable, se rechaza con motivo («al otro lado sólo hay mar»).
- **16b. El jugador migra.** Cuando el personaje del jugador cruza, la comarca
  cambia (fases 14c y 14d) y entra por el borde opuesto de la vecina. Van con
  él quienes lo sigan: su hogar si se lo ordena (orden `follow_me`, con su
  entrada en `ORDER_COST`: dejar tu tierra es mucho pedir) y la banda entera si
  es jefe y la orden sale adelante. Los que se quedan siguen en la comarca de
  origen, ahora abstracta. **Una banda puede partirse**, y es así como se
  expandieron las poblaciones.
- **16c. Explorar.** Un verbo `scout`: alguien sale por un borde y vuelve días
  después (en abstracto) con lo que vio de la comarca vecina. Para la regla del
  propietario, es el único modo honesto de saber adónde ir. Es también una
  historia con nombre propio: el explorador que no volvió.
- **16d. La IA migra.** Una decisión diaria de banda en `BandSystem`,
  **determinista** (su `rng` es `forestRng`; una tirada nueva replanta los
  bosques). Los motivos, del más fuerte al más débil:
  1. no hay agua dulce (nota 7);
  2. hambre sostenida;
  3. un vecino más fuerte con enemistad o incursiones repetidas;
  4. sobrepoblación sobre la capacidad de la comarca;
  5. los desterrados (M11 5e) fundan una banda en la comarca de al lado en vez
     de vagar.

  El destino se elige sólo entre comarcas que la banda **conoce**. Sin ninguna
  conocida, primero se explora.
- **16e. Lo que se deja atrás.** El campamento abandonado queda en el libro y se
  deteriora. Otra banda puede ocuparlo o saquearlo. Volver a él tres
  generaciones después es volver a unas ruinas.

**Puerta:** escenario `drought` (comarca sin agua dulce, vecina con río). Check
`the-thirsty-leave`: la banda migra antes de que muera de sed más de un tercio;
en un build sin el motivo del agua, no migra. Check `fission-happens` en la
cohorte con mapa.

## Fase 17 — Llegar más lejos (transporte)

Cada tecnología llega con su efecto en el mismo commit (regla del propietario)
y en su orden histórico (regla del propietario):

| nodo | edad | requiere | efecto |
|---|---|---|---|
| `logboat` | Mesolítico (la canoa de Pesse, hace ~10.000 años) | `carpentry`, `firemaking`, `ground_stone`* | cruzar ríos y lagos fuera de los vados; viaje por la costa a comarcas costeras |
| `sledge` | Mesolítico | `carpentry`, `cordage` | más carga por persona en el viaje; en nieve, además, más rápido |
| `pack_animals` | Calcolítico (el asno, hace ~6.000 años) | `herding` | viajes de dos comarcas; carga que no va a la espalda |
| `horse_riding` | Calcolítico (Botai, hace ~5.500 años) | `herding`, `taming` | viajes de tres comarcas; exploradores más rápidos; la caballería, en el bloque VIII |
| `the_wheel` (ya existe) | Neolítico | — | **gana la velocidad que se quedó sin construir**: el carro acorta los viajes entre comarcas, no los recados dentro de una, y así evita tocar `MovementSystem` en todas partes |
| `sail` | Edad del Bronce (el Nilo, hace ~5.500 años) | `weaving`, `logboat` | viajes por mar entre comarcas no contiguas |

\* Con la cautela de la memoria del proyecto: si la canoa es más antigua que
la piedra pulida del árbol, `requires` lleva la puerta de juego y `firstKnown`
la verdad histórica. Se discute al escribir el nodo.

- **17d. El viaje de varias comarcas** es un estado abstracto: días de camino,
  provisiones consumidas, y encuentros resueltos con el stream del mundo
  (tormenta, fauna, un pueblo). Aquí revive la decisión del §0b de
  `next-steps.md`: **el viaje es la primera razón real para conservar comida**.
  Se vuelve a medir la descomposición *sólo en las provisiones del viaje* y, si
  se sostiene, `preserving` y el secadero (retenidos desde M8.1) salen en esta
  fase con su efecto. Si no, siguen retenidos y se anota por qué.

**Puerta:** un check por nodo, cada uno verificado contra el build sin el nodo.
Cohorte `migrants` a 20 semillas.

---

# Bloque VII — Entre comarcas

## Fase 18 — Noticias, comercio y caravanas

- **18a. Las noticias viajan con la gente.** Un robo en la comarca A se sabe en
  la B sólo si alguien que lo vio, o a quien se lo contaron, llega a la B
  (regla del propietario). Los viajeros, los cónyuges de fuera, los cautivos y
  los comerciantes son los canales.
- **18b. `trade`**, el nodo de M8.2 que nunca llegó a `TECHS`: práctica del
  Neolítico que requiere `marking`. Su efecto: el trueque entre bandas lee
  `ItemDef.baseValue`, y una banda que lo conoce puede **organizar una caravana**.
- **18c. Caravanas.** Entidad del mundo: origen, destino, carga, escolta y días
  de camino. En abstracto intercambia bienes y sube `BandRelations`. Si llega a
  la comarca detallada, entra por un borde, acampa, comercia con quien se
  acerque y se va. Se puede asaltar, y eso deja una enemistad entre comarcas
  que viaja de boca en boca como cualquier agravio.
- **18d. Incursiones y guerra entre comarcas.** `considerRaid` (M11 11c) ya
  arma partidas. Con el mapa, el objetivo puede estar en otra comarca: la
  partida viaja, y si el objetivo es la comarca del jugador, **llega por el
  borde**.
- **18e. La casa rival.** Las enemistades de hogar (M12 6a-6c) viajan en los
  `HouseholdRecord`. La interfaz gana una vista de la casa enemiga, a partir de
  lo que tu familia sabe de ella. El archienemigo multigeneracional que el
  propietario pidió no construir antes de tiempo; M14 sólo evita que se pierda
  al cambiar de comarca.

## Fase 19 — El Calcolítico y el Bronce (M8.3), porque el estaño está lejos

M8.3 entra aquí y no antes por una razón histórica que el mapa hace jugable:
**el bronce exige estaño, y el estaño está en muy pocas partes**. Las redes de
comercio de la Edad del Bronce existieron por eso. Los diez nodos de
`m8_plan_the_ages.md` (`charcoal`, `mining`, `native_copper`, `smelting`,
`bellows`, `casting`, `alloying`, `bronze_tools`, `bronze_arms` y `goldwork`)
con los recursos de mineral colocados según el perfil de la comarca (11a),
en su propia pasada y con su propio stream. `smith` por fin se entrena.
`armourOf` pasa por `techPower`. Una mina es un nodo, no una casilla excavada,
así que **no hace falta la reparación de regiones**.

**Puerta:** los checks de M8.3 del plan de las edades, más
`bronze-needs-a-trader`: en la cohorte con mapa, casi ninguna banda sin estaño
en su comarca funde bronce sin haber comerciado o asaltado.

---

# Bloque VIII — Civilización

El arco del propietario: de la tribu con jefe al gobierno, que puede declarar
la guerra, cobrar impuestos (aunque sean 0) y comerciar. **Este bloque puede
convertirse en M15** si el bloque VII se alarga. Está escrito para que no haya
que diseñarlo de nuevo.

## Fase 20 — De la jefatura al Estado

- **20a. El banquete** (la mitad pendiente de `brewing`). El jefe gasta
  excedente (cerveza, pan, carne) en una fiesta que reúne a la banda: sube su
  renombre y la opinión de los asistentes. Es la redistribución antes del
  templo, y la arqueología la sitúa en el origen de las jefaturas. Encuentra por
  fin el excedente que `gift` echaba de menos (`bugs.md`, «Nobody carries a
  spare»).
- **20b. Los nodos del Estado**, en orden histórico y cada uno con su efecto:

| nodo | edad | requiere | efecto |
|---|---|---|---|
| `city_walls` | Neolítico precerámico (Jericó, hace ~10.000 años) | `masonry` | muralla: **aquí sí** llegan los muros de M7, como edificios que bloquean el paso, y con ellos la reparación incremental de regiones (el único cliente que la justifica) |
| `redistribution` | Neolítico final (templos de El Obeid, hace ~7.500 años) | `chiefdom`, `granary` construido | el templo-almacén: el jefe recoge y reparte; los hogares aportan |
| `accounting` | Calcolítico (fichas de arcilla → tablillas de Uruk) | `marking`, `clay_tablet` | deudas y aportaciones escritas: nadie las olvida (`Amends.ts`) |
| `taxation` | Edad del Bronce | `redistribution`, `accounting` | **impuesto** con tasa elegida por el gobierno, **0 incluido**: fracción de lo que el hogar almacena, al templo. Una tasa alta alimenta la rebelión (M6b fase 6) |
| `law_code` | Edad del Bronce (Ur-Nammu, hace ~4.100 años) | `writing`, `taxation` | los veredictos de `Justice.ts` se vuelven predecibles: la misma falta, la misma pena; baja el rencor ante un veredicto |
| `standing_army` | Edad del Bronce | `division_of_labour`, `taxation` | el trabajo de soldado, mantenido por el impuesto: entrena `fight`, vigila y forma la partida de guerra |
| `kingship` | Edad del Bronce | `chiefdom`, `standing_army` | el jefe es rey: su cargo se hereda en su hogar (sucesión dinástica); autoridad sobre bandas tributarias |

- **20c. Qué es una civilización.** Un campo derivado y no guardado, como la
  rebelión: una banda (o varias bajo un rey) que conoce `farming`, `writing`,
  `division_of_labour`, `taxation`, `standing_army` y `kingship`. La interfaz la
  nombra y el globo la pinta. El juego nunca obliga a ello (memoria del
  propietario: el jugador es libre de jugar como quiera).

## Fase 21 — Lo que un Estado puede hacer

- **21a. Declarar la guerra y la paz.** `BandRelations` gana un estado formal
  (`war`, `peace`, `tributary`) que sólo puede fijar un gobierno. La guerra
  declarada abre la incursión sin el umbral de rencor de hoy. La paz tiene un
  coste para quien la rompe, conocido por quien lo vio (regla del propietario:
  nadie se entera por arte de magia).
- **21b. Esclavitud.** La cautividad de M12 fase 4c (trabajo forzado) pasa a ser
  una institución con `kingship` o `law_code`: los cautivos adultos de guerra se
  quedan como siervos del hogar que los tomó, heredables. Es parte del arco
  histórico que el propietario pidió (esclavizar), y con él llegan su rechazo,
  su fuga y su rebelión.
- **21c. Conspirar contra el rey** (otro lector de `conspiracyAgainst`). La
  facción de M11 5d apunta al jefe: un golpe, o una sucesión disputada al morir
  el rey. Es la intriga de estilo Sims que el propietario quiere, y así
  `conspiracyAgainst` deja de tener un solo lector.
- **21d. Tratados y tributo.** Una banda vencida paga tributo en vez de
  desaparecer, y sus caravanas llevan el tributo al rey.

---

## Determinismo

> **Los números de fork de esta tabla suponen que M13 no añade ninguno**, que
> es lo que su plan pretende. Si M13 añade uno, `healthRng` pasa a ser el
> n.º 19 y `ecologyRng` el n.º 20, y la tabla de `AGENTS.md` manda: se añaden
> siempre detrás del último que exista al llegar aquí.

| # | fork | fase | dónde |
|---|---|---|---|
| 18 | `healthRng` | 7a | después de `cultureRng`, antes de `spawnResources` |
| 19 | `ecologyRng` | 9e | después de `healthRng` |

- **El mapa, `RegionSim`, los viajes y las caravanas no usan forks de
  `Simulation`**: sus streams se derivan de la semilla en `WorldState`
  (`deriveSeed`). Una `Simulation` suelta con `legacyIsland` es, por tanto,
  bit-idéntica a la de hoy salvo por lo que añadan las fases 4-10.
- **Cada fork añadido gana su fila en la tabla de `AGENTS.md` en el mismo
  commit.**
- **Especies, biomas, tipos de recurso y tecnologías nuevos se añaden al final
  de sus tablas**, y aparecen en pasadas propias después de `spawnPeople`.
  Nunca en el `plan` de `spawnResources` ni en `spawnHerds`: comparten
  `spawnRng` y el test de determinismo no lo detecta.
- **Ninguna tirada nueva en `BandSystem`**: su `rng` es `forestRng`. La decisión
  de migrar (16d) es determinista o usa el stream del mundo.

## Libro de commits: qué debe salir bit-idéntico

| commit | expectativa |
|---|---|
| 0 docs · 1a-1c instrumentos · 2a interfaz de órdenes | **bit-idéntico** |
| 2b pendiente de obediencia | medido, 20 semillas |
| 3a `IdSpace` · 3b registros · 3c ida y vuelta | **bit-idéntico** |
| 4c concepción bajo techo (4a, 4b y 4d, en M13) | uno a uno, medidos |
| 5a-5d embarazo | medido; 5c (interfaz) bit-idéntico |
| 6a-6e crianza | uno a uno, medidos contra `DEMOGRAPHY` |
| 7a partes del cuerpo | bit-idéntico salvo el stream `healthRng` |
| 7b-7e heridas y enfermedad | medidos |
| 8c crudo (8a y 8b, en M13) | medidos |
| 9a hierba (inerte) | **bit-idéntico** (sin tiradas, nadie la lee) |
| 9b-9h fauna | uno a uno, medidos; el escenario `wilds` es nuevo |
| 10 plantar | medido |
| 11a-11d mapa, `TileProfile`, `WorldState` | **bit-idéntico** con `legacyIsland` |
| 12a-12e agua | bit-idéntico en la matriz clásica; medido en `frontier` |
| 13 globo | interfaz, e2e |
| 14 LOD · 15 poblar | puerta `lod-matches-detail` |
| 16-21 | medidos en escenarios con mapa, 20 semillas |

## Escenarios nuevos

`nursery` (bloque II: bandas con parejas jóvenes y chozas, para la
demografía), `wilds` (depredadores y una fauna que se puede agotar), `frontier`
(comarca continental con río y vecinos), `drought` (sin agua dulce),
`migrants` (mapa pequeño y transporte), `caravans` (estaño lejos) y `polity`
(fundadores con los nodos del Estado, por el mismo truco que `craft` y
`scribes`).

## Verificación

```bash
npm run typecheck
npm test
npm run sim:check:all
DYNASTY_PORT=5399 npm run e2e
npm run sim:seeds -- --seeds 20          # todo lo que mueva el mundo; DEMOGRAPHY desde la fase 1c
npm run violence -- --scenario century   # las fases 9 y 18: dónde cae el daño
npm run why -- --person 0 --from 1700 --to 1760
```

Un commit «bit-idéntico» se demuestra con `sim:check:all` sin una sola cifra
cambiada, no con un test verde. Antes de añadir un check, se verifica que falla
en el build roto.

---

## Riesgos

- **El LOD que diverge.** Si el modelo abstracto no reproduce la demografía
  detallada, cada cambio de comarca es un salto de población que el jugador
  verá como un fallo. Por eso `lod-matches-detail` bloquea el bloque VI y por
  eso el bloque II va primero.
- **El bloque II como segundo mecanismo de hambre.** Embarazo, lactancia,
  heridas y enfermedad cargan todos a la misma población. Cada fase declara su
  coste en supervivencia **antes** de medir. Si una lo supera, se para y se
  pregunta al propietario, como en M11 fase 8.
- **Depredadores que vacían la banda.** Un lobo que se lleva un bebé cada
  semana es una picadora. Techo bajo, el fuego y la guardia como frenos, y la
  línea `DEMOGRAPHY` como alarma.
- **Los ríos parten las regiones.** `World.region` se calcula una vez. Los
  vados garantizados lo resuelven sin reparación incremental; si una fase
  quisiera excavar, desviar o construir un puente, entonces sí hace falta, y se
  hace en esa fase y sólo en ella.
- **`main.ts` tiene 2.142 líneas y asume una `Simulation` fija.** Hacer que
  hable con `WorldState` (11d) toca cámara, selección, HUD, sucesión y
  paneles. Se hace en un commit propio, sin cambios de comportamiento, con los
  e2e como red.
- **Sin guardado de partida, una dinastía de varias comarcas se pierde al
  recargar.** Los registros de la fase 3 son el 80% de un guardado. Ver
  §Decisiones.
- **`century` es caótico.** Todo se juzga a 20 semillas, nunca con una sola.

---

## Decisiones para el propietario

Cada una tiene una recomendación. El plan las da por tomadas en ese sentido
hasta que el propietario diga otra cosa.

1. **Orden: ¿el cuerpo antes que el mapa?** *Recomendado:* sí (bloques II y III
   antes que el IV), por la calibración del LOD. La alternativa es el mapa
   primero (bloques I, IV y V) y el cuerpo después, y exigiría recalibrar el LOD
   al terminar el bloque II.
2. **¿Qué techo cuenta para concebir?** *Recomendado:* cualquier refugio,
   paravientos incluido, y no el raso.
3. **¿Cuánta mortalidad infantil es aceptable?** La nota la sube por diseño (un
   bebé sin madre lactante muere). *Recomendado:* fijar un techo en la línea
   `DEMOGRAPHY`, por ejemplo que la supervivencia media de `century` no caiga más
   de 8 puntos a 20 semillas.
4. **¿La comarca de partida sigue siendo una isla?** *Recomendado:* no en el modo
   mapa. Una comarca continental con bordes de tierra, para que la primera
   migración sea a pie, como en la historia. El modo clásico conserva la isla.
5. **Tamaño del mundo.** *Recomendado:* 24 × 16 comarcas, ajustable.
6. **Guardado de partida.** *Recomendado:* añadirlo como fase 15c. Con los
   registros de la fase 3 y el libro de la fase 14 es poco más que serializar
   la comarca detallada al amanecer.
7. **`bands-take-sides` en mundos bien alimentados** (pendiente desde M11).
   *Recomendado:* que un pueblo bien alimentado no tome partido sin causa, y
   reescribir el check para esos escenarios.
8. **¿El bloque VIII es M14 o M15?** *Recomendado:* M15, con este documento
   como su plan.

---

## Documentación al cerrar cada pasada

`docs/changelog.md` con la fecha y el motivo; `docs/bugs.md` con lo
encontrado y no arreglado; `docs/next-steps.md` con la fila de la fase;
`AGENTS.md` con cada fork nuevo; y `docs/architecture.md` al cerrar la fase 11,
porque la regla «una `Simulation` = una isla» deja de ser verdad y el documento
de arquitectura la da por supuesta.
