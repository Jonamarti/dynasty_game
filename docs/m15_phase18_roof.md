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

**Determinismo.** La puerta va **después** del sorteo de concepción. Una
primera versión la ponía antes: quitaba números de `lifeRng`, que también
alimenta la mortalidad, y `diggers` perdía `earthworks-are-dug` por pura
divergencia (0 de 2 zanjas con 33 paladas, frente a 45 con la puerta tras el
sorteo). Con el sorteo previo, un intento rechazado cambia solo la concepción.
Ningún fork nuevo. El contador `conception_no_roof` cuenta concepciones
bloqueadas.

**Medido (`sim:seeds --seeds 20`, `century`; la referencia es el mismo build con
la puerta desactivada, medido con la primera versión de la puerta).** Nacimientos
516 → 191 (2,35 → 0,86 por mujer fértil); supervivencia media 68,2 % → 81,9 %;
colapsos <25 %: 1 → 2 de 20; extinciones 0/20 en ambos. La supervivencia sube en
parte porque nacen menos niños que mueran: no es una mejora de balance, es un
efecto de la menor natalidad. Decidir si 0,86 nacimientos por mujer es
demasiado bajo queda para la calibración de la fase 41 (la natalidad depende
ahora de que haya techo). `sim:check:all`: 106 fallos con la puerta; ver changelog.

**Check `conception-needs-a-roof`.** Mide desde las personas (acción y edificio
objetivo el paso previo al bloque de medianoche), no desde el mapa que lee la
puerta. Verificado contra el build roto (puerta desactivada): `century` da
16 de 19 concepciones sin techo compartido → FALLA; con la puerta, 0 de 8 → PASA.

**Prueba unitaria:** `src/sim/__tests__/conception-roof.test.ts`.
