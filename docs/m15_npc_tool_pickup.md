# M15 phase 11d: NPCs collect tools for work

The `Brain` may score `pickup` for an axe or weapon left in a nearby pile when
the person already has a concrete chopping or hunting opportunity and lacks a
usable tool for that work. Candidate piles come from `pileHash`, must be in the
same region, must pass `mayTakeFromPile`, and the item must fit the person's
current carry limits. The scorer only considers tools whose use the person
knows; the normal pickup action still performs the transfer and records the
handled item. Food, construction materials and tools feed one `pickup` row; its
score and target belong to the same winning candidate. An axe uses the chop
opportunity score, and a weapon uses the hunt score. It does not create a
standing tool-hoarding motive.

Once collected, the existing `ActionSystem` preparation path equips the tool
for the work and keeps its setup delay, arm checks, property accounting, and
drop behavior. A weapon that needs two hands is not offered to someone whose
remaining arm capacity cannot use it.

## Verification

`npc-pickup.test.ts` verifies that an eligible spear pile outranks the matching
hunt opportunity, that an NPC autonomously picks it up and equips it before
hunting, that the item remains conserved, and that an unknown spear is not
selected. It also checks that axes cannot borrow hunt score, weapons cannot
borrow chop score, and one-handed capacity rejects a bow. `tool-equipment.test.ts`
continues to cover other equip and work setup cases. This fixture proves the
local decision/action sequence; it does not establish how often the route fires
in a full world or scenario.
