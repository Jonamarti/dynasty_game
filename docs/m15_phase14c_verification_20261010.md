# M15 14c — alamares, lino, lana y subred Ropa

Entrega del 2026-10-10, versiones `0.15.42-alpha` a `0.15.45-alpha`.
Tres subagentes `gpt-6-luna` con razonamiento high implementaron las prendas;
la integración serial conservó commits independientes y evitó mezclar cambios
en las tablas compartidas.

- `780f3c1`: parka con alamares de hueso.
- `334e3f9`: túnica de lino, hilo y aguja retenida.
- `3655b67`: manto de lana que sustituye la capa de piel.
- `bf02ccc`: subred Ropa, sastrería, hilado, tejido y siete recetas.

Las pruebas focales pasan: 98 de alamares, 98 de lino, 104 de lana y 57 de
subred. Typecheck pasa. Cada funcionalidad tiene contrato, traducción y
captura fechada. Los chequeos cortos conservan los dos fallos iniciales
`cravings-steer-the-diet` y `perf-budget`; `n/a` no se cuenta como éxito.

La primera suite global fue una ejecución durante integración; no se usa
como resultado final. La copia fija `.41` reproduce difusión 0,63 frente a
<0,6, antes de estas prendas. Los demás fallos previos están en `bugs.md`.

La suite completa estable `.45` termina en 358,48 s: 278 archivos, 272
correctos y 6 fallidos; 2020 pruebas correctas, 7 fallidas y 1 omitida.
Log: `artifacts/m15-full-unit-45-20261010.log`. Persisten el negativo de
correspondencia compacta, el contador de observación de comida, diggers,
difusión (0,66), tributo, conspiración y una muerte por sed. La huella del
mundo en determinismo pasa; falla la expectativa de actividad del contador.
Las siete incidencias ya estaban registradas antes de la entrega. No se
declara una suite verde ni se cambian sus umbrales.

La captura original de lino conserva una etiqueta .42 por reutilizar Vite:
su configuración lee package/commit al arrancar. Las capturas de verificación
se generan en un directorio nuevo con un servidor nuevo, sin sobrescribir el
registro anterior. Lana y subred reportaron éxito en su e2e aislado, pero hubo
que interrumpir el teardown de su servidor; la regresión conjunta usa Vite
gestionado aparte.

Capturas de integración:
`artifacts/screenshots/m15-phase14c-verification-2026-10-10T-01/`.
Lino, lana y subred se inspeccionaron con etiqueta .45 en esta captura.
Alamares se inspeccionó en `m15-phase14c-verification-2026-10-10T-02/`.

Regresión de navegador: 80 pruebas en nueve specs (smoke, ropa, capas,
subredes, tres prendas y versión). Resultado inicial: 78 pasan, 2 fallan.
Log `artifacts/m15-ui-45-20261010.log`. La aserción nueva de alamares estaba
antes de abrir Equipo; se trasladó a la pestaña correcta, sin cambiar juego.
La repetición focal pasa alamares y reproduce el otro fallo de niebla:
`artifacts/m15-ui-45-recheck-20261010.log`. La copia fija `.41`, servida por
Vite desde `artifacts/verification/m15-baseline41`, falla igual: píxel sin
niebla 36 frente a >45 (`artifacts/m15-ui-baseline41-fog-20261010.log`). No
se cambia el umbral ni se declara resuelto; todas las pruebas de ropa,
subred y versión pasan. El recorrido no es la lista completa de `npm run e2e`.
Las cuatro capturas históricas de 13c que la prueba de screenshot incluida
por error reescribió se restauraron desde Git; sólo se conservan las nuevas.
Tras `bf02ccc`, una nueva ejecución de versión con Vite recién iniciado pasa
2/2: menú y juego muestran `v0.15.45-alpha (bf02ccc)`. Log
`artifacts/m15-version-45-20261010.log`; captura de menú en el directorio
`m15-phase14c-verification-2026-10-10T-03/`.

14c sigue abierta: taparrabos/falda de fibra, curtido, bolsillos,
desgaste/reparación, creencias de abrigo, retirada por calor y escenario
tailors. Cohortes y matriz pesada diferidas por AGENTS.md. No se declara
mejora económica ni cierre de M15.
