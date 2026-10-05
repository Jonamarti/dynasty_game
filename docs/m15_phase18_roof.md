# M15 fase 18 — Concebir bajo un techo

**Regla.** `LifeSystem.tryConceive` exige que la madre y su cónyuge hayan
dormido bajo el **mismo edificio** en la última muestra de medianoche. Vale
cualquier refugio con `shelter > 0` (paravientos incluido); no vale el raso ni
dos techos distintos. Decisión del propietario recogida en `m14_plan.md` 4c.

**Cómo.** `Simulation.shareTheHearth` ya muestrea quién duerme dónde para
`belonging` y para el hogar de cada familia. Ahora también rellena
`roofTonight` (id de persona → id de edificio). El mapa se vacía y se reconstruye
en cada medianoche, en el mismo tick en que `LifeSystem.daily` lo lee; no hay
segundo muestreo y no se guarda en el checkpoint.

**Determinismo.** La puerta va antes del sorteo de concepción, así que una
pareja separada no consume número de `lifeRng`. Ningún fork nuevo; los mundos
clásicos cambian solo porque hay menos concepciones (medido abajo). El contador
`conception_no_roof` cuenta los días-pareja bloqueados.

**Check `conception-needs-a-roof`.** Mide desde las personas (acción y edificio
objetivo el paso previo al bloque de medianoche), no desde el mapa que lee la
puerta. Verificado contra el build roto (puerta desactivada): `century` da
16 de 19 concepciones sin techo compartido → FALLA; con la puerta, 0 de 8 → PASA.

**Prueba unitaria:** `src/sim/__tests__/conception-roof.test.ts`.
