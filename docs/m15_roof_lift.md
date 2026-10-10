# M15 fase 16c — exposición del interior

Las cuatro viviendas con `BuildingDef.interior` tienen superficies generadas
además de su fachada/tejado habitual: suelo y anillo de muros con una abertura
por cada orientación de puerta. `Renderer` elige el lado guardado por la casa,
dibuja suelo y perímetro detrás de habitantes y muebles, y vuelve a dibujar la
pared delantera con los edificios altos, para que oculte a quien esté detrás.
Los suelos y muros usan los límites enteros de los tiles que bloquea la
simulación. Antes de usarlos, el renderer verifica que el edificio tenga
interior y que las dimensiones del arte coincidan; así los datos guardados con
huellas antiguas no reciben una planta estirada. El arte se produce desde
`art/src/buildings/buildings.ts` y entra al atlas con
`npm run art:build -- buildings`.

El tejado se aparta cuando el jugador o la persona seleccionada está en una
casilla de interior según `houseInteriorContains`, el cursor está sobre la
huella (`Building.contains`) o se activa la vista global con `V`. Los muros del
perímetro no cuentan como interior para el personaje; el cursor sí cubre toda
la huella para que la casa siga respondiendo aunque el puntero esté sobre un
muro. La prueba no cambia `hitRadiusOf`, selección, coordenadas de edificios ni
anillo de propiedad.

`Z` conserva el atajo de niebla de guerra y el botón de HUD sigue disponible.
La ayuda y la clave se traducen con `t()`. Pausar congela la simulación, pero
permite mover el cursor y usar `V` sin afectar el mundo.

La e2e cubre ocupación real, puerta orientada por `houseDoor`, hover, `V`,
huella antigua, reposo con pausa y cierre del tejado;
las capturas cronológicas están en
`artifacts/screenshots/m15-roof-lift-2026-10-10-final/`.
