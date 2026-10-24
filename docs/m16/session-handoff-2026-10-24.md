# M16 — cierre de sesión 2026-10-24

## Lote de esta sesión

- 1.8: cierre documental `5b7273bd`; implementación `d58faae9`.
- 2.12 / A12: cierre documental `50721b42`; implementación `2b25754c`.
- 2.16 / N18: cierre documental `7384f678`; implementación `92fd53ee`.
- 1.7: se corrige `check:full` para llegar a E2E tras una matriz roja,
  conservar los códigos de fallo y usar los flags unitarios de Windows.
  Los tiempos aislados de todas las áreas siguen pendientes; la fase no se
  declara terminada. No hay cambios en juego, versión o UI.

Las tres primeras fases usan evidencias históricas del 20 de octubre, enlazadas
en sus tarjetas; no se presentan como nuevas ejecuciones. Las capturas ya
existentes se conservan.

## Verificación de 1.7

Directorio: `artifacts/verification/m16-1.7-closeout-2026-10-24/`.

- Prueba del comando anterior con npm simulado: sólo tres capas, salida 1.
- Nuevo CLI con la misma matriz roja simulada: cuatro capas, salida 1.
- Pruebas focales del orquestador y CLI: 5/5.
- Control rápido: typecheck y 9 archivos / 46 pruebas aprobadas.
- Área `objects`: 24 escenarios; 924 aprobados y 61 fallidos de 985 aplicables.
  Sus 506,31 s tuvieron carga concurrente: no son una medida aislada.
- Suite unitaria completa de esta fase, una vez para el lote final: 358 archivos
  aprobados, 2.474 pruebas aprobadas, un fallo esperado E5 y una omitida;
  salida 0, 987,27 s. Log: `unit-full.log`.

Una primera prueba del CLI heredó el npm real y arrancó verificaciones; se
identificó y detuvo únicamente ese árbol de procesos. El intento interrumpido
no cuenta como suite completa. La prueba definitiva usa un ejecutable simulado
explícito en un directorio temporal y pasa sin ejecutar capas reales.

## Siguiente trabajo

1. Completar el cronometraje aislado de `check:area` de 1.7, conservando
   cobertura y sin confundir un resultado rojo de salud con un error del runner.
2. Preparar 2.G: ejecutar el gate completo, comparar su matriz con
   `artifacts/verification/m16-baseline/matrix.json`, explicar cada transición
   PASS→FAIL/PASS→n/a, y correr `band` y `century` con 20 semillas, serialmente.
3. Escribir `baseline-2.md`, reconciliar los A abiertos y guardar un recorrido
   nuevo de capturas de etapa. 14.3 depende de este gate; no se ha iniciado.

Antes del gate, revisar el E2E heredado de antorchas documentado en `bugs.md`:
no consigue colocar su hoguera; no se arregla cambiando la regla de colocación
sin investigar el montaje.

La auditoría documental también encontró cierres no reflejados en el triage:
A3/N6/E4 tienen capacidad, unidad y E2E en 2.3 (`65a5333e`); A4 y la parte de
rechazo de N8 tienen capacidad y unidad en 2.4 (`e8ba1754`). N8 sigue teniendo
trabajo autónomo de equipo en 6.3. No cerrar N20 como causa corregida: el reporte
de desaparición no se reprodujo.

No usar los logs de diff antiguos como comparación formal contra 0.1:
`m16-2.3/after/baseline-diff-final.log` compara con 2.27, y
`m16-2.4/baseline-diff.log` sólo contiene el error de uso. El gate debe producir
su comparación explícita contra la referencia correcta.

Las capturas históricas M15 modificadas, `docs/notes_for_m15.txt` y el handoff
sin seguimiento del 18 de octubre eran cambios anteriores a la sesión; se
conservan fuera de los commits nuevos. No hacer push: lo realiza el propietario.
