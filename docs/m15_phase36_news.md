# M15 phase 36a — person-carried news

This delivery supplies a person-owned story ledger and connects it to real SocialSystem theft emission and gossip. A theft is recorded only after the person's existing Memory proves firsthand knowledge of that same event. The root sets SocialSystem.worldOrigin for the active comarca; events and memories retain that origin for later tellings. Each entry keeps event identity, origin comarca, occurrence tick, confidence, source, and contact channel.

WorldNews belongs to one person. There is no global index, broadcast, or lookup from a destination comarca. tellEventTo transfers only the selected story from an actual telling. tellTo requires the caller to name an explicit person-to-person contact: conversation, traveller, spouse, captive, or trader. The caller remains responsible for proving that contact happened. A handoff changes firsthand knowledge into hearsay and multiplies confidence by 0.7; repeated delivery of the same event does not duplicate it. Storage is capped at 48 entries per person.

Integration is now connected at both ends:

- SocialSystem.emit tags new geographic events with the active origin. The victim and real witnesses seed a story only when their Memory records the same theft as firsthand. Hearsay cannot seed another direct witness.
- MemoryEntry retains origin across the existing Person object-graph codec; optional Person.worldNews uses the same codec and restores with the person.
- SocialSystem.tellStory forwards only the theft it actually tells. Conversation passes its current tick. A spouse or captive telling is labelled with that channel. WorldState supplies a read-only worldPersonById callback so a story can still name its perpetrator after that person is parked in the origin comarca; only the local listener and relationship graph change.
- The root binds worldOrigin and the archived-person lookup when it installs a comarca. Other cross-comarca coordinators can call tellTo at an actual traveller, spouse, captive, or trader contact. Arrival itself does not spread anything.

Tests cover firsthand proof, non-theft rejection, local isolation, selected-story-only gossip, provenance/confidence, spouse/captive/trader APIs, capacity, invalid timing, person codec round-trip, and a real one-edge geographic journey at eight ticks/day. The journey test keeps the culprit parked in the origin comarca and a non-witness passenger without news until the traveller tells the story after arrival. Cross-comarca delivery is therefore tested through an actual journey plus conversation; the future caravan/trader flow still needs to call its explicit contact API.
