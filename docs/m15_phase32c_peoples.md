# M15 32c — `PeopleSim`, el nivel 2, mecanismo a mecanismo

2026-10-06. Punto 4 de §7 de [m15_simulation_lod.md](m15_simulation_lod.md); diseño en
`m15_plan.md` §32c. Todo vive en `src/sim/world/`, sin renderer ni DOM, **inerte**: nada de
`Simulation` lo llama y el juego normal es bit-idéntico. Sin UI, así que sin capturas.

## 1. Estructura de un pueblo (`PeopleSim.ts`)

Un `People` tiene: id estable; **cohortes por edad y sexo** (13 bandas de 5 años, 0-4 … 55-59 y
60+; enteros, nunca un contador); `comarcas` ocupadas (un número); **técnicas como bitset sobre
`TECHS`** (`TechSet`); cultura (`norms` de `Events.ts`, `strangerRegard`, media de cada rasgo de
`TRAITS`); excedente (raciones, agregado); su stream propio y la fecha de su próxima actualización.
El **nivel de organización** (`band`/`tribe`/`chiefdom`/`state`) no se guarda: se deriva de las
técnicas (`organisationOf`), como la civilización de la fase 38c: `division_of_labour` es el primer
peldaño (M9.5 4c), `chiefdom` el segundo (4d) y un Estado tiene los seis nodos de
`CIVILISATION_NEEDS`. *Decisión de diseño que el propietario puede cambiar*: el plan no fija cuándo
una banda es «tribu»; se eligió el peldaño que el juego ya trata como primer paso más allá de la banda
en vez de un umbral de población inventado. El modo de vida y las relaciones de comercio no están
todavía (el primero sale de la capacidad de §2; el segundo no tiene mecanismo que lo escriba).

**Técnicas.** `TechSet.add` rechaza (lanza) una técnica a la que le falta un `requires`, con la
misma regla (`TECH[t].requires`) que el juego detallado; el constructor rechaza un conjunto inicial
que no está cerrado bajo `requires`; el registro JSON guarda recuento y hash de `TECHS` y
`fromRecord` rechaza una lista distinta o un conjunto no cerrado. Test: añadiendo lo alcanzable
(`reachableFrom`) se llega a los 100 % de los nodos.

**Relaciones.** Un registro por par no ordenado en `PeopleSim.relations`, con id (standing,
contacto, postura): ningún pueblo guarda copia, de modo que «actualizar ambos extremos» es escribir
un registro y un comercio o tributo no se aplica dos veces. `commit(idTransacción)` devuelve `false`
en la segunda aplicación (mismo patrón que el ledger del compacto, §3/§4 del diseño).

**Streams.** `derivePeopleStream(semilla, id)` = hash de `people|semilla|id`: fuera de los forks de
`Simulation` y sin depender de cuántos pueblos existan (test: el pueblo 1 saca lo mismo con 1 que con
10 pueblos fundados). Su estado se guarda (`PeopleRecord.rng`); un restaurado que re-derivara sus
streams diverge (control negativo).

**Actualización estacional repartida por número de paso.** Cada pueblo toca una vez por estación, en
el paso `estación·pasosPorEstación + offset(id)`, `offset` = hash de semilla e id: la carga se reparte
por los 2.400 pasos de la estación en vez de caer en uno. `advanceTo(paso)` ejecuta lo vencido por
(paso, id) y solo hacia delante; partir la corrida en trozos cualquiera (1, 7, 333, 334, …, o paso a
paso) da el mismo estado y las mismas tiradas (test); un mecanismo que leyera el paso que pidió el
llamante (un reloj) sí cambia con los cortes y lo detecta el mismo test (control). Nada lee FPS ni
reloj de pared. Los mecanismos se pasan al constructor en un orden fijo (`SeasonMechanism`).

Serializa a JSON (`snapshot`/`fromSnapshot`), rechazando versión, ids, cohortes negativas,
relaciones o transacciones duplicadas y un pueblo cuya actualización ya se perdió.

Tests: `src/sim/__tests__/people-sim.test.ts` (13). 
