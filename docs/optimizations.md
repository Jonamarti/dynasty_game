# Performance

Measured 2026-09-02 on the machine this was developed on. Numbers come from
`npm run sim:check`, which prints steps/s at the top of every report and asserts
a floor in `perf-budget`.

## Where it stands

| scenario | people | steps/s |
|---|---|---|
| tiny | 8 | ~10,000 |
| band | 31 | ~4,200 |
| crowded | 60+ | ~3,400 |
| century | falling to ~16 | ~8,900 |
| harsh-winter | ~30 | ~6,100 |

The floor asserted by `perf-budget` is 2,000 steps/s. The browser runs at 5
steps/s by default, so there is roughly three orders of magnitude of headroom
for the current world size — the number matters for the *harness*, which is the
fast feedback loop, not for the game.

**M6a cost about 35% of the band scenario's throughput**, from ~6,500 steps/s to
~4,200. That is the price of ~50 animals moving and being indexed every step,
plus a larger and more entangled population. It was not optimised away because
there is no pressure yet, but it is the first regression of its size in the
project and it is worth knowing about before the next one lands on top of it.

## Optimisations already in place

These are the reasons the simulation is fast, and each is load-bearing.

**Spatial hashes for every proximity query.** `peopleHash`, `nodeHash`,
`treeHash`, `pileHash`, `shoreHash`, `animalHash`. The predecessor project
scanned all entities for every "nearest X" question, which made per-step cost
quadratic in population and capped the world size. The hash is checked against
brute force in `spatial.test.ts`, because an index that returns a *different*
answer than the naive scan is worse than no index at all.

**Rebuild only what moves.** People and animals move every step, so their
indices are rebuilt every step. Trees, nodes and piles are rebuilt only when
something changes them.

**Coarse-grained regrowth.** Resource nodes regrow once every 20 steps at 20×
the rate. A twentieth of the cost, and indistinguishable at the timescales that
matter.

**Daily work is daily.** Memory decay, relationship decay, forest growth, band
decisions, knowledge, era recount and the whole life cycle run once per in-game
day rather than per tick. Decaying sixty people's worth of memories every step
would be the single most expensive thing in the loop and nothing in the design
could tell the difference.

**Staggered thinking.** Each person re-scores on their own phase of the think
cycle (`thinkInterval`, staggered by id). Both a cost smoother and a look fix,
since synchronised NPCs move like a shoal.

**Staggered wildlife.** Animals move every 5 ticks, on a stagger keyed to their
id, at 5× the per-tick speed. Wildlife is the largest population in the world
and the least interesting per tick.

**Herd centroids computed once per step**, not once per animal — otherwise the
wildlife system would be O(n²) in herd size.

**Pre-rendered terrain.** Drawn once into an offscreen canvas at construction
and blitted each frame. Terrain is static and by far the largest number of draw
calls; this turns tens of thousands of `fillRect` calls per frame into one
`drawImage`.

**Panel caching.** The HUD rebuilds its inspector only when its cache key
changes, and patches a handful of live values otherwise. M6a folded
`inventory.version` and the presence of a work bar into that key — the cost is
one rebuild per harvest cycle (8–35 ticks), which is nothing, and it fixed a
Kit tab that was built once and never touched again.

## What is left, roughly in order of value

1. **Simulation LOD.** The chunked freeze/thaw tiering the original plan
   describes. Everyone is currently simulated in full detail; this is the thing
   that has to exist before the world grows beyond one island.
2. **Wildlife LOD.** Animals far from any person do not need herd cohesion
   computed at all. Cheapest single win available if the 35% regression ever
   matters.
3. **`Simulation.livingPeople()` allocates a new array on every call**, and it
   is called from the step loop, from `stats()`, and from several checks. A
   cached list invalidated on death would remove a lot of garbage.
4. **`buildingAt` and `NeedsSystem.shelterAt` are linear scans over all
   buildings.** Correct and cheap while a camp has a handful of structures;
   revisit if settlements ever grow into towns. Both carry a comment saying so.
5. **`removeAnimal`, `removeTree` and `removePile` each rebuild an array with
   `filter`.** Fine at current rates (a few per run); would matter if anything
   ever killed things in bulk.

## What not to optimise

The renderer. It is a 2D canvas drawing a few hundred sprites at 60fps with a
pre-blitted terrain layer, and it is nowhere near being the constraint. The
constraint is the simulation, and the simulation is measured by the harness.
