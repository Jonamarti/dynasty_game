# M15 fase 30 — Agua dulce local y salinidad

## Segunda pasada — continuidad entre mapas

La leche añade cinco puntos de hidratación continental. Se mantiene el nombre
existente `ItemDef.hydration` para el `water` de M14; `hydrationOf` preserva
la política histórica de la leche clásica y la hidratación existente de fruta
en ambos modos. Todos los consumidores y el scorer consultan esa política.
Las pruebas cubren consumo desde la UI, una orden real de comer y continuidad
desde JSON, además de macros; no añaden estado privado ni draws de RNG.

La cuota geográfica de pesca reserva una casilla de cada clase dulce/salada
disponible si el número de puntos lo permite. El bucle anterior podía gastar
ambos draws en mar pese a tener río somero; una regresión reproduce esa
secuencia exacta. Los peces conservan el stream dedicado existente y las
condiciones de agua somera y banco accesible de fase 27. La prueba de IA
demuestra ruta y cosecha efectiva de un punto dulce; la isla clásica conserva
su distribución histórica. La reserva es condicional: un acantilado sin agua
somera no gana un banco artificial.
Una aceptación separada genera un lago de depresión sin candidatos de río
y comprueba peces dulces someros junto a un banco seco de la misma región.
Los tres focales de pesca pasan (reserva, lago y cosecha autónoma).

La aceptación de fruta sin orillas dulces encontró otro defecto: explorar
por agua siempre superaba comer la manzana de mochila, incluso con sed 95.
En continente, preguntar/explorar espera a consumir ese puente hidratante;
al agotarse se vuelve a buscar una fuente duradera. Se conserva el scorer
clásico y no se calibran pesos nuevos. Dos pruebas reales demuestran consumo
autónomo de manzana por sed y consumo de un pozo terminado sin orillas dulces.
No demuestran que una sola fruta sostenga indefinidamente a una población
ni que se recolecte fruta por sed sola.

La red geográfica comparte nodos y aristas globales en giros y confluencias.
Cada baldosa consulta esa red, por lo que un recorte no vuelve a trazar el
río desde su propio borde. Superficies ancladas al relieve y fase de vados
medida hacia el desagüe conservan clase, cota y lecho a igual resolución.
Los diagnósticos recorren aristas descendentes reales: ordenar una componente
por altura no demostraba que sus baldosas fueran vecinas.

El control antes/después de un mapa 80×80 frente a cuatro recortes 40×40
detecta 1 clase, 1 superficie y 9 lechos diferentes en el build anterior;
ahora son cero. Los 15 tests focales cubren también confluencia, descenso,
lechos que no elevan el terreno y vados en una extensión de una comarca.
`tools/waterTerrainFixture.ts` comparte el giro real con el e2e, que verifica
un checkpoint intacto al renderizar. Captura revisada:
`artifacts/screenshots/m15-phase30-continuity-2026-10-06T-02/04-river-bend-and-fords.png`.

Las secciones de la primera pasada conservan su evidencia histórica; el
cierre integrado se añade después de la cohorte y las verificaciones finales.

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

## Verificación de la primera pasada — 2026-10-06

- Typecheck limpio; suite completa 1.094/1.094 tests, 158 archivos.
- E2e completo 82/82; repetición de los dos nuevos después del último arreglo
  del generador, 2/2. Sus tres capturas se revisaron visualmente.
- Soak español: 419 líneas distintas, cero sospechosas de inglés.
- `frontier`: 17 ticks de bebida dulce, cero bebida marina autónoma y un
  cruce terminado; 2/2 checks aplicables. Los controles negativos pasan.
- Seis SHA-256 de checkpoints clásicos completos coinciden antes/después:
  `band`, `tour` y `m15-classic-reference` a ticks 0 y 180, con 60 ticks/día.
  Esto cubre estado, IDs y RNG de esas muestras; no todos los mundos posibles.
- Matriz completa: 31 escenarios, incluidos los 30 clásicos con exactamente
  los mismos recuentos de checks aplicables/pases e IDs de fallo que el checkout
  inicial. Conserva 116 fallos; ambos comandos salen con código 1. `frontier`
  añade 2/2 sin fallos. La comparación no afirma igualdad de todas las métricas
  ni coste: la pasada final compartió CPU con tests y navegador.

Logs y JSON completos en `artifacts/verification/m15-phase30-20261006/`.
Los intentos durante edición no se presentan como pases: la primera suite
falló tres pruebas; la siguiente falló la unión fluvial aún en revisión;
la repetición final pasa todos los archivos. Typecheck detectó una variable
sobrante y pasó tras retirarla. Un primer audit de hashes usó por error el
calendario por defecto; el audit final usa el mismo calendario que la referencia.
Estos logs se conservan junto a los resultados finales.

## Escenario continental y alcance

`frontier` construye una costa salada y un río a través del constructor
geográfico normal. Una persona sedienta decide autónomamente junto al mar,
con agua dulce visible; otra recibe una orden de caminar entre orillas a
través de un vado generado. Las observaciones cuentan bebida dulce, intentos
autónomos salados y un cruce terminado, sin alimentar decisiones de la IA.

`nobody-drinks-the-sea` exige una oportunidad salada, bebida dulce efectiva y
cero bebida marina autónoma. `rivers-are-crossed` exige llegada a la otra orilla
después de pisar un vado. Dos controles negativos reproducen la búsqueda salada
anterior y bloquean los vados: ambos checks detectan el mecanismo roto. Este
escenario tiene dos checks aplicables, nunca `n/a`, y no afirma supervivencia
continental ni mejora económica. `sim:seeds` acepta su constructor geográfico
sin cambiar el setup histórico de las cohortes clásicas.

Al terminar la primera pasada quedaban abiertos giros, vados globales y
validación continental larga; esa entrega parcial no cerraba la fase 30.
La segunda pasada corrige la continuidad y añade la cohorte. Selección
global y contenido salinero de fase 15 siguen en sus fases correspondientes.
