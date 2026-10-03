# M15 fase 17 — gesto de cavar

El renderer muestra cuatro fotogramas `d0`–`d3` mientras una orden real de
cavar está trabajando en su objetivo. La herramienta seleccionada por el
simulador queda anclada a la mano; el bastón primitivo tiene una imagen propia.
El gesto usa los mismos criterios de presentación que la recolección: persona
viva, acción activa, temporizador de trabajo, objetivo alcanzado y fracción de
reloj acotada. La selección no adelanta el trabajo ni modifica el mundo. Al
viajar, morir, interrumpirse o no tener un objetivo válido, vuelve a la pose
normal.

La fuente editable está en `art/src/people/rig.ts`; `npm run art:build` regenera
las hojas y manifiestos. `npm run art:sheet` produce
`artifacts/art/contact-dig.png`, que muestra las cuatro direcciones, las cuatro
fases, ropa, bastón, pala, niño y anciano.

## Verificación

- `npm.cmd run typecheck` — pasa.
- `npm.cmd test -- --maxWorkers=1 src/render/__tests__/work-animation.test.ts src/render/__tests__/art.test.ts` — 21/21 pasan.
- `npx.cmd playwright test e2e/dig-animation.spec.ts`, con `DYNASTY_PORT=5399` y `DYNASTY_CAPTURE_DIR=artifacts/screenshots/m15-dig-2026-10-03-final-pass1` — 1/1 pasa. La prueba ordena cavar por `sim.order`, avanza el motor hasta comenzar trabajo, pausa, verifica que reloj/progreso/terreno queden inmóviles al dibujar, captura los cuatro golpes y comprueba que cancelar la orden quite el gesto.
- La línea base anterior a estos cambios en `npm.cmd run sim:check` fue 2/131: `cravings-steer-the-diet` y `perf-budget` (688 pasos/s frente al suelo de 1.678). La presentación no cambia la simulación.

Capturas de la partida: `artifacts/screenshots/m15-dig-2026-10-03-final-pass1/`.
