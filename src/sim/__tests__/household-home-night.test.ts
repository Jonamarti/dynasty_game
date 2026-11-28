import { describe, expect, it } from 'vitest';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { Household } from '../entities/Household.ts';
import { Person } from '../entities/Person.ts';
import { IdSpace } from '../core/IdSpace.ts';
import { RNG } from '../core/RNG.ts';
import { Simulation } from '../core/Simulation.ts';
import { householdHomeAfterNight } from '../world/HouseholdHome.ts';

function fixture(size = 4) {
  const ids = new IdSpace();
  const people = Array.from({ length:size }, (_, i) =>
    new Person('member ' + i, 10, 10, 1, new RNG('household-home-' + i), 80, ids));
  const household = new Household('family', people[0]!.id, 1, 0, ids);
  for (const p of people) { p.householdId = household.id; household.add(p.id); }
  const a = new Building(BUILDINGS.mud_hut!, 4, 4, 1, ids);
  const b = new Building(BUILDINGS.mud_hut!, 14, 14, 1, ids);
  for (const roof of [a,b]) { roof.complete = true; roof.durability = roof.def.workTicks; }
  const peopleById = new Map(people.map(p => [p.id, p]));
  const buildingsById = new Map([[a.id,a],[b.id,b]]);
  const choose = (night: ReadonlyMap<number,number>) =>
    householdHomeAfterNight(household, peopleById, night, buildingsById);
  return { people, household, a, b, choose, peopleById };
}

describe('one stable household home from the midnight sleep sample', () => {
  it('retains a sound home with a sleeper regardless of iteration order', () => {
    const f = fixture();
    f.household.homeBuildingId = f.a.id;
    const night = new Map(f.people.map((p,i) => [p.id, i === 0 ? f.a.id : f.b.id]));
    expect(f.choose(night)).toBe(f.a.id);
    f.household.memberIds.reverse();
    expect(f.choose(new Map([...night].reverse()))).toBe(f.a.id);
    expect(f.household.homeBuildingId).toBe(f.a.id);
  });

  it('does not turn a single visit or an evenly split night into a move', () => {
    const f = fixture();
    f.household.homeBuildingId = f.a.id;
    expect(f.choose(new Map([[f.people[0]!.id, f.b.id]]))).toBe(f.a.id);
    expect(f.choose(new Map(f.people.slice(0,2).map(p=>[p.id,f.b.id])))).toBe(f.a.id);
    expect(f.choose(new Map())).toBe(f.a.id);
  });

  it('recognises a genuine move once a strict local majority sleeps at one alternative', () => {
    const f = fixture();
    f.household.homeBuildingId = f.a.id;
    expect(f.choose(new Map(f.people.slice(0,3).map(p=>[p.id,f.b.id])))).toBe(f.b.id);
  });

  it('requires an observed majority for a first home or replacement of a ruined one', () => {
    const f = fixture();
    const [one,two,three] = f.people;
    expect(f.choose(new Map([[one!.id,f.a.id],[two!.id,f.b.id]]))).toBeNull();
    expect(f.choose(new Map([[one!.id,f.a.id],[two!.id,f.b.id],[three!.id,f.b.id]]))).toBe(f.b.id);
    f.household.homeBuildingId = f.a.id; f.a.durability = 0;
    expect(f.choose(new Map([[two!.id,f.b.id]]))).toBe(f.b.id);
    expect(f.choose(new Map())).toBe(f.a.id);
  });

  it('does not let a dead, absent, captive or carried relative claim a move', () => {
    const f = fixture(5);
    const [one,two,three,four,five] = f.people;
    f.household.homeBuildingId = f.a.id;
    two!.die('hunger'); f.peopleById.delete(three!.id);
    four!.captiveOf = one!.id; five!.carriedBy = one!.id;
    const night = new Map([two!,three!,four!,five!].map(p=>[p.id,f.b.id]));
    expect(f.choose(night)).toBe(f.a.id);
    night.set(one!.id,f.b.id);
    expect(f.choose(night)).toBe(f.b.id);
  });

  it('keeps individual roofs distinct while a real midnight sample updates the home once', () => {
    const sim = new Simulation({ seed:'stable-household-home', world:{ width:64,height:64,predators:0,gameHerds:0 },
      population:{ bands:1, peoplePerBand:4 } });
    const [one,two] = sim.livingPeople().filter(p=>!p.isChild);
    if (!one || !two) throw new Error('need two founders');
    const household = new Household('family',one.id,one.bandId,sim.time.tick,sim.ids);
    for (const p of [one,two]) {
      if (p.householdId !== null) sim.householdsById.get(p.householdId)?.remove(p.id);
      p.householdId=household.id; household.add(p.id);
    }
    sim.households.push(household); sim.householdsById.set(household.id,household);
    const huts:Building[] = [];
    for (let y=4;y<sim.world.height-8 && huts.length<2;y++) {
      for (let x=4;x<sim.world.width-8 && huts.length<2;x++) {
        if (!sim.canPlace(BUILDINGS.mud_hut!,x,y)) continue;
        const hut=sim.place('mud_hut',x,y,one.bandId);
        if (hut) { hut.complete=true; hut.durability=hut.def.workTicks; huts.push(hut); }
      }
    }
    const [a,b]=huts;
    if (!a || !b) throw new Error('need two sited huts');
    household.homeBuildingId=a.id;
    for (const p of sim.people) { p.action='idle'; p.x=0; p.y=0; }
    for (const [p,roof] of [[one,a],[two,b]] as const) {
      p.action='sleep'; p.targetBuildingId=roof.id; p.x=roof.centerX; p.y=roof.centerY;
    }
    sim.peopleHash.rebuild(sim.people);
    const midnight=sim as unknown as { shareTheHearth():void; roofTonight:Map<number,number> };
    midnight.shareTheHearth();
    expect(midnight.roofTonight.get(one.id)).toBe(a.id);
    expect(midnight.roofTonight.get(two.id)).toBe(b.id);
    expect(household.homeBuildingId).toBe(a.id);
    sim.people.reverse();
    midnight.shareTheHearth();
    expect(household.homeBuildingId).toBe(a.id);
    one.targetBuildingId=b.id; one.x=b.centerX; one.y=b.centerY;
    sim.peopleHash.rebuild(sim.people);
    midnight.shareTheHearth();
    expect(midnight.roofTonight.get(one.id)).toBe(b.id);
    expect(midnight.roofTonight.get(two.id)).toBe(b.id);
    expect(household.homeBuildingId).toBe(b.id);
  });
});
