import { describe, expect, it } from 'vitest';
import { Inventory } from '../entities/Item.ts';
import { WorldCaravans, cargoBaseValue, exchangeCaravanGoods } from '../world/WorldCaravans.ts';
import type { ScheduleCaravanInput } from '../world/WorldCaravans.ts';

const base:ScheduleCaravanInput={
 id:1,source:{kind:'random',seed:'world',regionsWide:4,regionsHigh:4,cx:3,cy:4},
 destination:{kind:'random',seed:'world',regionsWide:4,regionsHigh:4,cx:5,cy:4},
 sourcePeopleId:11,destinationPeopleId:12,
 travellers:[{personId:101,name:'Aru'},{personId:102,name:'Bela'}],escortIds:[103],
 route:[{cx:3,cy:4},{cx:4,cy:4},{cx:5,cy:4}],returnRoute:[{cx:5,cy:4},{cx:4,cy:4},{cx:3,cy:4}],
 departureTick:10,arrivalTick:30,campStops:[{point:{cx:4,cy:4},tick:20,resumeTick:22}],
 cargo:[{itemId:'gold_nugget',count:2}],
};
const peaceful=()=>({stance:null,standing:0});
describe('WorldCaravans',()=>{
 it('persists a replayable departure transaction and keeps named canonical IDs',()=>{
  const caravans=new WorldCaravans();caravans.schedule(base);
  const emitted=caravans.advanceTo(10,peaceful);expect(emitted).toHaveLength(1);expect(emitted[0]?.kind).toBe('depart');
  const restored=WorldCaravans.fromRecord(JSON.parse(JSON.stringify(caravans.toRecord())));
  expect(restored.advanceTo(11,peaceful)).toEqual(emitted);
  restored.ack(emitted[0]!.eventId);expect(restored.get(1)?.phase).toBe('outbound');
  expect(()=>restored.ack(emitted[0]!.eventId)).toThrow();
 });
 it('stops at camps, resumes, trades, and schedules the canonical return route',()=>{
  const c=new WorldCaravans();c.schedule(base);c.ack(c.advanceTo(10,peaceful)[0]!.eventId);
  const camp=c.advanceTo(20,peaceful)[0]!;expect(camp.kind).toBe('camp');c.ack(camp.eventId);
  const resume=c.advanceTo(22,peaceful)[0]!;expect(resume.kind).toBe('resume');c.ack(resume.eventId);
  const arrival=c.advanceTo(30,peaceful)[0]!;expect(arrival.kind).toBe('arrive');if(arrival.kind!=='arrive')throw new Error('arrival expected');expect(arrival.cargoBaseValue).toBe(48);
  c.ack(arrival.eventId,{cargoAfter:[{itemId:'tin',count:1}]});c.beginReturn(1,32,40);
  const depart=c.advanceTo(32,peaceful)[0]!;expect(depart.kind).toBe('return-depart');c.ack(depart.eventId);
  const ret=c.advanceTo(40,peaceful);expect(ret[0]?.kind).toBe('return-arrive');
 });
 it('offers a raid hook on war/hostility and applies acknowledged physical cargo losses',()=>{
  const c=new WorldCaravans();c.schedule({...base,campStops:[]});c.ack(c.advanceTo(10,peaceful)[0]!.eventId);
  const war=()=>({stance:'war' as const,standing:-90});const raid=c.advanceTo(30,war)[0]!;
  expect(raid.kind).toBe('raid-opportunity');c.ack(raid.eventId,{cargoAfter:[{itemId:'gold_nugget',count:1}]});
  const arrival=c.advanceTo(30,war)[0]!;expect(arrival.kind).toBe('arrive');if(arrival.kind!=='arrive')throw new Error('arrival expected');expect(arrival.cargoBaseValue).toBe(24);
 });
 it('barters actual inventory stacks by baseValue without creating or deleting goods',()=>{
  const source=new Inventory(),destination=new Inventory();source.add('gold_nugget',2);destination.add('tin_ore',1);
  expect(cargoBaseValue([{itemId:'gold_nugget',count:2}])).toBe(48);
  const before=source.total+destination.total;
  expect(exchangeCaravanGoods(source,destination,[{itemId:'gold_nugget',count:1}],[{itemId:'tin_ore',count:1}])).toEqual({offeredValue:24,receivedValue:9,standingDelta:1});
  expect(source.count('gold_nugget')).toBe(1);expect(source.count('tin_ore')).toBe(1);expect(destination.count('gold_nugget')).toBe(1);expect(destination.count('tin_ore')).toBe(0);
  expect(source.total+destination.total).toBe(before);
  expect(()=>exchangeCaravanGoods(source,destination,[{itemId:'gold_nugget',count:1}],[{itemId:'bronze',count:2}])).toThrow();
 });
 it('closes a completed schedule when the merchant dies at destination',()=>{
  const c=new WorldCaravans();c.schedule({...base,campStops:[]});c.ack(c.advanceTo(10,peaceful)[0]!.eventId);const arrival=c.advanceTo(30,peaceful)[0]!;c.ack(arrival.eventId,{cargoAfter:[]});c.cancel(1);
  const restored=WorldCaravans.fromRecord(JSON.parse(JSON.stringify(c.toRecord())));
  expect(restored.get(1)?.phase).toBe('cancelled');
  expect(restored.advanceTo(100,peaceful)).toEqual([]);
 }); it('rejects invented parties, mismatched route ends and invalid cargo before storing a ticket',()=>{
  const c=new WorldCaravans();expect(()=>c.schedule({...base,travellers:[]})).toThrow();expect(()=>c.schedule({...base,route:[{cx:3,cy:4},{cx:5,cy:4}]})).toThrow();expect(()=>c.schedule({...base,cargo:[{itemId:'made_up',count:1}]})).toThrow();
 });
});
