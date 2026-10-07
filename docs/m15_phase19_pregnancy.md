# M15 fase 19 — El embarazo

Plan: `m15_plan.md` fase 19 (que hereda `m14_plan.md` fase 5). Esta nota recoge
lo decidido al hacerla y lo medido, una sección por commit.

## 19a. Los tres tercios, el paso y el veto

**Un solo lugar:** `src/sim/entities/Pregnancy.ts`. `trimesterOf(person)` lee
cuánto de `gestationDays` ya se gastó (`gestationLeft` baja desde ahí) y da 0
(no embarazada), 1, 2 o 3; está acotado, porque los tests y los guardados
anteriores ponen `gestationLeft` a mano fuera del tramo. `gestationDays` se
mudó aquí desde `LifeSystem` (que lo reexporta) para medir los tercios contra el
mismo plazo que el parto, sin ciclo de importaciones.

**Qué cambia en cada tercio**

| Tercio | Paso | Tareas pesadas | Carga |
|---|---|---|---|
| 1.º | 1 | permitidas | normal |
| 2.º | 0,85 | permitidas | normal |
| 3.º | 0,7 | vetadas (`HEAVY_ACTIONS`) | solo puñados: ni brazadas ni hombro |

- **Paso:** `MovementSystem.speedOf`, el paso que comparten el camino de los PNJ
  y las teclas del jugador, multiplica `pregnancyPace`.
- **Carga:** `Carry.freeArms` nunca pasa de un brazo para quien `handfulsOnly`,
  y `itemCapacityFor` le quita el hombro. Es decir: la leña (que se lleva a
  brazadas o al hombro) queda en 0 y la carne en el puño. `Simulation` cuenta
  media «ocupación» más en `armsTakenLastTick` para que el cambio de tercio, que
  ocurre a medianoche sin tocar el inventario, dispare la reconciliación y suelte
  lo que ya no cabe (si no, la brazada de la víspera se quedaría en sus brazos).
- **Veto:** `Brain` filtra la tabla ya terminada, como hace con los niños:
  una regla sobre todas las rutas que puntúan un verbo. La lista —`hunt`,
  `chop`, `build`, `attack`, `spar`, `sabotage`, `restrain`, `drag`— es un
  `Set` en `Pregnancy.ts`; lo permitido es todo lo demás (`forage`, `gather`,
  `pick`, `craft`, `talk`, `teach`, `sow`, `reap`...), de modo que un verbo
  futuro nace permitido y alguien decide si deja de estarlo.

**Discrepancia plan/código.** El plan habla de «una propiedad de `ActionDef`».
No existe tal tipo: una acción en este proyecto es una cadena y sus reglas viven
en conjuntos junto a quien las pregunta (`CUT_OFF_AT_ONCE`,
`YOUNG_CHILD_ACTIONS`). `HEAVY_ACTIONS` es ese mismo patrón, en un solo archivo,
y lo leen los tres consumidores. Anotado en `bugs.md`.

**`attack` también.** Una embarazada del último tercio acorralada no se defiende
a golpes: huye si puede y se encoge si no. Es lo que dice el plan y lo que mide
`the-pregnant-are-spared`; si el propietario prefiere que la defensa propia sea
la excepción, es una línea en el filtro de `Brain`.

**Pruebas:** `src/sim/__tests__/pregnancy.test.ts` (tercios, paso 0,85/0,7 en
`speedOf`, lista, carga y un mundo de doce personas con todas las mujeres
retenidas en el último tercio: ninguna empieza una tarea pesada; **sin el filtro
la misma prueba falla**: cuatro `spar`).
