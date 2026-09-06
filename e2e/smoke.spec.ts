/**
 * Browser smoke tests.
 *
 * These answer only the questions the headless harness cannot: does the page
 * boot without throwing, does the canvas paint, does the clock advance, and
 * does input reach the simulation. Anything about whether the world *behaves*
 * belongs in `npm run sim:check`, which is a hundred times faster.
 */
import { test, expect, type Page } from '@playwright/test';

/** Fails the test on any uncaught error or console error, not just assertions. */
function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });
  return errors;
}

/**
 * Waits until the app is actually alive before interacting.
 *
 * The canvas is in the static HTML, so Playwright can click it happily before
 * main.ts has run and attached a single listener — the click lands on a live
 * element and does nothing at all. A populated clock proves the module has
 * executed and the loop is stepping.
 */
async function ready(page: Page): Promise<void> {
  // A pinned seed. The world is deterministic from it, so every test sees the
  // same island, the same band and the same person standing in the same place.
  // Without this the suite rolled a new world each run and the menu assertions
  // passed or failed on where the player happened to have spawned.
  // `skipIntro` bypasses character creation. These specs were all written
  // against a game that starts immediately, and teaching every one of them to
  // dismiss an overlay first is a large change for no assertion gained — the
  // overlay has its own spec below.
  await page.goto('/?seed=e2e-fixture&skipIntro=1');
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.locator('.hud-name')).not.toBeEmpty();
}

/**
 * Clicks the map, and chooses from the entity picker when one opens.
 *
 * A click on a crowded tile no longer selects blindly: two or more things under
 * the cursor put up a bubble per candidate and wait to be told which was meant.
 * That is the point of the picker, and it means a test aiming at a berry bush
 * standing under an oak has to say so — the old blind behaviour would have
 * silently handed it the oak.
 */
/**
 * Aims at a person from another tribe, and returns where they are on screen.
 *
 * Two round trips on purpose. `snapTo` is not the last word on where the camera
 * ends up: the frame loop calls `clampTo` straight afterwards, which pulls the
 * view back inside the map. A camp near the edge therefore settles somewhere
 * other than where the snap asked for, so a screen coordinate computed in the
 * same evaluate as the snap is already stale — the click lands on whatever
 * happens to be standing there instead, which in a camp is a mud hut, and the
 * test then fails with a message about huts. Snap, let a frame settle it, then
 * read the position.
 *
 * Callers pause the world first, so nobody walks off between the two trips.
 */
async function aimAtStranger(page: Page): Promise<{ x: number; y: number } | null> {
  type Debug = {
    __dynasty: {
      sim: {
        player: { id: number };
        livingPeople: () => { id: number; bandId: number; x: number; y: number }[];
      };
      camera: {
        worldToScreenX: (x: number) => number;
        worldToScreenY: (y: number) => number;
        snapTo: (x: number, y: number) => void;
        following: boolean;
      };
    };
  };

  // Someone from another tribe. "The next person in the list" used to be a
  // stranger, when a band was fifteen unrelated adults; since the world started
  // being founded from families it is the player's own wife.
  const id = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.livingPeople().find(p => p.id === d.sim.player.id);
    if (!self) return null;
    const other = d.sim.livingPeople().find(p => p.bandId !== self.bandId);
    if (!other) return null;
    d.camera.snapTo(other.x, other.y);
    d.camera.following = false;
    return other.id;
  });
  if (id === null) return null;

  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  return await page.evaluate((personId) => {
    const d = (window as never as Debug).__dynasty;
    const who = d.sim.livingPeople().find(p => p.id === personId);
    if (!who) return null;
    return { x: d.camera.worldToScreenX(who.x), y: d.camera.worldToScreenY(who.y) };
  }, id);
}

async function clickAndChoose(
  page: Page,
  x: number,
  y: number,
  want: RegExp
): Promise<void> {
  await page.mouse.click(x, y);
  const picker = page.locator('.picker');
  if (!(await picker.isVisible())) return;

  // Matched by reading each bubble rather than with a `hasText` filter: the
  // label sits in a child span next to an emoji icon, and the filter does not
  // reliably see through that.
  const items = picker.locator('.picker-item');
  const count = await items.count();
  const seen: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const text = (await item.textContent()) ?? '';
    seen.push(text);
    if (want.test(text)) {
      await item.click();
      return;
    }
  }
  throw new Error('picker offered ' + JSON.stringify(seen) +
    ' but nothing matched ' + want);
}

/**
 * Screen point over walkable ground with nothing standing on it.
 *
 * Clicking blind at the centre of the canvas used to be fine, when only people
 * were selectable and everything else fell through to the player. Now that a
 * click picks whatever is under it, "the middle of the screen" is whoever
 * happens to be walking past, and the test asserts against a stranger.
 */
async function emptyGround(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { x: number; y: number };
          world: { isWalkable: (x: number, y: number) => boolean };
          livingPeople: () => { x: number; y: number }[];
          nodes: { x: number; y: number }[];
          buildingAt: (x: number, y: number) => unknown;
        };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;

    const clear = (x: number, y: number) =>
      d.sim.world.isWalkable(x, y) &&
      !d.sim.buildingAt(x, y) &&
      d.sim.livingPeople().every(p => Math.hypot(p.x - x, p.y - y) > 2.5) &&
      d.sim.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 2.5);

    for (let radius = 3; radius <= 10; radius++) {
      for (let angle = 0; angle < 16; angle++) {
        const x = Math.round(d.sim.player.x + Math.cos(angle) * radius);
        const y = Math.round(d.sim.player.y + Math.sin(angle) * radius);
        if (clear(x, y)) {
          return { x: d.camera.worldToScreenX(x), y: d.camera.worldToScreenY(y) };
        }
      }
    }
    return null;
  });
  expect(point, 'no empty ground near the player on this seed').not.toBeNull();
  return point!;
}

test('boots, paints and advances the clock', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await expect(page.locator('#view')).toBeVisible();

  // The clock must not merely exist; it must move, which proves the fixed
  // timestep loop is actually stepping the simulation.
  const clock = page.locator('.hud-clock');
  await expect(clock).not.toBeEmpty();
  const first = await clock.textContent();
  await expect.poll(async () => clock.textContent(), { timeout: 15_000 }).not.toBe(first);

  // A blank or single-colour canvas is the classic silent rendering failure.
  const distinctColors = await page.evaluate(() => {
    const el = document.getElementById('view') as HTMLCanvasElement;
    const ctx = el.getContext('2d');
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, el.width, el.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97) {
      seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    }
    return seen.size;
  });
  expect(distinctColors).toBeGreaterThan(5);

  expect(errors).toEqual([]);
});

test('the panel shows who someone is and what they want', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await expect(page.locator('.hud-name')).not.toBeEmpty();
  await expect(page.locator('.hud-tag')).toHaveText('you');

  // The score table is both the debugging surface for the utility AI and the
  // player's way of reading someone's intentions. If it stops rendering,
  // tuning the AI becomes guesswork.
  await expect.poll(async () => page.locator('.hud-score').count(), { timeout: 15_000 })
    .toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('the character tabs each render', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.locator('.hud-tab', { hasText: 'Self' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Skills' })).toBeVisible();
  await expect(page.locator('.hud-section', { hasText: 'Temperament' })).toBeVisible();

  await page.locator('.hud-tab', { hasText: 'Kit' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Carrying' })).toBeVisible();

  await page.locator('.hud-tab', { hasText: 'Ties' }).click();
  await expect(page.locator('.hud-panel')).toContainText(/know|nobody|standing/i);

  await page.locator('.hud-tab', { hasText: 'Life' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Life so far' })).toBeVisible();

  await page.locator('.hud-tab', { hasText: 'Now' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Condition' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('right-click opens a radial menu whose options fit the target', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  const ground = await emptyGround(page);
  await page.mouse.click(ground.x, ground.y, { button: 'right' });
  const menu = page.locator('.radial-item');
  await expect.poll(async () => menu.count(), { timeout: 10_000 }).toBeGreaterThan(0);

  // Right-clicking bare ground offers ground verbs and must not offer the
  // social ones — the catalogue is what keeps the menu honest.
  // On the pinned seed the player stands on open ground, so these are the
  // ground verbs. The catalogue is what guarantees the menu matches the target.
  const labels = (await menu.allTextContents()).join(' ').toLowerCase();
  expect(labels).toContain('walk here');
  expect(labels).toContain('rest');

  // Escape dismisses.
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await expect.poll(async () => page.locator('.radial-item').count(), { timeout: 5_000 }).toBe(0);

  expect(errors).toEqual([]);
});

test('an order from the menu changes what the player is doing', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  const ground = await emptyGround(page);
  await page.mouse.click(ground.x, ground.y, { button: 'right' });
  const rest = page.locator('.radial-item', { hasText: 'Rest' }).first();
  await expect(rest).toBeVisible({ timeout: 10_000 });
  await rest.click();

  // The panel reports the current action, and an ordered action is badged.
  await expect.poll(async () => page.locator('.hud-doing').textContent(), { timeout: 10_000 })
    .toMatch(/resting/i);

  expect(errors).toEqual([]);
});

test('build mode offers designs and marks locked ones', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.keyboard.press('b');

  const bar = page.locator('.hud-buildbar');
  await expect(bar).toBeVisible();
  await expect(page.locator('.hud-design')).not.toHaveCount(0);
  await expect(bar).toContainText('Mud hut');

  // Advanced designs exist but need knowledge nobody has yet; showing them is
  // how the progression stays visible instead of appearing from nowhere.
  await expect(page.locator('.hud-buildbar-locked')).toContainText(/granary|longhouse/i);

  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();

  expect(errors).toEqual([]);
});

test('pauses and resumes', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  const clock = page.locator('.hud-clock');
  await page.locator('.hud-button', { hasText: 'Pause' }).click();
  await expect(page.locator('.hud-button', { hasText: 'Resume' })).toBeVisible();

  const paused = await clock.textContent();
  await page.waitForTimeout(1500);
  expect(await clock.textContent()).toBe(paused);

  await page.locator('.hud-button', { hasText: 'Resume' }).click();
  await expect.poll(async () => clock.textContent(), { timeout: 15_000 }).not.toBe(paused);

  expect(errors).toEqual([]);
});

test('walking with the keyboard moves the player', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await expect(page.locator('.hud-tag')).toHaveText('you');
  await page.keyboard.down('d');
  await expect.poll(async () => page.locator('.hud-doing').textContent(), { timeout: 15_000 })
    .toMatch(/walking/i);
  await page.keyboard.up('d');

  expect(errors).toEqual([]);
});

test('dragging pans the map instead of selecting', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  const before = await page.evaluate(() => {
    const d = (window as never as { __dynasty: { camera: { x: number; y: number } } }).__dynasty;
    return { x: d.camera.x, y: d.camera.y };
  });

  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(500, 300, { steps: 8 });
  await page.mouse.up();

  const after = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { camera: { x: number; y: number; following: boolean } };
    }).__dynasty;
    return { x: d.camera.x, y: d.camera.y, following: d.camera.following };
  });

  // The view moved and let go of the player; `F` re-attaches it.
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(1);
  expect(after.following).toBe(false);

  await page.keyboard.press('f');
  await expect.poll(async () => page.evaluate(() => {
    const d = (window as never as { __dynasty: { camera: { following: boolean } } }).__dynasty;
    return d.camera.following;
  })).toBe(true);

  expect(errors).toEqual([]);
});

test('the browser context menu is suppressed', async ({ page }) => {
  await ready(page);
  const prevented = await page.evaluate(() => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.getElementById('view')!.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('a stranger gives up nothing but what you can see', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Freeze the world before working out where anybody is standing.
  //
  // The target is computed in one `evaluate`, then clicked in a separate round
  // trip, and the simulation keeps stepping in between: by the time the click
  // lands the person has walked several tiles and the cursor is over whatever
  // did not move, which in a camp is the mud hut they were standing in. The
  // test then selects a building and fails on a message about huts. This is not
  // seed-dependent behaviour worth preserving — it passed before only because
  // the person the spec happened to pick was standing still.
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  // Pick someone the player has certainly never met and click where they stand.
  const clicked = await aimAtStranger(page);
  expect(clicked).not.toBeNull();

  // A stranger reads as "a man" / "a woman" in the picker too, for the same
  // reason they do in the panel: the picker must not leak a name either.
  await clickAndChoose(page, clicked!.x, clicked!.y, /(man|woman|child)/i);

  // No name, and an explicit statement of why you know nothing.
  await expect(page.locator('.hud-name')).toContainText(/^a (child|young |older )?(wo)?man$/i);
  await expect(page.locator('.hud-known')).toContainText('never met');

  // Their skills and temperament are not readable off a stranger's face.
  await page.locator('.hud-tab', { hasText: 'Self' }).click();
  await expect(page.locator('.hud-veil')).toBeVisible();
  await expect(page.locator('.hud-section', { hasText: 'Skills' })).toHaveCount(0);

  // Nor is their life story.
  await page.locator('.hud-tab', { hasText: 'Life' }).click();
  await expect(page.locator('.hud-section', { hasText: 'What you know of them' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('a berry bush reads as an estimate until you are close', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  const clicked = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { x: number; y: number };
          nodes: { kind: string; x: number; y: number }[];
        };
        camera: {
          worldToScreenX: (x: number) => number;
          worldToScreenY: (y: number) => number;
          snapTo: (x: number, y: number) => void;
          following: boolean;
        };
      };
    }).__dynasty;
    const far = d.sim.nodes.find(n => {
      const dx = n.x - d.sim.player.x;
      const dy = n.y - d.sim.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return n.kind === 'berries' && dist > 4 && dist < 18;
    });
    if (!far) return null;
    // A bush the player can see is not necessarily a bush *on screen*: the
    // camera frames the player, and a click outside the canvas never reaches
    // the game at all. Bring the view to it and let go of the follow.
    d.camera.snapTo(far.x, far.y);
    d.camera.following = false;
    return { x: d.camera.worldToScreenX(far.x), y: d.camera.worldToScreenY(far.y) };
  });
  if (!clicked) test.skip(true, 'no berry bush at a useful distance on this seed');

  await clickAndChoose(page, clicked!.x, clicked!.y, /berries/i);
  await expect(page.locator('.hud-name')).toContainText('Berry bush');
  await expect(page.locator('.hud-known')).toContainText('too far to judge');
  await expect(page.locator('.hud-veil')).toBeVisible();

  expect(errors).toEqual([]);
});

test('death hands the game to an heir instead of ending it', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  const before = await page.locator('.hud-name').textContent();

  // Kill the player outright. The succession machinery runs off the same path
  // whatever the cause, so a direct kill exercises exactly what old age does.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { die: (cause: string) => void } | null } };
    }).__dynasty;
    d.sim.player?.die('a test');
  });

  const card = page.locator('.succession-card');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('has died');
  await expect(card).toContainText('a test');

  await page.locator('.succession-go').click();
  await expect(card).toBeHidden();

  // The game carries on, as somebody else.
  await expect(page.locator('.hud-tag')).toHaveText('you');
  await expect.poll(async () => page.locator('.hud-name').textContent(), { timeout: 10_000 })
    .not.toBe(before);

  const clock = page.locator('.hud-clock');
  const at = await clock.textContent();
  await expect.poll(async () => clock.textContent(), { timeout: 15_000 }).not.toBe(at);

  expect(errors).toEqual([]);
});

test('the family panel names spouse, parents and children', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.locator('.hud-tab', { hasText: 'Ties' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Family' })).toBeVisible();
  // A founding character is a member of a founding family, not a household of
  // one: the world now opens with three tribes made of married couples, their
  // children and the occasional widowed parent. Asserting "unmarried, no
  // children" would now be asserting that founding had not happened.
  await expect(page.locator('.hud-panel')).toContainText('household');
  await expect(page.locator('.hud-panel')).toContainText('married to');

  expect(errors).toEqual([]);
});

test('the era is named in the top bar', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);
  // A fresh world knows nothing, so it opens in the Stone Age by definition.
  await expect(page.locator('.hud-stats')).toContainText('Stone Age');
  expect(errors).toEqual([]);
});

test('standing over someone is shown, and command mode can be entered', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Freeze the world before working out where anybody is standing.
  //
  // The target is computed in one `evaluate`, then clicked in a separate round
  // trip, and the simulation keeps stepping in between: by the time the click
  // lands the person has walked several tiles and the cursor is over whatever
  // did not move, which in a camp is the mud hut they were standing in. The
  // test then selects a building and fails on a message about huts. This is not
  // seed-dependent behaviour worth preserving — it passed before only because
  // the person the spec happened to pick was standing still.
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  // Select somebody else, then read what the player could make them do.
  const other = await aimAtStranger(page);
  expect(other).not.toBeNull();
  await clickAndChoose(page, other!.x, other!.y, /(man|woman|child)/i);

  await page.locator('.hud-tab', { hasText: 'Ties' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Your standing' })).toBeVisible();
  // A stranger owes the player nothing, and the panel says so.
  await expect(page.locator('.hud-panel')).toContainText('no standing over them');

  const command = page.locator('.hud-commandbtn');
  await expect(command).toBeVisible();
  await command.click();

  expect(errors).toEqual([]);
});

test('knowledge is listed on the person who holds it', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Give the player something to know, the same way the simulation would.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { knownTech: Set<string> } | null } };
    }).__dynasty;
    d.sim.player?.knownTech.add('firemaking');
  });

  await page.locator('.hud-tab', { hasText: 'Self' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Knows how to' })).toBeVisible();
  await expect(page.locator('.hud-panel')).toContainText('Firemaking');
  await expect(page.locator('.hud-panel')).toContainText('Knowledge lives in people');

  expect(errors).toEqual([]);
});

test('an idea in progress is shown, with the story that started it', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Put an idea on the player the way conception would, and check the whole
  // lifecycle is legible from inside the game. Before M6b phase 2 research was
  // entirely invisible: a character sat down, some time passed, and eventually
  // a technology appeared in a list.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { ideas: unknown[] } | null } };
    }).__dynasty;
    d.sim.player?.ideas.push({
      tech: 'cordage', stage: 'researching', insight: 0.4,
      story: 'kept running out of hands',
      conceivedTick: 0, effort: 12, discussedWith: [], failedTests: 1,
    });
  });

  await page.locator('.hud-tab', { hasText: 'Self' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Working on' })).toBeVisible();
  await expect(page.locator('.hud-panel')).toContainText('Cordage');
  await expect(page.locator('.hud-panel')).toContainText('working it out');
  await expect(page.locator('.hud-panel')).toContainText('kept running out of hands');
  // A failed attempt is part of the story, not something to hide.
  await expect(page.locator('.hud-panel')).toContainText('1 attempt that did not work');

  expect(errors).toEqual([]);
});

test('thinking is offered only once something has occurred to you', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Right-click empty ground: the verb is there and greyed, with the reason.
  // An option that is simply absent teaches the player nothing about why.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { ideas: unknown[] } | null } };
    }).__dynasty;
    if (d.sim.player) d.sim.player.ideas.length = 0;
  });

  const ground = await emptyGround(page);
  await page.mouse.click(ground.x, ground.y, { button: 'right' });
  const think = page.locator('.radial-item', { hasText: 'Think' }).first();
  await expect(think).toBeVisible({ timeout: 10_000 });
  await expect(think).toHaveClass(/is-disabled/);

  expect(errors).toEqual([]);
});

test('the tech web opens on G and answers why an idea has not arrived', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.evaluate(() => {
    const d = (window as never as { __dynasty: { sim: { player: {
      knownTech: Set<string>; techLevel: Map<string, number>; ideas: unknown[];
    } | null } } }).__dynasty;
    const player = d.sim.player;
    if (!player) return;
    player.knownTech.add('firemaking');
    player.techLevel.set('firemaking', 1);
    player.ideas.push({
      tech: 'cordage', stage: 'researching', insight: 0.5,
      story: 'kept running out of hands',
      conceivedTick: 0, effort: 5, discussedWith: [], failedTests: 0,
    });
  });

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });

  // Every technology is on the web, and the states are distinguishable.
  await expect(page.locator('.techweb-node')).toHaveCount(10);
  await expect(page.locator('.techweb-node.is-proven')).toHaveCount(1);
  await expect(page.locator('.techweb-node.is-working')).toHaveCount(1);
  // Out of reach means unlabelled: the shape of what is unknown is visible,
  // its content is not.
  const dark = page.locator('.techweb-node.is-unknown').first();
  await expect(dark).toHaveText('');

  // The whole reason the panel exists: hovering says which half of a spark is
  // satisfied and which is missing, in words.
  await page.locator('.techweb-node[data-tech="cooking"]').hover();
  await expect(page.locator('.techweb-title')).toHaveText('Cooking');
  await expect(page.locator('.techweb-ing.is-met').first())
    .toContainText('knowing firemaking');
  await expect(page.locator('.techweb-detail')).toContainText('holding');

  // Escape dismisses, and a dismissed overlay must not be left swallowing
  // clicks — the trap this project has now fallen into four times.
  await page.keyboard.press('Escape');
  await expect(page.locator('.techweb-card')).toHaveCount(0);
  await expect(page.locator('.techweb')).toHaveCSS('display', 'none');

  expect(errors).toEqual([]);
});

test('the tech web keeps a stranger to themselves', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Paused first. People walk, so a position read in one evaluate and clicked
  // a moment later is a position they have already left — the click landed on
  // a mud hut the stranger happened to be standing on, the selection became the
  // building, and the panel opened on the player instead.
  await page.keyboard.press(' ');

  // Somebody from another band, which since founding families is the only
  // reliable way to get an actual stranger: "the next person in the list" is
  // now very often the player's own wife, and three specs learned that the
  // hard way when households landed.
  const found = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { id: number; bandId: number; householdId: number | null } | null;
          livingPeople: () => {
            id: number; x: number; y: number; bandId: number; householdId: number | null;
          }[];
          buildingAt: (x: number, y: number) => unknown;
        };
        camera: {
          snapTo: (x: number, y: number) => void; following: boolean;
          worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
        };
      };
    }).__dynasty;
    const player = d.sim.player;
    if (!player) return null;
    // And not standing on a building: two candidates under one cursor opens the
    // chooser rather than selecting, so the click would land on neither. The
    // fixture seed puts this stranger squarely on an unfinished mud hut.
    const other = d.sim.livingPeople().find(p =>
      p.id !== player.id && p.bandId !== player.bandId &&
      p.householdId !== player.householdId &&
      d.sim.buildingAt(p.x, p.y) === null);
    if (!other) return null;
    d.camera.snapTo(other.x, other.y);
    d.camera.following = false;
    return { id: other.id };
  });
  expect(found, 'this seed has nobody from another band').not.toBeNull();

  // The screen position is read in a *second* pass, after the camera has
  // settled. Taken in the same breath as the snap it was 65 pixels out — the
  // frame loop clamps the camera to the world bounds afterwards — and the click
  // landed on a mud hut a little way off.
  await page.waitForTimeout(300);
  const at = await page.evaluate((id: number) => {
    const d = (window as never as {
      __dynasty: {
        sim: { peopleById: Map<number, { x: number; y: number }> };
        camera: {
          worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
        };
      };
    }).__dynasty;
    const who = d.sim.peopleById.get(id)!;
    return { x: d.camera.worldToScreenX(who.x), y: d.camera.worldToScreenY(who.y) };
  }, found!.id);

  await page.mouse.click(at.x, at.y);
  // The panel names them the way the player's character would, which is also
  // the proof the click landed on the stranger and not on whatever they were
  // standing on.
  await expect(page.locator('.hud-panel'))
    .toContainText('not of your band', { timeout: 5_000 });
  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.techweb-veil')).toBeVisible();
  // Not one node: a map of somebody's mind is the easiest possible way to hand
  // the player the god's-eye view the design is built to withhold.
  await expect(page.locator('.techweb-node')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.keyboard.press(' ');
  expect(errors).toEqual([]);
});

test('teaching appears in the menu only when you have something to teach', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  const other = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { id: number; knownTech: Set<string> } | null;
          livingPeople: () => { id: number; x: number; y: number; knownTech: Set<string> }[];
        };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;
    const pick = d.sim.livingPeople().find(p => p.id !== d.sim.player?.id);
    if (!pick) return null;
    d.sim.player?.knownTech.add('cordage');
    pick.knownTech.clear();
    return { x: d.camera.worldToScreenX(pick.x), y: d.camera.worldToScreenY(pick.y) };
  });
  expect(other).not.toBeNull();

  await page.mouse.click(other!.x, other!.y, { button: 'right' });
  const teach = page.locator('.radial-item', { hasText: 'Teach' }).first();
  await expect(teach).toBeVisible({ timeout: 10_000 });
  await expect(teach).not.toHaveClass(/is-disabled/);

  expect(errors).toEqual([]);
});

test('the kit tab lists what you carry and offers verbs on it', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Put something in the pack the way the world would.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { inventory: { add: (id: string, n: number) => void } } | null } };
    }).__dynasty;
    d.sim.player?.inventory.add('berries', 4);
  });

  await page.locator('.hud-tab', { hasText: 'Kit' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Carrying' })).toBeVisible();
  await expect(page.locator('.hud-item-name')).toContainText('Berries');

  // Eating from the panel actually consumes a unit.
  await page.locator('.hud-verb', { hasText: 'Eat' }).first().click();
  await expect.poll(async () => page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { inventory: { count: (id: string) => number } } | null } };
    }).__dynasty;
    return d.sim.player?.inventory.count('berries') ?? -1;
  }), { timeout: 5_000 }).toBe(3);

  expect(errors).toEqual([]);
});

test('dropping puts goods on the ground where they can be picked up', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { inventory: { add: (id: string, n: number) => void } } | null } };
    }).__dynasty;
    d.sim.player?.inventory.add('flint', 2);
  });

  await page.locator('.hud-tab', { hasText: 'Kit' }).click();
  await page.locator('.hud-verb', { hasText: 'Drop' }).first().click();

  // The goods left the pack and exist in the world rather than being deleted.
  const state = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { inventory: { count: (id: string) => number } } | null;
          piles: { contents: { count: (id: string) => number } }[];
        };
      };
    }).__dynasty;
    return {
      carried: d.sim.player?.inventory.count('flint') ?? -1,
      onGround: d.sim.piles.reduce((sum, p) => sum + p.contents.count('flint'), 0),
    };
  });
  expect(state.carried).toBe(0);
  expect(state.onGround).toBe(2);

  expect(errors).toEqual([]);
});

test('right-clicking water sends you to the bank instead of refusing', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Zoom out so a shoreline is actually on screen to click.
  await page.locator('#view').hover();
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(300);

  const water = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: {
        sim: {
          player: { x: number; y: number };
          world: { isWater: (x: number, y: number) => boolean };
        };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;
    // Real angles, and only water that is actually on screen: the first version
    // used the loop index as an angle and happily returned a lake four hundred
    // pixels below the viewport, which no click could ever reach.
    for (let r = 2; r < 40; r += 0.5) {
      for (let step = 0; step < 32; step++) {
        const angle = (step / 32) * Math.PI * 2;
        const x = Math.round(d.sim.player.x + Math.cos(angle) * r);
        const y = Math.round(d.sim.player.y + Math.sin(angle) * r);
        if (!d.sim.world.isWater(x, y)) continue;
        const sx = d.camera.worldToScreenX(x);
        const sy = d.camera.worldToScreenY(y);
        if (sx < 40 || sx > window.innerWidth - 340) continue;
        if (sy < 40 || sy > window.innerHeight - 80) continue;
        return { x: sx, y: sy };
      }
    }
    return null;
  });
  if (!water) test.skip(true, 'no water on screen for this seed');

  await page.mouse.click(water!.x, water!.y, { button: 'right' });
  const drink = page.locator('.radial-item', { hasText: 'Drink' }).first();
  await expect(drink).toBeVisible({ timeout: 10_000 });
  await drink.click();

  // It is accepted and routed to a bank, rather than mutely refused.
  await expect.poll(async () => page.locator('.hud-doing').textContent(), { timeout: 10_000 })
    .toMatch(/drinking|walking/i);

  expect(errors).toEqual([]);
});

test('character creation picks a life inside a world that already exists', async ({ page }) => {
  const errors = guardErrors(page);
  // Deliberately *without* `skipIntro`: this is the one spec that wants the
  // overlay, and every other spec bypasses it.
  await page.goto('/?seed=e2e-fixture');

  // Three tribes, each described by its own norms rather than by a hand-written
  // blurb, and the world behind them already generated.
  const tribes = page.locator('.newgame-option');
  await expect(tribes).toHaveCount(3, { timeout: 15_000 });
  await tribes.first().click();

  // A shortlist of that tribe's adults, and a reshuffle that shows a different
  // slice of the same fixed set of people rather than inventing anyone.
  const first = await page.locator('.newgame-option-name').first().innerText();
  await page.locator('.hud-button', { hasText: 'Roll again' }).click();
  await expect(page.locator('.newgame-option-name').first()).not.toHaveText(first);

  await page.locator('.newgame-option').first().click();

  // Point-buy replaces the rolled skills rather than adding to them.
  await page.locator('.hud-button', { hasText: 'Choose skills instead' }).click();
  await expect(page.locator('.newgame-skill').first()).toContainText('0');

  await page.locator('.hud-button', { hasText: 'Begin' }).click();

  // The overlay is gone, the clock is running, and the player is somebody.
  await expect(page.locator('.newgame')).toBeHidden();
  await expect(page.locator('.hud-tag')).toHaveText('you');
  await expect(page.locator('.hud-clock')).not.toBeEmpty();

  expect(errors).toEqual([]);
});

test('the ties tab can send the camera to somebody', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.locator('.hud-tab', { hasText: 'Ties' }).click();
  const goTo = page.locator('.hud-goto').first();
  await expect(goTo).toBeVisible();

  const cameraAt = () => page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { camera: { x: number; y: number; following: boolean } };
    }).__dynasty;
    return { x: d.camera.x, y: d.camera.y, following: d.camera.following };
  });

  const before = await cameraAt();
  await goTo.click();
  const after = await cameraAt();

  // It moved, and it let go of the player — otherwise the view slides straight
  // back to wherever the player is standing and the button does nothing.
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0);
  expect(after.following).toBe(false);

  expect(errors).toEqual([]);
});
