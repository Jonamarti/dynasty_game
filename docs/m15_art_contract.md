# Contrato de arte para las manos y el equipo (M15 fase 11a)

Escrito en el mismo commit que `ItemDef.hand` (fase 11a) para que quien dibuje
el arte pre-renderizado de la fase 17 — persona o agente — sepa, desde ahora,
qué tiene que poder anclar. No cambia nada del renderer actual: `Sprites.ts`
sigue dibujando solo la lista corta de hoy (`HeldItemKind`, en `render/
Sprites.ts`). Este documento es el contrato al que esa lista crecerá.

## Los puntos de anclaje que el arte tiene que dar

Cuatro, uno por hueco que puede llevar algo dibujable (`src/sim/entities/
Equipment.ts`, `SLOTS`): **mano izquierda**, **mano derecha**, **hombro** y
**espalda**. `belt` (cinturón) no lleva nada que se dibuje por delante del
cuerpo hasta que la bolsa de piel llegue en la fase 11c, así que no necesita
anclaje propio todavía — lo que lleve se dibuja como un bulto en la cadera,
igual que la cesta de hoy se dibuja pegada a la espalda.

Cada dirección del personaje (de frente, de espaldas, de perfil y su espejo —
decisión 9 del plan) necesita los cuatro puntos por separado, porque la mano
que queda «delante» cambia con la orientación.

## Qué se dibuja en cada hueco

La tabla sale directamente de `ItemDef.hand` en `src/sim/entities/Item.ts`:
`hands: 2` significa que el objeto ocupa las dos manos a la vez (no hay
anclaje de mano libre mientras se lleva), y `shoulder` marca los objetos que,
además de la mano, tienen una pose de «al hombro» cuando se cargan en esa
cantidad.

| objeto | huecos que ocupa | pose especial |
|---|---|---|
| bayas, frutos secos, bellotas, grano, harina, manzanas, peras, ciruelas, pan | 1 mano | — |
| carne, pescado, asado de carne, asado de pescado | 1 mano | al hombro con una pieza grande |
| leche, cerveza | 1 mano | — |
| sílex, arcilla, hueso, tendón | 1 mano | — |
| palos, paja | 1 mano | — |
| madera (tronco) | las dos manos | al hombro con un tronco |
| piel | 1 mano | al hombro con una piel grande |
| lanza, propulsor (atlatl), punta de hueso | 1 mano | — |
| arco | **las dos manos siempre** | — |
| hacha de mano, azuela, hacha pulida, hoz, aguja, husillo | 1 mano | — |
| armadura de piel, abrigo de piel | 1 mano (se lleva, no se viste aún) | — |
| flauta | 1 mano | — |
| cesta, red, olla, bolsa | 1 mano | — |
| carro | **las dos manos siempre**, tirando | — |

Objetos sin `hand.hands: 2` y sin `shoulder` (la mayoría) solo necesitan la
pose «llevado en una mano», reutilizable entre objetos de forma parecida
(un puñado de bayas y un puñado de grano pueden compartir el mismo gesto de
mano cerrada, por ejemplo).

## La ropa que ya lee la fase 14a

`Person.equipment` añade seis huecos corporales (`hips`, `torso`, `legs`,
`feet`, `head`, `cloak`). El renderer deriva la ropa visible solo de esos
huecos; el contenido guardado en el inventario no se dibuja como si estuviera
puesto. Los dos artículos existentes que ahora se pueden vestir usan capas de
`PersonSpec.wear` con el mismo id:

| objeto | hueco | capa del arte |
|---|---|---|
| `hide_armour` | `torso` | `art/garment/hide_armour` |
| `fur_coat` | `torso` | `art/garment/fur_coat` |

Las variantes viven en `art/src/people/rig.ts` y se materializan en la hoja
`public/art/people-*`; `npm run art:build -- people` la vuelve a generar. Cada
nuevo `ItemDef.garment` de 14c debe añadir aquí su id, slot y variante en el
mismo cambio que su lector visual. La hoja puede dibujar capas simultáneas en
huecos distintos; dos artículos del mismo hueco nunca se dibujan juntos.

## Lo que todavía no entra en este contrato

- **`HeldItemKind` en `Sprites.ts`** sigue con su lista corta de hoy (`spear`,
  `bow`, `atlatl`, `bone_point`, `handaxe`, `net`, `basket`) hasta que la fase
  17 la amplíe a cubrir esta tabla entera. Ampliarla antes sería declarar arte
  sin que nadie lo dibuje — la misma regla del proyecto que evita datos
  inertes en el árbol tecnológico.
- **El desgaste (`wear`) y la mecha encendida (`lit`)** de `EquippedItem` no
  tienen efecto visual todavía; llegan con sus lectores en las fases 14 y 12.
