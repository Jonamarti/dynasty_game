import { test, expect } from '@playwright/test';

const SHOTS = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-phase35-sail-2026-10-09';

test('long sea journeys require logboat plus researched and physical sail', async ({ page }) => {
  await page.goto('/?skipIntro=1&seed=e2e-sail&world=random');
  await expect(page.locator('.hud-name')).not.toBeEmpty({ timeout: 20_000 });
  const result = await page.evaluate(async () => {
    const d = (window as any).__dynasty, sim = d.sim, actor = sim.player, from = sim.comarcaAtTile(actor.x, actor.y);
    const width = sim.worldFrame.mapWidth, height = sim.worldFrame.mapHeight;
    const routeOf = (to: {cx:number;cy:number}) => {
      const east=(to.cx-from.cx+width)%width, west=(from.cx-to.cx+width)%width, step=east<=west?1:-1, n=Math.min(east,west);
      const route=[{cx:from.cx,cy:from.cy}]; let x=from.cx; for(let i=0;i<n;i++){x=(x+step+width)%width;route.push({cx:x,cy:from.cy});}
      let y=from.cy; const dy=to.cy<from.cy?-1:1; while(y!==to.cy){y+=dy;route.push({cx:x,cy:y});} return route;
    };
    let target: {cx:number;cy:number}|null=null;
    for(let radius=2;radius<=24&&!target;radius++) for(let dy=-radius;dy<=radius&&!target;dy++) for(let dx=-radius;dx<=radius&&!target;dx++) {
      if(Math.abs(dx)+Math.abs(dy)!==radius) continue;
      const cx=(from.cx+dx+width)%width,cy=from.cy+dy;if(cy<0||cy>=height)continue;
      const terrain=d.worldState.geography.profileAt(cx,cy), land=terrain.kind==='earth'?terrain.land:terrain.kind==='random'?terrain.biome!=='ocean':false;
      if(!land)continue;
      const route=routeOf({cx,cy}); const sea=route.slice(1).filter((p:any)=>{const t=d.worldState.geography.profileAt(p.cx,p.cy);return t.kind==='earth'?!t.land:t.kind==='random'?t.elevation<=0:false;}).length;
      if(sea>=1)target={cx,cy};
    }
    if(!target)throw new Error('The fixture must have a nearby land destination beyond the coast');
    actor.inventory.add('logboat',1); actor.knownTech.add('logboat'); actor.worldKnowledge.see(target.cx,target.cy,sim.time.day);
    const withoutSail=d.worldState.startJourney(target,{requireKnowledge:false});
    actor.inventory.add('sail',1); actor.knownTech.add('sail');
    const withSail=d.worldState.startJourney(target,{requireKnowledge:false});
    return { withoutSail, withSail, mode:d.worldState.frontier.pendingJourney?.transport.mode, target };
  });
  expect(result.withoutSail).toMatch(/transport needed/i);
  expect(result.withSail).toBeNull();
  expect(result.mode).toBe('sail');
  await expect(page.locator('.journey-status')).toContainText('Under sail', { timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/01-long-sea-journey.png` });
});
