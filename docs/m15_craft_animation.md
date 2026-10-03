# M15 fase 17 — Fabricar con las manos

2026-10-03. Cuatro poses `m0`–`m3` de manipulación, con mano de apoyo y pies
plantados, generadas para las cinco edades, ambos sexos y las direcciones
horneadas. `art:build` reconstruye la hoja y `art:sheet` incluye `contact-make`;
se revisaron el contacto y la captura frontal del juego.

El selector exige trabajo iniciado, persona viva y quieta, temporizador activo
y receta válida. Si hay estación, comprueba el edificio completo del tipo
correcto y que contenga al trabajador, igual que el ejecutor. El ejecutor sigue
siendo dueño de los requisitos: el renderer no consulta conocimientos privados
ni inventario para adivinar qué puede fabricar un desconocido. Durante el gesto
oculta la herramienta transportada. Todavía no dibuja el material o producto en
las manos ni convierte todas las familias de trabajo en animaciones propias.

Las cuatro poses comparten el reloj visual de recolectar, cavar y talar: dos
ticks de trabajo por pose y fracción acotada del acumulador. Pausar congela el
gesto; viajar, morir o cancelar lo quita. No se guarda un reloj nuevo en el motor
ni se consume RNG. Cuatro casos del selector cubren estaciones, recetas y
límites; otro comprueba los pies/anclas de todos los cuerpos. La prueba de
navegador parte de una orden real de fabricar, comprueba cuatro composiciones,
pausa y cancelación, y demuestra que renderizar no altera progreso, reloj,
necesidades ni inventario. Un getter que lanza asegura que el selector no lee
conocimientos ni inventario privados.

Verificación conjunta: typecheck limpio, 946/946 pruebas en 129 archivos y
74/74 e2e. La matriz de mundos sigue roja y se compara por separado; estas
cifras no la convierten en un pase. Capturas nuevas, revisadas:
`artifacts/screenshots/m15-craft-2026-10-03-final/`.
