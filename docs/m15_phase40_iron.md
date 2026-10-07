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