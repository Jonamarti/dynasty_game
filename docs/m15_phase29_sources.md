# M15 fase 29c — procedencia y límite del paleoclima

2026-10-05. Cada fila de `WORLD_FEATURE_SEEDS` ahora lleva `source`, una clave
de bibliografía concreta que se resuelve en `public/world/SOURCES.md`. Esto
permite auditar la ubicación de cada centroide sin convertir un área amplia en
un supuesto yacimiento exacto. La lista exportada de claves y una regresión
comprueban que ninguna fila carezca de una clave reconocida.

Las referencias distinguen evidencia de domesticación, área probable del
progenitor, geología del recurso y explotación arqueológica. Esas categorías no
son intercambiables. Se señalan de forma explícita las filas con evidencia
local débil o una ubicación que necesita revisión. Tres entradas exponen
conocidos desajustes de ubicación (sorgo, caballo y oro), y dos carecen de evidencia
suficiente para el punto guardado (sílex levantino y sal del mar Muerto). Son
deudas de datos abiertas, así que la bibliografía no basta para cerrar la
puerta de fase. Las semillas no determinan recursos locales de una comarca ni
distribución histórica detallada.

El mapa `earth-12000-bce` conserva la elevación moderna de ETOPO con un nivel
del mar de −60 m, clases Köppen-Geiger de 1980–2016 y las mismas semillas
regionales aproximadas. No modela rangos pasados de recursos. Tanto `SOURCES.md`
como `manifest.json` dicen expresamente que no
hay paleoclima. La prueba de activos verifica esa declaración y que los dos
mapas no difieren en sus clases climáticas y flags de recurso.

Verificación focal: `npm.cmd test -- --maxWorkers=1 --testTimeout=15000 src/sim/__tests__/real-world-assets.test.ts` y `npm.cmd run typecheck`.
