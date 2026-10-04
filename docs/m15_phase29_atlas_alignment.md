# M15 29 — Coordenadas del atlas terrestre alineadas

2026-10-04. La inspección local descubrió un defecto previo del generador de
datos: NOAA entrega los puntos con longitudes 0–360°, pero `RealWorldMap`,
Natural Earth y las semillas de recursos sitúan la columna cero en −180°.
Guardar directamente las columnas NOAA desplazaba el relieve 180°. El clima
también se consultaba con longitudes positivas 1,875–358,125° aunque el TIFF
Beck empieza en −180°, recortando la mitad posterior al borde del raster.

`parseElevationCsv` convierte las longitudes a −180–180° antes de asignar
columnas. El centro 1,875°E queda en la columna 48 y 181,875°E en la columna
cero (−178,125°). El muestreo climático usa −178,125 + 3,75×columna, manteniendo
la orientación norte-sur existente. El TIFF original tiene origen (−180°,90°)
y píxeles de 0,5°, comprobados en sus etiquetas de georreferenciación.

Los dos binarios se regeneraron con `npm.cmd run world:build` desde los cuatro
inputs originales disponibles en la caché local
`C:/Users/Marty/AppData/Local/Temp/dynasty-worlddata/`: CSV NOAA, ZIP Beck y ZIP
de ríos y lagos de Natural Earth. No se rotaron a mano los datos ni se intentó
recuperar el clima perdido de los binarios anteriores. La salida mantiene
96×48 regiones, 151 regiones con río y cinco con lago. Manifiesto, nivel del
mar y flags regionales conservan su formato; ambas capas terrestres de clima
y altura ahora coinciden con sus coordenadas.

Antes del arreglo fallaban tres comprobaciones focales: la asignación de
columnas NOAA, el gradiente longitudinal de clima y la posición real de Iberia.
Después pasan los 14 casos de tres archivos de fuentes/atlas/mapa real.
Iberia central (−3°,40°) tiene tierra y altura positiva; el Pacífico central
(175°,0°) es mar. El check de clima usa un gradiente por longitud para detectar
el recorte que el antiguo fixture, constante en cada fila, no podía ver.

La regresión de navegador dibuja una ventana de 30×20 comarcas centrada en
Iberia desde el atlas comprometido, comprueba píxeles opacos y varios biomas,
y compara el checkpoint completo antes/después del render. No cambia el motor
ni la raíz de la partida clásica del navegador. No es una reconstrucción de
una costa local medida: la altura sigue interpolada a partir de una rejilla
regional de 3,75°. Las partidas geográficas pobladas siguen rechazadas hasta
tener agua dulce local; las fuentes por semilla y el paleoclima siguen abiertos.

Captura geográfica revisada:
`artifacts/screenshots/m15-phase29-atlas-alignment-2026-10-04-pass1/14-earth-iberia-inspection.png`.
Gira final 1/1; 30 imágenes de la gira y los e2e en ese hito, incluida la
geográfica.
Typecheck, 997/997 unitarios en 138 archivos, 75/75 e2e y build pasan. La
primera suite de navegador tuvo 74 aprobados y falló el caso nuevo; la repetición
final completa aprueba 75/75 después de regenerar. Ambos intentos fallidos
de la captura inicial quedan en los logs. El cierre de Playwright esperó a su
servidor Vite propio; detenerlo tras acabar los tests permitió salir con exit 0.

La matriz clásica antes/después conserva 108 fallos en 27 escenarios y termina
con exit 1. La comparación de orden, recuentos de pases/aplicables y listas de
fallos pasa; no compara métricas de cada check ni throughput. No se declara
mejora de balance. Los hashes completos de tres mundos clásicos coinciden antes
y después, al inicio y tras 180 ticks.
La cohorte clásica `century` completa diez semillas de 40.000 ticks:
82,9 % de supervivencia media, cero colapsos por debajo de un cuarto de
población y 369 nacimientos. No hay una cohorte anterior comparable ni se
extrapola el resultado a los mapas geográficos sin habitantes.
Logs de pruebas, referencia clásica y matriz:
`artifacts/verification/m15-phase29-local-20261004-pass1/`.
