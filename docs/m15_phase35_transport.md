# M15 fase 35 — transporte (2026-10-09)

La fase amplía la frontera de comarca de 34 con transporte físico. La técnica
no crea un medio de transporte: la canoa y la vela se fabrican; el asno y el
caballo son animales vivos que se domestican y mantienen su identidad.

## Entregas

1. Canoa local: aguas profundas dulces y brazos de mar resguardados. La balsa
   de juncos conserva su límite de agua dulce. El movimiento, el catálogo,
   las órdenes, la retirada al interrumpir y las necesidades comparten el
   lector del medio utilizable. [Contrato](m15_phase35_logboat.md).
2. Viaje terrestre fechado, rastra y carro: provisiones físicas, duración,
   guardado parcial y retorno/llegada bajo el coordinador mundial.
3. Transporte animal: una relación recíproca entre persona y animal canónico
   habilita carga o monta; morir, perder la propiedad o dejar la técnica invalida
   la capacidad. [Contrato](m15_phase35_animals.md).
4. Navegación a vela: vela y canoa físicas, ambas técnicas, para rutas marítimas
   entre costas no contiguas. [Viajes](m15_phase35_journeys.md).

## Diferencias respecto a los documentos anteriores

La fase 11 había creado el objeto y la receta de rastra, pero no existía
sledge en TECHS. Se añade el nodo previsto, con carpintería y cordelería como
requisitos, y se conecta a esa misma receta; no se duplica el objeto.

PREY_SPECIES conserva su orden y sus miembros. Los nuevos animales se colocan
con un RNG derivado de la semilla después de las pasadas existentes: no se añade
ningún fork a Simulation ni se gasta spawnRng en esa colocación. Esto preserva
la generación anterior de personas y recursos; no promete que añadir animales
deje iguales las decisiones futuras, la caza o la economía.

## Verificación y límites

Durante M15 solo se usan typecheck, unitarios, sim:check de una semilla y e2e.
La cohorte migrants de veinte semillas y la matriz sim:check:all se difieren
por AGENTS.md. Los controles de mecanismo no se presentan como mediciones de
supervivencia ni como la puerta anual lod-matches-detail.

La referencia de fase 34 tenía dos fallos unitarios (hambre compacta craft/delta
y difusión tecnológica) y dos de sim:check (antojos y rendimiento). El informe
final distinguirá esos fallos de cualquier regresión nueva. Capturas históricas
y notes_for_m15.txt del usuario se conservan.

La comparación corta prueba que bayas físicas se deterioran y avellanas no, también al guardar/reanudar. El catálogo actual carece de preserving, secadero, pemmican y carne conservada: las afirmaciones antiguas del plan de que 15 los entregó no describen este build. La receta de conservación sigue retenida; esta prueba no mide suministro autónomo ni autoriza seleccionar su coste o añadir un término económico al consenso de migración. Se registra como deuda explícita en bugs/M16.
