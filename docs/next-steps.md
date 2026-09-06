# Next steps

Written 2026-09-02. Ordered, with the reason for the order.

## 0. Food supply — the remaining half of the winter problem

The distribution half is done (2026-09-02): mean survival across ten seeds went
from 40% to 59% and nothing collapses any more. See
[changelog.md](changelog.md), and measure with `npm run sim:seeds` rather than a
single run — one `century` is too chaotic to read.

What is left is supply, and it is a design decision rather than a tuning one.
Deaths are now 99 adults to 40 infants across ten seeds, so handing food around
differently cannot help: there is not enough of it. The candidates, in the order
they seem worth trying:

1. **Make hunting matter.** It is currently a garnish — a 3,000-step run
   produces about three kills — and it is the one food source that does not stop
   existing in winter. Herd density and the `sightRadius * 1.5` quarry search
   are the two knobs, and `Animal` already carries the hooks for a deeper pass.
2. **Give the wood a winter role.** Hazelnuts already never spoil
   (`spoilTicks: 0`). An autumn glut that is worth deliberately storing is the
   most thematically apt answer to February that this world has.
3. **Slow the birth rate under pressure.** `LifeSystem.tryConceive` already
   scales with the mother's hunger; it may simply be too weak. This is the
   cheapest lever and the least interesting one.

Do **not** approach this by tuning `interruption()` or the scorer's food
weights. That ground is covered and the measurements are in the changelog,
including two things that were tried and made it worse.

## 1. M6b — depth

Deferred out of M6a deliberately, and still the right next content pass.
**Phase 1 landed 2026-09-05** — see [changelog.md](changelog.md). The tree is a
registry with an enforced "every node does something" rule, `techPower` is the
single seam every effect reads, `intelligence` and `industriousness` are in, and
the longhouse is buildable for the first time. What is below is what remains.

- **A real tech tree**, ~22 nodes with prerequisite chains, and accumulating
  research fed by `intelligence` and personal interest. *Ten nodes so far.* The
  research lifecycle — conceive, research through thought and conversation,
  prototype, test, refine — is phase 2 and is the next thing to build.
- **Knowledge that travels four ways**: explaining to an adult, teaching
  children (children currently cannot be taught at all — `Brain` filters them
  out of the pupil list), observation, and writing it down, with writing
  discovered as a technology and arriving first in stone. Phase 3.
- **`industriousness` and `intelligence` as trait axes.** Rebelliousness stays
  *derived* from `loyalty` — two knobs for one behaviour is how a scorer becomes
  untunable.
- **Weapons**, with a term in `doAttack`.
- **A jobs tab** biasing the scorer, with rebellion rolled through
  `social/Authority.ts`.
- **Two visualisers**: a family tree from `motherId`/`fatherId`/`spouseId`, and
  a tribe as an opinion-weighted graph. Both are now worth building in a way
  they were not before M6a, because there are actually families to draw.

## 2. Wildlife, second pass

The hooks are already in `Animal`: `temperament` and `fedBy` exist and do
nothing, which is deliberate — adding them later would be a migration.

- Herbivores that graze real forage and carnivores that hunt them.
- Predators that will take a person, which is the first thing that makes the
  wilderness dangerous rather than merely empty.
- Taming by feeding, reading `fedBy`.
- Animals remembering who fed or hurt them.

Also fold in the tuning [bugs.md](bugs.md) records: hunting is currently too
rare to matter, and the quarry search radius and herd density are the two knobs.

## 3. M7 — A\*, walls, interiors, beds

`World.isWalkable` is the single chokepoint walls insert behind.

**This lands alone.** The greedy steerer has already produced two of the worst
bugs in this project's history, and replacing the movement system every agent
uses every tick must not share a milestone with anything else. Note that M6a
made animals share `moveToward` with people, so A\* has two callers now, not
one — which is an argument for the shared function and a reason to be careful.

Gates before it is called done: `paths-are-found`, `nobody-walled-in`,
`people-on-land`, `perf-budget`.

## 4. Dynamic tiles

Shovels, canals, moved dirt, defensive trenches, piled rock.

The architecture note worth having written down: `World.walkable` and
`World.biome` are already `Uint8Array`s behind accessors, so mutating a tile is
easy. The expensive part is `World.region`, the flood-filled landmass index
that keeps people from walking at food across water. Any tile change needs
incremental region repair — and that is exactly the machinery M7's walls need.
Build it once in M7 and digging becomes content on top of it.

## Longer-standing gaps, still open

- **No raids or feuds between bands.** Bands have norms, chiefs, territory of a
  sort and standing with each other, but nothing organises a party to go and
  take something from the neighbours.
- **Farming is declared but inert.** It is the last tech and the gate on the Age
  of Sowing, and reaching it changes nothing on the ground.
- **Exile is a one-way door**, and currently never fires at all.
- **No simulation LOD.** Everyone is simulated in full detail.
- **Crafting is a stub** beyond the hand axe.
- **Nobody plants a tree.** Bands fell timber when a site needs it, but no one
  has a reason to leave a stand standing for their grandchildren.
