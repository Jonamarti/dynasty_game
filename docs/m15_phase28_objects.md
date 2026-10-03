# M15 phase 28: world object records

2026-10-03.

`WorldObjectRecord` is the inert counterpart to the terrain snapshot. At one
simulation tick it captures the ordered world entity collections and their
canonical ID indexes: resource nodes, buildings, trees, item piles, corpses,
animals and inscriptions. A single graph preserves aliases between each array,
its map, nested building state (`Crop`, trap carry, herd carry and stores), and
other objects reachable from those entities. The graph codec keeps supported
class prototypes so methods remain available after hydration.

Capture checks that each ID is a positive safe integer and unique in its own
namespace, every ID map points back to exactly one object in its array, entity
positions and state are valid, and time-bearing entities do not claim a future
tick. Corpse people must be the simulation's canonical retained identities.
Hydration repeats the structural checks and can bind each corpse to a supplied
roster `peopleById` map. Without a roster map, the person graph remains a
detached copy and the belief callback is rebound to that copied person.

This record is a detached object ledger, not a live `Simulation` loader. It
does not construct entities, allocate IDs, draw from RNG streams, register
objects with a simulation or rebuild spatial hashes. A future coordinator owns
those indexes and the canonical cross-record identity binding. The record and
hydrated entities use independent storage, and a JSON round trip preserves the
same graph and collection order.

The dedicated regression is `src/sim/__tests__/world-object-records.test.ts`.
It covers JSON round-tripping, nested crop/trap/pen work state, canonical maps,
class behavior, independent copies, ID/RNG non-advancement, and malformed
indexes and graph references.

Typecheck and the three dedicated world-object cases pass, together with the
existing entity-record regressions after the graph extraction. A new general
screenshot tour passed and its initial image was reviewed, without changing UI:
`artifacts/screenshots/m15-phase28-objects-2026-10-03-pass1/`.
Joint verification is recorded under
`artifacts/verification/m15-phase28-checkpoint-20261003-pass1/`;
the baseline world matrix already contains 108 failed checks in 27 scenarios.
