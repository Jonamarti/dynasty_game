# M15 fase 30 — Agua dulce local y salinidad

## Terreno y registros — 2026-10-06

`World` conserva `shoreTiles` para las operaciones que necesitan cualquier
orilla y expone `freshShore` y `saltShore` para consultar la procedencia. El
bioma `river` se añade al final, índice 6, sin desplazar los biomas clásicos.
`isDrinkingWater`, `isFreshWater` e `isSaltWater` consultan el agua de la baldosa;
las consultas de orilla incluyen el agua somera caminable.

El terreno geográfico tiene dos arrays: clase del agua y cota de su superficie.
La profundidad lee esa superficie y el lecho actual, incluidos los cambios de
tierra. Una zanja hereda clase y superficie de su fuente en un orden fijo de
vecinos, sin draws aleatorios. El renderer usa los mismos umbrales de vadeo y
natación para ríos y mar; el agua no recibe la textura de tierra movida.

`Hydrology` deriva cauces de los candidatos regionales y de la altura. Los
flags del atlas no convierten una región entera en agua. El cauce talla un
lecho por debajo de su superficie, conserva profundidad somera en los vados,
y los lagos exigen una depresión conectada. Los manantiales dependen de una
ladera húmeda y de un hash de coordenadas. Estas formas locales son una
aproximación procedural a datos regionales; no son cursos fluviales medidos.

Los registros de terreno geográfico usan `WorldTerrainRecord` v2, con arrays
independientes y validación de clase, bioma, superficie y conectividad. La
isla clásica conserva el registro v1 y su mar potable, incluida la semántica
histórica de agua fuera del borde al inundar zanjas. No hay forks ni draws
nuevos en los streams del motor.

Los tests del modelo ejercitan salinidad, lecho elevado, guardado independiente,
canales, registros corruptos y compatibilidad clásica. Una regresión comprueba
la conexión entre dos mapas vecinos en un tramo recto. Quedan pendientes los
giros entre regiones y la fase global de los vados: la ruta se reconstruye por
mapa y su contador de vados reinicia. No se declara cerrada la fase.
Los logs intermedios se conservan, incluidos los intentos
que fallaron durante la integración.

Capturas iniciales revisadas: `artifacts/screenshots/m15-phase30-water-2026-10-06T-01/`
y `artifacts/screenshots/m15-phase30-water-2026-10-06T-02/`. La segunda muestra
el lecho tallado al mediodía. La verificación final se registra al terminar
los consumidores y el escenario continental.

## Consumidores y órdenes — 2026-10-06

`Simulation` mantiene hashes de orilla dulce y salada junto al hash genérico.
La IA, los recuerdos y la comunicación sobre agua y la elección de campamento
consultan agua potable. Ocultar un cadáver y retirarse nadando siguen usando
cualquier orilla. Los índices se reconstruyen al cargar o cambiar el terreno.

Una orden explícita al mar conserva su intención salada al interrumpirse,
reanudarse y guardarse; si desaparece esa fuente, termina con `no_water`.
No se convierte silenciosamente en una bebida dulce. Beber mar añade cuatro
puntos de sed, quita uno de salud y detiene la orden con `salt_water` visible.
El menú advierte del daño y ambos textos tienen traducción española. El mar
clásico mantiene su comportamiento histórico potable.

Se habilitan inicios continentales poblados mediante `WorldState`, sin nueva
selección en el navegador. Un test guarda la raíz en JSON y compara dos
continuaciones de 180 ticks, incluidos los arrays de agua independientes.
Cuatro regresiones prueban IA, orden dañina, guardado y fuente desaparecida.
El navegador ejercita menú, daño y parada en la UI real. Capturas revisadas:
`artifacts/screenshots/m15-phase30-final-2026-10-06T-02/` (tres imágenes).
