# M15 phase 16b: physical house walls

The mud hut and wattle hut now occupy 4×4 tiles, the stone house 5×5, and the
longhouse 8×4. Their perimeter is blocked through the house-wall overlay in
`World`, except for one opening facing the owning band's camp anchor. Shelter and sleeping
recognize the room tiles; windbreaks and other open shelters keep their earlier
nearby-warmth rule. Material and work costs are unchanged.

When a house is completed, occupants on tiles that become walls are moved to a
walkable room tile in stable distance, y, x, then person-id order. Ruining the
house opens its wall ring. A ruined house closes it again only after full
repair. The door direction and wall-active state live on the building, so
moving camp cannot move the opening and a partly repaired ruin stays open.
Walkability below a wall is stored separately and included in terrain record
v3; digging or flooding under a wall therefore remains in effect after it is
ruined. Sleep routes through the opening and does not start until the person
reaches a room tile.

Saved building definitions are object-graph data. Definitions from before this
change have their former dimensions and no `interior` property, so they remain
open legacy shelters after load. No migration is attempted: changing their
footprint or walkability during load could displace people and alter existing
world geography. Newly constructed houses use the new dimensions and walls.

Focused coverage is in `src/sim/__tests__/house-interior.test.ts` and
`src/sim/__tests__/house-interior-lifecycle.test.ts`; it checks tile-edge
semantics, occupancy evacuation, terrain edits beneath a wall, a fixed door
after camp relocation, JSON checkpoint restoration, sleep travel, sabotage,
and repair. This records the 16b delivery only; furniture and other 16 work
remain outside this change.
