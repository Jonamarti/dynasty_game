# Dynasty

## Human introduction
This is an experiment to see first hand what would AI vibe coding a game look like. 
I tell the AI the features I want or the bugs Ive seen, tell a big model to do
the planning and then a less powerful model to write the code. Once in a while 
I interrupt the plan flow to introduce changes that the AI has to rewrite into the
plan, something like what Agile development is like, with the client requesting changes to features mid development.

## AI summary
A life-and-lineage simulation. You play one person in a world of people who have
their own needs, skills and agendas — you gather, craft, trade, ally, steal or
kill, and everyone who saw you do it forms their own opinion and passes it on.
Starts in the Stone Age; knowledge is held by individuals, spread by teaching,
and lost when the last person who knew it dies.

Working documentation — architecture, known bugs, next steps, performance and a
dated changelog — lives in [docs/](docs/). If you are an AI agent, start with
[AGENTS.md](AGENTS.md).

**Milestones 0 through 6a are done and playable.** A seeded island; bands of
people with needs, skills and their own agendas; a witnessing-and-gossip layer
where deeds are judged by each culture's own norms; a right-click radial menu of
context-sensitive orders; buildings from sticks, thatch and daub; and everything
the inspector tells you filtered through what your own character actually knows.

People court, marry, bear children, grow old and die - and when your character
dies the game hands you their heir rather than ending. A twenty-year run turns
over three generations and the population sustains itself.

The land keeps time too. Trees grow over decades, bear apples, pears, plums and
hazelnuts in their seasons, and do not come back when felled - the only new
trees anywhere grow from seed cast by trees still standing.

Bands choose chiefs, decide for themselves what to build, and cast out people
their norms cannot tolerate. Household heads give orders that are obeyed or
refused to their face. And knowledge is held by individuals: fire is worked out
by one curious person on a cold night, taught to whoever will listen, and lost
outright if the last person who knows it dies without passing it on. A twenty
year run reaches the Age of Tools. See [Roadmap](#roadmap).

**Play the current build:** <https://jonamarti.github.io/dynasty_game/> — rebuilt
from `master` on every push. To run it locally instead:

```bash
npm install --legacy-peer-deps   # see "Installing" below
npm run dev                      # http://localhost:5173
```

**Controls** — `WASD` walk · `click` inspect anyone · `right-click` open the
action menu on whatever is under the cursor · `B` build · `C` command ·
`1`–`5` switch panel tabs · `P` fold the panel away · `H` hide the whole
overlay · `space` pause · `wheel` zoom.

A click on a crowded tile puts up one bubble per thing under the cursor and asks
which you meant. `?skipIntro=1` skips the character-creation screen.

Add `?seed=anything` to the URL to replay an exact world. The simulation is
deterministic from its seed, so a world you liked, or a bug you saw once, can
always be brought back.

## Verifying a change

Four layers, fastest first. `npm run verify` chains them.

```bash
npm run typecheck      # tsc --noEmit                      ~3s
npm test               # unit + determinism tests          ~1s
npm run sim:check:all  # world health, every scenario      ~15s
npm run e2e            # Playwright browser tests          ~21s
```

**`npm run sim:check` is the one to reach for first.** It runs the simulation
headlessly and prints a world health report — population over time, an event
histogram, the action distribution, relationships, buildings, and thirty-eight
named checks that say whether the world behaves the way the design intends.
Checks a scenario cannot exercise report **n/a** rather than passing silently: a
summer run has nothing to say about shelter, and a single band has nobody to
treat as a stranger. It is the difference between "it
compiles and renders" and "people actually drink".

```bash
npm run sim:check                             # the default 'band' scenario
npm run sim:check -- --scenario century       # tiny | band | crowded | century | harsh-winter
npm run sim:check -- --steps 20000            # longer run
npm run sim:check -- --json                   # machine-readable
npm run sim:seeds                             # ten seeds at once: mean survival,
                                              # collapses, and who starved
```

One run is not enough to tell whether a change to the food economy helped. A
long run is chaotic — two runs of different code produce very different islands —
so `sim:seeds` runs the same scenario across ten seeds and reports the mean. It
exists because a band once starved to death beside a storage pit holding
fourteen hundred items while every named check passed.

When an NPC does something baffling, ask why. This prints one person's utility
score table tick by tick, which is the actual reason for every decision they
make:

```bash
npm run why -- --scenario band --person 0 --from 1700 --to 1760
```

That tool paid for itself immediately. It showed a woman scoring `drink: 2.96`
as her top choice every single think tick while standing still and dying of
thirst — the shore-detection radius was one tile too small, so she reached the
water's edge, was told there was no water, and gave up. From the outside it
looked like a balance problem for hours.

The health report has caught several more since. The social layer first produced
a murder spiral (one theft, a revenge beating, and thirty people dead in a
fortnight), then the opposite — nobody fought, but two well-fed people passed
the same handful of berries back and forth twenty-six thousand times, each
transfer a public act of generosity every bystander dutifully admired. Both were
the same underlying mistake: a social act that costs nothing and can repeat every
tick is not an act, it is a loop.

The worst one only appeared in a twenty-year run: an entire island starved to
death with the map full of food. People walking almost due south into a
shoreline were blocked, fell through to the east-west fallback, and moved four
ten-thousandths of a tile - which the stuck detector counted as *success*. They
slid sideways forever, never gave up, and starved standing still six tiles from
a berry bush. The detector now measures actual displacement, and `npm run why`
was what showed the distance-to-target frozen tick after tick.

Letting work continue until something stops it produced its own version of the
same lesson twice over. Felling ran off a single uninterruptible timer hundreds
of ticks long, so woodcutters chopped steadily through to a hundred thirst and
died holding the axe - and `npm run why` printed `drink` far down their score
table, because a committed person never re-scores and the table was from before
they picked up the axe. The tool now says `[committed]` when that is what you
are looking at. Then, once work *could* be interrupted, whatever threshold
interrupts it becomes the level a need parks at: setting the hunger cut-off at
55 gave a band whose average hunger sat at 55.

M3 produced a third variation on the same theme. Once a chief could order people
to work, an ordered builder was `committed` - so the brain would not re-plan for
them - and `doBuild` had no interruption check. Chiefs put people on huts and
they built through hunger, thirst and nightfall until the roof went on or they
died. A single winter took twenty-two of thirty-six. Every long job needs the
check; that is now the rule rather than a thing to remember.

`npm run shots` writes a screenshot tour to `artifacts/screenshots/`.

## Architecture

```
src/
  sim/          PURE simulation. No DOM, no renderer imports, no Math.random.
    core/       Simulation, World, TimeManager, RNG, SpatialHash, Telemetry
    entities/   Person, Household, Tree, ResourceNode, Building, Animal,
                Item/Inventory, ItemPile
    ai/         Brain (utility scorer), ActionCatalog (every verb, and when)
    social/     Events + norms, Memory, Relationships, SocialSystem, Authority,
                Knowledge (what one person can tell about another)
    knowledge/  Tech definitions and eras
    systems/    Needs, Movement, Action, Life (aging, birth, death, inheritance),
                Forest (growth, fruiting, seeding), Band (chiefs, building,
                exile), Knowledge (discovery, teaching, watching),
                Wildlife (herds, grazing, flight), Founding (the opening world)
  render/       Canvas 2D renderer, Camera, Floaters
  ui/           HUD (five-tab character panel), RadialMenu, EntityPicker,
                NewGame, Succession
  data/         Name syllables (recipes and knowledge go here)
tools/          simcheck (library) + headless / scenarios / why (CLIs)
e2e/            Playwright smoke tests and screenshot tour
artifacts/      Test output — git-ignored
```

Three rules hold the design together.

**The simulation never imports the renderer.** `src/sim/` is pure data and
logic; the renderer reads it and never writes back. That is what lets the
headless harness run exactly the code the browser runs, thirty times faster than
real time.

**Nothing calls `Math.random()`.** Every draw comes from a seeded `RNG`, and
subsystems take forked streams so that adding a draw in world generation does not
shift every later draw in the AI. A determinism test asserts that two runs of one
seed are byte-identical after 500 steps. This is what makes a bug in year 140
reproducible instead of a ghost story.

**The wood keeps time in years.** Everything else in the world regrows on a
timer measured in hours, which makes it scenery - strip a berry bush and it is
back within the season. A tree takes thirty years to be worth an axe, felling it
is permanent, and a forest only persists because some of the trees standing now
survive to seed. Cut a valley to stumps and it stays bare for as long as the
game runs. That asymmetry is what turns gathering into husbandry and gives a
dynasty something worth planning across generations.

**Knowledge is held by people, not by a civilisation.** There is no global tech
tree and no unlock. Fire is worked out by one person under need pressure on a
cold night; it spreads because they teach it, or because somebody standing near
them picks it up; and it leaves the world entirely if the last person who knows
it dies first. The era is *read off* the population - the world is in the Age of
Tools when enough living adults know the four things that name it, and it can
fall back out again after a bad winter. `Simulation.knownTech` is recomputed
from who is alive every day rather than stored, so nothing anywhere has to
remember to take a thing away.

**Authority is a roll, not a switch.** A household head is obeyed by their own
kin about three times in four; a well-regarded chief gets roughly half of what
they ask; nobody at all can order a killing. Refusal is public, costs the leader
regard, and goes in both chronicles - it is a first-class outcome, not an error
path, and it is where most of the drama in a family lives.

**The player is not omniscient.** Everything the inspector shows is filtered
through `sim/social/Knowledge.ts`: a stranger is "a man, about thirty", with no
name, no skills and no life story, and a berry bush reads as "picked over"
rather than "3" until you are close enough to count or skilled enough to judge.
The whole design rests on reputation being local - held in the heads of people
who saw something - and a UI that reads out a stranger's private state hands the
player exactly the god's-eye view the simulation is built to withhold.

**Every proximity query goes through the spatial hash.** The predecessor project
scanned all entities for every "nearest X" question, which made per-step cost
quadratic in population and capped the world size. `SpatialHash` is checked
against brute force in the tests, because an index that returns a *different*
answer than the naive scan is worse than no index at all.

### The AI is a utility scorer, not a state machine

Each person, on their own staggered think tick, scores every candidate action
and takes the best:

```
score = needUrgency² × opportunity(distance, skill) × personality × commitment
```

A state machine encodes *transitions*, which explode combinatorially as
behaviours are added. A utility score encodes *desire*, which composes: adding
theft later means adding one scorer, not auditing every transition. It is also
inspectable — the HUD and `npm run why` both show the same score table, so
"why did she do that?" always has a numeric answer.

### Simulation clock, not frame clock

Fixed-timestep accumulator. One `sim.step()` is exactly one simulation step —
no hidden amplification — so the step budgets in the harness mean what they say.
Player input is consumed inside the step, so your character obeys the same speed
and walkability rules as everyone else.

## Installing

`npm install` needs `--legacy-peer-deps` on this machine. npm 10.9.2's dependency
resolver crashes with `Cannot read properties of null (reading 'edgesOut')` while
walking vitest's optional peer set; the legacy resolver sidesteps it. Node 23 is
also outside vitest 4's supported range and prints an `EBADENGINE` warning —
everything runs, but Node 22 or 24 would be quieter.

## Deploying

The game is published to GitHub Pages at
**<https://jonamarti.github.io/dynasty_game/>**. Every push to `master` rebuilds
it and replaces what is there — there is no manual publish step, and nothing
about the build is committed (`dist/` stays gitignored). The Actions tab shows
whether the last push made it out.

Two workflows do the work:

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — typecheck, unit tests
  and a build, on every push and every pull request, on any branch.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — the same
  three checks, then upload and deploy, only from `master`. A failing typecheck
  or a failing test stops the deploy, so what is live has at least passed the
  two fast layers. The scenario harness and the Playwright specs are
  deliberately left out of the deploy path: they need a dev server and a browser
  download, and the point of this workflow is that a push is live a minute
  later. `npm run verify` is still the gate before pushing.

`workflow_dispatch` is enabled on the deploy workflow, so it can also be run by
hand from the Actions tab without a commit.

**[`vite.config.ts`](vite.config.ts) sets `base: './'` and must keep doing so.**
Pages serves the game from the `/dynasty_game/` subpath, and Vite's default
`base: '/'` writes `<script src="/assets/…">` into `dist/index.html` — which
resolves to `jonamarti.github.io/assets/…`, four-oh-fours, and a blank canvas.
A relative base sidesteps the whole question: it works at the subpath, at the
root under `npm run preview`, and at a custom domain later, with no repo name
written down anywhere. Vite normalises it to `/` for the dev server, so
`npm run dev` never notices.

The one thing not in the repo is the repo setting: **Settings → Pages → Build
and deployment → Source: GitHub Actions**. Without it `deploy-pages` fails with
an error about Pages not being enabled.

## Roadmap

M0 is the skeleton. The systems that make it a *dynasty* game come next.

| | |
|---|---|
| **M0 — Bones** ✅ | World, needs, skills, utility AI, harvesting, seasons, direct control, health harness |
| **M1 — The Band** ✅ | Relationships, episodic memory, witnesses, rumour, cultural norms, talk/give/steal/attack/flee |
| **M1.5 — Hands on** ✅ | Radial menu, player orders, action floaters, four-tab character panel, buildings and shelter |
| **M2 — Family** ✅ | Courtship, marriage, children, aging, natural death, households, inheritance, succession, play on as your heir |
| **M2.5 — The wood** ✅ | Trees that grow over decades, seasonal fruit, felling that is permanent, sticks as an early material, and work that continues until something stops it |
| **M3 — The band** ✅ | Chiefs chosen by regard, household and chiefly authority with compliance rolls, bands that plan and build for themselves, exile by a band's own norms |
| **M5 — Hands** ✅ | Click-through-self and mute-refusal bugs fixed, work progress bars, an inventory tab with per-item verbs, goods droppable on the ground, a visible command mode |
| **M4 — Knowledge** ✅ | Seven techs held by individuals, discovery under need pressure, teaching, learning by watching, loss when the last holder dies, hand axes, and eras read off the living population |
| **M6a — Hands, households and hooves** ✅ | Three tribes made of real families, character creation over a world that already exists, sleep as its own act, animals that move in herds and can be hunted, a bubble picker for stacked entities, hit boxes that match what is drawn, a foldable panel, and kin who outrank band-mates who outrank strangers |
| **M6b — Depth** | A real tech tree with prerequisite chains, research, weapons, jobs, and visualisers for family and tribe |
| **M7 — Pathfinding** | A\*, walls, walkable interiors and beds. Lands alone: it replaces the movement system every agent uses every tick |

### Known gaps

The full list, with reproductions, is in [docs/bugs.md](docs/bugs.md); the
plan for what to do about them is in [docs/next-steps.md](docs/next-steps.md).

- **The island is only marginally sustainable across a long run.** Two in-game
  years end with about half the peak population alive, and the die-offs are all
  in winter, with full storage pits standing unused. This is the top priority.
- **Hunting is rare.** The chain works — animals flee, a chase can be won or
  lost, meat is carried home and eaten — but wild meat is currently a garnish
  rather than a food source.
- **No raids or feuds between bands.** Bands have norms, chiefs, territory of a
  sort and standing with each other, but nothing organises a party to go and
  take something from the neighbours. That is the obvious next thing.
- **Farming is declared but inert.** It is the last tech and the gate on the Age
  of Sowing, and reaching it currently changes nothing on the ground - there are
  no fields to sow. Crops are what M5 should be.
- **Exile is a one-way door.** The cast-out keep their memories, kin and goods
  but there is no way back in, and no wanderer settlement for them to form.
- **No pathfinding.** Movement is greedy steering with a sidestep and a give-up
  timer. Fine on open terrain; add A* when walls create real dead ends.
- **No simulation LOD.** Everyone is simulated in full detail. At 8,000-20,000
  steps/s there is headroom, but the chunked freeze/thaw tiering in the plan is
  needed before the world grows.
- **Crafting is a stub.** Items and recipes exist for buildings, but there is no
  workbench, no tool quality and no hand axe you can actually make yet.
- **Winter still kills the unlucky.** Exposure is a leading cause of death in a
  long run. Bands now size their shelter by floor area rather than by counting
  roofs, but a band that loses its builders in one bad season does not recover.
- **Nobody plants a tree.** Bands fell timber when a site needs it, but no one
  has a reason to leave a stand standing for their grandchildren.
