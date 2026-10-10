# M15 fase 17 — extracción de materiales

El juego usa cuatro poses generadas `x0`–`x3` para extraer sílex, arcilla y
mineral de cobre, estaño o hierro. El ciclo prepara el golpe, golpea, recoge el
material y recupera la posición. Es una sola familia visual: la piedra concreta
viene del nodo, y las condiciones del mundo siguen en `ActionSystem.doHarvest`.
Los pies permanecen plantados y el avance usa `workedTicks` más la fracción de
simulación, igual que las demás animaciones de trabajo.

El selector requiere una orden `forage`/`gather` viva y detenida, trabajo ya
iniciado (`actionTotal`, `actionTimer` y `workedTicks` positivos), nodo objetivo
presente, disponible, alcanzado y de uno de esos cinco tipos. No vuelve a
consultar conocimientos, habilidades, equipo ni inventario: que el sistema haya
incrementado `workedTicks` es la señal de que el trabajo pasó sus puertas. La
preparación automática de herramienta tiene `actionTotal === 0`, por lo que no
se confunde con la extracción. Movimiento, viaje, interrupción, muerte y
agotamiento dejan la pose normal.

El banco de arte añade `x0`–`x3` a `ART_POSES`; el generador mantiene edades,
sexos y tres orientaciones dibujadas, con oeste como reflejo. Las pruebas cubren
claves del manifiesto, anclas distintas y finitas, pies idénticos a quieto, los
cinco tipos de nodo, selección y rechazos, y lectura sin mutación del trabajo.
La e2e ordena una extracción real de sílex con la partida pausada y captura el
gesto activo en
`artifacts/screenshots/m15-extraction-animation-2026-10-10/00-active-flint-extraction.png`.

La animación comparte gesto aunque la extracción de arcilla, el sílex y los
minerales puedan requerir herramientas distintas o producir materiales
distintos. No cambia la receta, el rendimiento, las puertas técnicas ni el
comportamiento de la simulación.
