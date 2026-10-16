# M15 fase 17 — estados visibles de cuidado infantil (2026-10-16)

La integración de renderer ya presenta al bebé como la misma entidad `Person`
en sus estados básicos de suelo, brazos y lactancia. El sprite conserva edad,
sexo, tono de piel, ropa y expresión propios. Componer o dibujar estos estados
no avanza la simulación ni consulta el hambre, inventario o salud del bebé.

- Un bebé no cargado usa la pose `L0` despierto y el ciclo `e0..e3` solo cuando
  `action === 'sleep'`; las capas generadas de suelo y manta se muestran detrás
  y delante de la figura real. La fase de sueño sigue su reloj explícito.
- Un bebé con `carriedBy` usa su pose horizontal propia y los brazos de carga
  del portador. El atlas suprime su bebé genérico superpuesto para evitar una
  segunda figura. El sprite del portador y el del bebé conservan sus propios
  datos visuales.
- Lactar requiere acción `nurse`, objetivo vivo que siga siendo infante,
  `workedTicks > 0`, alcance real de la acción y que otro adulto no lo lleve.
  Durante la caminata la pareja no se compone como si estuviera junta.
- Las cinco familias principales (talar, cavar, recolectar, fabricar y pelear)
  ya tenían selector de gesto y pruebas; la auditoría registra su estado aparte.

La prueba Playwright fuerza estados sobre personas de la simulación pausada,
observa los aspectos que realmente dibuja el renderer y guarda cuatro
capturas. Antes/después compara el registro de checkpoint, incluidos los
streams: las cuatro operaciones de dibujo mantienen el mismo estado.
`work-animation.test.ts` más `infant-care-animation.test.ts` cubren la selección
de poses y capas generadas. Verificación focal de esta pasada: typecheck y seis
pruebas unitarias pasan; la prueba E2E específica pasa 1/1.

## Alcance que continúa abierto

El renderer todavía no distingue superficies reales bajo el bebé. Usa el arte
generado de suelo tanto al aire libre como dentro de una casa; las variantes
generadas `mat` y `cradle` siguen sin una entidad de simulación que indique
dónde está colocado el bebé. No se muestra una cuna ficticia. La cobertura del
contrato completo de fase 17 (suelo, esterilla y cuna, despierto/dormido) sigue
abierta hasta conectar superficies observables. La fase 17 no se declara
completa con este avance.

Las poses añaden cinco códigos a cada combinación de edad, sexo y dirección
bakeada (150 dibujos fuente: 5 poses × 5 edades × 2 sexos × 3 direcciones).
`npm.cmd run art:build -- people` produjo tres hojas con unos 10.582.000
píxeles combinados (redondeados al millar) y 13.806.879 bytes PNG. Las hojas
anteriores sumaban 12.874.651 bytes, por lo que el crecimiento comprimido
compartido es 932.228 bytes
(7,24%). Esto mide los archivos de atlas compartidos, no heap JS, memoria del
proceso en ejecución, GPU ni FPS. `art.test.ts` verifica manifiesto, poses y
consistencia del arte generado.
