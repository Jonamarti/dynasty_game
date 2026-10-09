import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase36-caravans-2026-10-09';

test('the globe offers a caravan only for a known non-home comarca and sends the selected target', async ({ page }) => {
  await page.goto('/?skipIntro=1&seed=e2e-caravan-map&world=random');
  await expect(page.locator('.hud-name')).not.toBeEmpty();
  const destination = await page.evaluate(() => {
    const state = (window as any).__dynasty.worldState;
    const sim = (window as any).__dynasty.sim;
    const from = state.frontier.active;
    const width = state.geography.map.width, height = state.geography.map.height;
    const candidates = [[from.cx + 1, from.cy], [from.cx, from.cy + 1], [from.cx - 1, from.cy], [from.cx, from.cy - 1]];
    for (const [rawX, cy] of candidates) {
      if (cy < 0 || cy >= height) continue;
      const cx = (rawX + width) % width;
      if (state.geography.profileAt(cx, cy).biome === 'ocean') continue;
      sim.player.worldKnowledge.see(cx, cy, sim.time.day);
      state.dispatchCaravanForPlayer = (point: { cx: number; cy: number }) => {
        (window as any).__caravanSent = point;
        return null;
      };
      return { cx, cy, rx: Math.floor(cx / 10), ry: Math.floor(cy / 10), dx: cx % 10, dy: cy % 10 };
    }
    return null;
  });
  expect(destination).not.toBeNull();
  await page.locator('.hud-globe').click();
  const box = (await page.locator('.worldmap-canvas').boundingBox())!;
  await page.mouse.click(box.x + (destination!.rx + .5) / 96 * box.width, box.y + (destination!.ry + .5) / 48 * box.height);
  await page.locator('.worldmap-closer').click();
  const region = (await page.locator('.worldmap-canvas').boundingBox())!;
  await page.mouse.click(region.x + (destination!.dx + .5) / 10 * region.width, region.y + (destination!.dy + .5) / 10 * region.height);
  const caravan = page.locator('.worldmap-caravan');
  await expect(caravan).toBeVisible();
  await expect(caravan).toHaveText('Send a caravan here');
  await page.screenshot({ path: `${SHOTS}/01-known-comarca-caravan-control.png` });
  await caravan.click();
  await expect(page.locator('.worldmap-info')).toContainText('A caravan has been sent.');
  await expect.poll(() => page.evaluate(() => (window as any).__caravanSent)).toEqual({ cx: destination!.cx, cy: destination!.cy });
});


test('commissioning from the globe transfers the actual nearby merchant and goods', async ({ page }) => {
  await page.goto('/?skipIntro=1&seed=e2e-real-caravan-map&world=random');
  await expect(page.locator('.hud-name')).not.toBeEmpty();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const destination = await page.evaluate(() => {
    const d=(window as any).__dynasty,state=d.worldState,sim=d.sim,from=state.frontier.active;
    const width=state.geography.map.width,height=state.geography.map.height;
    const points=[[from.cx+1,from.cy],[from.cx-1,from.cy],[from.cx,from.cy+1],[from.cx,from.cy-1]];
    const merchant=sim.people.find((p:any)=>p.alive&&!p.isPlayer&&!p.isChild&&p.bandId===sim.player.bandId);
    if(!merchant)return null;
    sim.peopleHash.remove(merchant);merchant.x=sim.player.x+.25;merchant.y=sim.player.y;sim.peopleHash.insert(merchant);
    merchant.knownTech.add('marking');merchant.knownTech.add('trade');merchant.inventory.add('tin_ore',2);
    for(const [rawX,cy] of points){
      const cx=(rawX+width)%width;
      if(cy<0||cy>=height||state.geography.profileAt(cx,cy).biome==='ocean')continue;
      sim.player.worldKnowledge.see(cx,cy,sim.time.day);
      merchant.worldKnowledge=new sim.player.worldKnowledge.constructor();
      merchant.worldKnowledge.see(cx,cy,sim.time.day);
      merchant.worldKnowledge.see(from.cx,from.cy,sim.time.day);
      merchant.worldKnowledge.meet(cx,cy,merchant.bandId+1,sim.time.day);
      return {cx,cy,merchantId:merchant.id,rx:Math.floor(cx/10),ry:Math.floor(cy/10),dx:cx%10,dy:cy%10};
    }
    return null;
  });
  expect(destination).not.toBeNull();
  await page.locator('.hud-globe').click();
  const globe=(await page.locator('.worldmap-canvas').boundingBox())!;
  await page.mouse.click(globe.x+(destination!.rx+.5)/96*globe.width,globe.y+(destination!.ry+.5)/48*globe.height);
  await page.locator('.worldmap-closer').click();
  const region=(await page.locator('.worldmap-canvas').boundingBox())!;
  await page.mouse.click(region.x+(destination!.dx+.5)/10*region.width,region.y+(destination!.dy+.5)/10*region.height);
  await page.locator('.worldmap-caravan').click();
  await expect(page.locator('.worldmap-info')).toContainText('A caravan has been sent.');
  const result=await page.evaluate((id:number)=>{
    const state=(window as any).__dynasty.worldState,ticket=state.traffic.partyRecords.find((p:any)=>p.actorId===id);
    return {local:state.current.peopleById.has(id),party:ticket?.travellerIds,goods:state.traffic.caravans.list()[0]?.cargo};
  },destination!.merchantId);
  expect(result.local).toBe(false);
  expect(result.party).toContain(destination!.merchantId);
  expect(result.goods).toContainEqual({itemId:'tin_ore',count:2});
  await page.screenshot({path:SHOTS+'/02-named-merchant-departure.png'});
});
