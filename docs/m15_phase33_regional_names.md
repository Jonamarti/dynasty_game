# M15 fase 33 — nombres al materializar residentes

Los residentes creados desde `PeopleSim` reciben un nombre en
`WorldState.materializeResidents`, en el mismo momento en que se crea su
`Person`. `RegionalNames` deriva un inventario de ataques, vocales, codas y
longitud silábica de la semilla del mundo, la clase de geografía y el ID de la
región; el nombre deriva además del ID persistente de la persona. No hay una
tabla global que se consuma ni un fork nuevo de `Simulation`.

Los datos de la Tierra del repositorio describen relieve, clima, agua y
recursos, no familias lingüísticas. Por eso los inventarios de la Tierra son
**fonologías ficticias por región**, no aproximaciones afirmadas de idiomas
históricos. El mapa aleatorio también recibe inventarios generados. El nombre
no determina cultura, tecnología, pueblo histórico ni ubicación, y no se
colocan pueblos históricos por guion.

Los nombres ya se guardan en `PersonRecord`; al cargar o volver a la región se
conserva el nombre registrado. Los streams derivados mantienen el orden de
forks de `Simulation`. En la materialización se reservan los dos draws que antes
escogían ataque y coda, para que la secuencia compartida que inicializa al
residente no cambie por esta característica.

Cobertura focal: repetibilidad por identidad, separación de inventarios entre
regiones y clases de geografía, y conservación de IDs/nombres tras viajar,
guardar y recargar. Las colisiones de nombres no se prohíben; la identidad es
el ID de persona, no la cadena visible.

**Pendiente:** no hay evidencia lingüística en las fuentes del repo para
reemplazar estos inventarios ficticios por familias reales. Hacer esa asociación
requiere datos lingüísticos con procedencia documentada y una decisión de
producto; el modelo actual no pretende representar una reconstrucción
histórica.
