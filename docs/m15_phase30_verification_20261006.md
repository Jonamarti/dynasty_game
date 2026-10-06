# M15 fase 30 — Verificación del cierre (2026-10-06)

Referencia de esta segunda pasada: `8aba05f`; la auditoría adicional contra
`3d585f6` cubre el estado anterior a toda la fase 30. La primera pasada ya había
entregado terreno v2, consumidores dulces/salados y guardado continental;
este cierre añade continuidad en giros, hidratación de leche, distribución
de pesca y aceptación continental larga. Los resultados pendientes se
completan antes de marcar cerrada la fase.

## Controles que detectan el defecto

- Un mapa de 80×80 frente a cuatro recortes de 40×40, a igual resolución:
  antes difieren 1 clase de agua, 1 superficie y 9 lechos; después, cero.
  Las regresiones incluyen giros, confluencia y fase global de vados.
- La secuencia anterior de `fishRng`, con los draws de cantidad incluidos,
  coloca ambos puntos en mar en una semilla que tiene río somero disponible.
  La reserva nueva ofrece un punto por clase disponible cuando alcanza la
  cuota; no inventa bancos someros en costas de acantilado.
- `frontier` demuestra bebida dulce y llegada a la otra orilla por un vado
  generado. Sus controles de hash salado y vado bloqueado detectan ambas
  averías; 2/2 checks aplicables.
- La cohorte detecta una IA con el hash de bebida salado. El control de sed
  emparejado a 2.400 ticks retira fruta/pozos y usa calorías secas: el agua
  dulce evita muertes por deshidratación; el mismo terreno reclasificado
  salado produce muertes con esa causa real.
- La observación de la cohorte no cambia un checkpoint a 120 ticks. Un
  desvío que entra en agua y vuelve a la misma orilla registra vadeo y cero
  cruces completos.

## Partida autónoma

`frontier-cohort`: dos bandas de doce personas, sin teletransporte, órdenes
ni necesidades forzadas; 12.000 ticks, 60 ticks/día, 200 días o cinco años
del calendario de juego. Antes del último arreglo de fruta, la aceptación
de una semilla pasó 3/3: 5.146 ticks
de bebida dulce, 47 oportunidades saladas visibles para NPCs, cero bebida
marina autónoma y cero muertes por deshidratación. Observa 116.817 estancias
en río somero y cero cruces topológicos demostrados: **estas estancias no
se presentan como cruces**. El cruce completo lo demuestra `frontier`.

La primera cohorte de veinte mundos, previa al arreglo de fruta, usa el mismo constructor poblado
y observación pasiva: 12.000 ticks cada uno, sin colapso por debajo del 25%
del pico ni extinciones. La media de población final/pico es 97,9%; **no es
supervivencia individual**: hubo 645 nacimientos y 90 muertes registradas,
31 por hambre (14 infantes, 17 adultos). Ninguna fue por deshidratación.
No se ha realizado una cohorte económica emparejada ni se afirma mejora
de la economía respecto a otra versión.

En conjunto: 93.961 ticks de bebida dulce, cero bebida marina autónoma,
1.681.363 observaciones de río somero y cero cruces topológicos demostrados.
Los 1.000 nodos iniciales de pescado son dulces; este perfil no ofrece costa
somera salada. La otra fixture prueba expresamente ambos hábitats.
La caída neta de stock fresco observada es 11.551,13 unidades: no equivale
a capturas exactas porque puede compensarla la regeneración y falta baseline
antes de la primera observación. Se observaron 21.817 piezas ingeridas de
comida hidratante y 17.812 reevaluaciones del scorer con candidata hidratante;
no son puntos de sed aliviados. El ledger diario puede perder comidas en el
límite del día, por lo que el contador es de unidades observadas.

## Verificación integrada

- `npm.cmd run typecheck`: limpio.
- `npm.cmd test -- --maxWorkers=1 --testTimeout=15000`: 1.111 tests pasan
  en 162 archivos tras el arreglo de fruta. Se confirman comando y recuento completos.
- `DYNASTY_PORT=5399 npm.cmd run e2e`: 83/83 pasan.
- `npm.cmd run i18n:soak`: 419 líneas españolas, cero sospechosas de inglés.
- Los treinta escenarios clásicos terminan con el mismo SHA-256 de estado,
  recuentos de checks e IDs de fallo que `8aba05f`. La auditoría compara la
  representación persistida completa, incluido RNG, IDs y configuración;
  expone las cuatro excepciones de codec descritas debajo. Conserva 116
  fallos previos. La matriz integrada está en curso; su resultado se añade.

La cohorte final de veinte semillas, la matriz y ambas auditorías se repiten
tras el arreglo de fruta; sus resultados se añaden antes del cierre.

El codec rechaza configuración de cuatro fixtures antiguas (`hearths`,
`porters`, `scribes`, `conquest`). Para esas cuatro, el digest conserva toda
la configuración original y un checkpoint con entrada de configuración
normalizada a claves conocidas, en referencia y candidato. `configFallback`
expone esa excepción: no demuestra guardabilidad de sus checkpoints crudos.

## Evidencia y límites

Logs, comparación de recortes y treinta hashes antes/después:
`artifacts/verification/m15-phase30-closure-20261006/`.
Los intentos fallidos se conservan: la igualdad directa del test JSON detectó
la normalización de cero negativo; el test definitivo compara ambas formas
persistidas completas. No se presenta ese intento como un pase.
La prueba de fruta falló en el scorer anterior y pasó al aplazar la búsqueda
de agua hasta gastar la comida hidratante; no se cambió un umbral del test
para encubrir el defecto. La aceptación de lago necesitó corregir la fixture:
su umbral sintético de vadeo anulaba la depresión; con el umbral del juego
se genera el lago sin modificar el runtime.

Capturas nuevas revisadas:
`artifacts/screenshots/m15-phase30-continuity-2026-10-06T-02/`
(giro y vados) y `artifacts/screenshots/m15-phase30-closure-2026-10-06T-01/`
(terreno, menú de bebida dañina y razón visible de parada). Se conservan los
milestones anteriores; el e2e comprueba que renderizar no avanza el mundo.

La hidrología local representa cauces procedurales derivados del relieve y
flags regionales, no trayectorias históricas exactas. Las salinas,
`saltmaking` y `salt_pan` siguen siendo contenido pendiente de fase 15;
selección global y migración corresponden a fases posteriores. No son
funcionalidades que esta fase 30 implemente.
