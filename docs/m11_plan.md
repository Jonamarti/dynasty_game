# M11 — Nadie sabe lo que no ha visto: depredación, propiedad y macros

## Context

El propietario quiere mezclar tres juegos: **los Sims** (acciones de diálogo
controlables — cotillear, small talk, conversación profunda; resultados que
dependen de la personalidad; complots y expulsar a alguien de la tribu),
**RimWorld** (supervivencia y construcción de base) y **Evolve** (un árbol
tecnológico ancho, descubierto nodo a nodo). El arco que pide es el de la
historia humana: bandas igualitarias → división del trabajo → estratificación →
conflicto entre grupos, robo, esclavitud y muerte.

Su queja de partida: **no hay ningún motivo para que los personajes se
enfrenten**, y sospechaba que sobra comida o que aún no saben cómo.

### El diagnóstico medido, con una corrección importante

`npm run sim:check -- --scenario century` (4 años, 65 personas):

| indicador | valor | lectura |
|---|---|---|
| `needs-not-pinned` | hambre final **13.1**, sed 17.6, frío 0.1 | **no hay escasez ninguna** |
| `health-holds-up` | salud media **100.0** | nadie está bajo presión |
| `population-persists` | 65 vivos, pico 65 | el mundo no castiga |
| `opinions-diverge` | 3.710 relaciones: 2.712 cálidas, 187 hostiles | el 5% son malas |
| `ai-uses-many-actions` | `steal`=5.699 · `attack`=1.530 · `threaten`=903 | los verbos funcionan: son el ~0,4% |
| `events-witnessed` | deeds=2.658 · **witnessed=24.398 · unwitnessed=262** | el testigo **ya** importa |

**Medido el 2026-09-17, fase 0b — y la corrección que yo mismo introduje aquí
era falsa.** Se sospechaba que el +15.9 era un artefacto: `setKinship` crea la
arista con `bias: 0` e `introduce` se niega a marcar una arista existente, así que
un pariente de otra banda nunca recibiría `OUT_GROUP_BIAS`. **Refutado.** Añadida
la cifra `outsider-unrelated` (el mismo cubo filtrado a `kinship === 0`), sale
idéntica al `outsider` en los cinco escenarios probados, a un decimal. No hay
contaminación, porque el check ya excluye a los de la misma casa y un matrimonio
entre bandas mete a los dos cónyuges y a sus hijos en una sola casa.

**Lo que la medición sí encontró vale más que aquello para lo que se hizo:**

| escenario | pasos | forastero |
|---|---|---|
| `crowded` | 3.000 | **−5.2** |
| `band` | 3.000 | **−1.3** |
| `culture` | 9.000 | **+1.5** |
| `millers` | 36.000 | **+15.1** |
| `century` | 40.000 | **+15.9** |

El aprecio al forastero es una función monótona de **cuánto lleva el mundo
corriendo**. Y eso es un mecanismo, no ruido: `OUT_GROUP_BIAS` es una constante de
−6 fijada al crear la arista y que **nunca decae** — a propósito, para que «un
forastero siga siendo un forastero hasta que sus hechos digan otra cosa» — mientras
que todos los demás términos de `opinion` crecen con el trato: `familiarity` se
acumula en cada encuentro y entra a ×0.35, y `deeds` se acumula en positivo vía
`share_food`, `teach` y `help`. Con suficientes años la constante queda sepultada.

**Así que sí hay un "ellos", y se disuelve.** Que es exactamente al revés del arco
que se pide. Y es el argumento de por qué el standing entre bandas tiene que ser
un valor que pueda **crecer** hostil, y no una constante que no puede. La fase 7
se calibra contra esta tabla.

**Lo que sí se sostiene del diagnóstico**, verificado leyendo el código:

1. **Sobra comida.** `steal` se puntúa con `hunger * 0.8` y el hambre vive en 13.
2. **No existe ningún estado entre bandas.** `Band` es `id, name, homeX, homeY,
   norms, chiefId, outcast` y nada más.
3. **No hay desigualdad.** `Household.renown` **no tiene ni un lector ni un
   escritor** en todo `src/` — sólo la declaración,
   [Household.ts:37](src/sim/entities/Household.ts#L37). Y `household.store` sólo
   lo escribe [LifeSystem.ts:257](src/sim/systems/LifeSystem.ts#L257); el
   comentario de [Simulation.ts:1974](src/sim/core/Simulation.ts#L1974) ya lo
   llama *"un agujero negro"*.
4. **La propiedad es binaria y está copiada quince veces.** `ownerBandId ===
   person.bandId` aparece en `Brain` ×6, `Simulation` ×4, `BandSystem` ×4,
   `ActionSystem`, `Knowledge` y `Hud`. (`next-steps.md` §O4 y el comentario de
   [Brain.ts:1280](src/sim/ai/Brain.ts#L1280) dicen que se respeta "en exactamente
   un sitio". Está desactualizado.)

**Subir los coeficientes de agresión no es la respuesta.** El propio código
registra ese fracaso: *"una banda se consumía a sí misma en quince días"*
([Brain.ts:812](src/sim/ai/Brain.ts#L812)).

### El hallazgo que ordena la primera fase

El changelog de M9.5 4a dice que la primera versión de `threaten` **"nunca ganó
el argmax contra `steal`, y no apareció ni una vez en un siglo entero de un mundo
de 156 personas"**. En un scorer argmax un verbo nuevo nace invisible. Y este
plan añade unos ocho verbos. **El softmax va primero y solo**, o todo lo demás se
mide contra un scorer en movimiento.

### Las decisiones del propietario

De la primera ronda:

1. **Determinismo**: el RNG sembrado se queda. Cambia el argmax por **elección
   ponderada sembrada**.
2. **El conflicto sale de las dos cosas**: propiedad/desigualdad *y* escasez, en
   pasadas separadas y medidas por separado.
3. **Orden**: capa social → los 15 nodos neolíticos → guerra.
4. **Árbol**: `writing` detrás del excedente; más nodos con mecanismo; y **que al
   principio prime la tradición oral**.

De la segunda ronda, y son las que reorganizan el plan:

5. **Robar y atacar dependen de la personalidad y de la debilidad del objetivo.**
   Si el objetivo es débil, la elección debe pesar más.
6. **Nada se sabe al instante.** Un crimen —o un cotilleo, o una conversación
   conspirando contra el jefe— sólo lo conoce quien lo vio. Si no lo vio nadie,
   **la víctima tiene que ir a contarlo** para que la tribu se entere.
7. **La propiedad la protege la atención, no el permiso.** Un forastero
   *puede* dormir en una choza ajena o coger de un almacén ajeno si nadie de esa
   banda le ve y le para. Un guardia no sabe automáticamente que hay un crimen:
   tiene que verlo o que se lo cuenten.
8. **Un complot lo puede iniciar cualquiera** con relación y lealtad bajas, o con
   un rasgo de personalidad tipo *malévolo* o *conspirador*.
9. **La alimentación se separa por macronutrientes.** Grasa, proteína e hidratos
   en proporciones; penalización de salud si falta alguno; y la necesidad escala
   con el nivel de actividad.

No se pidió frenar el ritmo global de descubrimiento ni acortar las vidas.

---

## El principio que unifica 6, 7 y 8

**Nada ni nadie se entera de algo si no lo ha visto o se lo han contado.**

Es el gemelo, del lado de los NPCs, de la regla que este proyecto ya tiene del
lado del jugador (todo lo que enseña la UI pasa por `sim/social/Knowledge.ts`).
La buena noticia: **la mitad ya está construida**. `SocialSystem.emit` hace una
consulta de radio para los testigos y el contador dice `unwitnessed=262`. Lo que
falta es la otra mitad — que la víctima tenga *motivo* para ir a contarlo, y que
la propiedad deje de ser un test de pertenencia que hace el robo físicamente
imposible.

Esto convierte O4 de "funcionalidad nueva" en "el test binario se sustituye por
una pregunta sobre quién está mirando", que es a la vez más barato y mucho mejor.

---

# Bloque I — Los cimientos

## Fase 0 — Reparaciones y un mundo donde algo muerda

Cuatro commits pequeños, cada uno independiente.

- **0a — `AGENTS.md` miente sobre dónde se añade un fork.** Dice que el bloque
  termina en `recordRng` con un decimocuarto fork anónimo debajo. Verificado: hoy
  hay **tres** forks por debajo — el de `seedInitialForest`, `fishRng`
  ([Simulation.ts:404](src/sim/core/Simulation.ts#L404)) y `grainRng` (:409). **El
  punto real de inserción es justo después de `grainRng`.** Añadir donde invita el
  comentario replanta todos los bosques. Commit sólo de documentación, al
  principio del milestone, o le cuesta un día a alguien.
- **0b — medir el forastero limpio. HECHO** (`b78fa6b`). La cifra
  `outsider-unrelated` sale idéntica al `outsider`: la hipótesis del artefacto
  queda refutada y el instrumento se queda como prueba. Lo que encontró en su
  lugar —que el aprecio al forastero crece con la duración del run— está en la
  tabla del Context y es contra lo que se calibra la fase 7.
- ~~**0c — `setKinship` debería marcar `firstImpression`.**~~ **Retirado a la luz
  de 0b.** La medición demuestra que los parientes de otra banda no están
  contaminando nada, así que el único efecto del cambio sería penalizar a un
  primo por vivir en otra banda — y kin es kin. Un commit medido y arriesgado
  menos.
- **0d — el escenario `lean`.** Con hambre 13 y salud 100 no roba nadie, no odia
  nadie y el destierro no puede saltar hagas lo que hagas: **todo lo que añada
  este plan reportaría n/a**. Un escenario con menos densidad de recursos y bandas
  más grandes, con la misma disciplina que usa `harsh-winter` al acortar una
  estación. No toca el mundo por defecto y es la diferencia entre medir los
  mecanismos nuevos y verlos en blanco.

## Fase 1 — La elección deja de ser argmax

**1a — la maquinaria, apagada.** `src/sim/core/Choice.ts`:
`chooseAmongBest(scores, rng, spread)`.

**No un softmax con temperatura.** Los scores van de 0.02 (`wander`) a 9
(`hunt`); a temperatura fija o es argmax o deja que un `wander` gane a un `hunt`.
Se usa una **banda relativa al líder**: se conservan los candidatos con
`score >= scores[0].score * (1 - spread)` y se sortea proporcional al score
dentro de ese conjunto. Es invariante de escala, está acotado, y con
`spread === 0` devuelve `scores[0]` **sin consumir ningún draw** — por eso el
commit es bit-idéntico.

**El draw vive en `think`, nunca en `score`.** `Simulation` llama a `brain.score`
para el jugador **en cada frame** ([Simulation.ts:2512, 2556, 2563](src/sim/core/Simulation.ts#L2512)).
Un draw en `score` haría que lo que hace el mundo dependa de cuántas veces se le
ha mirado — es la regla de pureza de `techPower` dicha otra vez, y merece un
comentario que lo diga.

`SimConfig.ai.choiceSpread`, por defecto `0`. Fork nuevo `choiceRng`, **añadido
después de `grainRng`**, y pasado a `BrainContext` como campo aparte de
`ctx.rng`, para que el draw del `wander` y el de la elección no se entrelacen —
esa separación es lo que permite apagarlo y volver exactamente al mundo de hoy.

**1b — encenderlo.** `choiceSpread: 0.12`, midiendo 0.08 / 0.12 / 0.20 como tres
runs de 20 semillas.

**Peligro conocido, y hay que nombrarlo en el commit:** la histéresis
(`id === current ? score * 1.25`, [Brain.ts:373](src/sim/ai/Brain.ts#L373))
existe porque la gente bailaba en el sitio. Una banda del 12% roza el margen del
25%. Lo que hay que vigilar son los 786 intentos abandonados por hacha que
`doCraft` ya tiene registrados.

**Gate:** `ai-uses-many-actions` como **distribución**; 20 semillas de
supervivencia; y telemetría nueva de abandonos por verbo — un softmax que sube la
variedad y parte por la mitad el trabajo terminado es una pérdida.

---

# Bloque II — El conflicto

## Fase 2 — Depredación: robar y atacar leen la debilidad (nota 5)

Estado real, verificado:

- **`attack` sí lee la debilidad**: `boldness = max(0, myPower - theirPower*0.8) / (1 + theirFriends)`.
- **`threaten` sí la lee**: exige `edge = skillFactor('fight') propio − ajeno > 0.05`.
- **`steal` no lee nada de eso.** Sólo `hunger, greed, dislike, loyalty, privacy,
  proximidad`. Un anciano cargado y un guerrero cargado son el mismo objetivo.

**2a — `steal` gana un término de vulnerabilidad.** No sólo la habilidad de
pelea: si está dormido, si es niño o anciano, si está herido, si su `vigour` es
bajo, y si tiene parientes cerca que reaccionarían. Todo eso ya es consultable
(`isChild`, `isElder`, `vigour`, `health`, `action === 'sleep'`, `peopleHash`).

**2b — `attack` gana una segunda ruta.** Hoy hay una sola y está cerrada con
`grudge > 0.5` (opinión < −50), que es *venganza*. La nota pide **depredación**:
alguien agresivo ante alguien indefenso no necesita rencor. Ruta nueva, con su
propio techo, mucho más baja que la de venganza y multiplicada por `aggression` y
por la vulnerabilidad, y **con la privacidad que `steal` ya usa** — se agrede a
quien está solo.

**No se toca el gate `grudge > 0.5`.** Es el freno que impide que la banda se
devore en quince días. La ruta nueva se añade al lado, no se afloja la vieja.

**Gate:** `ai-uses-many-actions` como distribución; contadores nuevos separando
robo por hambre de robo por oportunidad, y agresión por venganza de agresión por
depredación. 20 semillas: si la esperanza de vida de los ancianos se hunde, el
techo de la ruta depredadora está alto.

## Fase 3 — Sólo se sabe lo que se ve o lo que se cuenta (nota 6)

La mitad ya existe: `emit` consulta el radio y 262 hechos quedaron sin testigos.
Faltan tres cosas.

**3a — la víctima tiene motivo para ir a contarlo.** Verbo `report`: ir a buscar
a alguien de confianza y contarle lo que me han hecho. Se puntúa **alto cuando el
crimen no tuvo testigos** (es la única vía para que se sepa) y bajo cuando media
banda lo vio. Reutiliza `SocialSystem.absorb` con `firsthand: false`, igual que el
cotilleo, para que no haya un segundo camino al mismo efecto.

**3b — el conocimiento del crimen se ve en la UI.** Hoy `unwitnessed` es sólo un
contador. El jugador tiene que poder ver que nadie le vio, porque es información
que cambia su decisión. Y cuando su personaje es la víctima, que sepa que **nadie
más lo sabe todavía**.

**3c — las conversaciones también son observables.** La nota lo dice: *"un
cotilleo, una conversación conspirando contra el jefe"*. `slander` y la
conspiración de la fase 5 emiten su propio hecho, y la privacidad de `doSteal` es
el modelo: conspirar en un campamento lleno sale caro, conspirar en un claro no.

## Fase 4 — La propiedad la protege la atención, no el permiso (nota 7)

**Ésta es la fase que más cambia respecto a lo que planteé antes, y para mejor.**

Un único predicado, `src/sim/social/Property.ts`:

```ts
export function mayUse(person, building, ctx):
  { allowed: boolean; seen: Person | null; because: string }
```

Sustituye los quince `b.ownerBandId === person.bandId`, consultado por `Brain`,
`ActionCatalog` y `ActionSystem` por igual. Pero **no devuelve lo mismo que el
test que sustituye**:

- Si el edificio es de tu banda: permitido, como siempre.
- Si no lo es: **permitido igualmente**, pero `seen` dice si hay algún miembro de
  la banda dueña con línea de visión. Si lo hay, el uso se convierte en un hecho
  (`theft` o `trespass`), el testigo puede intervenir, y el refuse llega al
  jugador por `lastRefusal` con el motivo de verdad — *"te ha visto alguien"*, no
  *"no es tuyo"*.
- Un guardia (M10) no es un sensor: tiene una ronda y una vista normales.

Esto hace que dormir en la choza del enemigo y vaciarle el almacén sean jugadas
reales, con riesgo, que es lo que pide la nota. Y **el commit en que se extrae el
predicado devolviendo exactamente la respuesta de hoy es bit-idéntico**, lo que
separa el refactor del cambio de comportamiento.

**Dependencia con la fase 6:** para que a una *casa* se le pueda robar, sus
bienes tienen que estar en algún sitio del mapa al que se pueda ir andando. Por
eso `Household.store` se borra en vez de leerse (fase 6a).

## Fase 5 — Complots, calumnia y destierro (notas 4 y 8)

**5a — el rasgo. HECHO 2026-09-17.** La nota 8 pedía un rasgo tipo *malévolo* o
*conspirador*: `malice`, octavo eje, sin lector todavía. Se hizo a la vez que
[m9_6_plan.md](docs/m9_6_plan.md) fase 4a — `Person.mood`, cuatro canales,
decadencia hacia un punto que fija el temperamento, fila del inspector — porque
las dos migran `TRAITS`/fundación/herencia/envejecimiento/resumen de personaje
y pagar el peaje del RNG dos veces habría sido tonto. Medido: cohorte de veinte
semillas antes/después en `changelog.md`, mundo sano en todas las cifras que esa
cohorte puede resolver. Tres líneas de `sim:check:all` cambiaron de lado — todas
ya documentadas en `bugs.md` como filos de cuchillo (`kills-are-butchered-for-
bone`, `pictures-are-painted`, `the-hurt-are-tended`) o como una población de
`century` genuinamente mayor (`perf-budget`) — y ninguna se tocó.

**5b — la tabla de hechos, honestamente. HECHO 2026-09-17.** `EVENT_TYPES`
declaraba `gift`, `help`, `talk` y `trade` y **nada los emitía**. No hacía
falta emitirlos todos:

- **`talk` se borró.** `settle` ya paga la conversación en familiaridad, que
  entra en `opinion` a ×0.35 — un hecho encima lo habría contado dos veces. Y su
  saliencia 0.08 estaba **por debajo del suelo de 0.15** de `bestGossipFor`: era
  memoria que nunca podía ser noticia, sólo ocupar hueco en un almacén de 48.
  Además `emit` hace una consulta espacial, y hacerla en cada saludo era coste
  por paso a cambio de nada.
- **`trade` se borró también** (no sólo aplazado): sin verbo detrás no tenía
  ni lector ni escritor. Vuelve declarado, junto con el verbo que por fin lo
  lea, en la fase 7.
- **`gift` se queda declarado** hasta la fase 6 — regalar cosas es cómo un
  gran hombre convierte riqueza en prestigio, y su verbo (`give`) ya existe y
  funciona; sólo falta el lado del hecho, el mismo hueco corto en el que vive
  `malice` de la fase 5a hasta la 5d.
- **`help` se conectó**, emitido desde `doTend` una sola vez por tanda de
  cuidado, no por tick — la misma disciplina de `useProperty` para un hecho de
  una acción larga. Magnitud: cuánto de mal estaba el paciente.
  (Aviso honesto, cumplido: `the-hurt-are-tended` sigue reportando pocos ticks
  en la mayoría de escenarios — es el check de un solo evento que `bugs.md` ya
  documenta — así que el canal lee delgado hasta que ese bug tenga su propia
  pasada.)
- **`slander` y `praise` se añadieron**, declarados por delante de su verbo
  (fase 5c), y `slander` entró en `VARIABLE_NORMS`: una banda a la que le da
  igual el chismorreo y otra a la que no es exactamente la variación cultural
  para la que existe esa tabla.

Medido: cohorte de veinte semillas, mundo sano (99.9% supervivencia media, 858
nacidos, 11.7 tecnologías). Cinco líneas de `sim:check:all` cambiaron de lado
por el nuevo draw de `VARIABLE_NORMS` — todas ya documentadas en `bugs.md`
como filos de cuchillo, salvo `century`/`heads-direct-work`, nueva en ese
escenario pero explicada por el propio comentario del check en
`tools/simcheck.ts`. Efecto colateral encontrado y arreglado: la semilla fija
de e2e `e2e-fixture` movió el punto vacío más cercano al jugador justo un
anillo más allá del tope de búsqueda de `emptyGround`; el arreglo cambió el
tope por una comprobación con `elementFromPoint`, que es la pregunta que un
click de verdad hace.

**5c — cotilleo con intención.** Verbos `slander` y `praise`, con un tercer
objetivo (`targetSubjectId` en `Person`, limpiado en `finish` junto a
`targetPersonId`). `Memory` gana `bestStoryAbout(subjectId, listener, sign)`,
hermano de `bestGossipFor` y con el mismo suelo de saliencia. Pasa por `absorb`,
para que herede las normas de la banda del oyente, el factor de oídas y la
capacidad de memoria.

**El contragolpe es lo que lo convierte en mecánica de Sims y no en un botón:**
después de que la historia aterrice, se mueve la opinión del oyente **sobre el
que la cuenta**, proporcional a lo bien que el oyente ya pensaba del sujeto.
Calumnia a un hombre ante su amigo y lo pagas; ante su enemigo, no. Ese único
término produce alianzas y triángulos sin ningún código de facciones.

**5d — complots, derivados y no almacenados.** `src/sim/social/Factions.ts`:
`conspiracyAgainst(subjectId, band, members, rels)`, recorriendo `knownBy` por
miembro (O(n·k) sobre un grafo disperso), no todos los pares. Umbral: opinión del
sujeto < −20 y entre sí > +15. Y, por la nota 8, **lo puede iniciar cualquiera**
con lealtad baja o el rasgo nuevo — no hace falta ser el jefe ni el agraviado.

**5e — el destierro, que hoy no salta jamás.** `considerExile`
([BandSystem.ts:871](src/sim/systems/BandSystem.ts#L871)) pide que la opinión
**media** de la banda baje de −28. Con sesgo de casa +18 y parentesco encima es
inalcanzable. Y `considerRebellion`, justo al lado, ya lleva escrito el argumento
de por qué la media es la estadística equivocada. **Se sustituye la media por la
facción de 5d** — que es literalmente el complot.

**No se toca el umbral en el mismo commit que 5c.** 5c es la razón por la que
empezará a saltar; cambiar las dos cosas a la vez mete dos cambios en una
medición. Primero medir, después decidir.

**5f — la puerta de vuelta.** `considerAdoption`, espejo de `considerExile`: una
banda puede acoger a un desterrado que ronde cerca. **El motivo por el que esto
funciona ya está construido y nunca se ha ejercitado**: la reputación se deriva de
la *memoria*, así que una banda que no se enteró del asesinato no se lo tiene en
cuenta, y sus `Norms` propias pueden hacer que el robo le dé igual. Es el mejor
rédito disponible sobre trabajo ya hecho, y es la semilla del archienemigo.

*Peligro:* `Household.bandId` es lo que lee `headsAHouseIn`, y `exile` no lo toca.
Decidir explícitamente: al desterrado se le queda la casa atrás, y el adoptado
funda una casa nueva de una persona.

**Gate del bloque:** checks nuevos `exile-is-reachable`, `factions-form`,
`gossip-is-aimed`, `the-cast-out-find-a-home` — **todos verificados fallando
contra la build anterior** antes de darlos por buenos. `AGENTS.md` es explícito y
este proyecto ya ha borrado dos checks por no pasar esa prueba.

---

# Bloque III — La sociedad

## Fase 6 — Desigualdad

**6a — matar el agujero negro.** `household.store` **no se hace legible: se
borra.** Un `Inventory` colgado de un `Household` no tiene posición, así que
nadie puede ir andando hasta él — y la fase 4 necesita justo lo contrario. En su
lugar: `Household.homeBuildingId`, puesto donde `shareTheHearth` ya muestrea
quién durmió bajo qué techo; `settleEstate` deja los bienes del muerto en el
almacén de esa casa, o un `ItemPile` en el suelo si no hay. Ahora los bienes de
una familia existen en un sitio al que se puede ir **y del que se puede robar**.

*Migración:* `mergeHouseholds` ([Simulation.ts:776](src/sim/core/Simulation.ts#L776))
mueve `source.store` a `target.store`; pasa a ser una transferencia entre
edificios o un no-op.

**6b — el motivo para acaparar, que es el commit que hace real toda la fase.**
Hacer legible un almacén no enriquece a nadie: nada en `Brain` puntúa dejar
bienes en otro sitio que no sea un almacén de la banda. Sin un término pesado por
`greed` que prefiera el almacén de la propia casa, la riqueza sale idéntica en
todas las casas y la fase entera es contenido inerte disfrazado de mecanismo.
**Va primero, no último.**

**6c — `renown` se escribe.** `SocialSystem` no debe aprender qué es una casa —su
cabecera dice que sabe de personas y de lo que sienten—, así que se usa el patrón
`onMarriage`: un callback `onDeed` que `Simulation` conecta y que mapea el actor a
su casa. Decae mucho más lento que `deeds` (0.997 frente a 0.985): el renombre es
la memoria de la familia y tiene que componer entre generaciones.

**6d — `standingOver` lee riqueza y renombre, *relativos a la media de la
banda*.** Un término absoluto hace que en el juego tardío se obedezca toda orden.
Un término proporcional a tu distancia por encima de la media **es cero por
construcción en una banda igualitaria** y se enciende solo cuando la riqueza se
concentra. Así el arco igualitario → estratificado sale **emergente en vez de
desbloqueado por una tecnología**, que es mucho mejor respuesta. Con tope por
debajo de `RANK_AUTHORITY` (0.22) y muy por debajo de la jefatura de casa (0.55).

**6e — el gran hombre llega a jefe.** `chooseChief` suma el renombre relativo.
Una línea y un comentario, pero **commit propio**: `chooseChief` también alimenta
el desafío de `considerRebellion`.

## Fase 7 — Standing entre bandas

**7a — la estructura, enviada inerte.** `BandRelations`: **simétrica**, al revés
que `RelationshipGraph`, y hay que decir por qué en la cabecera — una arista
dirigida necesita dos historias por evento y no hay ningún mecanismo que mueva un
solo lado; cómo se siente cada *persona* ya lo lleva `Memory`, rico y asimétrico.
Clave con `min(a,b)` primero para que un par no tenga dos entradas. Decae hacia 0
muy despacio (0.998/día): un rencor entre pueblos sobrevive a las personas.

**No consume ningún draw** — todos sus motores son deterministas. Así que la fase
7 **no necesita fork nuevo**, y conviene mantenerlo así.

`firstImpression` pasa a `outGroupBias(standing)`, con `outGroupBias(0) === -6`
**exacto** y todos los lazos empezando en 0: **el commit es bit-idéntico**. Se
envía la estructura entera, el panel y la columna del informe sin que nada la
mueva todavía — la misma disciplina que usaron spoilage y el ánimo.

**7b — los motores, un commit cada uno**, por orden de facilidad de medición:
hechos que cruzan la frontera (escala pequeña: un robo no empieza una guerra);
**matrimonio** entre bandas (+, y es el mecanismo de paz más fuerte del registro
histórico, y cuesta una línea); **comercio** (el verbo `trade`, que es donde ese
tipo de evento se gana el sitio); y **territorio × escasez** — contar miembros de
otras bandas dentro de un radio de `homeX/homeY`, multiplicado por la presión de
despensa que `planBuildings` **ya calcula**
([BandSystem.ts:510](src/sim/systems/BandSystem.ts#L510)). Una banda bien
alimentada se encoge de hombros ante una intrusión; una hambrienta no.

Ese último cable es **lo que hace que la escasez de la fase 8 aterrice sin
mecánica nueva**, y de paso cierra el TODO `// later, claim territory`.

**7c — los lectores**, uno por commit y el de `Brain` el último y solo: `mayUse`
(y ahí **O4 queda hecho**), `Conversation.crossBand` (hoy un ×0.43 plano), y el
término de banda en `steal`/`threaten`/`attack`.

**Gate:** `bands-take-sides` — al final de un `century` el reparto entre el lazo
más amistoso y el más hostil tiene que ser no trivial; un mundo donde todos los
lazos siguen en 0 es un mecanismo que se envió y no hizo nada. Y el
`outsider-unrelated` de la fase 0b es contra lo que se calibra, **no** el +15.9.

---

# Bloque IV — El cuerpo y el árbol

## Fase 8 — Macronutrientes (nota 9)

Hoy `ItemDef.nutrition` es un número único y todo el origen se suma igual. La
nota pide grasa/proteína/hidratos con proporciones, penalización de salud por
déficit, y necesidad escalada por actividad.

**Y resuelve a la vez el problema de la escasez**, que es por lo que va aquí y no
al final: hace escasa la **variedad**, no las calorías. Una banda que sólo come
bayas está desnutrida estando llena. Eso da presión —que es lo que el mundo no
tiene— **sin quitar comida**, que es lo que ya se midió costando 3-5 puntos de
supervivencia y el doble de muerte infantil.

- **8a — los datos.** `ItemDef` gana `macros: { fat, protein, carb }` como
  fracciones que suman 1. Es data pura sobre una tabla que ya existe, con valores
  reales: carne y pescado proteína y grasa; avellanas grasa; bayas y fruta
  hidratos; harina y pan hidratos; leche y queso (cuando lleguen con `dairying`)
  grasa y proteína. **Bit-idéntico**: nadie lo lee todavía.
- **8b — el balance.** `Person` lleva un promedio móvil por macro sobre una
  ventana de varios días (no un contador por comida: un día desequilibrado no es
  malnutrición). Inerte, con contadores de dry-run. **La misma disciplina que
  spoilage y el ánimo**: existir y cambiar el mundo son dos commits.
- **8c — la actividad.** La necesidad de cada macro escala con el esfuerzo. **El
  precedente exacto ya está escrito**: `EXERTION` en `NeedsSystem` ya escala la
  sed por lo que estás haciendo, de 0.4 durmiendo a 1.5 talando, y su comentario
  explica por qué. Se reutiliza esa tabla, no se escribe una segunda.
- **8d — muerde.** Déficit sostenido → penalización a `recoveryRate` y techo de
  salud, **no muerte directa**: `LETHAL_NEEDS` es hambre, sed y frío por una razón
  argumentada, y la malnutrición es degradación, no una cuarta forma de morir.
  Y tiene contrajuego obvio: cazar, pescar, moler, criar ganado — que es
  exactamente lo que le faltaba a spoilage.
- **8e — que se vea.** El panel tiene que decir *"lleva un mes sin comer más que
  bayas"*. Un mecanismo de salud invisible es el peor tipo de dificultad.

**Gate:** 20 semillas por commit, con el coste aceptable **declarado por
adelantado** — "aceptamos hasta N puntos de supervivencia media a cambio de una
curva de población que se mueva". Escribir ese número antes de correr la medición,
o se acaba aceptando lo que salga.

## Fase 9 — La palabra hablada, y la escritura detrás del grano (nota 4)

**Va antes que el re-gating de `writing`.** Si `writing` se aleja primero, `ochre`
—Paleolítico Medio, 150 ticks y dos de barro— se queda como el único registro del
juego y pasa de rareza a canal dominante. Justo lo contrario de lo que se pide.

**9a — un registro puede ser un recordatorio.** `InscriptionDef` gana
`fidelity: 'reminder' | 'instruction'` (data, no un caso especial: ese fichero ya
convirtió `literacy` en data por este mismo argumento). `ochre` es `reminder`;
`stone` y `clay`, `instruction`.

`doRead` se bifurca: `instruction` → `receiveFromRecord` como hoy; `reminder` →
`remindFromRecord`, que **siembra una `Idea` en estado `conceived`** con el
insight por debajo de `PROTOTYPE_AT` — todavía hay que pensarlo, prototiparlo y
probarlo. La pintura es la chispa, no la instrucción.

**Y `Simulation.recordedTech` tiene que dejar de contar los recordatorios.**
`architecture.md` dice que ese conjunto es lo que una sociedad podría
**recuperar**, y un recordatorio no es recuperación. Se parte en `recordedTech`
(sólo `instruction`) y `rememberedTech`. Así la afirmación de la arquitectura
vuelve a ser verdad.

**9b — el canal oral se refuerza**, porque debilitar el ochre a secas quita un
canal y frena un árbol que `next-steps.md` §0 ya señala como limitado por la
transmisión:

- **El hogar enseña**, y es lo más barato y de mayor rédito del plan.
  `shareTheHearth` **ya muestrea a medianoche quién durmió bajo qué techo**. Una
  tirada nocturna en la que el adulto más sabio de un techo pase algo a un niño
  del mismo techo hace el conocimiento **propiedad de la casa** —que es el pilar
  de la dinastía—, frágil y personal. Necesita un fork nuevo, `hearthRng`,
  **después de `grainRng`**.
- **`storytelling` como nodo de verdad**, dominio `people`, práctica ejercida por
  `talk`: multiplica la probabilidad de `teach` y da un relato más en la
  conversación profunda. No es inerte y es literalmente el canal oral que se pide.
- **`tradition` por fin hace algo en conocimiento.** El rasgo existe y sólo lo lee
  `standingOver`. Entra en `teach` y en el score de enseñar. Cero estado nuevo.

**Lo que NO hay que tocar:** `learning.observationChance`. Es la palanca
documentada de transmisión y moverla es un cambio de escala de economía de
comida que aplastaría todo lo demás del milestone.

**9c — `writing` detrás del excedente.** `requires: ['marking','stoneworking','farming']`.
Verificado contra los tests: no crea ciclo, la ordenación por edad aguanta
(`farming` es Neolítico 4, `writing` es Bronce 6), y `ERA_LADDER` no lo usa. Lo
que sí pasa:

- El comentario del test *"writing es una tecnología de la Edad de Bronce que
  descansa sobre dos del Paleolítico"* **se vuelve falso** y hay que reescribirlo.
  Este proyecto tiene una regla contra los comentarios que afirman lo que no se ha
  confirmado.
- **El escenario `scribes` se rompe en silencio.** Sus fundadores reciben
  `writing` con prerrequisitos sin cumplir, y `teach`, `tryObserve` y `doRead`
  filtran todos por `requires`: la escritura no se podría enseñar ni leer en el
  único escenario que existe para eso. Su `startingTech` tiene que ganar
  `plant_lore`, `grinding` y `farming` **en el mismo commit**.
- Y ya que se toca: **`records-are-cut` reporta 0 lecturas y el re-gating no lo
  arregla.** La causa está en el comentario del propio escenario — todos los
  adultos alfabetizados arrancan con las mismas cinco tecnologías, así que no hay
  nada en ninguna piedra que a nadie le falte. Conocimiento inicial **asimétrico**
  entre las dos bandas, en commit aparte.

**Nota sobre `pictures-are-painted`** (10 pinturas de una banda que no sabe
escribir): **no es un defecto** y no se toca. Que una banda del Paleolítico Medio
pinte es el sentido histórico del nodo. Lo que 9a le quita es ser una biblioteca
permanente gratis, que es la queja real.

## Fase 10 — El árbol se ensancha

Se retoma [m8_plan_the_ages.md](docs/m8_plan_the_ages.md): **15 nodos neolíticos
pendientes**. Son los que crean el excedente que hace que la guerra signifique
algo.

**Primer commit HECHO 2026-09-21**: `ground_stone`, `spinning`, `weaving` y
`sickle`, los cuatro elegidos por no pedir ningún mecanismo nuevo, sólo un
término en una función que `techPower` ya alimenta. De paso, `ground_stone`
repara el bug de `handaxe` sin pasar por `techPower` que este mismo documento
ya listaba como conocido. Medido en `century` a 20 semillas: supervivencia
99.7%→99.6% (ruido), tecnologías conocidas 12.3→13.2, conceptos pasados de la
raíz 9.9→11.6.

**Segundo commit HECHO 2026-09-21**: `masonry` y `wattle_daub` (dos refugios
más, que `BandSystem.planBuildings` ya elige sin cambio de código porque lee
`shelter` genéricamente), `calendar` (una práctica, ejercida por `sow`, que
multiplica el término de aprovechamiento de `doReap` en vez de su suelo),
`the_wheel` (un cuarto término en `carryFactor`; la mitad de "velocidad" de
la tabla queda fuera, anotado: este juego no tiene penalización de carga que
un carro pueda responder), `bread` (la cuarta estación del mecanismo 4).
Medido: supervivencia 99.6%→99.7%, tecnologías 13.2→13.4 — esencialmente
plano, como se espera de cinco nodos más profundos que los cuatro del primer
commit.

**Tercer commit HECHO 2026-09-21**: `herding`, el único nodo de esta capa que
pedía un mecanismo de verdad. Un `pen` reutiliza `Building.store` y `doTake`
entero en vez de inventar un verbo: `Simulation.workHerds` hace crecer el
rebaño proporcionalmente a lo que ya contiene, no a una tasa fija, así que un
corral vaciado del todo se queda vacío para siempre — un fallo real y
permanente por sobreexplotar. **Encontrado y arreglado antes de medir, no
después**: la primera versión crio 27 de carne en un corral en el escenario
`farmers` y no sacrificó ninguna, llena 43 de los días del run — el mismo
fallo que ya se envió una vez con las trampas, porque la ruta de hambre
ordinaria de `Brain` sólo mira el almacén *más cercano* con comida, y un
granero más cerca tapaba el corral. Arreglado dándole a los corrales la
misma bonificación de "ronda" por llenura y cercanía que ya tienen las
trampas. `farmers` gana `taming`+`herding` en su tecnología inicial para
ejercitarlo (100.0%→99.6% supervivencia, dentro del ruido documentado). En
el mismo commit, el peldaño Neolítico de `ERAS`, que esperaba exactamente
estas tres tecnologías (`farming`, `herding`, `masonry`) y ya las tiene
todas. **Cinco nodos quedan**: `dairying`, `wool`, `brewing`, `well`,
`kiln`. `wool`/`dairying` dependen de `herding`, ya enviado; `well`/`kiln`
dependen de `masonry`, ya enviado. Ver `changelog.md`.

**Densidad tipo Evolve.** La regla de "nada inerte" (`TECH_EFFECTS` +
`tech.test.ts`) **no se toca** — es lo que ha mantenido sano este árbol. Lo que se
acepta explícitamente es que **el efecto de un nodo pueda ser un término numérico
sobre un mecanismo existente**: la maquinaria de refinamiento y las diez funciones
de efecto ya están. Eso permite multiplicar los nodos sin multiplicar los
mecanismos, que es exactamente lo que hace Evolve. **Y la fase 8 acaba de crear
diez consumidores nuevos**: cualquier nodo que mejore el acceso a un macro
concreto es un nodo con efecto real y barato.

## Fase 11 — La guerra (M10)

Ya diseñada en el cierre de
[m9_plan_words_and_hands.md](docs/m9_plan_words_and_hands.md): territorio,
`Building.durability` y sabotaje (O5), organizador de partida en
`BandSystem.daily`, cautiverio como estado en `Person`. Este plan le quita dos
cosas de encima: **la fase 7 ya le habrá dado el standing** y **la fase 4 ya le
habrá dado la propiedad observable**, así que el guardia fronterizo nace con la
regla correcta —tiene que ver el crimen— en vez de con un test de pertenencia.

---

# Para el futuro, deliberadamente no ahora

**El archienemigo multigeneracional.** Sale solo de 5d, 5f y 7 con una cosa
pequeña: que el rencor se **herede**. Un campo `feud` en `Household` que
`linkFamily` propague convertiría "la casa que desterró a mi abuelo" en una
relación de siglos. Barato una vez existe lo anterior, carísimo antes.

---

# Verificación

```bash
npm run typecheck                      # ~3s
npm test                               # unit + determinismo   ~1s
npm run sim:check:all                  # 16 escenarios + lean  ~15s
DYNASTY_PORT=5399 npm run e2e          # Playwright            ~21s
npm run sim:seeds -- --seeds 20        # todo lo que mueva el mundo
npm run why -- --person 0 --from 1700 --to 1760
```

**Libro de commits — qué debe salir bit-idéntico:**

| commit | expectativa |
|---|---|
| 0a docs del punto de fork · 0b `outsider-unrelated` | **bit-idéntico** |
| 0c `setKinship` marca impresión · 0d escenario `lean` | medido / el resto bit-idéntico |
| 1a `Choice.ts` + `choiceRng`, spread 0 | **bit-idéntico** |
| 1b spread encendido | medido, 20 semillas |
| 2a vulnerabilidad en `steal` · 2b ruta depredadora | uno cada uno, medidos |
| 3a `report` · 3b UI · 3c conversaciones observables | medidos |
| 4 extracción de `mayUse` con la respuesta de hoy | **bit-idéntico** |
| 4 acceso gobernado por la vista | medido |
| 5a migración de `TRAITS` (con la del ánimo, una sola vez) | medido, commit propio |
| 5b borrar `talk`/`trade` de las tablas | **bit-idéntico** (nada los emite) |
| 5b añadir `slander` a `VARIABLE_NORMS` | medido: añade un draw por banda |
| 5c calumnia · 5d facciones · 5e destierro · 5f adopción | uno cada uno, medidos |
| 6a borrar `Household.store` · 6b acaparar · 6c `renown` escrito | 6c bit-idéntico (nadie lo lee) |
| 6d `standingOver` · 6e `chooseChief` | medidos, separados |
| 7a `BandRelations` con todos los lazos a 0 | **bit-idéntico** |
| 7b motores · 7c lectores | uno cada uno; el de `Brain`, último y solo |
| 8a macros en `ItemDef` · 8b balance inerte | **bit-idénticos** |
| 8c actividad · 8d penalización · 8e UI | medidos, 20 semillas, coste declarado antes |
| 9a `fidelity` + split de `recordedTech` · 9b hogar/`storytelling`/`tradition` | medidos |
| 9c `writing.requires` + `scribes.startingTech` | medido, mismo commit |

**Determinismo:** dos streams nuevos en total, `choiceRng` y `hearthRng`, **los
dos añadidos después de `grainRng`** ([Simulation.ts:409](src/sim/core/Simulation.ts#L409)),
nunca después de `recordRng`. La fase 7 no necesita ninguno. Decirlo en cada
mensaje de commit.

---

# Riesgos

- **Calibrar la fase 7 contra un solo escenario.** El aprecio al forastero va de
  −5.2 a +15.9 según cuánto lleve corriendo el mundo (tabla en el Context), así
  que un coeficiente elegido sobre `century` deja `crowded` en xenofobia y uno
  elegido sobre `crowded` no hace nada en `century`. Lo que la fase 7 tiene que
  arreglar es que la penalización sea **constante mientras todo lo demás crece**,
  no su valor.
- **La fase 6 sin la 6b** envía riqueza uniforme y una fase entera inerte.
- **Medir cualquier cosa en el mundo por defecto**, donde la salud media es 100.0
  y no hay escasez, hace que todo reporte n/a y que luego se suban los
  coeficientes hasta que salte por el motivo equivocado. Por eso `lean` va en la
  fase 0.
- **La ruta depredadora de 2b puede vaciar el mundo de ancianos.** Techo bajo, y
  la esperanza de vida por tramo de edad como instrumento.
- **Las facciones pueden convertir la banda en una picadora**, que es el fracaso
  que `Brain.ts:812` ya documenta. El quórum y el requisito de que los
  conspiradores se conozcan entre sí son los frenos.
- **`century` es caótico**; todo se juzga con 20 semillas, nunca con un run.

---

# Documentación al cerrar cada pasada

`docs/changelog.md` con fecha y motivo, `docs/bugs.md` con lo encontrado y no
arreglado, `docs/next-steps.md` con la fila del milestone. Y en esta pasada, tres
correcciones a documentos que han dejado de ser ciertos: **`AGENTS.md`** sobre el
punto de inserción de forks (fase 0a), **`next-steps.md` §5** que afirma que no
existe estado entre bandas (fase 7), y **`next-steps.md` §O4** más el comentario
de `Brain.ts:1280` que dicen que `ownerBandId` se respeta en un solo sitio.
