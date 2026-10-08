import { describe, it, expect } from 'vitest';
import { Simulation } from '../core/Simulation.ts';
import { Building, BUILDINGS } from '../entities/Building.ts';
import { equipContainer } from '../core/Carry.ts';
import {
  activeDraftLease, availableDraftHeads, claimDraftTeam, findDraftPen,
  hasBusyDraftPen, reservedDraftHeads,
} from '../systems/Draft.ts';
import { toCheckpointRecord } from '../persistence/CheckpointRecords.ts';

const SMALL = {
  seed: 'ploughshare-tests',
  world: { width: 48, height: 48, berryBushes: 40, flintOutcrops: 10, deadwood: 20, gameHerds: 4 },
  population: { bands: 1, peoplePerBand: 6, startingTech: ['farming', 'herding', 'iron_tools', 'ploughshare'] },
};

function setup() {
  const sim = new Simulation(SMALL);
  for (let tick = 0; tick <= sim.config.time.ticksPerDay; tick++) sim.step();
  const person = sim.livingPeople()[0]!;
  person.knownTech.add('ploughshare' as never);
  person.knownTech.add('farming' as never);
  let field: Building | null = null;
  for (let ring = 3; ring <= 14 && !field; ring++) {
    for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring]]) {
      field = sim.place('field', Math.round(person.x) + dx!, Math.round(person.y) + dy!, person.bandId);
      if (field) break;
    }
  }
  if (!field) throw new Error('no usable field site for ploughshare test');
  field.complete = true;
  let pen: Building | null = null;
  for (let ring = 4; ring <= 10 && !pen; ring++) {
    for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring]]) {
      pen = sim.place('pen', field.x + field.def.width + dx!, field.y + dy!, person.bandId);
      if (pen && Math.hypot(pen.centerX - field.centerX, pen.centerY - field.centerY) <= 12) break;
      if (pen) pen = null;
    }
  }
  if (!pen) throw new Error('no usable pen site near the test field');
  pen.complete = true;
  pen.store.add('meat', 4);
  person.targetBuildingId = field.id;
  person.x = field.centerX;
  person.action = 'sow';
  person.targetItemId = 'iron_plough';
  person.targetBuildingId = field.id;
person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
  return { sim, person, field, pen };
}
function addPen(sim: Simulation, bandId: number, x: number, y: number, meat: number): Building {
  const pen = new Building(BUILDINGS.pen!, x, y, bandId, sim.ids);
  pen.complete = true;
  pen.store.add('meat', meat);
  sim.buildings.push(pen);
  sim.buildingsById.set(pen.id, pen);
  sim.buildingHash.insert(pen);
  return pen;
}

function supplySowKit(person: ReturnType<typeof setup>['person'], plough: boolean): void {
  for (const [id, count] of person.inventory.entries()) person.inventory.remove(id, count);
  person.inventory.add('basket', 1);
  equipContainer(person, 'basket');
  person.inventory.add('grain', 4);
  if (plough) person.inventory.add('iron_plough', 1);
}

function settle(person: ReturnType<typeof setup>['person']): void {
  person.needs.hunger = person.needs.thirst = person.needs.cold = person.needs.fatigue = 0;
}

function runOrder(sim: Simulation, person: ReturnType<typeof setup>['person'], limit = 1200): void {
  for (let tick = 0; tick < limit && person.order !== null; tick++) {
    settle(person);
    sim.step();
  }
}

function actualHarvest(plough: boolean): number {
  const { sim, person, field, pen } = setup();
  supplySowKit(person, plough);
  expect(sim.order(person, 'sow', plough
    ? { buildingId: field.id, itemId: 'iron_plough' }
    : { buildingId: field.id })).toBe(true);
  runOrder(sim, person);
  expect(field.crop!.stage, JSON.stringify(sim.interruptions.slice(-5))).toBe('growing');
  expect(field.crop!.ploughYieldFactor).toBe(plough ? 1.2 : 1);
  if (plough) pen.durability = 0;
  field.crop!.stage = 'ripe';
  field.crop!.growth = 1;
  field.crop!.ripeDay = sim.time.day;
  person.x = field.centerX;
  person.y = field.centerY;
  for (let dy = 0; dy < field.def.height; dy++) for (let dx = 0; dx < field.def.width; dx++) {
    const tile = sim.world.index(field.x + dx, field.y + dy);
    sim.world.soil.organic[tile] = 1;
    sim.world.soil.nutrient[tile] = 1;
  }  expect(sim.order(person, 'reap', { buildingId: field.id })).toBe(true);
  runOrder(sim, person);
  return field.crop!.lastYield;
}

describe('ploughshare draft leases', () => {
  it('reserves exactly two heads and makes a repeated owner claim idempotent', () => {
    const { sim, person, pen } = setup();
    expect(claimDraftTeam(person, pen, sim.peopleById, sim.buildingsById)).toBe(true);
    expect(claimDraftTeam(person, pen, sim.peopleById, sim.buildingsById)).toBe(true);
    expect(pen.draftUserId).toBe(person.id);
    expect(person.draftPenId).toBe(pen.id);
    expect(activeDraftLease(pen, sim.peopleById, sim.buildingsById)).toBe(person);
    expect(reservedDraftHeads(pen, sim.peopleById, sim.buildingsById)).toBe(2);
    expect(availableDraftHeads(pen, sim.peopleById, sim.buildingsById)).toBe(2);
    pen.store.remove('meat', 2);
    expect(claimDraftTeam(person, pen, sim.peopleById, sim.buildingsById)).toBe(true);
    expect(availableDraftHeads(pen, sim.peopleById, sim.buildingsById)).toBe(0);
  });

  it('leases only one farmer per pen and sends a second to an available pen', () => {
    const { sim, person, field, pen } = setup();
    const second = sim.livingPeople()[1]!;
    second.bandId = person.bandId;
    second.action = 'sow';
    second.targetItemId = 'iron_plough';
    second.targetBuildingId = field.id;
    const alternate = addPen(sim, person.bandId, field.x + field.def.width + 2, field.y, 2);
    expect(claimDraftTeam(person, pen, sim.peopleById, sim.buildingsById)).toBe(true);
    expect(findDraftPen(second, sim.buildingHash, sim.peopleById, sim.buildingsById)).toBe(alternate);
    expect(hasBusyDraftPen(second, sim.buildingHash, sim.peopleById, sim.buildingsById)).toBe(true);
    expect(claimDraftTeam(second, pen, sim.peopleById, sim.buildingsById)).toBe(false);
    expect(pen.store.count('meat')).toBe(4);
  });

  it('queries far enough to include a pen origin at 12.5, then enforces center distance 12', () => {
    const { sim, person, field, pen } = setup();
    pen.durability = 0;
    const edge = addPen(sim, person.bandId, field.centerX - 12.5, field.centerY - 0.5, 2);
    expect(Math.hypot(edge.centerX - field.centerX, edge.centerY - field.centerY)).toBe(12);
    expect(findDraftPen(person, sim.buildingHash, sim.peopleById, sim.buildingsById)).toBe(edge);
    const tooFar = addPen(sim, person.bandId, field.centerX - 13.5, field.centerY - 0.5, 2);
    expect(Math.hypot(tooFar.centerX - field.centerX, tooFar.centerY - field.centerY)).toBe(13);
    expect(findDraftPen(person, sim.buildingHash, sim.peopleById, sim.buildingsById)).toBe(edge);
  });

  it('invalidates stale, stopped, dead and cleared leases without reserving heads', () => {
    const { sim, person, pen } = setup();
    expect(claimDraftTeam(person, pen, sim.peopleById, sim.buildingsById)).toBe(true);
    person.action = 'idle';
    expect(activeDraftLease(pen, sim.peopleById, sim.buildingsById)).toBeNull();
    expect(reservedDraftHeads(pen, sim.peopleById, sim.buildingsById)).toBe(0);
    person.action = 'sow';
    person.draftPenId = null;
    expect(activeDraftLease(pen, sim.peopleById, sim.buildingsById)).toBeNull();
    person.draftPenId = pen.id;
    person.clearTarget();
    expect(person.draftPenId).toBeNull();
    expect(activeDraftLease(pen, sim.peopleById, sim.buildingsById)).toBeNull();
    person.action = 'sow';
    person.targetItemId = 'iron_plough';
    person.targetBuildingId = sim.buildings.find(building => building.def.field)!.id;
    person.draftPenId = pen.id;
    person.alive = false;
    expect(activeDraftLease(pen, sim.peopleById, sim.buildingsById)).toBeNull();
  });

  it('continues a real paid sowing and its integer lease across a checkpoint', () => {
    const { sim, person, field, pen } = setup();
    supplySowKit(person, true);
    expect(sim.order(person, 'sow', { buildingId: field.id, itemId: 'iron_plough' })).toBe(true);
    for (let tick = 0; tick < 18 && person.workedTicks < 8; tick++) {
      settle(person);
      sim.step();
    }
    expect(person.workedTicks, sim.lastRefusal ?? 'explicit sow was not working').toBeGreaterThan(0);
    expect(activeDraftLease(pen, sim.peopleById, sim.buildingsById)).toBe(person);
    const restored = Simulation.fromCheckpointRecord(JSON.parse(JSON.stringify(toCheckpointRecord(sim))));
    const restoredPerson = restored.peopleById.get(person.id)!;
    const restoredPen = restored.buildingsById.get(pen.id)!;
    const restoredField = restored.buildingsById.get(field.id)!;
    expect(Number.isInteger(restoredPerson.draftPenId)).toBe(true);
    expect(Number.isInteger(restoredPen.draftUserId)).toBe(true);
    expect(activeDraftLease(restoredPen, restored.peopleById, restored.buildingsById)).toBe(restoredPerson);
    runOrder(restored, restoredPerson);
    expect(restoredField.crop!.stage, JSON.stringify(restored.interruptions.slice(-5))).toBe('growing');
    expect(restoredField.crop!.ploughYieldFactor).toBe(1.2);
    expect(restoredPerson.draftPenId).toBeNull();
    expect(activeDraftLease(restoredPen, restored.peopleById, restored.buildingsById)).toBeNull();
  });

  it('protects leased heads from direct, shared, and named meat withdrawals', () => {
    const direct = setup();
    expect(claimDraftTeam(direct.person, direct.pen, direct.sim.peopleById, direct.sim.buildingsById)).toBe(true);
    expect(availableDraftHeads(direct.pen, direct.sim.peopleById, direct.sim.buildingsById)).toBe(2);
    expect(activeDraftLease(direct.pen, direct.sim.peopleById, direct.sim.buildingsById)).toBe(direct.person);
    expect(direct.sim.takeItem(direct.sim.livingPeople()[1]!, direct.pen, 'meat', 4)).toBe(2);
    expect(direct.pen.store.count('meat')).toBe(2);

    for (const itemId of [null, 'meat'] as const) {
      const { sim, person, pen, field } = setup();
      supplySowKit(person, true);
      expect(sim.order(person, 'sow', { buildingId: field.id, itemId: 'iron_plough' })).toBe(true);
      const taker = sim.livingPeople()[1]!;
      taker.x = pen.centerX;
      taker.y = pen.centerY;
      settle(taker);
      expect(sim.order(taker, 'take', itemId === null
        ? { buildingId: pen.id }
        : { buildingId: pen.id, itemId, count: 6 })).toBe(true);
      runOrder(sim, taker, 16);
      expect(pen.store.count('meat')).toBe(2);
      expect(activeDraftLease(pen, sim.peopleById, sim.buildingsById)).toBe(person);
    }
  });

  it('refuses missing tools, knowledge, and unreserved teams with a visible reason', () => {
    const missingTool = setup();
    supplySowKit(missingTool.person, false);
    expect(missingTool.sim.order(missingTool.person, 'sow', {
      buildingId: missingTool.field.id, itemId: 'iron_plough',
    })).toBe(false);
    expect(missingTool.sim.lastRefusal).toContain('iron plough is required');

    const missingKnowledge = setup();
    missingKnowledge.person.knownTech.delete('ploughshare' as never);
    supplySowKit(missingKnowledge.person, true);
    expect(missingKnowledge.sim.order(missingKnowledge.person, 'sow', {
      buildingId: missingKnowledge.field.id, itemId: 'iron_plough',
    })).toBe(false);
    expect(missingKnowledge.sim.lastRefusal).toContain('know how to use an iron plough');

    const noTeam = setup();
    noTeam.pen.store.remove('meat', noTeam.pen.store.count('meat'));
    supplySowKit(noTeam.person, true);
    expect(noTeam.sim.order(noTeam.person, 'sow', {
      buildingId: noTeam.field.id, itemId: 'iron_plough',
    })).toBe(false);
    expect(noTeam.sim.lastRefusal).toContain('no available pair of draft animals');
  });

  it('refuses a second explicit sow when the only nearby team is already leased', () => {
    const { sim, person, field, pen } = setup();
    supplySowKit(person, true);
    expect(sim.order(person, 'sow', { buildingId: field.id, itemId: 'iron_plough' })).toBe(true);
    const second = sim.livingPeople()[1]!;
    second.knownTech.add('ploughshare' as never);
    second.knownTech.add('farming' as never);
    second.x = field.centerX;
    second.y = field.centerY;
    supplySowKit(second, true);
    expect(sim.order(second, 'sow', { buildingId: field.id, itemId: 'iron_plough' })).toBe(false);
    expect(sim.lastRefusal).toContain('draft team is already working');
    expect(pen.store.count('meat')).toBe(4);
  });
  it('increases the actual harvest and keeps the paid bonus after the pen is lost', () => {
    const manual = actualHarvest(false);
    const ploughed = actualHarvest(true);
    expect(manual).toBeGreaterThan(0);
    expect(ploughed).toBe(Math.round(manual * 1.2));
  });
});
