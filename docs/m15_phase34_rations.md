# M15 fase 34 — retirar raciones de alimentos físicos

2026-10-09. `ComarcaInventoryTransfer.consumeRations` convierte una demanda
explícita en retiradas de los alimentos tipados que ya posee el escrow. El
coordinador proporciona la prioridad completa de pares `sourceId`/`itemId`:
cada stack nutritivo aparece una vez, sin un orden alternativo implícito. La
validación comprueba toda la lista, incluso con demanda cero o después de
cubrirla; una fuente desconocida, un duplicado o una omisión no consume nada.

Una ración sigue siendo `RATION_NUTRITION` puntos de nutrición. Las retiradas
admiten las cantidades fraccionarias de `Inventory`, cobran primero la fuente
indicada y devuelven cantidades, nutrición consumida y déficit real. Materiales
y grano crudo no pagan raciones. El carry de pudrición sigue la semántica de
`Inventory.remove`: retirar comida no rejuvenece el resto ni borra un carry
huérfano. Antes de mutar se comprueban todos los incrementos de versión,
incluidas varias retiradas de un mismo inventario.

El informe diario compacto distingue producción consumida de retirada de
reservas: el puente debe descontar `withdrawn`, no todo `consumed`, del stock
físico anterior. Las pruebas ejercitan esa conciliación con producción cero,
la escasez, prioridades distintas, validación atómica y retorno JSON. El
redondeo no autoriza cobrar más nutrición que la pedida ni una retirada tan
pequeña que el stack físico no pueda representarla.

Este contrato no ingiere comida en los cuerpos ni contabiliza hidratación,
macros o veneno. Una prioridad nutritiva tampoco demuestra que un alimento sea
seguro. Aún falta materializar producción/almacenamiento nuevos con tipos
explícitos, liquidar consumos durante una jornada incompleta y enlazar autoridad,
reloj y reservas. `Simulation` no activa el puente y la fase 34 sigue abierta.
El JSON continúa siendo dato detached: no deduplica dueños persistidos.

Verificación y captura del hito se registran en `docs/changelog.md`.
Cohortes económicas y matriz pesada diferidas por AGENTS.md; no se afirma
mejora económica.
