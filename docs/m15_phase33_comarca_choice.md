# M15 fase 29c/33 — comarca de inicio dentro de una región

2026-10-12. Tras elegir una región en el atlas, el panel ofrece una malla
accesible de las comarcas que la forman. Elegir una celda hace que el inicio
se mida en el centro exacto de esa comarca (`x + 0.5`, `y + 0.5`) y que
`WorldState` construya allí el mapa local de una comarca. El botón de inicio
sin una celda explícita conserva la recomendación por agua que ya existía.

La comarca explícita debe cumplir las mismas puertas existentes: al menos
120 baldosas de agua dulce y 35% de tierra para inicio normal. Si sólo cumple
el terreno, se ofrece el consentimiento seco existente; si no alcanza la
tierra, se rechaza esa celda con una razón y no se desplaza el inicio en
silencio. No se cambiaron umbrales ni los cálculos de generación.

Los pueblos abstractos se siguen reservando por región, no por comarca: la
comarca exacta afecta la geografía detallada inicial y su posición, mientras
que el nivel de pueblos conserva la resolución que ya tiene. Una regresión
focal comprueba coordenada exacta, rechazo en mar abierto, agua local y reserva
de la región.

`e2e/world-map-choice.spec.ts` añade un recorrido visible en español, verifica
las 100 comarcas y la partida instalada, y guarda una captura nueva bajo
`artifacts/screenshots/m15-comarca-choice-2026-10-12/04-comarca-choice-es.png`.
En el worktree de integración pasó typecheck, los dos archivos focales pasaron
23/23 pruebas y Playwright pasó 3/3. No se ejecutaron cohortes ni calibración.

Pendiente de fase 33: las puertas de calibración de 32c. La malla colorea el terreno atlasado; no promete agua en
celdas individuales antes de medirlas al confirmar.
