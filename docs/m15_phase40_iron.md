# M15 fase 40a — `bog_iron`

Primera entrega de la fase 40 (M8.4); la fase sigue abierta. Añade `iron_ore`, su
recolección y la tecnología que la habilita. No incluye `bloomery`, `forging`,
`carburising`, `iron_tools`, `ploughshare`, herramientas ni recetas posteriores.

`bog_iron` requiere `mining` y `smelting`, pertenece al dominio Metal y es el
primer nodo de la era `iron`. Sin minería, tanto `Simulation.order` como la
acción de cosechar respetan el gate de `ResourceDef.requiresTech`; el menú
muestra el motivo traducido. La definición del recurso se suma al final de las
tablas para preservar índices existentes. El nodo mineral no regenera.

La generación tiene una pasada independiente tras `spawnPeople` y un `ironRng`
añadido después de `oreRng`, en el punto real de append documentado en
`AGENTS.md`. En `legacyIsland`, el recurso se coloca sobre playa y la selección
comprueba `shoreHash`. En mapas geográficos, al no existir todavía humedal en
Atlas/`WORLD_FEATURE`, se usa como proxy humedad local alta junto a una orilla
dulce. Este proxy hace que el recurso sea jugable y reproducible, pero no prueba
que las celdas correspondan a turberas reales; no se cambiaron datos de Atlas ni
`SOURCES`.

Las pruebas de `metal.test.ts` cubren requisitos, era, emplazamiento clásico,
proxy de mapa, no regeneración, gate/feedback visible y recolección por un minero
que conoce la técnica. `e2e/phase40-bog-iron.spec.ts` captura el rechazo del menú
en español. Captura: `artifacts/screenshots/m15-phase40-bog-iron-2026-10-07/`.

Pendiente para continuar la fase: lupia y bloomery, forja, carburización/acero,
herramientas de hierro y arado; revisar las seis puertas del plan y añadir sus
checks contra el build anterior al nodo correspondiente. Los humedales
geográficos explícitos también quedan como deuda de datos, documentada en
`bugs.md`.

## 40b — `bloomery`, la lupia

`bloomery` requiere `bog_iron` y `bellows`, vive en la sub-red Metal y da la
receta `smelt_iron` en el horno de fundición existente. Dos unidades de
`iron_ore` y una de `charcoal` producen una `iron_bloom` (lupia), con la
habilidad `smith`, 120 `workTicks` y stock objetivo `keep: 2`. Cantidades,
tiempo y stock son supuestos de diseño; no son rendimientos históricos medidos.
La lupia conserva escoria: el hierro forjado y sus herramientas esperan a 40c.
Su valor permite regalo, robo y trueque mientras llega esa siguiente receta.

Los lectores son el catálogo de recetas/órdenes, `doCraft` y la búsqueda
recursiva de ingredientes de `Ore.wantedOreKinds`. El ejecutor existente
comprueba el conocimiento, el carbón/mineral y el horno, comunica los motivos
de parada y guarda el trabajo para retomarlo tras una necesidad urgente. No
se añade estación, sistema, fork ni pasada de spawn.

El escenario corto `ironsmiths` proporciona un herrero experimentado (70), una
carga, el conocimiento y un horno terminado, y emite una orden real de fundir. Su único check,
`iron-ore-becomes-bloom`, falló antes de añadir el nodo: una carga disponible,
cero fundiciones (1/1 FAIL). No se considera n/a en ese fixture. Las pruebas
quitan también la receta para mantener esa sensibilidad. Los mundos sin una
oportunidad de fundición siguen dando n/a. Es una prueba del mecanismo con
orden; no prueba producción autónoma ni la cadena económica del hierro.

Pruebas: `bloomery.test.ts` y `iron-check.test.ts`; interfaz/capturas:
`e2e/phase40-bloomery.spec.ts`, en
`artifacts/screenshots/m15-phase40-bloomery-2026-10-07/`.
Verificación final registrada en el changelog. Las cohortes y la matriz completa
siguen diferidas por el propietario hasta finalizar M15. La fase 40 sigue
abierta: `forging`, `carburising`, `iron_tools`, `ploughshare` y las puertas de
los nodos restantes.

Hallazgo de calibración para M16: el test de difusión de pueblos pasa de
0,32 en 40a a 0,43 con el nuevo nodo (límite < 0,4). Es una regresión nueva;
se conserva la tasa y la aserción sin ajuste. Detalle en `bugs.md`.

## 40c — `forging`, el hierro forjado

`forging` requiere `bloomery` y pertenece a la sub-red Metal. La receta
`forge_iron` convierte una `iron_bloom` en una `wrought_iron`, usando `smith`
en la nueva estación `anvil`, con 140 `workTicks` y stock objetivo `keep: 2`. El conjunto de estación incluye un yunque y
un martillo de piedra: no exige hierro forjado para producir el primer hierro
forjado. No se añade un martillo equipable ni un requisito de herramienta
consumible. La conversión uno a uno y el coste de trabajo son supuestos de
diseño; no representan una medición histórica del rendimiento metalúrgico.

La ejecución reutiliza las órdenes, ingredientes, interrupciones, progreso y
motivos de parada de `doCraft`. La banda reconoce el yunque mediante la lista
común de estaciones y recetas. No se añade RNG, spawn ni lógica de LOD.
El yunque y el hierro tienen fuentes en `art/src/`; los atlas se regeneran.

La entrega cubre la estación y el material de forja. Las herramientas de
hierro corresponden a `iron_tools`; siguen pendientes `carburising`,
`iron_tools` y `ploughshare`. No se afirma producción autónoma sostenida ni
mejora económica: las cohortes y la matriz completa se difieren por la
instrucción vigente de M15.

El yunque ocupa 2×2 casillas, cuesta ocho sílex y cuatro palos y necesita 160
`workTicks` de construcción con progreso guardado por el edificio. El taller
no representa temperatura ni recalentados del metal. Estas cantidades también
son supuestos de diseño.

Pruebas: `forging.test.ts` cubre la orden, negativas de estación/materiales y
conocimiento, y sed urgente con progreso guardado y reanudación. Las cuatro
pruebas iniciales fallaron en el build anterior por ausencia de las definiciones.
`forging-check.test.ts` comprueba una carga suministrada por `forgers`; quitar
la receta hace fallar `iron-bloom-becomes-wrought-iron`, sin convertirlo en n/a.
Capturas en español del nodo y el resultado junto al yunque:
`artifacts/screenshots/m15-phase40-forging-2026-10-08/`.

Verificación final: TypeScript limpio, 199 archivos y 1.557 pruebas unitarias pasan (1 omitida); check forgers 1/1 y navegador focal 2/2. La suite global de navegador terminó 108/109 antes de corregir el fixture de captura de forja; el detalle de la repetición focal consta en el changelog. El sim:check ordinario mantiene los fallos previos de antojos y rendimiento.
