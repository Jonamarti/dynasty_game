# M15 28 — Registros de identidad, primera entrega

2026-10-03. `src/sim/persistence/EntityRecords.ts` aporta un codec v1 inerte
para `PersonRecord`, `HouseholdRecord` y `BandRecord`. No activa simulación
compacta o guardado de partida. La asignación de identidad del motor se describe
en [m15_phase28_ids.md](m15_phase28_ids.md).

## Contrato

`toPersonRecord(person, lastAdvancedTick)`, `toHouseholdRecord` y `toBandRecord`
copian el estado propio a un grafo serializable como JSON. La marca de avance
la entrega el llamante: ha de ser un tick entero no negativo, común a los
registros de una misma transición. El codec no adelanta el reloj ni resuelve
acciones pendientes.

`fromPersonRecord(record)`, `fromHouseholdRecord` y `fromBandRecord` reciben
`unknown`, comprueban versión, tipo, referencias, prototipos y estado base
requerido, y reconstruyen una entidad independiente. No registran esa entidad
en `Simulation`, no llaman a constructores y no consumen IDs ni RNG. El llamante
conserva la marca del sobre para el scheduler posterior.

El grafo mantiene Map, Set, typed arrays, orden de campos/entradas, ciclos y
referencias compartidas. Esto preserva el vínculo entre los registros privados
de `PlaceMemory` y sus índices espaciales, además de los contadores y cachés
actuales de inventario. No se copia una segunda referencia al objeto original.

Persona incluye parentescos, embarazo, equipo/desgaste, inventario, cuerpo y
condiciones, creencias, memoria, mapa personal y saber de estaciones, técnicas,
ideas y refinamientos; también órdenes, ruta, destinos, trabajo banked y ánimo.
A diferencia de la propuesta antigua de M14, aquí no se pierde la acción en
curso. Hogar mantiene miembros, hogar físico, renombre, feud y contabilidad.
Banda mantiene los campos que hoy posee, incluidos normas, jefe y campamento.

Los tags de prototipo son explícitos y estables ante minificación. Se conserva
Infinity/-Infinity escalar (por ejemplo, la fecha inicial del último banquete)
y se rechaza NaN, typed arrays no finitos, clases no registradas y funciones.
La excepción conocida es el callback privado `Beliefs.onNewBelief`: no se
serializa; se vuelve a ligar al `Person` reconstruido para que una nueva
creencia refresque su curiosidad y no la del original.

## Evidencia y alcance pendiente

Tres pruebas focales comparan el snapshot completo tras JSON y rehidratación,
ejecutan métodos reales, verifican cambios independientes, referencias de
índices y un ciclo, y comprueban las siguientes identidades y draw sembrado.
Los controles negativos rechazan versión desconocida, inventario ausente,
identificador inválido, referencia colgante, fecha inválida y funciones.
La suite completa de esta pasada incluye estos casos y el determinismo.

No es todavía un formato de partida con migraciones ni un registro compacto.
La validación de forma no sustituye la consistencia entre entidades. Los grafos
de opiniones y `BandRelations` ya tienen codecs independientes en
[m15_phase28_social.md](m15_phase28_social.md). `RosterRecords` ya compone estos
registros y valida tick, pertenencias y aliases sin registrarlos en el motor;
conserva el archivo de fallecidos y la lista activa separadamente. Contrato en
[m15_phase28_roster.md](m15_phase28_roster.md).
`IdSpace` ya controla la creación de entidades/eventos por mundo,
incluidas ahora bandas/manadas mediante su checkpoint v2. Antes de integrarlo quedan libros
de edificios/recursos, RNG del mundo y agendas; transferencia de autoridad
sin duplicar personas o bienes y calendario de avances. `Knowledge` continúa
siendo la única vía para exponer estado a la interfaz: rehidratar no concede
conocimiento. La fase 28 y el LOD de la 32 permanecen abiertos.
