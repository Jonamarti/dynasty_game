# M15 fase 34: hidratación compacta compartida

CompactBandRuntime.fromRecord(record, services, sharedState?) admite IdSpace, peopleById, householdsById y RelationshipGraph compartidos por el coordinador. Valida el roster propio de cada banda antes de instalar las referencias. Si no se suministra estado compartido, conserva el contrato previo del motor individual.

Dos bandas que reanudan en la misma medianoche deben usar exactamente el mismo asignador: conciliar snapshots después de ambos nacimientos no evita que ya hayan producido el mismo ID. La nueva prueba en compact-band-runtime-integration.test.ts provoca ambos nacimientos, verifica IDs distintos y comprueba que los niños y vínculos quedaron en los mapas compartidos. Conjunto focal: 7/7.

Es un seam de autoridad para el coordinador de fase 34; no afirma correspondencia económica calibrada. Cohortes y matriz aplazadas según AGENTS.md.
