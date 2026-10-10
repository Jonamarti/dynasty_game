# M15 12b: lectores de luz

Las partidas nuevas calculan vista desde luz local con un suelo de 0,35. Brain,
intrusiones, testigos de hechos, sangre observada, cuerpos encontrados y
aprendizaje observado usan la vista del observador. El destinatario de un hecho
sigue conociéndolo directamente. La privacidad al robar/agredir filtra a los
observadores por su propia vista.

Fabricar, hacer prototipos y grabar inscripciones trabajan a una fracción entre
0,5 en oscuridad y 1 con luz completa. Los avances fraccionarios se guardan en
el banco de trabajo, por lo que interrumpir/reanudar no acredita horas que no
se trabajaron. La probabilidad existente de caza se multiplica por un factor
entre 0,65 y 1; no añade draws de RNG. Estos factores son supuestos iniciales.

Config.light.enabled permite comparar el mecanismo. Partidas antiguas sin
este bloque se migran con enabled=false, conservando sus reglas. Los cuerpos
se buscan en la cadencia de observación para evitar que un muestreo exclusivo
de medianoche los vuelva invisibles durante todo el día.

Siete pruebas focales pasaron: caída de luz, fuentes, vista, testigo diurno
frente a nocturno, progreso de fabricación y JSON, migración de guardados.
El sim:check corto del árbol compartido dio 3/147 fallos: los previos
cravings-steer-the-diet y perf-budget, y un nuevo people-act-on-what-they-know
(un destino desconocido). Este último queda registrado para diagnóstico; no se
relaja su check ni se afirma que sea un fallo previo. Los cambios simultáneos
de ropa/muebles impiden atribuirlo a una sola funcionalidad sin aislarla.
Las cohortes económicas siguen aplazadas según la instrucción M15.
