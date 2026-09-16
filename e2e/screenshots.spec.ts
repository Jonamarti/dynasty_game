/**
 * Screenshot tour. Not an assertion suite — a way to look at the game without
 * launching it, and to keep a visual record of how a change altered the view.
 *
 *   npm run shots   ->  artifacts/screenshots/
 */
import { test, expect } from '@playwright/test';

const DIR = 'artifacts/screenshots';

/**
 * Clicks something and takes it out of the chooser.
 *
 * Since O7 the chooser opens for a single candidate as well as for a stack,
 * because the bare ground is always one of the choices. The tour is a record
 * rather than an assertion suite, so before this it degraded silently: the
 * tree shots caught a picker and then an empty screen instead of the panel and
 * the radial menu they are there to show.
 *
 * Matched on the bubble's icon rather than its label, because labels are routed
 * through the knowledge layer and a stranger has no name to match.
 */
async function clickThrough(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  icon: string,
  button: 'left' | 'right' = 'left'
): Promise<void> {
  await page.mouse.click(x, y, { button });
  await page.waitForTimeout(200);
  const picker = page.locator('.picker');
  if (!(await picker.isVisible())) return;
  const items = picker.locator('.picker-item');
  for (let i = 0; i < await items.count(); i++) {
    if (((await items.nth(i).textContent()) ?? '').includes(icon)) {
      await items.nth(i).click();
      await page.waitForTimeout(200);
      return;
    }
  }
  await page.keyboard.press('Escape');
}

test('tour', async ({ page }) => {
  await page.goto('/?seed=tour&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: DIR + '/01-start.png' });

  // The radial menu over open ground.
  await page.locator('#view').click({ button: 'right', position: { x: 700, y: 430 } });
  await page.waitForTimeout(250);
  await page.screenshot({ path: DIR + '/02-radial.png' });
  await page.keyboard.press('Escape');

  // Let a few in-game days pass so people meet, gossip and build.
  await page.locator('.hud-speed').fill('120');
  await page.waitForTimeout(9000);

  await page.locator('.hud-tab', { hasText: 'Ties' }).click();
  await page.screenshot({ path: DIR + '/03-ties.png' });

  // A stranger: what the inspector will and will not tell you.
  const stranger = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: { player: { id: number }; livingPeople: () => { id: number; x: number; y: number }[] };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;
    const other = d.sim.livingPeople().find(p => p.id !== d.sim.player.id);
    if (!other) return null;
    return { x: d.camera.worldToScreenX(other.x), y: d.camera.worldToScreenY(other.y) };
  });
  if (stranger) {
    await page.mouse.click(stranger.x, stranger.y);
    await page.locator('.hud-tab', { hasText: 'Self' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: DIR + '/07-stranger.png' });
    await page.locator('.hud-tab', { hasText: 'Life' }).click();
  }

  await page.locator('.hud-tab', { hasText: 'Life' }).click();
  await page.screenshot({ path: DIR + '/04-life.png' });

  // The mind: an idea mid-lifecycle, and a refined design beside it. Staged
  // rather than waited for, because a two-year run is what it takes to see one
  // arrive naturally and this is a tour rather than a test.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { ideas: unknown[]; knownTech: Set<string>; techLevel: Map<string, number> };
        };
      };
    }).__dynasty;
    const player = d.sim.player;
    player.knownTech.add('cordage');
    player.techLevel.set('cordage', 1);
    player.ideas.length = 0;
    player.ideas.push({
      tech: 'hafting', stage: 'researching', insight: 0.45,
      story: 'hacked at a trunk with a loose stone until the stone hurt more than the tree',
      conceivedTick: 0, effort: 40, discussedWith: [], failedTests: 1,
    });
    player.ideas.push({
      tech: 'firemaking', stage: 'prototyped', insight: 0.7,
      story: 'struck two cold stones together and one of them spat a spark',
      conceivedTick: 0, effort: 60, discussedWith: [], failedTests: 0,
    });
  });
  // The tech web, opened on the player, with a node hovered so the pane that
  // answers "why has this not occurred to me" is filled in. That pane is the
  // reason the panel exists, so a tour shot of the picture alone would be
  // showing the least interesting half.
  await page.keyboard.press('g');
  await page.waitForTimeout(400);
  const unproven = page.locator('.techweb-node.is-conceivable, .techweb-node.is-understood');
  if (await unproven.count() > 0) {
    await unproven.first().hover();
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: DIR + '/12-techweb.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.locator('.hud-tab', { hasText: 'Self' }).click();
  // A taller window rather than a scroll: the panel rebuilds its subtree every
  // frame, so anything scrolled into view is scrolled back out again before the
  // shutter opens.
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport?.width ?? 1280, height: 1160 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: DIR + '/04-mind.png' });
  await page.setViewportSize({ width: viewport?.width ?? 1280, height: viewport?.height ?? 800 });
  await page.waitForTimeout(300);

  // Build mode, with the locked designs visible.
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  await page.screenshot({ path: DIR + '/05-build.png' });
  await page.keyboard.press('Escape');

  // The succession screen: what a life comes to.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { die: (cause: string) => void } | null } };
    }).__dynasty;
    d.sim.player?.die('a fall from the rocks');
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: DIR + '/08-succession.png' });
  await page.locator('.succession-go').click();
  await page.waitForTimeout(300);

// A fruit tree, and what a woodsman can and cannot tell about it.
  //
  // Paused first. The tour runs at 120 steps a second and the camera follows the
  // player, so a screen coordinate read in one round trip is pointing somewhere
  // else by the time the click lands in the next — which is why these two shots
  // had quietly become a picture of the player's own panel.
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForTimeout(200);
  const tree = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: { player: { x: number; y: number }; trees: { x: number; y: number; fruit: number }[] };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;
    const near = d.sim.trees
      .filter(t => Math.hypot(t.x - d.sim.player.x, t.y - d.sim.player.y) < 16)
      .sort((a, b) => b.fruit - a.fruit)[0];
    if (!near) return null;
    return { x: d.camera.worldToScreenX(near.x), y: d.camera.worldToScreenY(near.y) };
  });
  if (tree) {
    await clickThrough(page, tree.x, tree.y, '\u{1F333}');
    await page.screenshot({ path: DIR + '/09-tree.png' });
    await clickThrough(page, tree.x, tree.y, '\u{1F333}', 'right');
    await page.screenshot({ path: DIR + '/10-tree-menu.png' });
    await page.keyboard.press('Escape');
  }
  await page.locator('.hud-button', { hasText: 'Resume' }).click();

  // The kit tab. A tree is selected at this point in the tour, and a tree has no
  // tabs, so put the player back in the panel first.
  // Clicking bare ground selects your own character, because nothing else is
  // there to claim the click. Clicking the character directly does not, now
  // that the player is deliberately the last candidate under the cursor.
  const clear = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { x: number; y: number } | null;
          world: { isWalkable: (x: number, y: number) => boolean };
          livingPeople: () => { x: number; y: number }[];
          nodes: { x: number; y: number }[];
          trees: { x: number; y: number }[];
          buildingAt: (x: number, y: number) => unknown;
        };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;
    const me = d.sim.player;
    if (!me) return null;
    for (let r = 3; r < 12; r++) {
      for (let step = 0; step < 24; step++) {
        const angle = (step / 24) * Math.PI * 2;
        const x = Math.round(me.x + Math.cos(angle) * r);
        const y = Math.round(me.y + Math.sin(angle) * r);
        if (!d.sim.world.isWalkable(x, y)) continue;
        if (d.sim.buildingAt(x, y)) continue;
        if (d.sim.livingPeople().some(p => Math.hypot(p.x - x, p.y - y) < 2)) continue;
        if (d.sim.nodes.some(n => Math.hypot(n.x - x, n.y - y) < 2)) continue;
        if (d.sim.trees.some(t => Math.hypot(t.x - x, t.y - y) < 2.5)) continue;
        return { x: d.camera.worldToScreenX(x), y: d.camera.worldToScreenY(y) };
      }
    }
    return null;
  });
  if (clear) await page.mouse.click(clear.x, clear.y);

  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { inventory: { add: (id: string, n: number) => void } } | null } };
    }).__dynasty;
    d.sim.player?.inventory.add('berries', 6);
    d.sim.player?.inventory.add('flint', 3);
  });
  await page.locator('.hud-tab', { hasText: 'Kit' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: DIR + '/11-kit.png' });

  // Zoom out over the island.
  await page.locator('#view').hover();
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(500);
  await page.screenshot({ path: DIR + '/06-island.png' });
});

test('the four seasons', async ({ page }) => {
  // M9.5 phase 2a's gate: the ground and the trees should look different in
  // each season. Phase 2b added `Simulation.snowDepth`, a real accumulator
  // advanced once a day (`advanceSnowDepth`) — winter's frost overlay and
  // buried goods both read it, so getting to each checkpoint has to mean
  // actually stepping the simulation through every day in between rather
  // than jumping `time.tick` directly, or winter would arrive with no snow
  // ever having fallen.
  await page.goto('/?seed=tour&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForTimeout(200);

  // Config defaults: ticksPerDay 240, daysPerSeason 20, startDay 10
  // (`Config.ts`). These land mid-season rather than on a boundary, so
  // temperature (and snowfall) has settled into the season's typical range
  // rather than showing whatever a transition tick happens to look like.
  const midSeasonTicks: [string, number][] = [
    ['spring', 1200],  // day 15
    ['summer', 4800],  // day 30
    ['autumn', 9600],  // day 50
    ['winter', 14400], // day 70
  ];
  let stepped = 0;
  for (const [season, tick] of midSeasonTicks) {
    const toStep = tick - stepped;
    stepped = tick;
    await page.evaluate((n) => {
      const d = (window as never as { __dynasty: { sim: { step: () => void } } }).__dynasty;
      for (let i = 0; i < n; i++) d.sim.step();
    }, toStep);
    await page.waitForTimeout(150);
    // Over 14,400 real steps somebody in an unwatched band can die of
    // ordinary old age or misfortune, which raises the succession screen —
    // a tour of what winter looks like should not stall on it.
    const succession = page.locator('.succession-go');
    if (await succession.isVisible()) {
      await succession.click();
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: `${DIR}/13-season-${season}.png` });
  }
});

test('the tribe graph, flat and in ranks', async ({ page }) => {
  // M9.5 phase 4e. The two pictures side by side is the whole point of the
  // phase: the same ties, drawn flat before the band has the idea of dividing
  // its labour and in rungs afterwards. The world is doctored to get there —
  // the alternative is running a tour long enough for a band to invent
  // `division_of_labour` and `chiefdom` on its own, which is a scenario, not a
  // screenshot.
  await page.goto('/?seed=tour&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15000 });
  await page.locator('.hud-speed').fill('120');
  await page.waitForTimeout(9000);
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await page.waitForTimeout(200);

  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  await page.screenshot({ path: DIR + '/14-tribe-flat.png' });
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { id: number; bandId: number; householdId: number | null;
            knownTech: Set<string> };
          peopleById: Map<number, { id: number; alive: boolean; knownTech: Set<string> }>;
          householdsById: Map<number, { bandId: number; headId: number }>;
          bandSystem: { chiefByBand: Map<number, number> };
        };
      };
    }).__dynasty;
    const player = d.sim.player;
    player.knownTech.add('division_of_labour');
    d.sim.bandSystem.chiefByBand.set(player.bandId, player.id);
    const household = player.householdId === null
      ? null
      : d.sim.householdsById.get(player.householdId);
    const band = household ? household.bandId : player.bandId;
    d.sim.bandSystem.chiefByBand.set(band, player.id);
    // Heads of the other houses in the band, so the middle rung has somebody
    // standing on it and the shot shows a pyramid rather than two rows.
    for (const house of d.sim.householdsById.values()) {
      if (house.bandId !== band) continue;
      const head = d.sim.peopleById.get(house.headId);
      if (head && head.alive) head.knownTech.add('chiefdom');
    }
  });

  await page.keyboard.press('t');
  await page.waitForTimeout(400);
  await page.screenshot({ path: DIR + '/15-tribe-ranks.png' });
  await page.keyboard.press('Escape');
});

test('the menu and the settings screen', async ({ page }) => {
  await page.goto('/?seed=tour&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('.pausemenu')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: DIR + '/20-menu.png' });

  await page.locator('.pausemenu button', { hasText: 'Settings' }).click();
  await expect(page.locator('.settings')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: DIR + '/21-settings.png' });

  // And again at the far end of the slider, so the record shows what a
  // difficulty actually does to the numbers under it.
  const difficulty = page.locator('.settings-difficulty-range');
  await difficulty.fill('4');
  await difficulty.dispatchEvent('input');
  await page.waitForTimeout(200);
  await page.screenshot({ path: DIR + '/22-settings-extreme.png' });
});

test('the screen the game opens on', async ({ page }) => {
  // No `skipIntro`: the tour should show what a player actually sees first.
  await page.goto('/?seed=tour');
  await expect(page.locator('.settings')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: DIR + '/19-start.png' });

  await page.locator('.settings button', { hasText: 'Begin' }).click();
  await expect(page.locator('.newgame')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: DIR + '/19b-newgame-after-settings.png' });
});
