# M15 fase 34: cruzar, explorar y volver

2026-10-09. leave_comarca y scout caminan al borde elegido. Cada tick comprueba interrupciones; follow_me sigue a un compañero vivo de la banda mediante Simulation.command y su autoridad normal. La salida espera a todos los seguidores que aceptaron y transporta también a los dependientes cargados. Viajan personas e inventarios llevados; edificios y reservas del campamento permanecen en su comarca.

WorldState procesa la llegada al terminar el tick. Prepara copias de ambas comarcas y del mundo de pueblos, valida los checkpoints y publica los asignadores antes del cambio de propietario. El antiguo motor pierde autoridad: una referencia antigua no puede seguir ejecutando step. Solo la salida del jugador cambia la comarca mostrada; una emigración de NPC deja al jugador en su comarca. El destino entra por el borde opuesto. El lugar conocido de cada comarca conserva su propio PlaceMemory, mientras WorldKnowledge acompaña a la identidad.

ComarcaFrontier guarda los checkpoints aparcados, la solicitud pendiente, los tickets de exploración, las memorias locales y la continuidad de streams compactos/ecológicos. Raíz WorldStateRecord v4; carga raíces v1-v3 y fronteras anteriores. Los residentes se materializan desde cohortes reales de PeopleWorld al entrar en una nueva región, se descuentan de ella y se registran en away. Reentrar usa sus IDs existentes. Nacimientos y muertes actualizan las cabezas materializadas; un embarazo ya concebido mantiene al padre en otra comarca.

scout deja al explorador en el runtime compacto de la vecina durante dos días, conservando la comarca de origen como motor actual. Solo el regreso vivo registra lo visto y los pueblos encontrados y publica el aviso traducido. Un explorador muerto no revela el destino; si era el jugador, el hogar recibe su archivo y la sucesión. Se guarda/carga una expedición a mitad de jornada sin redibujar población ni reiniciar la alimentación de los residentes. El retorno actualiza la comarca aparcada hasta el reloj global y conserva nodos agotados, reservas, terreno y ruinas.

La deliberación diaria conserva la prioridad agua, hambre sostenida, vecino conocido más fuerte y hostil, sobrepoblación y destierro. Solo considera destinos conocidos por el proponente; sin ellos pide explorar. Proponer utiliza el mismo consenso y autoridad que la IA. Una emigración parcial aprobada puede formar una banda hija con parentesco intacto y standing inicial 60; un viaje individual conserva la banda.

Pruebas: comarca-travel.test.ts verifica bordes, negativas visibles, esperas/interrupciones, autoridad retirada, reentrada, JSON parcial, exploración viva/muerta, conservación de cohortes, parentesco y el control corto the-thirsty-leave con agua como negativo. comarca-migration.test.ts comprueba la fisión real. Son controles deterministas de mecanismo; la cohorte con mapa y la calibración económica se aplazan por AGENTS.md.

La presentación incluye controles persistentes para salir, explorar y proponer por cada borde, el pedido Seguidme y todos los textos en inglés/español. main actualiza motor, renderer, mapa, cámara, selección, menús y caches al cambiar de propietario. e2e/comarca-travel.spec.ts incluye dos pruebas de controles y una llegada con el coordinador real; su fixture solo completa el paseo hasta el borde. Capturas iniciales en artifacts/screenshots/m15-phase34-travel-2026-10-09T-01 y T-02; primera llegada real en T-03. La verificación final registra una nueva revisión sin sobrescribirlas.

## Presentación final — 2026-10-09

Capturas nuevas de controles ingleses, controles españoles y llegada real: artifacts/screenshots/m15-phase34-travel-2026-10-09T-04/. Revisada visualmente la pantalla en español. La spec forma parte de npm run e2e y genera una carpeta fechada nueva por defecto, para no sobreescribir hitos anteriores. main cambia la referencia de motor solo después del commit de WorldState y limpia selección/modos/caches antes de dibujar la nueva comarca.

Cierre: [informe de verificación](m15_phase34_verification_20261009.md). Gira final y capturas de la funcionalidad en artifacts/screenshots/m15-phase34-close-2026-10-09T-05/.
