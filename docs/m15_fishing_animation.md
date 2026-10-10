# M15 fase 17 — gesto de pesca

La pesca somera usa cuatro poses generadas `f0`–`f3`. El renderer las muestra
durante trabajo real de `forage` o `gather` sobre un nodo de peces alcanzado y
no agotado, solo si el trabajador está en agua somera. La mano baja hacia el
agua, recoge y vuelve; los pies permanecen plantados. El arma equipada sigue
siendo visible y viaja con el ancla de la mano.

El selector lee acción, temporizador, `workedTicks`, nodo objetivo, distancia,
vida y tipo de agua. No lee inventario ni conocimientos de otra persona, no
avanza trabajo y no añade aleatoriedad. Los cuatro fotogramas usan el mismo
acumulador limitado por la fracción de simulación que ya anima cavar, talar,
fabricar y recolectar; una pausa congela el gesto.

La fuente de poses está en `art/src/people/rig.ts`. `npm run art:build -- people`
regenera las hojas y manifiesto; `ART_POSES` obliga al test de cobertura a
verificar las cuatro direcciones dibujadas (sur, este y norte; oeste se refleja).
Las regresiones comprueban cobertura del banco, anclas finitas y distintas,
pies constantes, selección en agua somera y salida por viaje, interrupción,
muerte, agotamiento o terreno inválido.

La prueba de navegador lanza una orden de pesca con arpón equipado y captura el
trabajo activo antes de medir la captura. La imagen fechada está en
`artifacts/screenshots/m15-fishing-animation-2026-10-10/00-shallow-water-fishing-pose.png`.
El arte describe una pesca somera con alcance; los peces de otras aguas y otras
formas de pesca siguen mostrando la pose anterior.
