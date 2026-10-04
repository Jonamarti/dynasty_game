# M15 29 — Integración de perfiles en la comarca local

2026-10-04. `WorldState` puede recibir un mapa aleatorio o un atlas Earth y una
posición expresada en coordenadas de comarca global. `comarcasWide` y
`comarcasHigh` fijan cuánto ocupa el mapa local; ambos valen uno por defecto.
La raíz pasa esa selección al constructor de `Simulation`, y `World` muestrea
el perfil en el centro de cada baldosa antes de construir suelo, hierba,
orillas, componentes caminables y prominencia. La adaptación del relieve,
humedad y biomas está descrita en
[m15_phase29_terrain.md](m15_phase29_terrain.md).

La integración solo permite mundos geográficos de inspección con
`population.bands: 0`. Si hay una o más bandas, el constructor lanza un error
antes de crear el generador RNG, tomar forks, colocar entidades o reservar IDs.
La partida del navegador sigue usando la isla clásica y no ofrece selección de
mapa ni lugar de inicio. Esta restricción existe porque el motor actual trata
cualquier baldosa de agua junto a una orilla como potable, y los flags de ríos
y lagos del atlas no localizan el agua dulce dentro de la comarca. No se afirma
que la costa geográfica sea segura para beber ni que haya ríos locales.

La generación local de nodos conserva las comprobaciones de bioma de `World`.
El mapa macro añade una puerta de disponibilidad solo para cereal silvestre y
sílex: el mapa aleatorio consulta los recursos de su región y Earth usa sus
flags regionales aproximados. Bayas, ramas, juncos y arcilla todavía dependen
solo de la adecuación del terreno local; peces dependen de la costa que deriva
el `World` actual. Las semillas de recursos y antepasados de Earth siguen
siendo zonas aproximadas, con bibliografía por semilla pendiente. Otros
recursos macro no tienen todavía un tipo de nodo local correspondiente.

Las pasadas geográficas de nodos usan corrientes derivadas de la semilla, el
mapa, la posición, la extensión y el tipo de recurso. No añaden draws a los
forks de `Simulation`. La generación clásica mantiene su ruta y orden
anteriores. Tras construir el mundo, `Simulation` descarta el adaptador y la
selección de inicio; `WorldState` conserva el objeto geográfico, pero no la
posición ni la extensión local. El `CheckpointRecord` conserva las matrices y
los nodos para continuar el motor, pero no conserva el ID del mapa ni las
coordenadas globales. Habrá que registrar esos metadatos antes de guardar o
mostrar una partida con navegación global.

Esta integración no crea pueblos, libros de comarcas abandonadas, fauna
regional ni un scheduler global. Tampoco habilita una partida geográfica con
población. La fase 30 debe dar semántica local al agua dulce y separar las
orillas potables de las saladas antes de retirar el rechazo de bandas.

Las regresiones en `local-geography.test.ts` comprueban proyección, escala,
continuidad y codec. `geographic-worldstate.test.ts` comprueba rechazo antes de
efectos de generación, recursos con y sin procedencia explícita y continuación
de checkpoint sin metadatos globales. Typecheck y 995/995 unitarios en 138
archivos pasan en la entrega integrada; la comparación de checkpoints clásicos
SHA-256 de tres semillas coincide antes/después (inicio y 180 ticks).

Registro visual, sin cambio de interfaz: gira 1/1 y e2e con 29 imágenes en
`artifacts/screenshots/m15-phase29-resources-2026-10-04-pass1/`.
La inspección de Iberia detectó un defecto heredado del atlas: relieve guardado
con origen 0° y consultado con origen −180°, más longitudes climáticas
recortadas al borde del raster. El commit separado de fuentes corrige el
generador, regenera los binarios con datos originales y añade controles de
ubicación y muestreo. La regresión de navegador ahora dibuja una ventana
ibérica real de 30×20 comarcas y conserva el checkpoint durante el render.
Los primeros dos intentos fallidos quedan en los logs; no se declaran pases.
[Contrato de la reparación](m15_phase29_atlas_alignment.md). Logs y hashes:
`artifacts/verification/m15-phase29-local-20261004-pass1/`.
