# M15 29 — Perfiles de comarca y procedencia geográfica

2026-10-04. `RealWorldMap.comarcaAt(x, y)` consulta coordenadas continuas en
unidades de comarca, usando la subdivisión explícita del mapa. La longitud
envuelve y la latitud se limita a los polos. La altura absoluta se interpola
en metros; `elevationAboveSeaMeters` resta el nivel del mar del atlas. El
perfil retiene la región original: clima Köppen, flags, tierra y tipo de agua
son categorías **regionales**, no una costa o un río local reconstruidos.
La interpolación de altura no convierte esas categorías en datos subregionales.
Las consultas rechazan NaN e infinitos antes de indexar.

`WorldGeography` ofrece factories independientes para `legacyIsland`, `random`
y `earth`. Los perfiles son una unión discriminada: el relieve aleatorio sigue
normalizado y el real sigue en metros. No se igualan sus unidades ni se inventan
biomas, fauna, minerales o clima que la fuente no ofrece. La isla clásica no
genera un mapa global; los datos macro desconocidos llevan una marca explícita,
en lugar de atribuirle una latitud o una reserva de cero. El mapa aleatorio usa
su semilla propia; Earth recibe una entrada ya validada por `loadWorldAtlas` y
una subdivisión explícita. No hay llamadas a streams de Simulation ni red.

Las regresiones cubren la escala de coordenadas, los polos y el antimeridiano,
continuidad a ambos lados de los bordes, nivel del mar de −60 m, procedencia
regional, el binario terrestre comprometido y los datos ausentes por modo.
Once pruebas focales de mapa real/geografía pasan. Typecheck limpio. Un control
negativo omite la resta del nivel del mar y falla en dos regresiones; restaurar
el código vuelve a aprobar las once. Suite conjunta: 984/984 en 136 archivos.
Registro visual general de la pantalla inicial y elección de vida, sin cambio
de UI: `artifacts/screenshots/m15-phase29-profiles-2026-10-04-pass1/` (2 capturas).
La primera invocación del tour no encontró tests por el filtro con espacios;
el filtro final ejecutó y aprobó 1/1. Se conserva ese intento en los logs.

La fase 29 continúa abierta: falta conectar perfiles con terreno y recursos
locales antes de ofrecer otros mundos al jugador, completar bibliografía por
semilla/paleoclima y medir `world:bench`. Esta capa no crea pueblos, no avanza
modelos compactos y no aporta un grafo local de ríos. Evidencia de la pasada:
`artifacts/verification/m15-phase29-geography-20261004-pass1/`.
