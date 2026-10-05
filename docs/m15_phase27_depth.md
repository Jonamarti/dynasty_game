# M15 27a — El agua tiene fondo

2026-10-05. `World.depthAt` lee la superficie del agua y la altura actual del
fondo, incluido el relieve excavado. Devuelve cero fuera del mapa y cuando el
suelo está sobre el nivel del agua. No clasifica por sí sola el bioma: una
hondonada seca puede estar bajo el mar sin estar inundada. Los umbrales están
en unidades de elevación en `Config.world`, como el
nivel del agua: con 400 metros por unidad, `.002` equivale a 0,8 metros y `.008`
a 3,2 metros. La igualdad pertenece a la clase más profunda.

El renderer usa esos mismos umbrales para distinguir agua somera, de nado y
honda. La textura sigue siendo un hash de coordenadas, sin draws ni reloj de
animación nuevo. El cambio de color se aplica al terreno horneado; las obras
de tierra vuelven a hornearlo mediante `earthVersion`.

Esta primera funcionalidad observa el fondo y no cambia la caminabilidad. El
vadeo, la pesca y la natación se entregan en commits posteriores de la fase 27.
La regresión de navegador examina los píxeles del terreno real, comprueba tres
colores y que pintar el mundo pausado no avanza el reloj.

Captura de la costa:
`artifacts/screenshots/m15-phase27-depth-2026-10-05-pass2/01-coast-depth.png`.
La verificación conjunta y el coste de la fase se registran al terminar la
integración en el changelog; la matriz heredada ya estaba roja.
