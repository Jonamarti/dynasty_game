import { Simulation } from '../core/Simulation.ts';
import { describe, it, expect } from 'vitest';
import { approachComarcaEdge } from '../world/ComarcaTravel.ts';
import type { World } from '../core/World.ts';
import { Household } from '../entities/Household.ts';
import { claimTransportAnimal } from '../core/TransportAnimals.ts';

describe('the physical comarca approach', () => {
  const world = (walkable: (x: number, y: number) => boolean) => ({ width: 8, height: 6, isWalkable: walkable }) as World;
  it('approaches the requested edge at its nearest walkable tile, never a corner', () => {
    const map = world(() => true);
    expect(approachComarcaEdge(map, { x: 4.5, y: 3.5 }, 'e')).toEqual({ x: 7.5, y: 3.5 });
    expect(approachComarcaEdge(map, { x: .1, y: .1 }, 'n')).toEqual({ x: 1.5, y: .5 });
    expect(approachComarcaEdge(map, { x: 4.5, y: 3.5 }, 's')).toEqual({ x: 4.5, y: 5.5 });
    expect(approachComarcaEdge(map, { x: 4.5, y: 3.5 }, 'w')).toEqual({ x: .5, y: 3.5 });
  });
  it('refuses an entirely impassable edge and searches farther when the nearest tile is water', () => {
    expect(approachComarcaEdge(world(() => false), { x: 4.5, y: 3.5 }, 'e')).toBeNull();
    expect(approachComarcaEdge(world((x, y) => x === 7 && y === 1), { x: 4.5, y: 3.5 }, 'e'))
      .toEqual({ x: 7.5, y: 1.5 });
  });
});

describe('travel orders are reviewable before starting', () => {
  it('refuses an island departure without erasing the previous order', () => {
    const sim = new Simulation({ seed: 'travel-refusal', population: { bands: 1, peoplePerBand: 4 } });
    const actor = sim.possessFirst()!;
    actor.order = 'rest'; actor.action = 'rest';
    expect(sim.order(actor, 'leave_comarca', { edge: 'e' })).toBe(false);
    expect(sim.lastRefusal).toBe('This island has no neighbouring comarca');
    expect(actor.order).toBe('rest');
  });
  it('does not accept a nonexistent travelling leader', () => {
    const sim = new Simulation({ seed: 'follow-refusal', population: { bands: 1, peoplePerBand: 4 } });
    const actor = sim.possessFirst()!;
    expect(sim.order(actor, 'follow_me', { personId: 999999 })).toBe(false);
    expect(sim.lastRefusal).toBe('You can only follow a living member of your band');
  });
});


describe('canonical traveler ownership', () => {
  it('keeps an origin household archive and isolates its feud maps when the whole family crosses', () => {
    const source = new Simulation({ seed: 'travel-household-source', population: { bands: 1, peoplePerBand: 4 } });
    const destination = new Simulation({ seed: 'travel-household-destination', population: { bands: 0 } }, source.ids);
    const traveller = source.livingPeople()[0]!;
    const previous = traveller.householdId === null ? null : source.householdsById.get(traveller.householdId);
    if (previous) previous.remove(traveller.id);
    const household = new Household('Return home', traveller.id, traveller.bandId, source.time.tick, source.ids);
    household.add(traveller.id); household.homeBuildingId = 777; household.feud.set(42, 3);
    traveller.householdId = household.id;
    source.households.push(household); source.householdsById.set(household.id, household);

    const [moved] = source.transferTravellersTo(destination, [traveller.id], 'w');
    const sourceArchive = source.householdsById.get(household.id)!;
    const destinationHousehold = destination.householdsById.get(household.id)!;
    expect(moved).toBe(traveller);
    expect(source.peopleById.has(traveller.id)).toBe(false);
    expect(destination.peopleById.get(traveller.id)).toBe(traveller);
    expect(sourceArchive.memberIds).toEqual([]);
    expect(sourceArchive.homeBuildingId).toBe(777);
    expect(destinationHousehold.memberIds).toEqual([traveller.id]);
    expect(destinationHousehold.homeBuildingId).toBeNull();
    expect(destinationHousehold.feud).not.toBe(sourceArchive.feud);
    destinationHousehold.feud.set(42, 8);
    expect(sourceArchive.feud.get(42)).toBe(3);
  });
});

describe('household history on a return crossing', () => {
  it('merges carried rivalries into the returning family without rewriting either archive or another house', () => {
    const home = new Simulation({ seed: 'return-household-feud-home', world: { width: 32, height: 32 }, population: { bands: 1, peoplePerBand: 6 } });
    const away = new Simulation({ seed: 'return-household-feud-away', world: { width: 32, height: 32 }, population: { bands: 0 } }, home.ids);
    for (const sim of [home, away]) { sim.world.walkable.fill(1); sim.world.biome.fill(2); sim.world.elevation.fill(1); }
    const traveller = home.livingPeople()[0]!;
    const household = home.householdsById.get(traveller.householdId!)!;
    const rival = home.households.find(candidate => candidate.id !== household.id)!;
    const oldSuspect = rival.headId;
    const carriedSuspect = rival.memberIds.find(id => id !== oldSuspect) ?? oldSuspect;
    const newRivalId = 900_001;
    const oldScore = 20;

    household.feud.set(rival.id, oldScore);
    household.feudSuspects.set(rival.id, oldSuspect);
    rival.feud.set(900_002, 8);
    rival.feudSuspects.set(900_002, rival.headId);

    home.transferTravellersTo(away, [traveller.id], 'w');
    const carried = away.householdsById.get(household.id)!;
    expect(carried).not.toBe(household);
    expect(carried.feud).not.toBe(household.feud);
    carried.feud.set(rival.id, 55);
    carried.feudSuspects.set(rival.id, carriedSuspect);
    carried.feud.set(newRivalId, 35);
    carried.feudSuspects.set(newRivalId, carriedSuspect);

    away.transferTravellersTo(home, [traveller.id], 'e');

    const returned = home.householdsById.get(household.id)!;
    expect(returned).toBe(household);
    expect(returned.feud.get(rival.id)).toBe(55);
    expect(returned.feudSuspects.get(rival.id)).toBe(carriedSuspect);
    expect(returned.feud.get(newRivalId)).toBe(35);
    expect(returned.feudSuspects.get(newRivalId)).toBe(carriedSuspect);
    // Merging changes the active home record, but never the carried source
    // snapshot or a different household's ledger.
    expect(carried.feud.get(rival.id)).toBe(55);
    expect(carried.feud.has(newRivalId)).toBe(true);
    expect(rival.feud.get(900_002)).toBe(8);
    expect(rival.feud.has(newRivalId)).toBe(false);
    expect(rival.feudSuspects.get(900_002)).toBe(rival.headId);
  });
});

describe('transport traveller preflight', () => {
  it('rejects an animal ID collision before changing rosters, households, or cargo', () => {
    const source = new Simulation({ seed: 'transport-transfer-source', world: { width: 48, height: 48 }, population: { bands: 1, peoplePerBand: 4 } });
    const destination = new Simulation({ seed: 'transport-transfer-destination', world: { width: 48, height: 48 }, population: { bands: 0 } }, source.ids);
    const traveller = source.livingPeople().find(person => !person.isChild)!;
    const animal = source.animals.find(candidate => candidate.species === 'donkey')!;
    const conflict = destination.animals[0]!;
    traveller.knownTech.add('pack_animals');
    animal.tamedBy = traveller.id;
    animal.x = traveller.x + 1; animal.y = traveller.y;
    expect(claimTransportAnimal(traveller, animal, 'pack', source.animalsById)).toBe(true);
    traveller.inventory.add('meat', 7);
    destination.animalsById.set(animal.id, conflict);
    const sourcePeople = [...source.people];
    const destinationPeople = [...destination.people];
    const sourceHouseholds = [...source.households];
    const destinationHouseholds = [...destination.households];
    const sourceCargo = traveller.inventory.count('meat');
    expect(() => source.transferTravellersTo(destination, [traveller.id], 'w')).toThrow(/Transport animal/);
    expect(source.people).toEqual(sourcePeople);
    expect(destination.people).toEqual(destinationPeople);
    expect(source.households).toEqual(sourceHouseholds);
    expect(destination.households).toEqual(destinationHouseholds);
    expect(traveller.inventory.count('meat')).toBe(sourceCargo);
    expect(source.animalsById.get(animal.id)).toBe(animal);
    expect(traveller.transportAnimalId).toBe(animal.id);
    expect(animal.transportedBy).toBe(traveller.id);
  });
});

describe('committed travelling companions', () => {
  function fixture() {
    const sim = new Simulation({ seed: 'travel-party', world: { width: 32, height: 32 }, population: { bands: 1, peoplePerBand: 6 } });
    // Flat controlled ground isolates the order protocol from terrain generation.
    sim.world.walkable.fill(1); sim.world.biome.fill(2); sim.world.elevation.fill(1);
    const actor = sim.possessFirst()!;
    const follower = sim.livingPeople().find(p => p.id !== actor.id && !p.isChild)!;
    for (const person of [actor, follower]) {
      person.needs.hunger = 0; person.needs.thirst = 0; person.needs.cold = 0;
      person.needs.fatigue = 0; person.workedTicks = 0;
    }
    let arrivals: readonly number[] | null = null;
    sim.comarcaTravel = { refusal: () => null, arrive: request => { arrivals = request.travellerIds ?? []; return null; } };
    return { sim, actor, follower, arrivals: () => arrivals };
  }
  it('waits for an accepted follower and then sends one explicit party', () => {
    const { sim, actor, follower, arrivals } = fixture();
    expect(sim.order(actor, 'leave_comarca', { edge: 'e' })).toBe(true);
    actor.x = actor.targetX!; actor.y = actor.targetY!; sim.peopleHash.rebuild(sim.livingPeople());
    follower.x = actor.x - 8; follower.y = actor.y; sim.peopleHash.rebuild(sim.livingPeople());
    expect(sim.order(follower, 'follow_me', { personId: actor.id })).toBe(true);
    sim.step();
    expect(arrivals()).toBeNull(); expect(actor.order).toBe('leave_comarca');
    follower.x = actor.x - .5; follower.y = actor.y; sim.peopleHash.rebuild(sim.livingPeople());
    sim.step();
    expect(arrivals()).toEqual([actor.id, follower.id].sort((a,b) => a-b));
  });
  it('allows a need to stop a committed follow order with a visible reason', () => {
    const { sim, actor, follower } = fixture();
    expect(sim.order(follower, 'follow_me', { personId: actor.id })).toBe(true);
    follower.needs.cold = sim.config.needs.workLimits.cold + 20;
    sim.step();
    expect(sim.interruptions.some(stop => stop.personId === follower.id && stop.reason === 'cold')).toBe(true);
    expect(follower.order).not.toBe('follow_me');
  });
});

import { WorldKnowledge } from '../social/WorldKnowledge.ts';
import { WorldState } from '../world/WorldState.ts';
import { frontierGeography } from '../../../tools/frontierFixture.ts';
import { fromWorldStateRecord,toWorldStateRecord } from '../persistence/WorldStateRecords.ts';
import { fromPersonRecord,toPersonRecord } from '../persistence/EntityRecords.ts';

describe('real frontier ownership and scout return',()=>{
  function root() { return new WorldState({seed:'real-frontier-travel',world:{width:32,height:32},population:{bands:1,peoplePerBand:4,conceptionChance:0},time:{ticksPerDay:40,daysPerSeason:20,startDay:0},needs:{coldRate:0}},
    {geography:frontierGeography(),start:{x:40.5,y:20.5},peoples:false}); }
  function cross(state:WorldState,id:number,direction:'e'|'w',scout=false) {
    const person=state.current.peopleById.get(id)!;
    expect(state.current.comarcaTravel!.arrive({person,direction,scout,travellerIds:[id]})).toBeNull();
    expect(state.commitPendingCross()).toBe(true);
  }
  it('parks the old execution owner and restores the same depleted node and identity on reentry',()=>{
    const state=root(),source=state.current,actor=source.possessFirst()!,origin=state.frontier.active!;
    const node=source.nodes.find(n=>n.kind==='berries')!; node.amount=0; const nodeId=node.id;
    actor.inventory.add('flint',3); const id=actor.id;
    cross(state,id,'e'); expect(()=>source.step()).toThrow();
    const restored=fromWorldStateRecord(JSON.parse(JSON.stringify(toWorldStateRecord(state))));
    cross(restored,id,'w'); expect(restored.frontier.active).toEqual(origin);
    expect(restored.current.nodesById.get(nodeId)!.amount).toBe(0);
    expect(restored.current.peopleById.get(id)!.inventory.count('flint')).toBe(3);
    expect(restored.current.peopleById.get(id)!.name).toBe(actor.name);
    expect(restored.frontier.toRecord().parked.flatMap(p=>p.checkpoint.roster.people.map(fromPersonRecord)).some(p=>p.id===id)).toBe(false);
  });
  it('returns carried techniques to their macro people only after a named resident is back in its home region',()=>{
    const state=new WorldState({seed:'frontier-gates',world:{width:32,height:32},population:{bands:1,peoplePerBand:4,conceptionChance:0},time:{ticksPerDay:120,daysPerSeason:20,startDay:0},needs:{coldRate:0}},
      {geography:frontierGeography(),start:{x:49.5,y:20.5}});
    const founder=state.current.possessFirst()!;
    const cross=(id:number,direction:'e'|'w')=>{
      const person=state.current.peopleById.get(id)!;
      expect(state.current.comarcaTravel!.arrive({person,direction,scout:false,travellerIds:[id]})).toBeNull();
      if(!state.commitPendingCross()){let guard=0;while(state.frontier.pendingJourney&&guard++<500){state.current.step();state.advancePeoples();}expect(state.frontier.pendingJourney).toBeNull();}
    };
    cross(founder.id,'e');
    const societyId=[...state.peoples!.sim.peoples.values()].find(p=>p.away>0)!.id;
    const society=()=>state.peoples!.sim.peoples.get(societyId)!;
    const carrier=[...state.current.people].find(p=>p.id!==founder.id&&state.frontier.materializedOrigins().get(p.id)===societyId)!;
    const learned=TECHS.find(tech=>!society().techs.has(tech)&&!carrier.knownTech.has(tech)&&TECH[tech].requires.every(required=>carrier.knownTech.has(required)))!;
    expect(learned).toBeDefined();
    carrier.knownTech.add(learned);
    state.current.possess(carrier);
    cross(carrier.id,'w');
    for(let i=0;i<120;i++){state.current.step();state.advancePeoples();}
    expect(society().techs.has(learned)).toBe(false);
    cross(carrier.id,'e');
    const untilNextDay=120-(state.current.time.tick%120||0);
    for(let i=0;i<untilNextDay;i++){state.current.step();state.advancePeoples();}
    const ownerPeople=[...state.current.people,...state.frontier.toRecord().parked.flatMap(slot=>slot.checkpoint.roster.people.map(fromPersonRecord))];
    expect(ownerPeople.find(person=>person.id===carrier.id)?.knownTech.has(learned)).toBe(true);
    expect(state.frontier.materializedOrigins().get(carrier.id)).toBe(societyId);
    expect(society().techs.has(learned)).toBe(true);
  });
  it('keeps the home current until a dated scout returns with actual knowledge, including a partial-day save',()=>{
    // A `scout` ticket, a parked destination and a dated return are written for
    // a subordinate sent ahead while the player stays home — never for the
    // player's own controlled body (see the `playerTravelled` comment in
    // `WorldState.commitPendingCross`). Keep a different player possessed so
    // `actor` here is a genuine NPC scout and this test still exercises that path.
    const state=root(); state.current.possessFirst();
    const actor=state.current.livingPeople().find(p=>p.id!==state.current.player!.id&&!p.isChild)!,id=actor.id,origin=state.frontier.active!;
    actor.worldKnowledge=new WorldKnowledge(); actor.worldKnowledge.see(origin.cx,origin.cy,0);
    cross(state,id,'e',true);
    expect(state.frontier.active).toEqual(origin); expect(state.current.peopleById.has(id)).toBe(false);
    const ticket=state.frontier.scouts[0]!;
    const away=state.frontier.parkedAt(ticket.destination)!;
    expect(fromPersonRecord(away.roster.people.find(r=>fromPersonRecord(r).id===id)!).worldKnowledge!.entry(ticket.destination.cx,ticket.destination.cy)?.source).not.toBe('seen');
    for(let i=0;i<17;i++){state.current.step();state.advancePeoples();}
    const resumed=fromWorldStateRecord(JSON.parse(JSON.stringify(toWorldStateRecord(state))));
    while(resumed.current.time.tick<ticket.returnTick){resumed.current.step();resumed.advancePeoples();}
    expect(resumed.frontier.scouts).toHaveLength(0);
    const returned=resumed.current.peopleById.get(id)!; expect(returned.alive).toBe(true);
    expect(returned.worldKnowledge!.entry(ticket.destination.cx,ticket.destination.cy)?.source).toBe('seen');
    expect(returned.age).toBeGreaterThan(actor.age);
    expect(resumed.current.insights.some(n=>n.text.includes('returned from scouting'))).toBe(true);
    expect(()=>fromWorldStateRecord(JSON.parse(JSON.stringify(toWorldStateRecord(resumed))))).not.toThrow();
  });
  // Regression for the owner's 2026-10-09 report: clicking the globe's "Scout"
  // button always orders `sim.player` (main.ts's `WorldMapOverlay` callback
  // never names anyone else), which used to run the subordinate-scout branch
  // above on the controlled character — parking them with no live owner for a
  // full round trip, with `current.player` null the whole time. That is
  // `selected` going null, the HUD losing the player, and the globe reporting
  // `knowledgeOfWorld(null)` (an all-black map, no "you are here"), which from
  // the owner's side looked exactly like the character had stopped existing.
  it('a scout order on the controlled character installs the destination at once, like leave_comarca',()=>{
    const state=root(),actor=state.current.possessFirst()!,id=actor.id,origin=state.frontier.active!;
    expect(state.current.comarcaTravel!.arrive({person:actor,direction:'e',scout:true,travellerIds:[id]})).toBeNull();
    expect(state.commitPendingCross()).toBe(true);
    // The controlled traveller is live at the destination immediately: no
    // parked scout ticket, no round trip, no gap with a null `current.player`.
    expect(state.frontier.scouts).toHaveLength(0);
    expect(state.frontier.active).not.toEqual(origin);
    expect(state.current.player).not.toBeNull();
    expect(state.current.player!.id).toBe(id);
    expect(state.current.peopleById.get(id)).toBeDefined();
    // Standing in the new comarca counts as having seen it, same as a plain crossing.
    expect(state.current.player!.worldKnowledge!.entry(state.frontier.active!.cx,state.frontier.active!.cy)?.source).toBe('seen');
  });
});

import { populationOf } from '../world/PeopleSim.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';
import { ComarcaOffmapRuntime } from '../world/ComarcaOffmapRuntime.ts';
import type { Person } from '../entities/Person.ts';
import { type BandContext } from '../systems/BandSystem.ts';
import { TECH, TECHS } from '../knowledge/Tech.ts';

describe('frontier demography and drought gates',()=>{
  const config={seed:'frontier-gates',world:{width:32,height:32},population:{bands:1,peoplePerBand:4,conceptionChance:0},time:{ticksPerDay:120,daysPerSeason:20,startDay:0},needs:{coldRate:0}};
  it('materializes actual cohort heads exactly once when visiting another region',()=>{
    const state=new WorldState(config,{geography:frontierGeography(),start:{x:49.5,y:20.5}});
    const actor=state.current.possessFirst()!,id=actor.id;
    const total=()=>[...state.peoples!.sim.peoples.values()].reduce((n,p)=>n+populationOf(p)+p.away,0);
    const before=total();
    expect(state.current.comarcaTravel!.arrive({person:actor,direction:'e',scout:false})).toBeNull(); expect(state.commitPendingCross()).toBe(true);
    const residents=state.current.people.filter(p=>p.id!==id); expect(residents.length).toBeGreaterThan(0); expect(total()).toBe(before);
    const society=[...state.peoples!.sim.peoples.values()].find(p=>p.away>0)!; expect(society.away).toBe(residents.length);
    const residentIds=residents.map(p=>p.id).sort((a,b)=>a-b);
    expect(state.current.comarcaTravel!.arrive({person:state.current.peopleById.get(id)!,direction:'w',scout:false})).toBeNull(); expect(state.commitPendingCross()).toBe(true);
    expect(state.current.comarcaTravel!.arrive({person:state.current.peopleById.get(id)!,direction:'e',scout:false})).toBeNull(); expect(state.commitPendingCross()).toBe(true);
    expect(state.current.people.filter(p=>p.id!==id).map(p=>p.id).sort((a,b)=>a-b)).toEqual(residentIds); expect(total()).toBe(before);
  });
  it('preserves an absent father through a compact birth and gives the newborn a global fresh ID',()=>{
    const state=new WorldState(config,{geography:frontierGeography(),start:{x:40.5,y:20.5},peoples:false});
    const adults=state.current.livingPeople().filter(p=>!p.isChild),mother=adults[0]!,father=adults[1]!;
    mother.sex='female';mother.pregnant=true;mother.gestationLeft=1;mother.pregnantBy=father.id;mother.age=22*mother.daysPerYear;
    const elsewhere=new Simulation({...config,population:{bands:0}},state.ids); elsewhere.world.walkable.fill(1); state.current.transferTravellersTo(elsewhere,[father.id],'w');
    const entry=state.tileLedger.capture(state), record=toCheckpointRecord(state.current);
    const wire=JSON.parse(JSON.stringify(record));
    const runtime=ComarcaOffmapRuntime.start(wire,entry);
    const next=runtime.advanceTo(120,state.geography,state.ids,id=>id===father.id?father:null);
    const baby=next.compact.map(c=>fromPersonRecord(c.person)).find(p=>p.motherId===mother.id&&p.age===0)!;
    expect(baby).toBeDefined();expect(baby.fatherId).toBe(father.id);expect(father.childIds).toContain(baby.id);expect(baby.id).toBeGreaterThan(Math.max(...record.roster.activePersonIds));
  });
  it('the-thirsty-leave: an autonomous dry-band proposal crosses before one third dies; water is the negative control',()=>{
    function run(dry:boolean) {
      const state=new WorldState(config,{geography:frontierGeography(),start:{x:40.5,y:20.5},peoples:false}),sim=state.current,origin=state.frontier.active!;
      sim.world.walkable.fill(1); const members=sim.livingPeople();
      for(const p of members){p.age=20*p.daysPerYear;p.needs.hunger=0;p.needs.thirst=30;p.needs.cold=0;p.needs.fatigue=0;p.needs.company=0;p.order=null;p.worldKnowledge=new WorldKnowledge();p.worldKnowledge.see(41,20,0);}
      const leader=members[0]!;sim.bandSystem.chiefByBand.set(leader.bandId,leader.id);
      for(const p of members) if(p!==leader) {sim.relationships.introduce(p.id,leader.id,100);sim.relationships.introduce(leader.id,p.id,100);}
      const policy={...sim.comarcaMigration!()!,hasFreshWater:!dry,capacityRationsPerDay:null,hostileStrongerNeighbour:()=>false};
      // This controlled gate changes only water pressure, with the actual coordinator callbacks.
      (sim.bandSystem as unknown as {considerComarcaMigration(b:any,m:Person[],c:BandContext):void}).considerComarcaMigration(sim.bands[0]!,members,{migration:policy,relationships:sim.relationships,day:0} as unknown as BandContext);
      if(!dry) return {departed:leader.order==='propose',dead:0};
      // Use the same dry pressure when the shared proposal resolves forty ticks later.
      sim.world.freshShore.length=0;sim.world.waterKind!.fill(0);sim.freshShoreHash.clear();
      for(let i=0;i<300 && JSON.stringify(state.frontier.active)===JSON.stringify(origin);i++){state.current.step();state.advancePeoples();}
      return {departed:JSON.stringify(state.frontier.active)!==JSON.stringify(origin),dead:[...state.current.people,...state.frontier.toRecord().parked.flatMap(s=>s.checkpoint.roster.people.map(fromPersonRecord))].filter(p=>!p.alive&&members.some(m=>m.id===p.id)).length};
    }
    expect(run(true)).toEqual({departed:true,dead:0});expect(run(false).departed).toBe(false);
  });
});

// Before the frontier-bug fix (2026-10-09), `commitPendingCross` parked
// *any* scouting traveller, including the player themselves, leaving `current`
// with no player at all for the whole round trip — the owner's "my character
// stopped existing" report. A genuine NPC scout, never the controlled body,
// is still parked and can still die away; `scout.isPlayer` in `returnScouts`
// stays as dead-save compatibility for a ticket captured before the fix, but a
// freshly created scout ticket can no longer name the live player.
it('a scout who dies gives no observation and the home band learns they did not return',()=>{
  const state=new WorldState({seed:'scout-death',world:{width:32,height:32},population:{bands:1,peoplePerBand:4,conceptionChance:0},time:{ticksPerDay:40,daysPerSeason:20,startDay:0},needs:{coldRate:0}},
    {geography:frontierGeography(),start:{x:40.5,y:20.5},peoples:false});
  state.current.possessFirst();
  const actor=state.current.livingPeople().find(p=>p.id!==state.current.player!.id&&!p.isChild)!;
  actor.worldKnowledge=new WorldKnowledge();
  expect(state.current.comarcaTravel!.arrive({person:actor,direction:'e',scout:true})).toBeNull();expect(state.commitPendingCross()).toBe(true);
  // Keep whoever stays home from autonomously migrating on their own while the
  // long wait for the scout's dated return plays out (the frontier fixture has
  // no fresh water at this comarca, so the thirsty-band-leaves gate — tested
  // above — would otherwise fire well before the return tick and move `active`
  // out from under this test). `commitPendingCross` just rebound this through
  // `installCurrent`, so it has to be set after, not before. This test is
  // about the dead scout's own report, not home band drought pressure.
  state.current.comarcaMigration = () => null;
  const ticket=state.frontier.scouts[0]!,record=state.frontier.parkedAt(ticket.destination)!;
  const raw=record.roster.people.find(p=>fromPersonRecord(p).id===actor.id)!,dead=fromPersonRecord(raw);dead.die('thirst');
  const checkpoint={...record,roster:{...record.roster,people:record.roster.people.map(p=>fromPersonRecord(p).id===dead.id?toPersonRecord(dead,record.lastAdvancedTick):p)}};
  const tile=state.tileLedger.at(ticket.destination)!;
  state.frontier.park(ticket.destination,checkpoint,ComarcaOffmapRuntime.start(checkpoint,tile).toRecord());
  const playerId=state.current.player!.id;
  while(state.current.time.tick<ticket.returnTick){state.current.step();state.advancePeoples();}
  // The scout never comes home; the player who stayed behind is untouched.
  expect(state.current.player!.id).toBe(playerId); expect(state.current.player!.alive).toBe(true);
  expect(state.current.peopleById.get(actor.id)).toBeUndefined();
  expect(state.current.insights.some(n=>n.text.includes('did not return'))).toBe(true);
  expect(()=>fromWorldStateRecord(JSON.parse(JSON.stringify(toWorldStateRecord(state))))).not.toThrow();
});

it('shortens scout return only with a canonical living riding horse, not knowledge alone', () => {
  function duration(mounted: boolean) {
    const state = new WorldState({ seed: 'horse-scout-return', world: { width: 32, height: 32 }, population: { bands: 1, peoplePerBand: 4, conceptionChance: 0 }, time: { ticksPerDay: 40, daysPerSeason: 20, startDay: 0 }, needs: { coldRate: 0 } },
      { geography: frontierGeography(), start: { x: 40.5, y: 20.5 }, peoples: false });
    const sim = state.current;
    sim.possessFirst();
    const actor = sim.livingPeople().find(p => p.id !== sim.player!.id && !p.isChild)!;
    actor.knownTech.add('horse_riding');
    if (mounted) {
      const horse = sim.animals.find(animal => animal.alive && animal.species === 'horse')!;
      expect(horse).toBeDefined();
      horse.tamedBy = actor.id; horse.x = actor.x; horse.y = actor.y;
      expect(sim.claimTransportAnimalFor(actor.id, horse.id, 'riding')).toBe(true);
    }
    expect(sim.comarcaTravel!.arrive({ person: actor, direction: 'e', scout: true })).toBeNull();
    expect(state.commitPendingCross()).toBe(true);
    const ticket = state.frontier.scouts[0]!;
    return ticket.returnTick - ticket.departureTick;
  }
  expect(duration(false)).toBe(80);
  expect(duration(true)).toBe(54);
});
