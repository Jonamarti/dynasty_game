# M15 14c/14e — taparrabos e instrumento de invierno

Entrega del 2026-10-10, versiones `0.15.46-alpha` y `0.15.47-alpha`. Subagentes `gpt-6-luna`
con razonamiento high implementaron el corte de ropa y el instrumento; un
tercero revisó las puertas y los pendientes. La integración fue serial.

- `177d7b5`: escenario `tailors`, vestido autónomo de gorros suministrados y
  sondas pareadas del lector real de frío, con negativos de ropa/abrigo ausentes.
- `d3322d1`: taparrabos físico de cadera, receta con lasca/hacha retenida,
  abrigo sólo puesto, JSON, arte generado y botones españoles de Equipo.

Typecheck pasa. Las pruebas focales pasan 5/5 para el instrumento y 35/35
para prenda/arte/traducción. `tailors` pasa 2/2: 7/7 adultos suministrados se
vistieron durante una muestra fría; 4.350 de 10.073 muestras (43,2%) tenían
ropa. Las 4.350 sondas evitan 0,02387 puntos de frío por tick de media y
ninguna carece de beneficio. No se mide confección autónoma ni supervivencia.
El chequeo corto normal conserva los dos fallos iniciales: dieta y rendimiento.

Suite completa: 280 archivos, 274 correctos y 6 fallidos; 2.029 pruebas
correctas, 7 fallidas y 1 omitida. Tiempo 359,50 s. Las siete fallidas coinciden
con la entrega `.45`: correspondencia compacta, contador de observación de
comida, diggers, difusión, tributo, conspiración y muerte por sed. La huella
de determinismo pasa; falla la expectativa de actividad del contador. No se
relajaron umbrales. Log: `artifacts/m15-full-unit-46-20261010.log`.
El ajuste de tinte del arte se comprobó después con typecheck y navegador;
la lógica de simulación permaneció fija durante la suite.

El navegador focal de taparrabos pasa 1/1: vestir/quitar, aparición de capa y
calor, objeto conservado y color de material independiente de la banda. La
captura final focal fue inspeccionada en
`artifacts/screenshots/m15-phase14c-loincloth-2026-10-10T-03/T-01-hide-loincloth.png`.
Las capturas de los intentos de prueba anteriores se conservan por separado;
la hoja de contacto incluye ahora las tres orientaciones del taparrabos.

Regresión completa de navegador `.46`: 154/156 pasan en 9,7 minutos.
Falla la niebla de `smoke.spec.ts:326` (RGB 36 frente a >45, ya reproducida
en `.41`), y aparece una regresión nueva en la paridad de píxeles de personas.
Al devolver `''` cuando cadera estaba vacía, `flush` omitía la capa base del
taparrabos de presentación. La variante correcta es `base`. No se cambian
los píxeles de referencia ni se rebaja su comparación.

El arreglo `.47` restaura esa variante y regenera sólo personas. Una prueba
nueva recorre todos los cuerpos salvo la variante `infant`, sexos, poses y orientaciones
horneadas y exige base sin prenda / variante propia con prenda. Typecheck y
36 pruebas focales pasan. La paridad de navegador pasa los 360 casos (1/1);
equipo y versión pasan 3/3 con Vite nuevo. No se repite toda la lista de 156
después de este arreglo de arte; su fallo nuevo queda resuelto por la prueba
original que lo detectó. La simulación no cambia y el chequeo corto conserva
dieta/rendimiento. Logs: `artifacts/m15-hip-base-{art,typecheck,tests,health,pixels,browser,sheet}-20261010.log`.

Captura final inspeccionada:
`artifacts/screenshots/m15-hip-base-fix-2026-10-10T-01/T-01-hide-loincloth.png`.
Las 22 capturas históricas de rutas fijas se restauraron y sus hashes coinciden
con el respaldo. Los resultados nuevos se conservan en
`artifacts/screenshots/m15-full-ui-46-2026-10-10T-01/`, incluidos `fixed-paths`.
Log completo inicial: `artifacts/m15-full-ui-46-20261010.log`.

La sesión no inicia la falda de fibra, para reservar presupuesto de verificación.
Siguen abiertos falda, curtido, bolsillos, desgaste/remiendo, creencias de
abrigo, retirada por calor y confección autónoma de `tailors`. 14c/14e y M15
continúan abiertos. Cohortes y matriz pesada diferidas por AGENTS.md; no se
declara una suite global verde ni mejora económica.
