# M15 fase 29c — procedencia y límite del paleoclima

2026-10-05. Cada fila de `WORLD_FEATURE_SEEDS` ahora lleva `source`, una clave
de bibliografía concreta que se resuelve en `public/world/SOURCES.md`. Esto
permite auditar la ubicación de cada centroide sin convertir un área amplia en
un supuesto yacimiento exacto. La lista exportada de claves y una regresión
comprueban que ninguna fila carezca de una clave reconocida.

La auditoría bibliográfica de 2026-10-12 matiza cinco filas sin alterar
coordenadas, semillas ni activos. [SOURCES.md](../public/world/SOURCES.md)
enlaza estudios directos y distingue procedencia/domesticación, rango silvestre,
existencia geológica y explotación arqueológica. Sorgo (Kassala frente a 13°N,
1°E), caballo (foco inferido Volga–Don frente a 48°N, 35°E) y oro del Sinaí
(oro aluvial documentado en Dahab, no en 25°N, 33°E) siguen abiertos porque la
evidencia no identifica el centroide almacenado ni autoriza moverlo. La fuente
regional avala disponibilidad amplia de sílex en el Levante, sin localizar una
cantera en el punto. La halita del Mar Muerto queda confirmada como fenómeno
geológico, pero no como extracción prehistórica ni como recurso terrestre
accesible en la coordenada. Para las filas abiertas se especifica qué dato
falta. Las semillas no determinan recursos locales de una comarca ni rangos
históricos detallados; no se transforman lugares de domesticación en rangos
naturales.

El mapa `earth-12000-bce` conserva la elevación moderna de ETOPO con un nivel
del mar de −60 m, clases Köppen-Geiger de 1980–2016 y las mismas semillas
regionales aproximadas. No modela rangos pasados de recursos. Tanto `SOURCES.md`
como `manifest.json` dicen expresamente que no
hay paleoclima. La prueba de activos verifica esa declaración y que los dos
mapas no difieren en sus clases climáticas y flags de recurso.

Verificación focal: `npm.cmd test -- --maxWorkers=1 --testTimeout=15000 src/sim/__tests__/real-world-assets.test.ts` y `npm.cmd run typecheck`.
