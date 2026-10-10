# M15 fase 12c — luz nocturna local

La escena nocturna se tiñe en una capa offscreen que se reutiliza y solo cambia
de tamaño si cambia el viewport. Las fuentes válidas del frame llegan desde
`buildingHash.queryRadius`; el renderer descarta fuegos incompletos, apagados,
arruinados, fuera del viewport y fuera de la vista actual del observador. Las
fuentes recordadas no iluminan el presente. Por ahora `hearthLight` reconoce
solo hogares terminados y sanos.

Después de dibujar la escena y la niebla, se aplica el tinte nocturno a esa capa.
Cada fuego resta opacidad con `destination-out` y un gradiente radial lineal. El
centro usa `Simulation.lightAt` y el borde cae hasta la luz ambiental; el
contenido ya compuesto (incluida la niebla) nunca se borra. La consulta espacial
se acota a la diagonal visible más el radio de la fuente, así un hogar apenas
fuera de cuadro puede iluminar el borde, pero una fuente distante no produce
marcas fuera del canvas.

La e2e fija el reloj en medianoche y pausa el mundo para comparar un hogar
activo con uno incompleto y uno arruinado, comprueba el filtrado por niebla y
fuera de cuadro, y verifica que el render no mueve el reloj ni los streams RNG.
Capturas en español: `artifacts/screenshots/m15-phase12c-light-2026-10-10-final/`.

La e2e también cronometró directamente 120 composiciones de la capa, con una
fuente visible y una partida de 31 personas a 1280×800 CSS px: mediana 1.5 ms,
p95 2.7 ms en la captura de desarrollo. Es el coste medido de esta escena y
este equipo; no es una afirmación de FPS para otras poblaciones o dispositivos.
