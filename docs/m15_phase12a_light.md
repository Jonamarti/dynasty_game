# M15 12a: medir la luz local

`Light.ts` mide el máximo entre luz diurna y hogueras completas no arruinadas
en el hash espacial. El radio inicial de cuatro tiles y la caída lineal son
supuestos de diseño; no son una calibración histórica. Un techo por sí mismo
no produce luz. Las fuentes superpuestas no suman brillo.

`Simulation.lightAt` expone esta medida sin consumir RNG ni alterar decisiones.
El muestreo de medianoche, solo con telemetría activada, cuenta
`night_light_sum` y `night_light_samples`; su cociente es luz media de las
personas vivas en esa muestra. No infiere actividad ni accede al DOM.

Tres pruebas focales cubren caída, luz diurna, fuentes inválidas y máximo.
Es un instrumento: los lectores de vista, trabajo, caza, testigos y antorchas
siguen pendientes de 12b/12d. No se declara una mejora económica o de supervivencia.
