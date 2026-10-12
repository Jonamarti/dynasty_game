# M15 fase 29c — procedencia y límite del paleoclima

2026-10-05. Cada fila de `WORLD_FEATURE_SEEDS` ahora lleva `source`, una clave
de bibliografía concreta que se resuelve en `public/world/SOURCES.md`. Esto
permite auditar la ubicación de cada centroide sin convertir un área amplia en
un supuesto yacimiento exacto. La lista exportada de claves y una regresión
comprueban que ninguna fila carezca de una clave reconocida.

La auditoría bibliográfica de 2026-10-12 matiza cinco filas sin alterar
coordenadas, semillas ni activos. [SOURCES.md](../public/world/SOURCES.md)
enlaza fuentes directas y distingue procedencia/domesticación, rango silvestre,
existencia geológica y explotación arqueológica. La reconciliación posterior
separa la validez regional de la precisión de cada centroide:

- **Sorgo silvestre (13°N, 1°E):** el punto no es el foco de cultivo y
  domesticación de Kassala. La fila, sin embargo, representa `wildSorghum`, y
  Kew registra el progenitor silvestre (*S. bicolor* subsp.
  *verticilliflorum*) como nativo de Níger y Burkina Faso. Eso avala la región
  amplia del Sahel occidental como aproximación botánica. No identifica esta
  celda, abundancia ni presencia hace 12.000 años; el rango entre países de
  Kew y la rejilla de 3,75° no pueden dar esa precisión.
- **Caballo silvestre (48°N, 35°E):** la fila es `wildHorse`, no una ubicación
  del caballo doméstico moderno. Leonardi et al. (2018) reúnen hallazgos
  euroasiáticos de *Equus* y reconstruyen rangos por periodo, con registros
  extendidos en Europa y en el sur de Rusia. Esto hace defendible una región
  póntica-oriental amplia. El centroide no es una localidad fósil comprobada y
  las fuentes de domesticación DOM2 (Librado et al. 2021; 2024) no son fuentes
  del rango silvestre ni prueban presencia puntual en 12.000 a. C.
- **Oro del Sinaí (25°N, 33°E):** el punto está fuera de la península y no
  queda validado. Surour et al. (2003) sí documentan oro detrítico en
  sedimentos de wadis de Dahab, en el sudeste del Sinaí. La zona regional
  Dahab–sudeste del Sinaí tiene respaldo geológico; sigue sin haber base para
  asignar un depósito a la coordenada guardada. Corregirla requiere seleccionar
  un distrito concreto con ubicación de fuente compatible con la rejilla.
- **Sílex levantino (35°N, 35°E):** respaldada la disponibilidad extensa en
  parte del Levante, no un afloramiento o cantera en la celda.
- **Sal del Mar Muerto (31,5°N, 35,5°E):** confirmada la halita del sistema
  lacustre, no su extracción prehistórica ni la existencia de un depósito
  terrestre recolectable en la celda.

Por tanto, sorgo y caballo quedan respaldados como **semillas regionales
aproximadas** con incertidumbre temporal y subregional explícita. Oro, sílex y
sal conservan preguntas pendientes sobre la coordenada o la accesibilidad del
recurso. Las semillas no identifican recursos locales de una comarca ni
rangos históricos detallados; no se transforma una zona de domesticación en
un rango silvestre. No se movieron centros ni se regeneraron mapas.

El mapa `earth-12000-bce` conserva la elevación moderna de ETOPO con un nivel
del mar de −60 m, clases Köppen-Geiger de 1980–2016 y las mismas semillas
regionales aproximadas. No modela rangos pasados de recursos. Tanto `SOURCES.md`
como `manifest.json` dicen expresamente que no
hay paleoclima. La prueba de activos verifica esa declaración y que los dos
mapas no difieren en sus clases climáticas y flags de recurso.

Verificación focal: `npm.cmd test -- --maxWorkers=1 --testTimeout=15000 src/sim/__tests__/real-world-assets.test.ts` y `npm.cmd run typecheck`.
