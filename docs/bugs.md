# Known bugs and rough edges

As of 2026-09-23. Everything here is real and reproducible; nothing here is
speculative. Fixed defects are in [changelog.md](changelog.md).

## Found closing M11 (phase 17), 2026-09-23

### `labour` is slow, alone, against the scaled floor

1,156 steps/s at a peak of 37 people, against a floor of 1,445 — the only
scenario that fails `perf-budget` run alone under 17d's policy. It is also
the scenario where walkers grind (`walkers-do-not-grind`, 2,643 stuck ticks
at one site on one build of phase 15): hauling under a chief's order to a
site the path cannot reach well. The two are very likely one cause, not
measured as such.

### Nobody carries a spare, so `gift` barely fires

Crafting stops at `RecipeDef.keep`, so the only spare anybody holds is an
inheritance. The big man converting wealth into standing — the reason
`gift` was kept (17a) — needs a surplus: crafting past `keep` for a
purpose, or stores a household can draw gifts from.

### `millers`' one seed collapses since 17a

Its single run in the matrix dies out (14 deaths of exposure, 14 killings)
and fails four checks with it, while its ten-seed cohort holds at 97.5%.
Chaos on one seed, after a change that moved nothing in the cohort; not
tuned.

## Found shipping M11 phase 16 (the body), 2026-09-23

### "Neither none nor all" is a cohort reading, not a check

The plan asked `bodies-are-found` and `murders-are-solved` for both bounds.
Per run they assert only the lower one: at 4 to 27 events a run the upper
flipped between builds on its own (see the changelog). The upper bound is
in `sim:seeds`'s BODIES line, and nothing fails when it breaks — somebody has
to read it. Phase 17d's measurement policy is where that belongs.

### The dead's goods on somebody else are not evidence

The plan's fourth channel. `ITEMS` carry no provenance, so a dead man's axe
in another man's pack is an axe. It needs goods that remember whose they
were — a pass of its own, and one that would also give theft an evidence
trail.

### An investigation asks whoever is there, not whoever knows

The investigator stands where the body lay and asks everybody in earshot.
A witness who has wandered off is never asked unless they come back while
the investigation is open. Going to find the people who might know — the
dead's companions, whoever was seen nearby — is the next step, and it wants
a memory of who was where that the game does not keep.

### A finding frightens nobody

`body_found` is not in `FEARED`: coming upon a butchered neighbour moves
nobody's `security`. It probably should, for a wounded body, at about a
witness's weight — measured, and not done in this pass.

### Killers hide a body only while still bloodied, only with nobody about

Nobody hides one later, nobody gets rid of a body for somebody else, and a
body already found is still hidden if the killer comes back to it — the
killer does not know it was found. Each is a reasonable next rule; none is
built.

## Found shipping M11 phase 15 (defence and captivity), 2026-09-23

### Captivity is rare, and never lasts

At twenty seeds after the gate: `lean` took 2 captives in 1 seed of 20,
`century` 7 in 3 of 20 — and **every captive escaped**, most of them home.
Two reasons, both measured, and both design questions for the owner rather
than coefficients to push:

- **Nobody guards a captive.** Escape needs only that nobody of the captor
  band is in sight (`captorWatching`), and nothing makes anybody stay in
  sight of a captive — the guard job walks the band's buildings, not its
  prisoners. A captive slips away at the first quiet moment. The obvious next
  mechanism is a captive kept tied (a rope renewed by the captors) or set to
  work beside somebody; neither is built.
- **Only adults are taken.** Every route excludes children. Historically
  children were the captives most often taken and kept, and allowing it would
  multiply captures — but it is exactly the kind of thing the owner should
  decide, not a pass.

The raid is now the main way in (`RAID_CAPTURE`); predation's capture route
fires seldom by construction, and capture in the act needs a warned offender
still at it with a rope at hand.

### `guards-see` was planned and not shipped

The plan's third gate check. As "a guard's look finds a stranger half again
as often as anybody else's", it was run against a build with the job and no
`patrol` and discriminated nothing (`herders` 1.74 without, 1.93 with;
`labour` 1.00 and 1.11; `stewards` 0.18 and 1.18). As "a guard is among the
owners who see a property deed", it had nothing to read: the four scenarios
that hand out guards — `farmers`, `herders`, `stewards`, `labour` — see 0 to
5 such deeds a run, and the scenarios with crime (`lean`, `millers`,
`feasts`) never have a chief with the idea of setting one person to one
task. The guard is covered by `defence.test.ts`. What the world lacks is a
scenario with both division of labour and theft.

### A warning that answers a deed is still a threat to the one warned

`doWarn` emits `threaten` at full magnitude whether it is an owner seeing off
a thief or a stranger menaced on sight. 15b.2 stopped it counting against
the two peoples' standing, but the warned thief still takes it as a victim
takes a threat (opinion ×3, dread, fear). Probably right — nobody enjoys
being told off — but it is the half of the old feedback loop that remains.

### Station crafting still refuses when watched

15a made every other use of a foreign building happen in front of its
owners. Crafting at a foreign station does not pass through `useProperty`
and emits no deed at all, so letting it run watched would make being seen
cost nothing there; the menu still refuses it with the watcher's name. The
fix is to route station crafting through `useProperty` — which also makes
unwatched use of a rival's quern a trespass for the first time, so it wants
measuring.

### `jobs-bias-work` flips on single seeds

Seen failing on `lean` (2 jobs handed out in the whole run), `traps` and
`labour` at different commits of this phase, and passing at the next. The
samples are a handful of holders; it belongs with the one- and two-event
checks phase 17d moves to `sim:seeds`.

## Found shipping M11 phase 14 (fear), 2026-09-23

### The phase gate is only partly met

Measured at twenty seeds each, the build before phase 14 against the build
after 14f (all numbers in [changelog.md](changelog.md)):

| | `lean` before | after | `century` before | after |
|---|---|---|---|---|
| cross-band blows within 20 tiles of a camp | 31% | 43% | 38% | 41% |
| seeds whose peoples drift apart after incidents | 7/20 | 11/20 | 11/20 | 10/20 |

Violence has moved toward the camps, as the note asks, and fewer people die
of it, but `violence-concentrates` sets its floor at 50% and neither
scenario reaches it; `peoples-drift-apart` is a coin in `century` before and
after. On the single `lean` seed both checks still fail. They were not tuned
to pass (`AGENTS.md`). What still lands far from home is revenge and
predation between people who meet while ranging, and the range filter
(`homeRange`) only begins at a quarter of fear. Phase 15's escalation ladder
was the next lever. **Measured after it**: `lean` 40% near a camp at twenty
seeds (38-45% across phase 15's commits), `century` 42-48% — the ladder
moved it no further. The two checks still fail on the single `lean` seed.

### Well-fed peoples stopped taking sides, since 14c

`bands-take-sides` (spread between the friendliest and most hostile pair
over 20 points) now fails on `farmers`, `herders` and `stewards`. Those
peoples used to resent each other daily because the territory engine counted
every stranger within forty tiles, and it did so hardest when their granaries
were fullest — the backwards sign 14c fixed. With the sign as its own
comment always said, a well-fed people shrugs off a neighbour, and those
three worlds are well fed. `lean`, the scarce one, still divides. Whether
peace between full granaries is the right answer is a design question for the
owner — the project's arc is toward conflict — and not something to recover
by retuning the engine back.

### A warning is started far more often than it is finished

On `lean`, `warn` holds 1,323 person-ticks and completes 10 times. The
intruder usually walks out of the inner third while the defender is still
walking up, which is a warning working without being spoken, but it also
means the grace-then-strike half of the route rarely comes round
(`defend_territory_chosen` 44). Not tuned: phase 15b's ladder rewrites this.

### The raid for what a band lacks is rare

It needs a kind missing from a band's near ground *and* seen on the ground of
a people it is not on good terms with within a day's march. Over the whole
forty-tile territory that never happened once in the matrix; over the inner
half it fires a handful of times on `lean` (6 in one run, mostly clay) and
not at all on `century`. It is the one reader of `BandMaps`; a richer idea of
"need" (what a band is short of, not what it lacks entirely) is the obvious
next step and belongs with M12's use of the map.

## Found shipping the Spanish translation, 2026-09-23

Rough edges of [the translation pass](changelog.md), left on purpose. None of
them is a Spanish-only defect that English does not also have.

### A line written before a language switch stays in its language

The simulation writes some sentences as they happen — a line in somebody's
life, an insight, a refusal — and writes them in the language set at that
moment (see the header of `src/i18n/i18n.ts` for why). Switch language
mid-game and the *Life* tab is bilingual. So are band names: a world generated
in Spanish has "banda Korak", and switching to English does not rename it.
Starting the next world in the new language is the whole cure. Lines that are
re-derived on reading — your own deeds (13f), memories of other people — do
follow the switch.

### English output keeps three small grammar slips, so that it stays byte-identical

The pass changed no English. So "a older man" (a stranger's description),
"built a apple…"-style articles from `'a ' + label`, and "Pick acorns" built
by pluralising an item id are all still there in English, while Spanish, which
has its own templates, reads correctly. Likewise English floaters say "ate
raw_meat" and a heap of one kind of goods is labelled by its id; Spanish shows
the label. Each is a one-line fix that moves English output, and belongs in a
commit that says so.

### Spanish uses the masculine for "them" where the subject's sex is not to hand

Sentences built around the player's view of a stranger ("Tendrías que
conocerle mejor…") and the ones written with no person in reach take the
grammatical masculine. Where the sentence has a person — temperament, family,
the stranger's own description, spark stories — it agrees with them through
`{g:o|a}`.

## Found triaging the owner's notes of 2026-09-22

All scheduled in [m11_block_v_plan.md](m11_block_v_plan.md). Each entry leaves
this list, for [changelog.md](changelog.md), in the commit that fixes it.

### Two checks went red when NPC attacks stopped being lost (12b)

When 12b's second commit stopped NPCs losing every attack they scored between
nine and twelve tiles, two single-run checks turned red. Neither is chased
here, on the plan's instruction that the answer to more violence is phase 14
rather than a lower ceiling in `doAttack`.

- **`feasts` / `kin-outrank-strangers`**: household 19.3, band −26.4,
  outsider −24.5 — people now think worse of their own band than of
  strangers. In the same run blows landed went from 114 to 192, `attack` ticks
  from 5,215 to 8,844 and murders from 4 to 7. That the extra blows are what
  soured the band is likely but **not confirmed**: nothing yet splits
  assaults by whether the two were of one band.
- **`craft` / `pictures-are-painted`**: one painting in the previous build,
  none now. A one-event check of the kind 17d is to deal with.

Also: `lean`'s `perf-budget` read 1,993 steps/s against its floor of 2,000 in
the same matrix — wall clock, 17d.

### M11 phase 4 shipped the reverse of its own plan

The plan said a rival's building is "allowed all the same" and that `seen`
only decides whether the use becomes a witnessed deed the witness can act on.
`mayUse` returns `allowed: false` whenever an owner is in sight and
`useProperty` abandons with `property_guarded`, so a watched store is as
impossible to use as it was under the membership test phase 4 replaced. The
owner's note 6 asks for what the plan asked for. Phase 15a.

### Two lines of your own chronicle still carry a name as written

13f re-writes every line `emit` wrote from its ids, through `Knowledge`, when
the *Life* tab shows it. Lines written elsewhere are still finished text, and
two of them name a person: `Simulation.command`'s *"refused X over Y"* and
`assignJob`'s *"refused to take up work for X"*. Both name the leader who gave
the order, who is in practice always someone the refuser knows — a chief or a
household head of their own band — so no stranger's name is known to leak
this way; but nothing enforces it. Give them a `deed`-style id if a foreign
leader can ever command.

### `perf-budget` is a wall-clock check and it flakes hard under matrix load

The same build, the same scenario, the same machine: `lean` reports **2,071
steps/s** run on its own with `npm run sim:check -- --scenario lean` and
**1,626 steps/s** inside the `npm run sim:check:all` matrix a minute later.
That is a 21% swing with nothing changed but what else the machine was doing.
`crowded` fails the 2,000 floor on **every build measured**, including
`f72493b~1` from before phase 11b existed, and `century` and `craft` failed it
in one matrix run and passed it comfortably in another.

This matters because the check reads as a code regression and is usually not
one. Anyone bisecting a `perf-budget` failure should re-measure the single
scenario on its own, three times, before believing it — and should not tune
anything on a matrix number.

### Phase 11b did cost `lean` real steps/s, and the cause is the world, not the code

Separately from the flake above, and measured in isolation three runs each:
`lean` ran at 2,042-2,071 steps/s before phase 11b and 1,778-1,935 after. The
obvious suspect was the scorer — `Brain`'s sabotage loop calls `mayUse`, which
is a spatial query, once per candidate building per person thinking, and on
`lean` all six band pairs reach open hostility so the cheap `bandHostility`
gate stops nobody: around a hundred and fifty spatial queries a tick.

**It is not that.** Hoisting the whole witness question out of the per-person
loop and answering it once per building per tick in `Simulation` — the same
answer, since in that loop `mayUse` has no dependence on who is asking — moved
`lean` from about 1,870 to about 1,935, which is inside the noise band the
entry above describes. The change was reverted rather than shipped, because
shipping an optimisation whose benefit cannot be demonstrated, at the cost of
diverging four scenarios, is the thing this project's docs argue against.

What actually costs the time is the world phase 11b creates. Same scenario,
before and after: `attack` **1,491 → 10,761** action ticks, `flee` **1,712 →
12,113**, murders **3 → 22**. A witnessed `sabotage` is worth −17 and it
drives whole bands hostile, so wrecking huts buys a great deal more fighting,
fleeing and pathing. That is the design working — conflict is the destination
— and it is simply not free. If the floor has to move for `lean`, it should
move for that stated reason and not be papered over with a micro-optimisation.

## Found shipping M11 phase 11b, 2026-09-22

### A field cannot be sabotaged, because ruining one would currently do nothing

`sabotage` refuses any building with `crop !== null`, deliberately — a field
is `isStructure` too (clearing and tilling it costs real `workTicks`), and
letting it through would set `durability` and let it fall to `ruined` like
any other structure, but nothing would happen. `doSow` and `doReap` read
nothing about a field's `durability`; a trampled field would sow and reap
exactly as an untouched one does. That is the declared-but-inert defect this
project holds every table to, applied to a whole target category rather than
one entry, and it is why the category was left out rather than half-wired
in. Whoever picks this up needs to decide what a ruined field actually means
— does standing growth die, does sowing refuse until it is repaired, is the
ground itself worse for a season — and gate `doSow`/`doReap` on `!ruined`
once that is decided. `Brain`'s sabotage scoring and `ActionCatalog`'s menu
both carry the same exclusion and both need it lifted together.
**Scheduled as Block V phase 17c.**

### Two single-seed checks flip when `sabotage` is added to `Brain`'s candidates

`traps`/`animals-are-tamed` and `farmers`/`heads-direct-work` go from a clean
PASS to a hard 0 with this commit — `0 meals offered to wild animals` and `0
orders landed on rank alone, 9 refused`, not a near-miss on a threshold.
Chased before being written off, as `AGENTS.md` asks: neither check's subject
touches a building, a band relation, or anything else this pass changed, and
both are the single-seed shape the project already documents as fragile —
`animals-are-tamed` needs the scorer to have picked `tame` at all in one
seeded run, `heads-direct-work` needs five-plus rank orders to land the right
way in one. Adding any new scoreable action to `Brain.think` shifts how many
candidates exist when `choiceRng` makes its pick, which shifts that draw,
which shifts the entire world's trajectory downstream of it — the same
mechanism `century`'s own chaos entry describes, reached here by a much
smaller cause. The check itself is not broken and the mechanism it measures
is not broken either: `labour`, the scenario built specifically to give
`heads-direct-work` a real sample, passes it outright on this same code.
Left unresolved because there is nothing to resolve — re-seeding either
scenario to dodge this one unlucky draw would only be tuning the check green
without learning anything, which `AGENTS.md` says not to do.

## Found shipping M9.6 phase 2d, 2026-09-21

### The tech web's arrangement shifted when the relaxation was fixed, and nothing pins it

Making `relax` symmetric and cooled changed the *output* of every graph that
uses it, not only the tribe graph it was fixed for. The tech web's natural
size went from 1069x966 to 984x897 — a more compact arrangement, with no
overlaps and the same determinism, so both of `techweb.test.ts`'s structural
checks pass exactly as before. Nothing is wrong with the new picture and the
old one was not preferred; it is simply that neither is pinned. If somebody
later tunes `MAX_PUSH`, `heat` or `AT_REST` for one graph, the other two move
underneath them silently, and the only tripwire is a human noticing the web
looks different. A snapshot of a few known node positions would catch it,
though it would also need rewriting on every deliberate change — which is why
one was not added here rather than added and immediately tuned green.

### `FamilyTree` never got the mobile zoom treatment the tech web did

`PanelBox` fixes the box all three panels ask for, so the family tree no
longer requests a 480px canvas inside a 378px card. But `FamilyTreeLayout`
uses `fitInto`, which scales an arrangement to whatever box it is handed, so
on a phone a large family is scaled down until its names are as unreadable as
the tech web's nodes were — there is no `.is-far` threshold to make the
failure obvious, which is probably why it was not reported. The tech web's
answer was to stop fitting and let the player pan and pinch instead; the
family tree and the tribe graph would both need the same pan-and-zoom
viewport to match. Not done here: the owner reported the tech web and the
tribe graph's motion, and retrofitting a viewport onto two more panels is a
larger change than either ask.

## Found shipping M11 phase 10, sixth commit, 2026-09-21

### `herders`/`bands-take-sides` fails: two small bands do not diverge enough in ~83 days

The new scenario's two bands of ten read a standing spread of 10.6 against
the check's threshold of 20, after the run clears the 60-day floor that
would otherwise skip it. Not chased: `herders` exists to exercise `dairying`
and `wool`'s byproduct accrual, which it does — `milk-is-drawn-and-drunk`
and `wool-is-sheared-and-woven` both pass — and nothing in this pass touches
`BandRelations` or the territory/marriage/trade engines that check reads.
Two bands of ten most likely just do not cross paths often enough in this
particular seed's geography for standing to spread past the threshold in
the time the run covers; a bigger population, more bands, or a longer run
would probably clear it, but none of those serve this scenario's own
purpose and were not added speculatively. Worth a look if `herders` is ever
reused for something that needs inter-band contact.

## Found shipping M11 phase 8d, 2026-09-21

### `lean`'s already-weakest seed, `tau`, newly collapses

The phase 6d entry below flagged `tau` as the lowest single seed measured
anywhere in this milestone's `lean` cohorts, at 27% survival — above the
20-seed collapse line (25%) but the worst seed by a wide margin even then.
Phase 8d's cohort puts the same seed at **4%**, now on the wrong side of
that line (1/20 collapsed, where the pre-8d cohort had 0/20). Every other
seed in the cohort moved within ordinary noise, and the cohort mean is
unchanged at 88.1% — so this reads as an already-marginal seed being pushed
over an edge it was already standing on, not a new failure mode. Not
chased further, on the same principle `AGENTS.md` states for single-seed
movement: a 20-seed cohort's signal is in the mean, and the mean did not
move. Worth a second look if a future phase's cohort shows `tau` still
collapsed, or a second seed joins it.

### `century`/`hunts-succeed-and-fail` and `stewards`/`soil-is-drawn-down` flip under phase 8d

Both are the same shape as the checks already named repeatedly below —
`sim:check:all` reports each as failing for the first time in this
milestone, and both are borderline by construction: `soil-is-drawn-down`
failed at 98.9% against a 98.5% threshold (a 0.4-point margin), and
`hunts-succeed-and-fail` failed on an 11-kills/0-misses run, the exact
"strikes cluster on one side" shape `bugs.md` already records for this
check on `band`. Nothing in phase 8d touches hunting, farming or soil;
capping health recovery changes who lives, works and is where on any given
tick, which is enough downstream RNG drift to flip a check already sitting
on its own threshold. `crowded`/`perf-budget`,
`hunters`/`kills-are-butchered-for-bone` and
`stewards`/`compost-answers-exhaustion` are unchanged.

## Found shipping M11 phase 6d, 2026-09-20

### `lean`'s mean survival has drifted down four small steps in a row

91.2% (clean baseline) → 90.6% (phases 5d-5f) → 90.1% (6a-6b) → 89.4% (6d),
across four separately-measured 20-seed cohorts. Every individual step is
inside the ~10-point floor `AGENTS.md` says a 20-seed cohort cannot resolve,
and 0/20 collapsed in any of the four — but four steps the same direction is
also the shape a real, small effect looks like before any one of them is
provable alone. Not treated as a regression to fix, because there is nothing
to point at yet: it is recorded here so that phase 6e's own measurement
reads it as a trend to watch rather than starting from a clean slate. One
seed in the 6d cohort (`tau`) fell to 27% survival, the lowest of any single
seed measured so far across this milestone.

## Found shipping M11 phase 6a, 2026-09-20

### `lean` moved onto the wrong side of `the-hurt-are-tended`

Same mechanism as the phase 5a/5b/5c entries below: giving a household's
goods a real position (`Household.homeBuildingId`) instead of an unreachable
`Inventory` changes what `dropAt` does for goods with nowhere else to go,
which changes candidate counts somewhere in `chooseAmongBest`'s pool on that
tick, which cascades every later `choiceRng` draw for the rest of the run.
`the-hurt-are-tended` is already on record as a one-event-wide check —
`bugs.md`'s own M9.6 phase 1 entry names it — so a single scenario flipping
sides on an RNG-cascading change is exactly the kind of noise this project
has learned not to chase. `crowded`/`perf-budget`,
`millers`/`the-hurt-are-tended` and `hunters`/`kills-are-butchered-for-bone`
are unchanged.

## Found shipping M11 phases 5d-5f, 2026-09-20

### `conspiracyAgainst` has no reader but exile and adoption

`Factions.ts` answers "who is scheming against this person right now" as a
general question, but `considerExile` and `considerAdoption` are the only two
callers today. The plan's own §5d is written as the general mechanism a
conspiracy against the chief, or a plot to have someone falsely accused,
would also read — neither exists yet. Not a defect, but worth knowing before
anyone reaches for a second conspiracy mechanism and writes a second copy of
this instead of a second caller of it.

### The plan's four new `simcheck` checks were not added

**Scheduled as Block V phase 17b**, each verified failing on the build before
5c-5f or dropped with the reason stated.

`m11_plan.md`'s gate for this block asks for `exile-is-reachable`,
`factions-form`, `gossip-is-aimed` and `the-cast-out-find-a-home`, each
verified failing against the prior build before being trusted. None were
written. The reason is the one `band.test.ts`'s own header already gives for
why `rebellion-is-rare-but-happens` is a unit test rather than a `simcheck`
check: `EXILE_QUORUM` needs four people who both hold a grudge and trust each
other, which is not guaranteed inside any one scenario's step budget — a
check that flakes between PASS and n/a by seed is exactly the "looks
reassuring, detects nothing" failure this project has already deleted two
checks for. The mechanism is instead asserted deterministically, by
engineering the grievance directly, in `band.test.ts`'s "exile and adoption"
block. Worth revisiting if `lean`'s own `exiled`/`adopted` telemetry turns
out to fire reliably enough across a seed cohort to gate on.

## Found shipping M11 phases 3c and 5c, 2026-09-18

### Two more checks moved sides under the new `slander`/`praise` scorer, both already on record

Adding two new scoreable actions changes which candidates fall inside
`chooseAmongBest`'s spread band on any given think, which changes how many
draws `choiceRng` takes from that tick on — the same kind of whole-stream
cascade M11 phase 5a's `malice` migration and phase 5b's `VARIABLE_NORMS`
entry both already caused and documented below. `sim:check:all` differs from
the pre-5c build on `fishers`/`pots-reach-a-granary` (a granary got marked
out this time where none did before, in a 37-day scenario where that is a
single event either falling inside the window or not) and `millers`/`the-
hurt-are-tended`, which is already named above as a one-event-wide check.
`crowded`/`perf-budget` and `hunters`/`kills-are-butchered-for-bone`, both
long-standing, are unchanged. A twenty-seed `century` cohort (see
`changelog.md`) reads as healthy as 5b's own cohort — these are instrument
noise from a shifted RNG stream, not damage to the world.

## Found shipping M11 phase 5b, 2026-09-17

### `century` reads "0 obeyed" on `heads-direct-work`, exactly as that check's own comment warns it can

Adding `slander` to `VARIABLE_NORMS` cost one more `rng.range` draw per band
before anybody is placed — the same mechanism the phase 5a entry below
documents for `malice` — and `century` now fails `heads-direct-work`: "0
orders landed on rank alone, 12 refused". Twelve is past the check's own
floor of five samples, so it is not skipped, and zero of them landed.

Not a new failure mode. `tools/simcheck.ts`'s comment on this exact check
already says why `century` is the wrong scenario to read it from: *"a world
that happened to work `chiefdom` out on its own says nothing about whether
rank carries an order"* — `century` reaches that technology late and
incidentally, on whatever seed it happens to fall on, rather than starting
with it the way the dedicated scenario does. `labour` exists precisely to
give this check a sample worth reading, starts its founders already knowing
both social technologies, and passed cleanly in the same run (52/52). This
is the `stewards`/"one head asked one person one thing and was refused"
case the comment already names, recurring on a second scenario under a
second RNG-shifting change, not a defect in the rank mechanism.

Not fixed and not tuned: `labour`'s own result is the one that speaks to
whether rank carries an order, and it says yes.

### Four more checks moved sides under the same `slander`/`VARIABLE_NORMS` shift, all already on record

`sim:check:all` differs from the post-5a build on `crowded`/`perf-budget`
(the long-standing documented failure below), `traps`/`jobs-bias-work`
("has an effect smaller than its own seed-to-seed spread", above),
`stewards`/`the-hurt-are-tended` and `stewards`/`compost-answers-exhaustion`
(both already named above as thinner than one behavioural change can
survive). `millers`/`the-hurt-are-tended` and `hunters`/`kills-are-butchered-
for-bone`, both flagged in the 5a entry below, are unchanged by this pass.
Recorded together rather than as five separate entries because they are the
same finding five times: a check whose margin is already known to be
seed-sensitive moved again, under a change that moves every seed. A
twenty-seed `century` cohort (see `changelog.md`) reads 99.9% mean survival
and 11.7 technologies known, indistinguishable from 5a's own cohort — the
world is healthy; these five lines are instrument noise, not damage.

## Found shipping M11 phase 5a / M9.6 phase 4a, 2026-09-17

### The `malice` migration flips three already-catalogued knife-edge checks, and grows `century`'s population enough to fail `perf-budget`

Adding an eighth trait to `TRAITS` means an eighth `rng.gaussian` draw in
founding's trait loop and in `inheritTraits`, which — exactly as `AGENTS.md`
and this document have recorded for every past change to world-generation-time
RNG — shifts every subsequent draw, for every scenario, on every seed. Three
lines of `sim:check:all` changed, and all three were checked against the
pre-migration build before being written down here, per this project's own
rule against declaring a check "fixed" or "broken" without that comparison.

`century` gains a `perf-budget` failure it did not have before: 1,700-1,950
steps/s against a 2,000 floor, down from a stable 2,300-ish. Bisected rather
than assumed: disabling the new decay loop in `Simulation`'s daily block and
disabling the new trait in turn, one at a time, showed the slowdown tracks the
trait, not the loop — and the reason is a genuinely bigger world. Peak
population on this seed is 76 with the trait against 66 without it, and this
project's systems are not free per person; a 15% larger population costing 15%
of the throughput is the simulation doing more work, not doing the same work
slower. `century` is already named in `AGENTS.md` as the scenario least able
to absorb a world-generation-time RNG shift, and M9.5 phase 4a's entry below
already recorded the identical shape (a `VARIABLE_NORMS` addition moving one
extra draw per band, `crafts-happen-at-stations` failing on `millers` as a
result) — this is that finding recurring on `century` and on `perf-budget`
rather than a new phenomenon.

`hunters`/`kills-are-butchered-for-bone` and `fishers`/`pictures-are-painted`
trade from passing to failing, and `farmers`/`the-hurt-are-tended` trades the
other way, from failing to passing. All three are already on record in this
document as one- or two-event-wide checks — `kills-are-butchered-for-bone` on
`hunters` under "`hunters`' coat chain is one event wide", `pictures-are-
painted` under the M9.5 phase 2b and 3 entries on checks that "trade places
under enough downstream RNG drift", and `the-hurt-are-tended` under three
separate entries above — so this is each of them doing exactly what this
document already said they would do under any behavioural change at all, not
three new defects.

Not fixed, and not tuned: a twenty-seed cohort (see the changelog entry for
this pass) shows a healthy world on every figure that cohort size can resolve
— survival, starvation and technologies known all move in a good direction —
so there is nothing here to chase beyond what is already written down. If
`perf-budget` on `century` is ever worth hardening against this kind of
legitimate population growth, the fix is a floor that scales with population
rather than a fixed steps-per-second number, which is a change to the
instrument and belongs with whoever next tunes it, not with this migration.

## Found shipping M11 phase 2, 2026-09-17

### Nobody in this world has any fight skill, and that blocks more than it looks

**Fixed in M11 phase 11a, 2026-09-21** — see `changelog.md`. The owner chose
to combine two of the three options below: `doHunt` now trains a small
trickle on a kill, and a new verb, `spar`, is deliberate mutual training
between willing same-band people. **Left open by that fix, and worth
watching rather than assumed away**: `DECISIVE_GAP` (`social/Vulnerability.ts`,
currently `0.3`) was calibrated against the narrow, floor-dominated spread
this entry describes below. Once `fight` skill actually varies across a
population, that calibration is stale by construction — it was tuned against
a range that no longer holds — and whichever later phase-11 commit first
leans on `attack`/`threaten`'s gap math (the border guard, the raiding party)
should re-measure it rather than trust the number inherited from before this
fix.

`fight` is trained by **exactly one thing**: landing a blow. `doAttack` calls
`person.practice('fight', 1.2)` on the striker and `0.4` on the struck, and no
other action in the game touches the skill. `SKILLS` has twelve entries and this
is the only one whose sole trainer is the rare, gated, mutually-destructive act
it governs.

The consequence is a population pinned to the floor. `skillFactor` is
`(0.35 + skills/100 * 0.85) * vigour`, so with the skill at zero it is
`0.35 * vigour` for practically everybody, and the only things that separate two
people's fighting power are **age and injury**:

    healthy adult, untrained      0.35
    adult at half health          0.18
    elder, untrained              0.12 - 0.20
    child, untrained              0.11 - 0.28

The formula's range is about 0.1 to 1.2. The range the world actually produces
is about 0.11 to 0.35, and the top of that is "an ordinary adult who is not
hurt". This cost M11 phase 2c a calibration pass: `DECISIVE_GAP` was set at 0.6
from reading the formula, which is wider than the widest gap that can occur, so
the predation route it gated never fired once in two instrumented worlds.

**Why it matters beyond that phase.** There can be no warriors. Not "no warrior
job" — no warriors of any kind, because there is no mechanism by which anyone
becomes better at fighting than the person next to them without first fighting
them. That removes:

- **a household that is feared**, which is half of what standing between
  families would otherwise mean;
- **a specialist**, so `division_of_labour` and `chiefdom` have nothing martial
  to divide;
- **the border guard of M10 phase 2**, who would be exactly as good at stopping
  a raider as any farmer;
- and **any reason for a raid to be risky**, since attacker and defender are
  interchangeable.

Not fixed here, because the fix is a design decision rather than a repair, and
it belongs with the pass that needs it. The honest options, in the order they
look cheapest:

1. **Hunting trains it a little.** Defensible — a spear is a spear — and it is
   one line in `doHunt`. It also quietly makes hunters the dangerous people in a
   band, which is historically not wrong.
2. **A `spar` verb**: practice between willing partners, socially positive,
   trains both. This is how the skill would actually be got, and it gives the
   player something to *do* about being weak.
3. **Weapons carry more of it**, so a spear in untrained hands beats bare hands
   decisively. `weaponOf` already runs through `techPower`; this moves the
   differentiation from the person to the kit, which is a different game and
   worth choosing deliberately rather than by default.

### Two more borderline checks changed sides, and the list is getting long

`stewards`' **`compost-answers-exhaustion`** went from passing to "5 loads
rotted down, 0 spread over 0 tile-dressings" under M11 phase 2c. This document
already carries "three spreadings a year is thin, and it is the scorer rather
than the verb" from M8.2's second half. Three a year going to zero under a
behavioural change is that thinness, not a new defect in composting: `spread`
still accumulated 410 ticks in the same run, so people were trying.

`farmers`' **`the-hurt-are-tended`** flipped back to failing, having flipped to
passing one commit earlier. It is the check M11 phase 1 already recorded as one
event wide at eighteen ticks.

That now makes **five** checks in this suite documented as one or two events
wide: `the-hurt-are-tended` on three scenarios, `kills-are-butchered-for-bone`
on `hunters`, `compost-answers-exhaustion` on `stewards`, and `jobs-bias-work`,
whose effect is smaller than its own seed-to-seed spread. They are not all the
same bug, but they have the same shape, and the shape is worth naming: **a check
written against a mechanism that fires a handful of times per run is a tripwire
on whether it fired, not a measurement of whether the world does it.**

The cost is real and it is paid every pass: a milestone that moves the world at
all spends time deciding which of its red lines are findings and which are
weather. Worth a pass of its own some day — either giving each of them a floor
that means something, or moving them to `sim:seeds` where a mean across twenty
worlds would resolve what one world cannot.

## Found shipping M11 phase 1, 2026-09-17

### `the-hurt-are-tended` is one event wide on `farmers` and `stewards`

Softening `Brain`'s choice from argmax to a draw among the best (M11 phase 1b)
flipped this check on two scenarios, and the flip is a fact about the check.

At `choiceSpread: 0` both worlds report **18 ticks** spent sitting with the hurt
and pass. At 0.12 both report **0** and fail. Eighteen ticks is one person
kneeling beside another for a few seconds, once, in a whole run — so the check is
not measuring whether a world tends its injured, it is measuring whether one
particular encounter happened to occur. Any behavioural change at all will move
it, in either direction, and it will keep changing sides.

This is the third entry of this exact shape in this document. The other two are
"two health checks are one or two events wide" (M9 phase 4) and "`hunters`' coat
chain is one event wide, and a sixfold fruit harvest tipped it" (M9.6). The
pattern is now established well enough to be worth stating as a rule: **a check
whose detail line reports a number in the tens is a tripwire on one event, and
should either be given a floor that means something or be read as a tripwire
rather than as a measurement.**

Not fixed here, deliberately. Fixing it means deciding what "a world tends its
injured" should actually require, and that decision belongs with the pass that
makes tending worth doing — not with the pass that happened to move it.

**The same commit made the same check go from 0 ticks to 114 and pass on
`century`**, where it had been failing since M9 phase 5 under the entry "a world
that reaches herbalism never tends anybody with it". That entry can now be
answered: the mechanism was never broken. `tend` simply never won an argmax
against whatever else that person could have been doing, and an argmax gives a
verb that is second-best every single time exactly nothing. `millers` still
reports 0 and still fails.

### `jobs-bias-work` changed sides again, on a tenth of a point

`craft` reports holders spending **8.1%** of their time on their own job's work
against everyone else's **8.2%** — so the check fails by one tenth of one point.

This document already records that this check "has an effect smaller than its own
seed-to-seed spread", found while building M8.1. Nothing has changed about that.
It is listed here only so that the M11 phase 1b matrix has an explanation for
every line that moved, rather than one unexplained failure that a later reader
has to re-derive.

## Found shipping M9.6 phases 0-3, 2026-09-17

### `hunters`' coat chain is one event wide, and a sixfold fruit harvest tipped it

`kills-are-butchered-for-bone` fails on `hunters` since M9.6 phase 1: 2 kills
gave 10 of bone and sinew and 3 tools, and no coat. At `HEAD` the same scenario
made **3** kills and exactly **one** coat, which is the whole margin the check
has ever had — and the scenario's own comment already calls the coat chain
fragile by design and pins `startDay` to the only position in the year from
which it completes at all.

Three of the chain's four links demonstrably still work. What is not knowable
from this run is whether the missing kill is noise or a real effect: fruit
picked in that world went from 108 to 686, and fruit is what hunting competes
with on `Brain`'s scorer, so displacement is a live hypothesis — at two kills
against three there is no way to tell, and `hunts-succeed-and-fail` is already
n/a on this scenario at "too few strikes to tell".

**Deliberately not fixed, and deliberately not tuned.** Lengthening the run
until it goes green would hide exactly the question worth answering. Whoever
takes it should give `hunters` enough herds or enough steps to make a dozen
kills — so the check measures a rate rather than an event — and then ask the
displacement question with an instrument that can answer it.

### The sleep sampler could report a rate off two observations

`sleep-restores` watches for sleepers on sampled ticks only, and only counts a
restoring tick when it catches the *same* person asleep on two samples running.
On `traps` that meant 0 observed sleeps at `HEAD` (n/a) and 2 after M9.6 phase 1
(FAIL, no falls seen) — a check changing sides without anything about sleep
changing. Fixed here by giving it a minimum sample of five, on
`heads-direct-work`'s precedent from M8.2. `millers` reports 372 sleeps and
3,335 restoring ticks in the same matrix, which is what the check looks like
when it has something to measure.

## Found triaging the owner's notes of 2026-09-17

### `millers` reaches herbalism now, and nobody there tends anybody either

Found while measuring M9.6 phase 1. With the autumn harvest repaired, `millers`
climbs far enough to work out `herbalism`, which makes `the-hurt-are-tended`
*applicable* on that scenario for the first time — and it fails, reporting zero
ticks spent sitting with the hurt, exactly as `century` has since M9 phase 5.

This is the open entry "A world that reaches herbalism never tends anybody with
it" appearing on a second scenario, not a new defect and not something phase 1
broke: n/a is not a pass, and a check that has stopped being n/a because the
world got further is the instrument working. Not tuned green. The tending bug
itself is still open below.

### ~~The autumn harvest is a rounding error, because a day is sampled at midnight~~

This is the missing half of "A season-gated harvest is a much narrower window
now that a season is half as long", below, and it is worse than that entry
supposed.

The daily block runs at `tick % ticksPerDay === 0` — midnight. At midnight
`daylight` is 0, so `TimeManager.temperature` takes its full diurnal penalty of
`-0.3`, and `growth` is `temperature * 0.9 + 0.35`. In mid-autumn the seasonal
term is about zero, so the growth handed to `ForestSystem.daily` is about
**0.08** — below the `max(0.2, growth)` floor inside `Tree.advanceDay`, every
autumn day of every year. Summer is unaffected: its seasonal term carries
midnight to about 0.71, which is why plums and pears look healthy and why
nobody noticed.

At that floor, with the swell at `fruitYield / 18` a day and a season now ten
days long, an apple tree sets about **1.6 of its 14 apples**, an oak about
**4 of its 40 acorns**, a hazel about 1 of 9. The out-of-season decay tail —
`fruitYield / 10` a day, during which the fruit is still on the branch and still
pickable — is currently carrying a real share of what little gets picked, which
is why the owner's note that fruit should not hang out of season **cannot be
implemented on its own**: it would take away most of what an autumn tree still
gives. The fix, and the order to do it in, is M9.6 phase 1 in
[m9_6_plan.md](m9_6_plan.md).

This also explains the `millers` entry below: the acorn chain did not become
unlucky, it became arithmetically near-impossible inside a ten-day autumn.

**Fixed 2026-09-17, M9.6 phases 1a and 1b**: `TimeManager.dailyGrowth` gives the
daily block the season's growth with the hour of the day taken out, and the
swell is now a fraction of the tree's own fruiting window rather than eighteen
absolute days. On `millers`, acorns picked went from **0 to 86** in four years
and meals ground at the quern from **0 to 28**. `growCrops` deliberately still
reads the midnight `growth`, because M8.2 fitted `GROWTH_PER_DAY` to that sample
— see `dailyGrowth`'s header. **The balance question this opens is live and is
recorded in the changelog, not here**: a tree now delivers the `fruitYield` its
own table always claimed, which is several times what the world has actually had
since M9.5 phase 3.

### ~~The tribe graph reshuffles itself continuously, and none of it is random~~

The owner's note. `layOutTribe` is rebuilt from scratch every frame and is a
continuous function of current opinion in four places at once: `knownBy` sorts
by `Math.abs(opinion)` and sets the ring angle from the index; `seedRows` takes
the row order from that same sort, alternating out from the middle, so one swap
moves two nodes several slots apart; `restLength` is `150 - opinion * 0.9`, so
220 relaxation passes land somewhere slightly different even with no swap at
all; and `TribeGraph.digest` hashes positions to the pixel, so any of it
rebuilds the DOM. `familiarity` is re-earned by proximity every tick and decays
6% a day, so the input never stops moving.

**Fixed 2026-09-17, M9.6 phase 2**, by carrying the arrangement between frames
(the layout is seeded from where it was and eases with 30 passes instead of
re-deriving itself with 220), by handing out a row slot only to somebody who has
not got one, by letting four people already on the graph stay on it past the cap,
and by quantising the redraw digest to four pixels and five points of opinion.
Three unit tests, each verified failing on the build without it.

**The M9.5 phase 4e entry below is now two thirds closed, and one third of it
was already wrong.** `TechWeb` does *not* relax every frame — `render` does
`this.layout ??= layOutWeb()`, so the tech web is laid out once and cached, and
has been. `FamilyTree` genuinely does re-run its 200 passes every frame, and is
the one left: harmless to watch, because a family tree's input changes only at a
birth or a death and the picture is therefore stable, but still work done sixty
times a second to reach the same answer. Left for whoever profiles the frame,
which is what that entry said in the first place.

## Found during M8.2's second half, 2026-09-17

### Compost is fetched twice as often as it is spread

`stewards` fetches twenty-nine loads across three years and spreads twelve of
them. The rest is carried around and eventually tipped into a storage pit by
`doStore`, which empties a whole pack without asking what is in it. Nothing is
lost — both the scorer and `doSpread` now look for compost wherever the band
keeps it, so it is fetched again later — but a band that spends a day carrying
muck to the larder and back is not a band anybody would write down.

The fix is a `doStore` that knows the difference between a surplus and a tool,
which is a change to a verb six other things use, and it belongs with whoever
next has reason to touch it. Left alone because the mechanism works and the
waste is legible: `compost_fetched` against `compost_spread` in the report is
exactly this, and it will show up the moment somebody makes it worse.

### Three spreadings a year is thin, and it is the scorer rather than the verb

Even with the errand committed and the interruption check at the waypoints, a
band with two heaps and four plots spreads about once a season. The option is
offered around a hundred and seventy thousand times a run and taken three times,
because it competes with foraging on a scorer where hunger dominates and almost
everybody is a little hungry most of the time. The mechanism is measurable and
the check passes; whether it is *enough* is a balance question for the pass that
adds `manuring` and `middening`, when there will be three sources of the same
material and the comparison will mean something.

## Found during M8.2's first half, 2026-09-17

### `millers` grinds grain now, and has stopped picking acorns entirely

The scenario exists to prove a crafting station gets used, and it did that with
two meals of acorn in three years — eleven acorns picked in the whole run, the
first grind at step 23,938. Adding `farming` to `TECHS` moves every knowledge
draw in every world, and on this seed the acorn harvest moved to zero: four
years, not one acorn.

The check is in better health than it has ever been, because the same band
grinds **twenty-six** lots of wild grain instead, and the run was lengthened to
a fourth year for `jobs-bias-work` rather than for the quern. But the thing that
stopped happening is worth recording plainly: **the acorn chain is now
unmeasured**. It needs somebody to notice a deficit, walk to an oak, gather
three acorns and carry them to a stone inside a ten-day autumn, and since M9.5
phase 3 halved the seasons no scenario in the suite has shown it happening
twice. Left alone because the honest fix is a scenario built for autumn rather
than a coefficient, and because `grinding` is demonstrably reachable and useful
by another route.

### Grain is inedible until it is ground, and nothing tells a band that

A band that works out `farming` without a standing quern can raise a plot, sow
it, reap forty-five grain and eat none of it. That is true to life and it is the
point of the technology, but the only place the game says so is the item's
nutrition of zero. `farming` requires `grinding`, so every farmer knows what to
do, and the planner builds stations before it breaks ground — so in practice it
does not happen. If it ever does, the fix is a refusal on `eat` that names the
quern, not a nutrition number.

## Found during the era rename, 2026-09-16

### The ladder has four rungs where it had six, so promotions are rarer

The real periods are coarser than the invented ones. `pottery`, `stoneworking`
and `carpentry` used to carry two rungs of their own — the Age of Craft and the
Age of Building — and under the archaeological names they carry none, because
worked stone and jointed timber are not what separates one period from the next
and a pot is Upper Palaeolithic in a world that has no farming. A band that
climbs that far now sees the top bar change twice in a run rather than four
times.

This is the rename being honest rather than a defect, and the ladder is short
only until M8.2: the Neolithic rung is the one those bands will actually earn,
and it arrives with the field that makes it mean something. Recorded here
because it is a visible change to a number the player watches, and because
"the era stopped advancing" is exactly the kind of thing that gets reported as
a bug three weeks later.

## Found during M9.5 phase 4e, 2026-09-16

### ~~The three graphs relax their whole layout every frame, open or idle~~

**Mostly fixed in M9.6 phase 2d, from the other end.** `relax` now exits as
soon as a pass moves less than `AT_REST`, so a settled arrangement costs one
pass rather than the full budget — the tribe graph on a paused world does the
O(n^2) sweep once, finds everybody already where they belong, and stops. That
is not the caching this entry proposed and it gets most of the same result
without splitting the digest in two. `FamilyTree` still calls `layOutFamily`
from scratch every frame and does not seed from the previous arrangement the
way `layOutTribe` does, so it pays a full relaxation whenever anything in its
digest moves; it is the smallest of the three graphs and nothing about it is
visible, but it is the part of this entry that is still true. Original report
follows.

### The three graphs relax their whole layout every frame, open or idle

`main.ts` calls `tribeGraph.update(sim)` from the frame loop, and `update`
calls `render`, which runs `layOutTribe` in full — 220 relaxation passes over
an O(n^2) repulsion term, plus the overlap pass — before comparing the digest
that decides whether to touch the DOM. At the cap of 25 people that is roughly
70,000 pair operations sixty times a second to discover that nothing has
changed. `FamilyTree` and `TechWeb` are built the same way; the tech web is the
largest graph of the three.

Nothing about it is visible today: the frame budget absorbs it, `perf-budget`
measures the simulation rather than the panel, and the digest still does its
real job of keeping the DOM stable so hovering works. Phase 4e added a rank
lookup per node to the same path, which is small beside the relaxation but is
on the wrong side of it.

The fix is to move the digest *before* the layout — it is computed from
simulation state and node positions, so it would need splitting into the part
that depends on the world and the part that depends on the picture — and to
cache the arrangement between frames. Left alone because it is a change to all
three panels and belongs with somebody profiling the frame, not inside a phase
about social rank.

## Found during M9.5 phase 4d, 2026-09-16

### A head keeps asking, is refused four times in five, and pays for it every time

On `labour`, heads gave 215 orders on rank and had 174 of them refused — an
obedience rate of about 19% — and `Simulation.command` debits the leader three
points of regard for every refusal. Nothing in `directWork` remembers having
been refused, so a head who is disliked asks again tomorrow, is refused again,
and is liked slightly less for it. The loop is real and it compounds.

It is **not** currently doing harm: the same run ends with 888 warm
relationships against 115 hostile, nobody outcast and nobody exiled, and every
social check passes. It is also not new — the chief has had exactly this
property since orders existed, at `order_refused` 49 on the `century` seed —
and phase 4d has scaled it up rather than introduced it.

Left alone because the remedy is a judgement call that belongs with the person
tuning authority, not inside a content phase: either a leader should back off
somebody who has refused them recently (a per-pair cooldown, which is new
per-edge state and the thing phase 4b deliberately avoided), or `directTo`
should pick the most biddable idle member rather than the first in list order,
which is a one-line change with a measurable effect on who ends up doing the
band's work and therefore a measured change, not a tidy-up.

## Found during M9.5 phase 4c, 2026-09-16

### `carpentry` has a spark route that cannot fire

`carpentry`'s second route needs `saw: long_enough` beside `doing: chop`
([Tech.ts:371](../src/sim/knowledge/Tech.ts#L371)). `long_enough` is emitted in
exactly one place — `ActionSystem.interruption`'s hard ceiling at
`MAX_WORK_STRETCH`, 900 ticks, nearly four in-game days of unbroken work — and
thirst reaches its own limit in about four hundred. The counter
`work_ended_long_enough` is **absent from the telemetry of every scenario in
the suite**, including the three long ones. The route is dead, and has been
since it was written.

This is `tracking`'s `doing: wander` defect again: a perfectly spelled
ingredient that nothing in the world ever produces, passing
`spark-ingredients-are-real` and `every ingredient it names` alike, because
both check that the id is *real* rather than that it is *reachable*.
`division_of_labour` was about to ship with the same route and it was caught by
measuring before shipping; `carpentry`'s was found the same way and left alone,
because changing a root-tier node's routes moves the tech economy in every
saved seed and that is a measured change, not a line in a phase about
leadership. `carpentry` has two other routes and is reached in play, so nothing
is currently unreachable.

The generalisable fix is a check that every spark route has fired at least once
across a seed cohort — the aggregate `sparks-are-various` already gestures at,
but per route rather than per technology.

### Two borderline checks changed sides under a behavioural change, again

`century`'s `the-hurt-are-tended` and `millers`' `crafts-happen-at-stations`
were both recorded here as failing by a margin of one or two events. Both now
pass, and nothing in this phase went near tending or stations. This is the
third time a phase has moved which borderline check is on which side of its
line — see the two entries below from phases 2b and 3 — and it is the same
finding each time: a check one or two events wide reports the seed, not the
mechanism. Recorded rather than celebrated; neither check was fixed.

## Found during M9.5 phase 4b, 2026-09-15

### The documented extra `--` drops named CLI flags on this machine's npm

The examples throughout `AGENTS.md` and `docs/` say, for example,
`npm run sim:seeds -- --seeds 20`. The package script itself already ends in
`--`; with the npm version installed on this machine, the documented command
arrives at the script as `vite-node tools/seeds.ts -- 20`: the name
`--seeds` has disappeared, so the default ten-seed cohort runs while its caller
believes it requested twenty. The same thing made a requested `century`
`sim:check` silently run the default `band` scenario. Confirmed from npm's own
echo of the expanded command and both report headers. Direct invocation works:
`npx vite-node tools/seeds.ts --seeds 20` and
`npx vite-node tools/headless.ts --scenario century`. Not fixed in this phase:
changing all four package scripts and every live invocation is tooling work,
not part of the leadership mechanic; the direct form was used for 4b's gates.

## Found during M9.5 phase 4a, 2026-09-15

### `threaten`'s variable norm pushes the `millers` scenario's already-thin margin past breaking

`threaten` needed a band-level norm — "a tolerant band shrugs at a threat and
a peaceable one remembers it" is the whole point of `VARIABLE_NORMS` — so it
was added there alongside `theft` and `assault`. `Simulation.foundBands`
draws one `rng.range(min, max)` per entry of `VARIABLE_NORMS` per band, so
every band founded from this point on consumes one more number from the
world's RNG stream than it used to, before a single person is placed or a
single tree is grown (the loop is inside `Simulation.spawnPeople`).
`worldRng` (terrain) is forked off `rng` *before* this loop runs, so no
island's layout moves — but band placement, every person's
traits, and every decision anyone ever makes for the rest of the run are all
drawn from the same unforked `rng`, so all of it shifts, for every scenario,
on every seed.

Confirmed as exactly this and nothing else: `sim:check:all` is otherwise
unchanged (the same single `perf-budget` and `the-hurt-are-tended` failures
already recorded below), except `millers`, which now additionally fails
`crafts-happen-at-stations` — "1 stations finished, 0 things made at one" —
and, after `Brain`'s `threaten` scorer was retuned to actually compete for
ticks (see below), `the-hurt-are-tended` as well. The second of those is not
a new phenomenon: it is the exact "borderline check trades places under
enough downstream RNG drift" pattern the phase 2b and phase 3 entries below
already recorded on `century`, showing up on a second scenario because this
change, unlike those, touches every scenario's world generation rather than
just one calendar's worth of ticks. `crafts-happen-at-stations` is the one
worth explaining. That scenario's own comment in `tools/simcheck.ts` already
names it as
living on a knife's edge: on this exact seed the acorn-grinding chain took
three autumns to first fire even before this phase, at step 23,938 against a
26,000-step budget. Raising the budget further does not rescue it — 40,000
steps still shows nothing ground — which says the shift did not just delay
the chain, it moved the world enough (which of two bands ends up within
reach of which oaks; every person's downstream choices) that this run's
particular path to a first grind is simply gone. A ten-seed run of the
default `century` scenario (`npm run sim:seeds -- --seeds 10`) shows the
world is otherwise healthy under the same change: 99.9% mean survival, every
seed reaching technology past the root nodes. No action taken — the plan's
own gate for this phase measures `--seeds 20`, not single-seed stability,
because exactly this kind of drift is expected from any change that touches
world-generation-time RNG, and `millers` was already the scenario in this
matrix with the least room to absorb one.

## Found during M9.5 phase 3, 2026-09-15

### A season-gated harvest is a much narrower window now that a season is half as long

M9.5 phase 3 halved `daysPerSeason` (20 → 10) so a lifetime covers half as many
days, and deliberately left every per-day rate alone — `Tree.advanceDay`'s
fruit swell (`fruitYield / 18` a day), decay, needs and skill decay are all
still absolute, calendar-day rates, per the plan's "hold everything else at
its current fraction of a year". That was the right call for rates that run
every day regardless of season, but it has a real, un-obvious consequence for
anything gated on a *season* specifically: an oak's acorns used to have 20
days of autumn to swell and be gathered before winter's decay took them back;
now they have 10, well under the 18 days the swell curve assumes, so a crop
that used to be abundant for most of the season is now only briefly so.

Confirmed on three of `sim:check:all`'s scenarios, all seed-sensitive rather
than structurally broken: `millers` (grinding acorns into meal) took three
autumns instead of one before this seed's band first managed it; `hunters`
(the bone-tool coat chain) turned out not to depend on the season at all and
was fixed by pinning `startDay` instead, once measurement ruled the season
length out; `craft` (cutting the first record) needed roughly double the
steps. All three were extended or pinned in `tools/simcheck.ts` rather than
re-balanced in the simulation itself — see the M9.5 phase 3 changelog entry —
so the harness passes again, but the underlying tightening is real and
reaches ordinary play, not just these scenarios. Not fixed: `Tree.ts`'s
`fruitYield / 18` swell rate is itself an implicit calendar assumption, in
exactly the spirit of the constant this phase spent its budget removing
(`DAYS_PER_YEAR`), and rescaling it (or every other season-gated rate in the
game) was judged out of scope for this pass. If a future run reports fruiting
trees as chronically stripped before anyone benefits, or a `--seeds 20`
economy run showing wild fruit intake down against a pre-phase-3 baseline,
this is where to look first.

### A behavioural change moves which borderline check fails on `century`, again

`the-hurt-are-tended` is back to failing on `century` instead of
`pictures-are-painted`, which M9.5 phase 2b's entry below already named as one
of two already-marginal, seed-sensitive checks that trade places under enough
downstream RNG drift. Phase 3's calendar change is exactly that kind of
change — a hundred simulated years of different day-to-tick timing — so this
is the same phenomenon recurring, not a new defect. No action taken.

## Found during M9.5 phase 2b, 2026-09-15

### A behavioural change moves which borderline check fails on `century`

`sim:check:all`'s `century` scenario has failed `the-hurt-are-tended` since
before this phase, recorded below. With snow burial active it instead fails
`pictures-are-painted` — `the-hurt-are-tended` itself now passes. Confirmed
as the mechanic's own doing rather than a new defect: re-running `century`
with `config.world.snowBuries: false` (everything else identical) restores
the original failure, `the-hurt-are-tended`, exactly. `findNode` now refuses
a handful of buried candidates every winter, which changes what a person
does next and so which random numbers everything downstream of that
decision draws — over a hundred simulated years that is enough drift to
flip which of two already-marginal, seed-sensitive checks lands on the
wrong side of its line. Population health is unaffected: a direct
before/after comparison on the `tour` seed over 14,400 steps showed
identical population growth (31 to 38) and *lower* average hunger with
burial on (13.0) than off (15.9), and `harsh-winter`'s `store` and `cold`
columns move by less than a point either way. No action taken; recording it
so the next person who sees `century` fail a check not in this file knows
where the drift came from.

## Found during M9.5 phase 1, 2026-09-14

### `perf-budget` cannot measure a renderer change

`docs/m9_5_plan.md`'s phase 1 gate calls for measuring `perf-budget` on
`crowded` before and after the sprite atlas, on the theory that baking
bodies once and drawing them with `drawImage` should make it better. It
cannot move that check at all: `sim:check`'s `perf-budget`
([simcheck.ts:1889](../tools/simcheck.ts#L1889)) is
`base.stepsPerSecond > 2000` from the headless harness, which never
constructs a `Renderer` — per `AGENTS.md`, `src/sim/` never imports it — so
no amount of drawing efficiency can touch the number the check reads.
Confirmed rather than assumed: `sim:check:all` failed `perf-budget` on
`crowded` identically before and after this phase's renderer changes, which
is exactly what a metric this decoupled from rendering should do. There is
no automated check anywhere in this project for *rendering* cost — frames
per second, or draw calls per frame — so a real regression there would only
show up as someone noticing the game feels slower. If sprite draw cost is
ever worth measuring on its own, it wants a new check that actually
constructs a `Renderer` and times `render()`, not a reading of this one.

## Found during M9 phase 6, 2026-09-12

### A character looking after itself will not run away

`urgent` autonomy ("Stays alive") fires on `LETHAL_NEEDS` and nothing else, so a
player character left in that state stands and takes a mauling. `flee` is on no
allowlist in [Autonomy.ts](../src/sim/ai/Autonomy.ts) and the trigger is
`urgentNeeds`, which knows nothing about being attacked.

Deliberate for this pass rather than missed. Being attacked is urgent in every
ordinary sense of the word, but it is not a *need*, and adding it means a second
trigger concept — health, or a hostile within some radius — plus a judgement
about whether a character that runs away by itself is a feature or a way of
losing a fight the player meant to have. That is a change to what combat feels
like and it deserves its own pass and its own measurement, not a line in a
convenience feature.

### Nothing stops an `auto` character walking out of a fight you started

The same boundary from the other side, and worth recording together with it.
`auto` hands the character wholly back to `Brain`, which includes `flee` at its
full weight, so a player who switches to "Acts alone" mid-fight will watch their
character leave. This is correct — it is what the state promises — but nobody
has played enough of it to say whether it reads as the character being sensible
or as the game taking the controls away. Worth a session of play before anything
is built on top of it.

### The top bar has no room left

Fixed for now by letting the bar stop short of the inspector panel and wrap, but
the underlying fact is that it is a fixed row of controls that has grown four
times and has about thirty pixels of slack at 1280 wide. The next control added
to it will wrap onto a second line on a common laptop screen. Before that
happens it wants a decision — fold the speed slider behind a button, shorten the
stats string, or accept two rows and design for them — rather than another round
of shaving padding.

## Found during M9 phase 5, 2026-09-12

### A world that reaches herbalism never tends anybody with it

`the-hurt-are-tended` fails on `century` as of 26dfbe3, reporting **0 ticks
spent sitting with the hurt, 0 of them nursed back to full health** — in a world
where `hurt_person_days` is non-zero, so the check's own "nobody was hurt enough
to be worth tending" skip did not apply. Somebody needed tending and nobody
went.

This is not a regression from M9 phase 5 and the distinction matters. The check
skips entirely unless `sim.knownTech.has('herbalism')`
([simcheck.ts:1521](../tools/simcheck.ts#L1521)), and before this phase no
scenario in the suite ever got there: `traps` and `band` report *"nobody here
knows a herb from a weed"*, `culture` reports *"nobody in this world was ever
hurt enough to tend"*, and `century` reported the first of those. Reflection
pushes worlds far enough up the tree that `century` reaches herbalism, which
makes it **the only scenario in the suite that exercises tending at all** — and
the first time anything did, it failed.

So the finding is that `tend` has never been exercised end to end by the
harness, and on its first exposure nobody performs it. The likely cause is
`Brain`'s `tend` weight against `TEND_WORTH_IT`, which is exactly the class of
change M9 phase 5 was forbidden to make — `AGENTS.md` records that `Brain`'s
coefficients are calibrated against each other, and the plan schedules this
phase alone specifically so its measurement is not confounded. Worth its own
pass, with `ai-uses-many-actions` and a seed cohort.

### `spatial-hash-spreads` reads one instant, and trips on small worlds

`millers` fails it at **11 of 19 items in the largest bucket** against a bound of
`max(8, items * 0.5)` = 9.5. `base.spatial` is `sim.peopleHash.stats()` called
once, on the final tick ([simcheck.ts:2068](../tools/simcheck.ts#L2068)) — a
single snapshot of where nineteen people happen to be standing, not a measure of
anything over the run.

It is not a clustering regression, and that was checked rather than assumed.
Across the same before-and-after: `tiny` 4/8 → 4/8, `band` 9/30 → **6**/30,
`crowded` 10/70 → **9**/70, `hunters` 4/24 → 4/24, `millers` 7/19 → 11/19. Two
scenarios got *less* clustered and two did not move; only the smallest world
moved the other way.

Left alone deliberately. `AGENTS.md` says not to tune a check until it goes
green, and the honest reading is that the check is mis-specified at small `n`
rather than that the world is wrong: the floor of 8 exists to protect small
populations, and `items * 0.5` overtakes it at nineteen people — a band that
camps together. The check's stated purpose is that query cost has not "quietly
gone quadratic", which is a statement about large populations. Fixing it means
either sampling over the run instead of at one instant, or raising the floor,
and either is a change to a measuring instrument that should be made on its own.

## Found during M9 phase 4, 2026-09-11

### A relationship, once made, can never be forgotten

`RelationshipGraph.decay` ([Relationships.ts](../src/sim/social/Relationships.ts))
drops an edge whose components have all faded, and the comment above the
condition says exactly why: "an edge with nothing left in it is just noise in a
map that will hold centuries of acquaintances." The condition then requires
`rel.bias === 0` — and `introduce` stamps a bias of +18, +6 or −6 on every edge
the moment it is created, and nothing ever clears it. So no edge is ever
deleted. Every person anybody has ever spoken to, witnessed a deed by, or
walked past while working stays in their map for the rest of their life, at the
bare first impression their band membership implied.

This was harmless while edges were made only by conversations and witnessed
deeds. `SocialSystem.workingAlongside`, added in this phase, makes many more of
them: relationship edges roughly doubled on the twelve-day run, 352 to 718. That
is **the whole cost of the pass**, and it was measured rather than guessed —
with `settle` stubbed out and the query and the loop left in place, the
`crowded` scenario measures 1,330 steps/s against 1,115 with it, which is the
same figure the build had before the pass existed.

Not fixed here because deleting a faded edge changes what people think of each
other: somebody forgotten reverts to an opinion of 0 rather than staying at the
−6 an outsider was stamped with, which is a change to the social scorer and
wants twenty seeds of its own. The shape of the fix is to let `bias` decay like
everything else, or to exclude it from the emptiness test and re-stamp a fresh
first impression the next time the two meet — which is arguably what a first
impression *is*.

### `ORDER_COST` prices all four conversations the same

`orderCost` ([Authority.ts](../src/sim/social/Authority.ts)) is keyed by action
id, and all four rungs of `Conversation.ts` are the action `talk`. So ordering
somebody to sit down with a near-stranger for ninety ticks is exactly as much of
an imposition, in the compliance roll, as telling them to say good morning to
somebody they already like. The menu offers the rungs separately as of this
phase, so the player can feel the difference everywhere except in whether they
are obeyed.

Not fixed because `orderCost` takes only the action and threading the rung into
it touches `standingOver`, `command` and `assignJob` — a small change to a
function whose output feeds a refusal roll, which is to say a change that needs
measuring rather than reading.

### A sixth of all conversations are broken off for thirst

`doTalk` gained an interruption check in this phase, because the longest rung is
ninety ticks and `AGENTS.md` is explicit about long actions with no way into
them. It fires a great deal: a century run reports 663 conversations stopped by
thirst against 3,251 completed, so roughly one exchange in six ends with
somebody walking off to the river.

That is the check doing its job — they really are thirsty, and `thirsty` is in
`RESUMABLE_STOPS` so the conversation is picked up again — but it is also a
great deal of walking spent on conversations that do not happen. Worth knowing
before anyone concludes the rungs are not being used: they are, and a sixth of
them are abandoned. The likely cause is that `Brain` scores `talk` without
consulting `pressedByNeed`, unlike `play`, `tend` and `tame`, which are gated on
it for precisely this reason.

### Technologies known moved from 11.0 to 10.1 and did not come back

Letting a greeting carry a story (the last commit of the phase) fixed
`rumor-propagates` in two scenarios where it had reached zero, and cost nine
tenths of a technology across the canonical twenty-seed cohort. Survival and
starvation both improved in the same run, and every figure involved is inside
the range `AGENTS.md` says twenty seeds cannot resolve.

Recorded for the same reason the tech-kind split's 9.6 → 8.8 is recorded above:
the next person to touch the tech economy should know this moved here, and
should not attribute it to their own change.

### Two health checks are one or two events wide

Neither is a defect in the world and both cost time to diagnose during this
phase, so they are written down as a warning rather than as a bug.

`the-hurt-are-tended` on `century` passed on 151 tend ticks before this phase
and reported 0 after it, which reads like a broken healer and is not one: the
same build tends for 583 ticks at 80,000 steps, so the world simply reached its
first injury later. `hunts-succeed-and-fail` on `band` skips below eight
strikes and reported exactly eight kills with no misses on one build, while
`hunters` — the scenario built to exercise it — reported 9 kills against 5
misses on that same build. Both are the documented chaos of long scenarios
landing on a threshold, and `AGENTS.md` already warns about it for `century`;
the note here is that `band` has a knife-edge check too.

## Found during M9 phase 3, 2026-09-11

### The catalogue reads a stranger's knowledge to decide whether to offer a lesson

`personActions` ([ActionCatalog.ts](../src/sim/ai/ActionCatalog.ts)) computes
`teachable` from `other.knownTech` and the `discuss` options from
`other.skills` and `other.knownTech`. `AGENTS.md` forbids the UI reading a
stranger's private state and routes names, skills, condition and history
through `sim/social/Knowledge.ts`; what is in somebody's head is the most
private thing in the game and has no route at all. The options are computed in
the simulation rather than in the UI, which is why this has never tripped a
rule, but the effect on screen is the same: hovering a stranger tells the
player exactly which technologies that stranger holds.

The `ask` verb added in the same pass deliberately does *not* do this — it is
offered unconditionally and the refusals are spoken by `doAsk` — so the shape
of the fix is already in the file. Doing the same for `teach` and `discuss`
means offering them always and letting the action refuse, which costs the
player a greyed-out tooltip and buys back the knowledge gate. Not done here
because it changes what the AI-facing half of the catalogue reports and wants
measuring on its own.

### Nobody ever picks anything up off the ground but the player

`pickup` became a real verb in this pass, but only the radial menu issues it.
`Brain` has no score for it, so a heap of goods — what a dead forager was
carrying, the timber from a tree felled by somebody whose hands were full —
sits where it fell until a player walks over and collects it. `dropAt` is
called from several places in `ActionSystem`, so this is a genuine leak of
goods out of the economy rather than a rare case. Worth a scorer term weighted
by what is in the heap and how far away it is; not attempted here because a
new work verb competes for foraging ticks and wants twenty seeds of its own.

### A practice is easier to reach than a device, and only the numbers say by how much

Splitting `TechDef.kind` gave practices two roads to the testing bench — half
a dozen uses in the field, or a full insight worked out by thinking — against
a device's single road of materials plus a hundred and twenty ticks. Twenty
seeds put mean technologies known at 9.1 against 9.2 before the pass, so the
overall pace is unchanged, but "conceived past the root nodes" moved 9.6 → 8.8
and that is the one figure that did not come back. It is within the range
`AGENTS.md` says twenty seeds cannot resolve, and it is recorded here rather
than acted on for exactly that reason: the next person to touch the tech
economy should know it moved and should not attribute it to their own change.

## Found triaging the owner's notes for M9, 2026-09-10

Eight of the owner's thirteen open notes turned out to name real defects rather
than only missing features. Full diagnosis and where each is scheduled:
[m9_plan_words_and_hands.md](m9_plan_words_and_hands.md). Six of the eight are
now fixed and removed from this list; see `changelog.md`: the picker offering
only one candidate per kind and the near-identical node art that carried
`NODE_LABELS`'s type asymmetry along with it (M9 phase 1), `give_item`
discarding a real refusal and `doTake`'s fixed six-of-whatever grab (M9
phase 2), and — in M9 phase 4 — `doDiscuss` and `doTeach` changing no
relationship at all, and nothing in the world recording who sleeps under the
same roof. The second of those is answered without the occupant list it seemed
to need: `Simulation.shareTheHearth` reads geometric containment once, at
midnight, rather than keeping a list that would then have to be maintained
through every death, move and demolition.

### ~~`ponder` requires a workable idea, so a comfortable person with none just wanders~~

**Fixed 2026-09-12, M9 phase 5.** `reflect` is the verb for having nothing in
your head: scored as the strict complement of `ponder`, 20 ticks long with a
200-tick cooldown, and read by conception in two places. `idle`'s HUD label
stopped saying "thinking" in the same commit. See `changelog.md` for the three
numbers and why two of them are not the ones the plan expected to matter. The
original diagnosis follows.


`Brain.think` only adds the `ponder` score when `workableIdea(person)` returns
something ([Brain.ts:900-911](../src/sim/ai/Brain.ts#L900-L911)); with none, a
comfortable, unfatigued, unordered person falls to `wander` at score 0.02, which
reads on screen as idling rather than thinking. There is also no autonomous
"thinking" activity that can *originate* an idea with nothing to build on —
`tryConceive` ([KnowledgeSystem.ts:298-353](../src/sim/systems/KnowledgeSystem.ts#L298-L353))
never checks whether the person has been pondering at all. Scheduled as M9
phase 5, deliberately last: `Brain.ts:906-909` already records that raising
`ponder`'s weight once made thinking the sixth most common activity in the
world, ahead of building and sleeping.

### No state exists between bands, though `next-steps.md` said otherwise

`Band` ([Simulation.ts:104-119](../src/sim/core/Simulation.ts#L104-L119)) is
`id`, `name`, `homeX/homeY`, `norms`, `chiefId`, `outcast` — nothing about how
one band regards another. `BandSystem` is entirely intra-band, and `steal` and
`attack` do not check the victim's band membership at all. `next-steps.md` had
claimed bands carry "standing with each other" in its open-gaps section, which
O4 depended on; that line is now corrected there. War, raiding and slavery
between bands are designed in
[m9_plan_words_and_hands.md](m9_plan_words_and_hands.md)'s closing section, for
M10, after M8.2 gives a band something worth raiding for.

## The open question left by M8.1, 2026-09-10

### The food economy has no headroom for spoilage, and that is the finding

Not a bug in the mechanism — the mechanism works and is tested. It is a fact
about the world that only building it could establish, and it is the reason
`needs.spoilRate` ships at 0.

Twenty seeds on `traps`: mean survival **92.2% → 88.8%**, infant starvation
**4 → 10**, and one world in twenty collapsing where none had. Four rates
between 0.35 and 1 are indistinguishable from each other, so this is not a
coefficient. `preserving` does not recover it — the band that could preserve
survived *worse* than the band that could not, at 91.5% against 94.1%, which is
noise rather than a mechanism. Making stores nearly perfect keepers changed
nothing, which locates the loss in **packs**: people carry a great deal of food
and all of it rots.

What would have to change before the decay half is worth switching on:

- **People should not carry a larder.** The pack is where the loss lands, and
  the answer is not a better pack — it is a reason to put food down. That is a
  scorer question, and it is the same one the larder fix answered from the other
  side.
- **Or the supply half needs to bed in first.** M8.1 added fishing, traps,
  grinding and bone in one milestone; the world has not been played at length
  with all four. Measuring a supply *cut* against a food economy that has not
  settled is measuring two changes at once.

The full machinery is in place and `fishers` exercises it, so this is a one-number
decision whenever the answer changes.

## Found while building the rest of M8.1, 2026-09-09 — open

### `jobs-bias-work` has an effect smaller than its own seed-to-seed spread

The new `hunters` scenario failed it at **-0.9 points** — holders spending less
time on their own job's work than everybody else — and four other seeds of the
same scenario report **+0.8, +1.3, +1.6 and +1.8**. The bias is real and it is
positive; it is simply about a point and a half on a band of twenty, and the
spread between seeds is wider than that.

Every other scenario in the suite passes, so this is not a defect in `Brain`'s
job bias. It is a check that will go red on roughly one new scenario in five for
no reason anybody can act on, which is the mirror image of the two larder checks
this project deleted for looking reassuring and detecting nothing.

`hunters` is seeded `bone` rather than `ivory` because of this, and the scenario
says so in its own comment rather than quietly. **The fix is to widen the check,
not the scenario**: either measure it across seeds the way `sim:seeds` does, or
state a margin it has to clear rather than a sign. Not done here because
`jobs-bias-work` gates eleven other scenarios and rewriting it inside a content
pass is how a gate gets quietly loosened.

**Partly addressed in M9.5 phase 4c, and the rest still stands.** The sampler
now counts only from the first moment anybody in the world holds a job, because
`division_of_labour` opened every run with a jobless stretch that was landing in
the check's control group — a second, larger defect in the same instrument,
which on `craft` inverted the reading outright. That is a correction to *what*
is compared, not to the margin. The original complaint is untouched: the effect
is still about two points on most scenarios and the seed-to-seed spread is still
wider than that, so the check will still go red on roughly one new scenario in
five. The dedicated `labour` scenario reads +5.1 and is the one place the margin
is comfortable. Stating a margin, or measuring across a cohort, remains the
fix.

### `tiny` fails `food-work-continues`, and did before any of this

Recorded because it was hit repeatedly while measuring M8.1 and mistaken for a
regression twice. On `tiny` the check reports **0 ticks of food-gathering
continued through hunger (658 hunting)** — it is a one-band eight-person world
where the whole food economy runs through the hunt, and the thing the check
measures never comes up. It fails identically on the commit before M8.1's
stations landed.

Either the check needs the same kind of honest skip the other thin-scenario
checks have grown, or `tiny` needs enough forage in it to exercise the thing.
Neither is done here.

### An animal that has been fed forgets nobody, and is inherited by no one

`taming` sets `Animal.tamedBy` to a person id, and `heel` falls back to grazing
when that person dies. So a dog whose owner dies is a dog that quietly stops
following anybody, for ever, while still not fleeing from the dead person's id.
Nothing passes it to an heir and nothing lets a second person take it over.

Deliberate for this pass — inheritance of animals belongs with the herd
mechanics in M8.2, which is where `Animal.fedBy` gets its second reader — but it
is a loose end and not a design.

## Found while building M8.1's traps, 2026-09-09 — open

### Adult starvation rose while infant starvation halved, and nothing explains it yet

Across twenty seeds of the `traps` scenario against the same scenario without the
trap half of the ladder, mean survival is identical at 89.8%, but the deaths move:
**6 infants starved against 12, and 53 adults against 38.** The plausible reading
is that trap food is collected and eaten at camp, where the youngest are, and that
the walk to empty a trap is time an adult did not spend foraging for themselves —
but that is a story, not a measurement, and this project has a rule about shipping
a comment that asserts an unconfirmed cause.

Not fixed, and deliberately not tuned: the totals are inside the noise this
project already knows twenty seeds cannot resolve, and `TRAP_ROUND` in `Brain.ts`
is the coefficient anybody chasing it would reach for. Whoever does should measure
`forage` ticks per adult-day either side, not survival.

### A trap is sited from where the band was founded, not from where its people are

`planBuildings` searches out from `band.homeX/homeY`, which never moves, and the
ring search added for the fish trap makes traps as close to that point as the
coastline allows. Collection is then scored on proximity to whoever is walking
past. A band whose daily range has drifted away from its founding fire will
therefore keep a trap it rarely passes, and that trap fills and stops catching.

Not a defect in the trap so much as the absence of anything that moves a camp, and
worth remembering when M7's interiors or any later migration lands: the trap
sweep counts `trap_full_<id>` days precisely so this is visible when it happens.

### `sparks-are-various` now skips on any scenario handed six or more technologies

Added in this pass, and the trade-off is real in both directions. Without the skip
the check fails on `traps` for a reason that has nothing to do with the web: a band
handed eight nodes has almost nothing left to conceive, and it read "3 routes into
1 technologies". With the skip, a future scenario that starts people rich would
stop reporting a genuine collapse of the spark table.

The line is drawn at six because `craft` (four) and `scribes` (five) still answer
the question honestly and `traps` (eight) cannot. If a third rich scenario arrives,
the better fix is to measure routes against *what was left to conceive* rather than
against the whole table.

### `basketry` does not make stores cheaper, though the plan said it would

The plan's line for the node was "a `basket` item raising `carryFactor`; a cheap
material for stores". Only the first half shipped. Adding `basket` to
`storage_pit`'s materials would have made the pit — the first thing any band
builds — unbuildable until somebody could weave, which is the granary defect in
miniature and exactly what `buildings-ask-for-things-that-exist` was written
after. A new cheap store gated on `basketry` is the honest way to do it, and it
belongs with the rest of the tier rather than retrofitted onto the pit.

## From the owner's notes, triaged 2026-09-09

### "Needs 3 thatch to build one" after cordage was already made — **not reproducible**

Reported in `notes.txt`. Investigated on 2026-09-09 and the line cannot appear
in that situation any more: `TechWeb.detail` gates the whole prototype block on
`idea.stage !== 'proven'`, and `KnowledgeSystem.advance` never puts a proven
idea's stage back — refinement raises `techLevel` and leaves the stage alone. So
the note predates the fix rather than describing a live defect. Recorded here
rather than silently dropped, because "the owner reported it and nothing was
found" is worth being able to look up.

What the investigation *did* find was a blank: a proven design being refined
showed nothing at all in that pane, so somebody quietly improving something for
days looked idle. Filled in the same pass — see the changelog.

### The craft bar was reachable only by pressing `M` — **fixed 2026-09-09**

Reported as "cannot see the crafting menu for things that are not buildings".
The bar itself was correct: `renderCraftBar` renders, `availableRecipes` gates
per person on `techPower`, and the CSS is shared with the build bar. Two things
made it read as missing, and both are fixed:

1. **It had no button.** `B` and `M` were named in one line of HUD chrome that
   `H` hides. A menu nobody can find is missing whether or not it renders.
2. **It is usually empty.** Every recipe is gated on a technology, and
   [next-steps.md](next-steps.md) records that a typical run ends with two to
   five known — so the honest common case is a bar saying "they do not know how
   to make anything yet", which from outside is indistinguishable from a broken
   bar. It now says what it is waiting on.

### Three lines in `main.ts`'s Escape handler were dead code

`if (techWeb.isOpen) techWeb.close()` and its two siblings could never fire.
Each graph overlay registers its own bubble-phase Escape listener when it is
constructed, and all of them are constructed above the main `keydown` handler,
so they had already closed themselves by the time it ran. Harmless until
something needed to know whether Escape had been *consumed* — which the pause
menu does. Fixed with a capture-phase snapshot; the three lines are kept as belt
and braces and now say so.

## Found while building M6b phase 6, 2026-09-08 — open

### A job does not protect someone from the chief's own labour draft

`BandSystem.directWork` sends any available idle adult to build or haul for an
unfinished site, without asking what job they hold. A hunter can be drafted
onto a hut for the day exactly as readily as an unemployed person can, and
`Brain`'s job bias does nothing to stop it — an explicit order from `directWork`
goes through `command`, not the scorer, so there is no bias term for it to
weigh against. This is arguably correct today (a job is described everywhere
in the UI as "a lean, not a command"), but it means a band can never actually
protect its hunter from spending the week on scaffolding, which will read as a
bug the day the player has deliberately built a specialised workforce and
watches the chief draft it away regardless.

### `farm` and `smith` are real skills with nothing that trains or reads them

Both were added to `SKILLS` in this pass, deliberately, so that founding,
inheritance, ageing and the character-creation point budget all know about
them before M8 gives either one an action — see the comment beside `SKILLS` in
`Person.ts`. Until then they behave like `heal`, already in the roster and
already unused: a character can be built with points in `farm` and nothing in
the game will ever notice. Not a defect on its own, since `techs-have-effects`
and its siblings police *technologies* declared without an effect and a skill
is not a technology, but worth a name here so nobody mistakes silence from
`farm` for a bug once M8.2 exists to compare it against.

## Found while planning M8, 2026-09-08 — open

Seven findings from reading the code and instrumenting two runs. None was fixed,
because the pass was a planning pass; each is scheduled in
[m8_plan_the_ages.md](m8_plan_the_ages.md) at the point where it does damage.

### Only three of seventeen technologies are ever conceived — on one seed in twenty

**Corrected on 2026-09-08 by M8.0.** As written below this was a finding about
the game; it is a finding about the `century` seed, which is the worst of twenty.

A two-year `century` run ends in the Age of Fire with two technologies known to
anybody, and across the whole run exactly three nodes are ever conceived:
`cordage` (16 times), `plant_lore` (13) and `firemaking` (5). Every one of those
numbers reproduces exactly. Across the canonical twenty-seed cohort
(`npm run sim:seeds -- --seeds 20`) the same scenario averages **5.4
technologies known at the end, 4.2 conceived past the root nodes and 124 things
taught or picked up by watching**, and reaches depth two — `stoneworking` and
`leatherwork` — routinely. The century seed is the only one of the twenty that
never gets past a root node.

The research pipeline is healthy, which the original entry had right: 34 ideas
became 8 prototypes and 7 proofs off 139 ponder breakthroughs and 28 from
discussion. What is wrong is the conclusion that **the rate of discovery is set
by transmission**. Transmission tracks adult person-days almost exactly — 24
things passed on in a world with 1,405 of them, 194 in a world with twice that —
so on the collapsing seed the thin teaching is a symptom, not the cause. Sorting
the cohort by survival sorts it by the climb.

**The open defect is the collapse**, not the tree: two of twenty worlds fall
below a quarter of their peak population, and those two are the two worst
climbs. `conceptionBase` remains the obvious wrong knob, and so, it turns out,
does anything else in `KnowledgeSystem`.

### `sparks-are-various` passed while detecting nothing — fixed in M8.0

It reported "8 distinct spark routes fired" on the run above and passed — and
all eight routes belonged to those same three technologies. A check that reads as
healthy on a world where 82% of the tree has never occurred to anyone is exactly
the "looks reassuring and detects nothing" failure `AGENTS.md` warns about, and
this project has already deleted two checks for it. It now counts technologies as
well as routes and asserts both, and `the-tree-is-climbed` was added beside it.

### One `spawnRng` is shared by three spawn passes

`spawnResources`, `spawnHerds` and `spawnPeople` all draw from the same forked
stream, so **adding one entry to the `plan` array in `spawnResources` moves every
herd and every person in every world.** This is not a fork-order violation, so
`determinism.test.ts` does not catch it — it compares two runs of the same build.
Any pass that adds a resource kind and then measures itself against a baseline
will be measuring the reshuffle. Now recorded in `AGENTS.md`.

### `tracking` is unreachable, and two spark ingredients never occur

**`tracking` fixed 2026-09-08; `store_empty` still open, see below.** Found by
instrumenting the daily conception pass in M8.0. `tracking` is a **root node**
— empty `requires`, so every adult in the world qualifies for it on every day
of their life — and it was conceived in **none** of twelve instrumented
worlds, and independently reproduced at 1 of 20 seeds in the canonical cohort
before the fix. On the century seed it was one ingredient short of firing on
1,404 of 1,405 adult person-days, and the missing ingredient was always the
same one.

Two `saw:` ingredients in `TECH` are keyed to events that essentially never
happen:

- **`quarry_escaped`**, the weight-1.0 route into `tracking`, is emitted only
  when an animal gets more than twice `PURSUIT_LIMIT` away. `hunt_lost` is **2**
  over two in-game years. Tracking's other two routes need `doing: hunt` with
  hunger, or forest plus winter plus wandering, and between them they fire twice
  in two years and have never carried an idea. **Fixed**: a fourth route,
  `{ doing: forage, place: forest }` at weight 0.7, gives `tracking` an
  ordinary daily story that does not wait on a hunt. Measured across the
  twenty-seed cohort — see `changelog.md`. The three original routes are
  untouched.
- **`store_empty`**, the weight-1.0 route into `marking`, is emitted by `doTake`
  when somebody walks to a store and finds nothing in it. `Brain` scores stores
  by what is in them, so it never sends anyone to an empty one, and the counter
  is **0** in every run inspected. `marking` survives on its other two routes,
  so this one is **still open** but no longer blocks anything in M8.1.

`tracking` no longer blocks M8.1, which puts `snares` and `taming` behind it.

**A fifth ingredient found while fixing M7's zombie-order bug, 2026-09-10.**
One of the two "essentially never happen" original routes needs `{ kind:
'doing', action: 'wander' }`. It could not have been satisfied *ever*, on any
seed: `ActionSystem`'s `case 'wander': default:` discarded `MovementSystem`'s
return value, so `finish` — the only place `Person.noteDid` is called — was
never reached for a wander. M7's fix makes `case 'wander'` reach `finish`
honestly, which would revive this route as a side effect of a movement fix
nobody asked for there. `Person.noteDid` now ignores `'wander'` explicitly
(alongside the pre-existing `'idle'`/`'dead'`) to hold that off.

**Closed 2026-09-12, M9 phase 5, and not by reviving `wander`.** The route now
reads `{ kind: 'doing', action: 'reflect' }`, which is what it should have said:
somebody stopping in a winter wood to sit and think is the story, and walking
through one was never the part that taught anybody to read a trail. `noteDid`
still ignores `'wander'`, so the tech economy is not changed by the back door.

The class of bug is closed too, which matters more than the instance.
`synthesis.test.ts`'s **`names no action that nobody is ever recorded as having
done`** walks every `doing:` ingredient in `TECH` through `Person.noteDid` and
asserts it survives — the spark table already checked that action ids were
spelled correctly, and `wander` was spelled perfectly for the whole life of the
project while being dead. Mutation-verified: restoring `wander` fails it with
`tracking has a route through "wander", which noteDid never records`.

The repaired route is still deliberately rare — forest, winter, and having
lately thought — and fires **zero times in a century-long run**, so play cannot
distinguish it from the impossible route it replaced. A second test asserts it
fires on the `Notice` that should fire it. `marking`'s `store_empty` route
below remains open, but `marking` gained a `reflect` route in the same pass and
that one does fire.

### The RNG fork comment points at the wrong place

The named fork block ends at `recordRng` with a comment saying to append after
it, and there is an **anonymous fourteenth fork twenty-five lines below**, the
one handed to `seedInitialForest`. Appending where the comment invites you to
consumes that fork's draw and silently replants every forest in every saved seed.
Also now in `AGENTS.md`.

### `household.store` is written and never read

`LifeSystem` puts a dead person's goods into their household's store, and
**nothing anywhere in the codebase ever takes them out again** — verified by
grep; that line is the only reference to the field. An estate therefore
disappears into a container nobody can open. Harmless today, and it will become
visible the moment food spoilage exists, since it is the one stock whose losses
nobody will ever see.

### Two effects bypass `techPower`, and one weapon stat is ignored

Every technology effect is supposed to read the seam. Three do not:

- **`hafting`'s felling bonus** is `inventory.has('handaxe') ? 0.5 : 1` in both
  `doChop` and `Progress.ts` — item presence, unscaled by refinement. Refining
  hafting therefore does nothing to felling.
- **`armourOf`** reads `ITEMS[id].armour` directly, so hide armour protects
  somebody who could not make it and refining `leatherwork` is worthless.
- **`doHunt` uses the bare `REACH` constant** rather than the weapon's, so the
  bow's `reach: 1.6` does nothing while hunting — the one place it should matter
  most. `doAttack` applies reach correctly; only the hunt path misses it.

## Reported from play, 2026-09-02 — fixed

Five defects reported by the project owner after M6a. **All five are fixed**;
the diagnosis is section M6c of
[m6_plan_households_sleep.md](m6_plan_households_sleep.md) and the fixes are in
[changelog.md](changelog.md). Regression tests are in
`src/sim/__tests__/orders.test.ts`.

Four of the five were one root cause: the simulation never told the player why
an order stopped. `interruption()` returns eight reasons and `abandon()` a dozen
more, and all of them were telemetry counters only. They now reach a floater and
the panel's action line.

One thing worth carrying forward from that pass: **the berries-versus-flint
asymmetry was not eliminated, and cannot be by tuning.** The interruption
thresholds are absolute need levels, so whether a job is ever interrupted
depends on how long it runs — berries are stripped in 148 ticks and never cross
the line, flint takes 416 and always does. What was fixed is the *consequence*:
interrupted orders are now set aside and picked back up, so the job gets done
either way. If someone later wants the rule itself to be uniform, that is a
redesign of `interruption`, not a coefficient change.

## Fixed in M6b phase 1

### The longhouse was never buildable

`BUILDINGS.longhouse` was gated behind `requiresTech: 'carpentry'` while
`'carpentry'` was not a member of `TECHS`, so nothing could ever satisfy the
gate. The best shelter in the game was unbuildable for its entire existence and
sat permanently in `lockedDesigns()`, which is exactly how it stayed invisible:
a locked design looks like content you have not reached yet. `carpentry` is a
real technology now, and `tech.test.ts` asserts every `requiresTech` in
`BUILDINGS` names one.

## Fixed in M6b phase 5, 2026-09-07

The three things reported in `docs/notes.txt`, and four defects found beside them.
Diagnosis and reasons in [changelog.md](changelog.md).

- **Work was interrupted by the need it was answering** — a forager stopped
  picking berries because they were hungry. The limits are contextual now.
- **A proven design went on advertising its prototype cost.** `TechWeb.detail`
  asked whether an idea existed, not what stage it was at, and an idea survives
  being proven.
- **A failed trial destroyed the work and the materials**, so a design could look
  permanently stuck. Proof accumulates and cannot go backwards.
- **There was no craft menu**; `RECIPES` was reachable only by right-clicking
  bare ground, and unmakeable entries were hidden rather than greyed.
- **`hunt` was never gated by `pressedByNeed`**, the same defect crafting was
  fixed for in pass A. Latent until thirst started answering to exertion, at
  which point it cost a run its entire population.
- **`doHunt` never told the player anything**, calling `finish` directly.
- **The build bar printed raw technology ids.**

### Nobody fetches materials for something they want for themselves

The reason the hand axe has always been rare, found while trying to write a
health check for weapons and worth more than the check was.

`Brain`'s craft term only scores a recipe whose ingredients are **already in the
pack** (`hasIngredients`). Pass A taught the scorer to go and fetch ingredients
for a recipe a *building site* is waiting on — `gather_for_site` looks up the
recipe and fetches its parts — but there is no equivalent for `keep`, the "you
want one of these on you" case. So a personal craft only ever happens when the
right materials happen to have been picked up for some other reason.

The numbers: the whole `craft` scenario, whose founders already know how to knap
and now how to make a spear, yields **one spear and two hand axes** across
twenty-four people and eight thousand steps, against twenty pots — because the
pots are what a granary is waiting for and the axes are not waiting for anything.

This is why `weapons-are-made-and-used` was written and not kept: whether an
armed blow lands in a given run is chance, and a check on it is either flaky or
permanently n/a. The mechanism is asserted in `combat.test.ts` instead.

Not fixed here because it is a scorer change and `Brain`'s coefficients are
calibrated against each other — a new fetch term competes with foraging for the
same ticks, and this pass had already spent its risk budget on the needs rework.
It is the obvious next thing for anyone who wants weapons, axes or clothing to be
ordinary rather than occasional.

## Open — behaviour, found in phase 5

### Nobody knows how often the owner thinks people drink

The note asked for "twice a day at baseline, four times under hard work or in
summer", against a reported "several times a day". The report can now measure it
and the answer is **0.07 to 0.22 completed drinks per person-day** across every
scenario — two orders of magnitude below the target and well below the
complaint.

The gap is almost certainly what is being counted. The walk to the water happens
*inside* the `drink` action, so what a player watches is a character heading for
the river, and there are far more of those than there are drinks that run to the
bottom of the thirst: `century` spends 8,255 ticks drinking to produce 563
completions, so roughly half of all trips are broken off part-way. Somebody
watching two or three characters at speed would reasonably call that "several
times a day".

**This pass therefore did not tune to the number**, because tuning to a number
whose definition is unknown is how you ship a coefficient chosen by noise. What
it did is give thirst the *shape* the note describes — sleeping is cheap, felling
a tree in July is not — and lower the base rate, which took drinking ticks down
by 27% and thirst interruptions from 72 to 18 on `century`. If the owner wants an
actual frequency, `drinking-is-paced` is the instrument and the first question is
which of the two numbers they mean.

### The proof bar can sit still for a long time

`trialChance` is 0.18 a day and a design needs three good trials, so the median
gap between building a prototype and proving it is now appreciably longer than it
was under the single roll — around three weeks of game time at the shipped
numbers. That is the intended shape: the days between building a thing and
believing it are no longer silent, since each trial fires a floater and moves a
bar. It has not been checked against how it *feels* at normal speed, which is a
question only play answers.

### `century/population-persists` fails, and it is not this pass

10 alive against a threshold of 11. Investigated rather than tuned: the same seed
ends at **8** with `conceptionBase` restored to its old 0.045, and at 10 with the
thirst model wholly neutralised, so the build under test is if anything the
better of the three. Twenty seeds moved 72.7% to 75.0% over the pass. This is the
divergence `AGENTS.md` warns about on this scenario. The check has *not* been
moved to accommodate it.

## Fixed in M6b phase 4, 2026-09-07

- **Children were excluded from knowledge entirely**, so a parent could not
  teach their own child anything and every technology had to be re-derived from
  nothing by each generation.
- **Neither the scorer nor the radial menu checked a pupil's prerequisites**,
  though `KnowledgeSystem.teach` has always dropped what a pupil cannot follow.
  People were sent to give lessons that could not land, and the menu offered a
  Teach that silently did nothing.
- **A long single-pull job could never be finished by a novice.** Carving a
  stone was twelve hundred ticks and thirst interrupts at four hundred, so the
  action restarted from nothing every time. Work banks on the record now.

## Open — behaviour, found in phase 4

### Reading only happens when the chain breaks

By design, and recorded because it looks like a defect from the outside. A
living teacher is quicker to reach than a stone across the valley, so `read`
fires when the last holder of something is dead or when a record carries
something newly worked out. Neither happens inside a fifty-eight-day run, so
`scribes` shows plenty of carving and no reading. A twenty-four-thousand-step
run does produce both (`read_firemaking`, `recovered_firemaking`).

If it should be more common, the lever is not the `read` weight — it is how
readily knowledge is *lost*, which is the same lever as mortality.

### `people-survive` asks the wrong question of a run between one and two years

The check demands 67% survival below two in-game years and switches to "the line
continues" above. That threshold was calibrated against runs of twelve to
thirty-three days; nothing in the suite sat between thirty-three days and two
years until `scribes` did. At a hundred days the world loses more than a third
of its people to two winters, and an **illiterate control at the same length
survived worse** (6/24 against 10/24), so it is the question and not the world.

Left alone deliberately: moving the survival bar is a food-economy decision and
this was a knowledge-transmission pass. `scribes` is fifty-eight days, which
sits inside the calibrated range. Whoever takes on the supply half of
`next-steps.md` §0 should fix the check as part of it.

### A half-cut record can be orphaned

If the carver dies or wanders off and nobody else is literate, a stone sits half
cut with its flint already spent. The scorer prefers finishing a nearby
half-cut record over starting a new one, so this self-heals wherever there is a
second scribe, and does not where there is not. That is arguably the right
story; it has not been measured.

### `clay_tablet` is not portable

The plan called clay tablets portable. They are not: they are cheaper, hold two,
and perish, which are three real differences the world acts on. Portability was
dropped because **nothing in the world would read it** — bands do not move camp,
and a `portable` flag nothing acts on is precisely the class of declared-inert
content this project keeps deleting. It comes back with whatever gives it a
consumer.

## Fixed in pass A, 2026-09-06

Four defects, three of them reported from play and one found while checking the
other three. Diagnosis and reasons are in [changelog.md](changelog.md).

- **`doCraft` had no interruption check** — 258 ticks for a novice during which
  nothing at all could reach the knapper, and no report to the player when the
  stretch ended.
- **The granary was unbuildable**, and in four separate ways: nothing produced
  `pottery`, `doCraft` knew only the hand axe, `Brain` could not fetch a
  material that has to be made rather than found, and **no band ever planned a
  granary or a longhouse at all** — `planBuildings` chose between three
  hardcoded ids and never asked what its members could actually raise.
- **A refusal by authority never set `lastRefusal`**, so the player read a bare
  "X refuses" while `standing.because` was computed and discarded one line
  earlier.

## Found during pass A — open

### The screenshot tour had quietly stopped showing what it claims to

Two shots in `e2e/screenshots.spec.ts` were pictures of the player's own panel
rather than of a tree and its menu. The tour runs at 120 steps a second and the
camera follows the player, so a screen position read in one round trip pointed
somewhere else by the time the click landed in the next. Fixed by pausing for
those shots — but the general point stands and is worth remembering: **the tour
asserts nothing, so it degrades silently.** Anything that depends on a click
landing needs the world held still, and anything it stops showing has to be
noticed by a person looking at the images.

### The player is not told when a chief is refused

`BandSystem.directWork` goes through `Simulation.command` like any other order,
so a refusal there now sets `lastRefusal` — but nothing reads it on that path,
and `reportInterruptions` in `main.ts` filters to `person.isPlayer` or the
person the player is currently commanding. A chief being told no by their own
band is invisible unless you happen to be one of the two people involved.

Deliberately left. Whether the player should see refusals between NPCs at all is
a question about omniscience rather than a defect: the same gate is why insights
and deeds are reported only within sight of the player's own character. It wants
an answer, not a patch.

### What is drawn and what is clickable are up to a third of a tile apart

Interpolation moved the drawn position off the stepped one, while hit-testing
still asks the simulation's spatial hashes — as it should, since the alternative
is the renderer answering questions about where things are. The gap is at most
one step of movement, 0.32 tiles at `BASE_SPEED`, and `GRAB_MARGIN` 0.25 plus a
person's 0.45 hit radius absorb it comfortably. Recorded because it is a real
difference that did not exist before, and because it will grow if anything ever
moves faster.

### Floaters do not follow the entity they are about

`Floaters.push` freezes a world position at the moment it is called, so a label
over somebody walking is left behind by up to a step. Visible now that people
move smoothly rather than in jumps. The clean fix is an optional `followId` on
`Floater`; it was not worth widening this pass for.

### Crafting is interrupted often, and NPC crafts are not resumed

`person.resume` is only set for *ordered* work — `noteStop` returns early when
`person.order === null` — so an NPC whose craft is broken off by thirst simply
starts again from the beginning later, losing the ticks already spent. Nothing
is lost but time, since materials are consumed only on the last tick, and the
alternative is set-aside errands accumulating on people nobody is watching. In
the `craft` scenario this shows up as 14 broken-off attempts against 10 finished
items. Worth revisiting if crafting ever becomes central rather than occasional.

## Found during M6b phase 2 — open

### Band membership is never reassigned on marriage

`Person.bandId` is set at birth or at founding and nothing ever changes it.
Marriage merges *households* (`Simulation.mergeHouseholds`) and leaves both
spouses in the bands they were born into, so a woman who marries into the band
across the valley remains, forever, an outsider to every social measurement and
to anything that reads `bandId` — chief authority, exile quorums, `ownerBandId`
on a store.

Found because it broke `kin-outrank-strangers` on the century seed: that check
compares mean opinion for household, band and outsider ties, and one cross-band
marriage in a population worn down to twelve survivors put mean *stranger*
regard above mean *band* regard. The check itself had a real defect alongside it
— its three categories were not disjoint — and that is fixed. The underlying
model is not.

Not fixed here because it is not a phase 2 problem and it is not small:
reassigning `bandId` on marriage touches chiefs, exile, band-owned stores and
who counts toward an era, and every one of those wants a deliberate answer to
"which band does a married couple belong to?" rather than a default.

### Nobody hunts, so hides are scarce

Known since M6a and unchanged, but phase 2 made a consequence of it visible.
Over a two-year century run hunting accounts for under a hundred ticks out of a
million, so `hide` — added in this pass, taken off every kill — almost never
enters the world. Clothing's heaviest spark is cold hands holding fur, and in
practice it is the *other* routes that fire.

The prototype cost was moved off hides for exactly this reason, because an idea
that can be had and never built is inert content. The spark is left alone: it is
the right story, and phase 5's weapons and `tracking` are the intended fix for
the hunting rate rather than anything in the knowledge system.

### A century run reports fewer technologies than it feels like it should

**Superseded 2026-09-08 — see "Only three of seventeen technologies are ever
conceived" at the top of this file.** The instrumented run this entry asked for
was done, and the answer was not a slow stage in the pipeline. Original text
follows.

Four to seven proven technologies over two in-game years, against five for the
build before this pass. That is not a regression in reachability — the pipeline
now has five stages where it had one roll, and `ideas-are-conceived` reports
around one idea per person-year with eleven distinct spark routes firing — but
it does mean the *rate* is set by the slowest stage rather than by
`CONCEPTION_BASE`, and nobody has measured which stage that is. Worth an
instrumented run before anyone reaches for the conception constant, which is the
obvious wrong knob.

## Open — behaviour

### The island supports a population, but only just

**Was the biggest open problem; substantially fixed 2026-09-02.**

`npm run sim:seeds` measures this properly — a single `century` run is too
chaotic to read. Across ten seeds, mean survival over two in-game years went
from **40% to 59%** when the larder gate was fixed, and the two seeds that
collapsed outright (one to two survivors) stopped collapsing. Details in
[changelog.md](changelog.md).

What remains, and it is a different problem from the one that was fixed:

- **Deaths have shifted to adults** — 99 adults against 40 infants across ten
  seeds. Distribution is no longer the constraint; total food is.
- **Redistribution cannot help further.** The `feed` behaviour measurably moves
  deaths from infants to adults without changing the total, which is what you
  would expect: handing food around does not create any.
- The levers left are supply-side — forage density, hunting yield (currently a
  garnish, see below), or a slower birth rate — and each is a design decision
  rather than a tuning one.

Do not attempt to fix this by tuning `interruption()` thresholds or the scorer's
food weights. That ground has been covered and the numbers are in the changelog.

### Hunting is rare — fixed in phase 5, kept for the diagnosis

**Fixed 2026-09-07 by weapons.** `hunts-succeed-and-fail` now reports 12 kills
against 9 misses on `craft`, where it had reported n/a for the whole life of the
project. The diagnosis below was right and is kept because it names the mechanism:
the answer turned out to be the second half of it — an armed hunter does not have
to outlast the animal.

`hunts-succeed-and-fail` reported **n/a** on most scenarios — "too few strikes to
tell". A 3,000-step band run produced about three kills. The chain works end to
end (`people-eat-meat` passes, meat is taken and eaten), but wild meat is a
garnish rather than a food source.

Causes, both deliberate and both probably overtuned:

- A fresh deer is faster than a person and re-alarms whenever a hunter comes
  within its notice radius, so a hunt only ends once stamina is drained.
- Herds are sparse relative to berry bushes, and `Brain` searches only
  `sightRadius * 1.5` for a quarry.

### Courtship nearly stopped after founding families landed

Over two in-game years the `century` scenario went from 177 courtships to
around 8. This was investigated and is **not** the courtship gate — lowering
`opinion > 5` to `> 0` changed the number not at all, and that change was
reverted rather than shipped with a comment asserting a cause the data
contradicted.

The actual cause appears to be demographic: a world founded from married
couples has almost no unmarried adults in it, so there is nobody to court until
the founding children grow up. Marriages still happen (10 over two years) and
births still happen, so this may be correct behaviour rather than a defect —
but it has not been confirmed, and it deserves a look before anyone tunes
courtship.

### Winter still kills the unlucky

Exposure is a leading cause of death in a long run. Bands build more shelter
than they used to (the planner counts floor area now, not roofs), but a band
that loses its builders in one bad season does not recover.

### Exile never fires in practice

`exiled` is 0 across every scenario. The threshold is −28 average opinion with
a quorum of four, and M6a raised the starting point for outsiders from −14 to
−6, so a stranger now has further to fall. Deeds should still dominate, but the
mechanism is currently untested by any run in the suite.

## Open — measurement

### Ten seeds cannot resolve a change of under about ten points

Found during M6b phase 1, and it changes how the food economy should be
measured from here on. Four variants of one change, none of which touched the
food economy deliberately, produced ten-seed mean survivals of 73.1%, 65.2%,
64.4%, 63.6% and 59.3%. At one point a **strictly better** skill-learning rate
measured nine points *worse* than the version it replaced, which cannot be a
mechanism.

Twenty seeds is tighter: 65.7% before the phase against 64.6% after it.

The practical rule: `npm run sim:seeds` at its ten-seed default is only good for
changes the size of the larder fix, which moved 40% → 59%. For anything smaller
pass `--seeds 20`, and never tune against a single ten-seed figure — that is how
you ship a coefficient chosen by noise and a comment asserting a cause the data
does not support.

### `food-work-continues` flips on a one-tick margin on `tiny`

Found landing fishing (M8.1, mechanism 2). The check was already passing
`tiny` by the barest possible margin — one tick of food-gathering pushed
through hunger, against a floor of more than zero — and adding fish as a
second food option, with no change to `interruption()` or to `tiny`'s berries,
flint or people at all, tipped that one tick to zero and failed it. Confirmed
by stashing the fishing changes and re-running the same seed: 1 before, 0
after. Not investigated further, because it is exactly the class of thing
`AGENTS.md` already warns about — a single small scenario amplifying an
unrelated change into a threshold flip — and guessing a new floor from one
run is how a coefficient gets chosen by noise. Left as-is; whoever next
touches food-gathering-under-hunger on `tiny` should know this check has no
margin to spare there.

### Older-child starvation may have risen, and nobody has confirmed it

Over twenty seeds, starvation among children older than five went from 9 to 27
across the phase-1 changes, while infant deaths (80 → 77) and adult deaths (195
→ 195) did not move. That is a large relative change on a small count and it may
well be noise on the same scale as everything above, but it is the one number in
the cohort that moved in a direction worth checking. It has not been
investigated.

## Open — interface

### The panel's work bar is the only thing patched between rebuilds

`Hud.refreshPerson` patches the action line, the need bars, the score table and
the work bar. Everything else in the panel is only correct because the cache key
(`selectionKey`) happens to change. The key now folds in `inventory.version` and
whether a work bar exists; anything else that changes without changing the key
will go stale the same way the Kit tab did. If a future action mutates a pack
many times per tick, the key should become a throttle rather than a raw counter.

### `Camera.following` is public and the tests set it directly

Three e2e specs snap the camera to an off-screen target and set
`camera.following = false` to stop the frame loop dragging the view back. It
works and is honest about what it is doing, but it is a test reaching into
render state.

## Traps that bit during M6a and will bite again

### An author `display` beats the browser's rule for `hidden`

A full-screen overlay styled `display: grid` stays laid out when its `hidden`
attribute is set, and silently swallows every click on the game underneath. The
project had already learned this once — `.succession` carries a comment about
it — and M6a reintroduced it twice, in `.newgame` and `.picker`, which broke
sixteen e2e tests at once with a message about an invisible div intercepting
pointer events.

**Every overlay needs an explicit `[hidden] { display: none; }` rule.**

### `git worktree remove --force` follows directory junctions

Creating a junction from a scratch worktree to the project's real
`node_modules`, then removing the worktree, deletes the real `node_modules`.
Recovering costs an `npm install --legacy-peer-deps`. Do not link into the
project from a directory you intend to delete.

### Two definitions of "in the world"

`simcheck` hand-wrote `person.x > width - 1` while `World.inBounds` uses
`x < width`. Someone standing at x=127.6 on a 128-wide map, on a walkable tile
the movement system had just approved, was reported as having escaped the
island. The check now asks the world. Do not recompute a predicate the
simulation already owns.

## Found reading the code for M7 (movement and A\*), 2026-09-10

### The radial menu's "Pick up" has no reach test

`ActionCatalog.ts`'s `case 'pile':` gates the option on `actor.carrying <
actor.carryCapacity` alone — nothing checks the actor is actually near the
pile. `Simulation.takeFromPile` does not check distance either. A pile visible
on screen but far from the player's character currently offers "Pick up" as
enabled and, if clicked, hands over the goods with no walk and no distance
check at all — every other radial verb that acts at range routes through an
order and a walk first. Not touched in the M7 pass, which only widened
`takeFromPile`'s signature (M9.3, `issuePickup`) without changing when the
option is offered.

### `heel` has no stuck handling at all

`WildlifeSystem.heel` (a tamed animal keeping up with its owner) calls
`moveToward` directly — the same greedy primitive people used before M7, with
none of `MovementSystem`'s stuck detector, let alone a route from
`Pathfinder`. A tamed dog following its owner around a headland will press
into the shoreline indefinitely, the same way a person once did.

Less badly than before, though: M7 stage C's fixes to `moveToward` itself are
shared by everything that walks. The two axis fallbacks no longer "succeed"
while displacing nothing, and the perpendicular slide now tries both hands
rather than one, so an animal pressed square into terrain does at least come
off it. What animals still lack is the *route* — nothing calls `Pathfinder`
for them, and nothing measures whether they got anywhere.

Deferred to a future wildlife pass with its own measurement, because giving
animals a path is a food-economy-adjacent change and does not belong inside a
pass whose seed cohort is measuring people.

**Correction, M7 stage C.** This entry used to add "`moveToward`'s jitter
branch draws from `moveRng`, which animals and people currently share", and
that is false. `Simulation.ts:271,278` hands `moveRng` to `MovementSystem`
alone; `Simulation.ts:289,1845` hands `wildlifeRng` to `WildlifeSystem`, which
passes `ctx.rng` at all three of its `moveToward` call sites. The two streams
are separate, and the note mattered because it is the sentence a future reader
would have sized the RNG risk from.

### `Building` measures tiles from their centres and `World` from their corners

`Building.centerX` is `this.x + width / 2 - 0.5` and `contains` tests
`[x - 0.5, x + 0.5)`, so a building treats tile `(x, y)` as the *square
centred on* the integer coordinate. `World.index` truncates, so everything
else in the game treats it as the square whose north-west *corner* is that
coordinate. The two conventions are half a tile apart, and `Renderer.ts`
compensates with a literal `- 0.5` in two places while nothing else does.

Not a live bug: every offset it produces is smaller than `ARRIVAL_RADIUS`, so
nobody currently fails to reach a door because of it. Filed because it is the
same class of defect M7 stage C spent a commit on at the other end — an aim
point half a tile from where the walkability test thought it was — and the
next person to hit it will hit it from the building side.
