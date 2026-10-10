# M15 29c/33 — elegir el atlas inicial

2026-10-10. El selector inicial ofrece los dos mapas comprometidos del atlas:
la Tierra actual y la Tierra de hace unos 12.000 años. La recomendación del
manifiesto sigue siendo el inicio predeterminado. Cambiar de mapa borra el
lugar elegido y la confirmación de inicio seco; Begin here exige elegir de
nuevo. La geografía seleccionada se instala al construir WorldState y se
conserva al regenerar la partida desde sus ajustes.

Todos los textos pasan por t() en inglés/español. La opción antigua advierte
que las costas son antiguas, pero clima y rangos de recursos son actuales:
la elección no resuelve la deuda de paleoclima ni amplía la procedencia del atlas.

Typecheck limpio. La prueba de navegador world-map-choice pasa: comprueba
recomendación, dos opciones, traducción, selección invalidada, caveat y el
mapId del WorldState realmente construido. Capturas revisadas en
artifacts/screenshots/m15-map-choice-2026-10-10T-01/. La comprobación inicial
de semilla única mantiene los fallos conocidos cravings-steer-the-diet y
perf-budget (554 pasos/s frente a 1.724). Cohortes/matriz pesada diferidas.

Quedan elección de comarca dentro de la región, repertorio de nombres al
materializar pueblos y calibración final. Esta entrega no cierra 29 ni 33.
