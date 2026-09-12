/**
 * Browser smoke tests.
 *
 * These answer only the questions the headless harness cannot: does the page
 * boot without throwing, does the canvas paint, does the clock advance, and
 * does input reach the simulation. Anything about whether the world *behaves*
 * belongs in `npm run sim:check`, which is a hundred times faster.
 */
import { test, expect, type Page } from '@playwright/test';
// The one import from the simulation in this file, and it earns its place: the
// node count used to be written here as a literal and broke the moment a
// milestone added a technology, which is a test asserting a number rather than
// a fact. The fact is "every technology is on the web".
import { TECHS } from '../src/sim/knowledge/Tech.ts';

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
 * A click on anything no longer selects blindly: every candidate under the
 * cursor puts up a bubble and waits to be told which was meant. That is the
 * point of the picker, and it means a test aiming at a berry bush standing
 * under an oak has to say so — the old blind behaviour would have silently
 * handed it the oak.
 *
 * Since O7 this includes a *single* candidate, because the bare ground is
 * always one of the choices: clicking a person standing on the tile you meant
 * to walk to used to give you the person and no way at all to say otherwise.
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
  want: RegExp,
  button: 'left' | 'right' = 'left'
): Promise<void> {
  await page.mouse.click(x, y, { button });
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
 *
 * Since O7 this has to mean genuinely empty. The chooser opens for a *single*
 * candidate now, so a tile with one tree on it no longer falls through to the
 * radial menu — and this helper used to check only people, nodes and buildings.
 * Animals are the reason it also wants margin: they wander while the test is
 * doing its round trips, so a tile that was clear when it was chosen can have a
 * deer on it by the time the click lands.
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
          trees: { x: number; y: number; standing: boolean }[];
          piles: { x: number; y: number }[];
          animals: { x: number; y: number; alive: boolean }[];
          buildingAt: (x: number, y: number) => unknown;
        };
        camera: { worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number };
      };
    }).__dynasty;

    const clear = (x: number, y: number) =>
      d.sim.world.isWalkable(x, y) &&
      !d.sim.buildingAt(x, y) &&
      d.sim.livingPeople().every(p => Math.hypot(p.x - x, p.y - y) > 2.5) &&
      d.sim.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 2.5) &&
      d.sim.trees.every(t => !t.standing || Math.hypot(t.x - x, t.y - y) > 2.5) &&
      d.sim.piles.every(pile => Math.hypot(pile.x - x, pile.y - y) > 2.5) &&
      // Wider, because these move between choosing the tile and clicking it.
      d.sim.animals.every(a => !a.alive || Math.hypot(a.x - x, a.y - y) > 6);

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

test('a job can be assigned from the Work tab and changes what it says', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.locator('.hud-tab', { hasText: 'Work' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Work' })).toBeVisible();
  await expect(page.locator('.hud-sub', { hasText: 'no settled work' })).toBeVisible();

  // Assigning your own job is never refused, so the panel's own wording is
  // the only thing that has to change here — the compliance roll shown for
  // someone else's job lives in `standing over people`, tested elsewhere.
  await page.locator('[data-job="hunter"]').click();
  await expect(page.locator('.hud-sub', { hasText: 'Works as hunter' })).toBeVisible();
  await expect(page.locator('.hud-note', { hasText: 'hunting' })).toBeVisible();

  await page.locator('[data-job="none"]').click();
  await expect(page.locator('.hud-sub', { hasText: 'no settled work' })).toBeVisible();

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
  // Named by the technology, not by its id. This line used to read "(needs
  // pottery)" only because the ids happen to be English words.
  await expect(page.locator('.hud-buildbar-locked')).toContainText(/needs [a-z]/i);

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
      conceivedTick: 0, effort: 12, discussedWith: [],
      trials: 1, proof: 0.11, failedTests: 1,
    });
  });

  await page.locator('.hud-tab', { hasText: 'Self' }).click();
  await expect(page.locator('.hud-section', { hasText: 'Working on' })).toBeVisible();
  await expect(page.locator('.hud-panel')).toContainText('Cordage');
  await expect(page.locator('.hud-panel')).toContainText('working it out');
  await expect(page.locator('.hud-panel')).toContainText('kept running out of hands');
  // A failed try is part of the story, not something to hide.
  await expect(page.locator('.hud-panel')).toContainText('1 try that did not work');

  expect(errors).toEqual([]);
});

test('somebody with no ideas can still sit and think', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // This spec used to assert the opposite — a greyed "Think" reading "Nothing
  // has occurred to you yet" — and the premise changed under it in M9 phase 5
  // rather than the game breaking. The owner's note 4 is that having no idea
  // yet is precisely the moment thinking is *for*, so `reflect` is offered
  // here, enabled, where a refusal used to be.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { ideas: unknown[] } | null } };
    }).__dynasty;
    if (d.sim.player) d.sim.player.ideas.length = 0;
  });

  const ground = await emptyGround(page);
  await page.mouse.click(ground.x, ground.y, { button: 'right' });
  const think = page.locator('.radial-item', { hasText: 'Sit and think' }).first();
  await expect(think).toBeVisible({ timeout: 10_000 });
  await expect(think).not.toHaveClass(/is-disabled/);

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
  await expect(page.locator('.techweb-node')).toHaveCount(TECHS.length);
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

  // The bubble for a person, not the one for the tile they are standing on.
  // A stranger is "a man" or "a woman" — the picker is knowledge-gated too, so
  // there is no name here to match against.
  await clickAndChoose(page, at.x, at.y, /man|woman|child/i);
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

test('the tech web can be dragged and zoomed', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });

  const node = page.locator('.techweb-node').first();
  const before = (await node.boundingBox())!;

  // Dragging the empty canvas pans the whole web, the same gesture that pans
  // the map behind it.
  await page.mouse.move(before.x + 200, before.y + 150);
  await page.mouse.down();
  await page.mouse.move(before.x + 130, before.y + 90, { steps: 6 });
  await page.mouse.up();

  const afterDrag = (await node.boundingBox())!;
  expect(Math.abs(afterDrag.x - before.x) + Math.abs(afterDrag.y - before.y))
    .toBeGreaterThan(20);

  // The drag must not have been read as a click on whatever it ended over —
  // the panel is still open and no node's detail pane was forced into focus
  // by the release.
  await expect(page.locator('.techweb-card')).toBeVisible();

  const beforeZoom = (await node.boundingBox())!;
  await page.mouse.move(afterDrag.x + 5, afterDrag.y + 5);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => {
    const box = await node.boundingBox();
    return box ? box.width : 0;
  }).toBeGreaterThan(beforeZoom.width * 1.1);

  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('the family tree opens on K and reads top to bottom', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.keyboard.press('k');
  await expect(page.locator('.familytree-card')).toBeVisible({ timeout: 10_000 });
  // At least the player's own node is on their own family tree.
  await expect(page.locator('.familytree-node.is-subject')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.familytree-card')).toHaveCount(0);
  await expect(page.locator('.familytree')).toHaveCSS('display', 'none');

  expect(errors).toEqual([]);
});

test('the tribe graph opens on T and is empty rather than broken for a friendless founder', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.keyboard.press('t');
  await expect(page.locator('.tribegraph-card')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.tribegraph-node.is-subject')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.tribegraph-card')).toHaveCount(0);
  await expect(page.locator('.tribegraph')).toHaveCSS('display', 'none');

  expect(errors).toEqual([]);
});

test('the family tree and tribe graph are gated the same as the tech web', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);
  await page.keyboard.press(' ');

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
        camera: { snapTo: (x: number, y: number) => void; following: boolean };
      };
    }).__dynasty;
    const player = d.sim.player;
    if (!player) return null;
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

  await clickAndChoose(page, at.x, at.y, /man|woman|child/i);
  await expect(page.locator('.hud-panel'))
    .toContainText('not of your band', { timeout: 5_000 });

  await page.keyboard.press('k');
  await expect(page.locator('.familytree-veil')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.familytree-node')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.keyboard.press('t');
  await expect(page.locator('.tribegraph-veil')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.tribegraph-node')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.keyboard.press(' ');
  expect(errors).toEqual([]);
});

test('the three graphs are mutually exclusive', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.keyboard.press('g');
  await expect(page.locator('.techweb-card')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('k');
  await expect(page.locator('.familytree-card')).toBeVisible({ timeout: 10_000 });
  // Opening the second closed the first, rather than stacking on top of it.
  await expect(page.locator('.techweb-card')).toHaveCount(0);
  await expect(page.locator('.techweb')).toHaveCSS('display', 'none');

  await page.keyboard.press('t');
  await expect(page.locator('.tribegraph-card')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.familytree-card')).toHaveCount(0);

  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('teaching appears in the menu only when you have something to teach', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Paused before anything is measured. The target has to be found, then
  // chosen out of the picker, then found again in the radial, and people walk:
  // read in one round trip and clicked in another, the pupil has left the tile
  // and the click lands on open ground. This spec passed alone and failed in
  // the suite until it stopped racing the world.
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  type Debug = {
    __dynasty: {
      sim: {
        player: { id: number; knownTech: Set<string> } | null;
        livingPeople: () => {
          id: number; x: number; y: number; name: string; knownTech: Set<string>;
        }[];
      };
      camera: {
        snapTo: (x: number, y: number) => void; following: boolean;
        worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
      };
    };
  };

  const chosen = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const pick = d.sim.livingPeople().find(p => p.id !== d.sim.player?.id);
    if (!pick) return null;
    d.sim.player?.knownTech.add('cordage');
    pick.knownTech.clear();
    d.camera.snapTo(pick.x, pick.y);
    d.camera.following = false;
    return { id: pick.id, name: pick.name };
  });
  expect(chosen).not.toBeNull();

  // The screen position after the camera has settled: `clampTo` runs in the
  // frame loop after `snapTo` and can pull the view back inside the map.
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const other = await page.evaluate((id: number) => {
    const d = (window as never as Debug).__dynasty;
    const who = d.sim.livingPeople().find(p => p.id === id)!;
    return {
      x: d.camera.worldToScreenX(who.x),
      y: d.camera.worldToScreenY(who.y),
      name: who.name,
    };
  }, chosen!.id);

  // Right-clicking somebody now offers the ground as well as the person, so the
  // radial opens once the person has been chosen. `pick` is a bandmate whose
  // name the player knows, so match on that rather than on a veiled label.
  await clickAndChoose(page, other!.x, other!.y, new RegExp(other!.name), 'right');
  const teach = page.locator('.radial-item', { hasText: 'Teach' }).first();
  await expect(teach).toBeVisible({ timeout: 10_000 });
  await expect(teach).not.toHaveClass(/is-disabled/);

  await page.keyboard.press('Escape');
  await page.locator('.hud-button', { hasText: 'Resume' }).click();
  expect(errors).toEqual([]);
});

test('the talk menu nests, and offers a stranger only a greeting', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  // Paused for the same reason the teaching spec is: the target has to be
  // found, chosen out of the picker and found again in the radial, and people
  // walk between round trips.
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  type Debug = {
    __dynasty: {
      sim: {
        player: { id: number } | null;
        livingPeople: () => { id: number; x: number; y: number; name: string }[];
        relationships: {
          edge: (a: number, b: number) => { familiarity: number; lastContact: number };
        };
      };
      camera: {
        snapTo: (x: number, y: number) => void; following: boolean;
        worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
      };
    };
  };

  // Made strangers on purpose. The four rungs are a statement about the
  // relationship, so the spec has to say what the relationship is rather than
  // take whatever the pinned world happened to grow.
  const chosen = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const me = d.sim.player;
    const pick = d.sim.livingPeople().find(p => p.id !== me?.id);
    if (!me || !pick) return null;
    d.sim.relationships.edge(me.id, pick.id).familiarity = 0;
    d.sim.relationships.edge(pick.id, me.id).familiarity = 0;
    d.camera.snapTo(pick.x, pick.y);
    d.camera.following = false;
    return { id: pick.id, name: pick.name };
  });
  expect(chosen).not.toBeNull();

  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const other = await page.evaluate((id: number) => {
    const d = (window as never as Debug).__dynasty;
    const who = d.sim.livingPeople().find(p => p.id === id)!;
    return {
      x: d.camera.worldToScreenX(who.x),
      y: d.camera.worldToScreenY(who.y),
      name: who.name,
    };
  }, chosen!.id);

  await clickAndChoose(page, other!.x, other!.y, new RegExp(other!.name), 'right');

  // One entry on the ring, not four: the conversations are a group.
  const group = page.locator('.radial-item', { hasText: 'Talk to' }).first();
  await expect(group).toBeVisible({ timeout: 10_000 });
  await group.click();

  // Inside it, a stranger may be greeted and nothing more — and the rungs out
  // of reach are shown greyed rather than hidden, because what they say is a
  // fact about the relationship the player is entitled to know.
  const greet = page.locator('.radial-item', { hasText: 'Greet' }).first();
  const deep = page.locator('.radial-item', { hasText: 'Talk at length' }).first();
  await expect(greet).toBeVisible({ timeout: 10_000 });
  await expect(greet).not.toHaveClass(/is-disabled/);
  await expect(deep).toBeVisible();
  await expect(deep).toHaveClass(/is-disabled/);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.hud-button', { hasText: 'Resume' }).click();
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

  // Drop now asks how many before it moves anything; confirm the default,
  // which is the whole stack.
  await page.locator('.quantity-picker-confirm').click();

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

  // The settings screen comes first now — the island has to be settled before
  // anybody can be born on it. Taking the defaults leaves the boot world alone,
  // so what character creation opens over is the world generated from the seed,
  // exactly as this spec has always assumed.
  await expect(page.locator('.settings')).toBeVisible({ timeout: 15_000 });
  await page.locator('.settings button', { hasText: 'Begin' }).click();

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

  await page.locator('.newgame .hud-button', { hasText: 'Begin' }).click();

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

test('clicking a lone person still offers the ground under them', async ({ page }) => {
  // O7. The chooser used to need *two* stacked candidates, and the ground was
  // only ever added as an extra entry once a stack had already opened it. So
  // clicking somebody standing on the tile you meant to walk to gave you the
  // person and no way at all to say you meant the tile — and standing on the
  // thing you are working on is the ordinary state of affairs here.
  const errors = guardErrors(page);
  await ready(page);

  // Paused, so the target does not walk out from under the cursor between the
  // evaluate that finds them and the click that lands on them.
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  const at = await aimAtStranger(page);
  expect(at, 'this seed has nobody from another band').not.toBeNull();

  await page.mouse.click(at!.x, at!.y);

  const picker = page.locator('.picker');
  await expect(picker).toBeVisible({ timeout: 5_000 });

  // Both choices are there: the person, and the tile they are standing on.
  const labels: string[] = [];
  const items = picker.locator('.picker-item');
  for (let i = 0; i < await items.count(); i++) {
    labels.push((await items.nth(i).textContent()) ?? '');
  }
  expect(labels.some(text => /(man|woman|child)/i.test(text)),
    'the person was not offered: ' + JSON.stringify(labels)).toBe(true);
  expect(labels.some(text => /ground/i.test(text)),
    'the ground was not offered: ' + JSON.stringify(labels)).toBe(true);

  // And choosing the ground selects the tile rather than the person.
  const ground = labels.findIndex(text => /ground/i.test(text));
  await items.nth(ground).click();
  await expect(picker).toBeHidden();

  await page.locator('.hud-button', { hasText: 'Resume' }).click();
  expect(errors).toEqual([]);
});

test('clicking yourself alone does not put a chooser in the way', async ({ page }) => {
  // The one exception O7 asks for. Clicking your own character is the most
  // common click in the game, and a two-entry menu in front of every one of
  // them would be worse than the problem it solves.
  const errors = guardErrors(page);
  await ready(page);

  type Debug = {
    __dynasty: {
      sim: {
        player: { x: number; y: number; forgetPlans: () => void } | null;
        world: { isWalkable: (x: number, y: number) => boolean };
        livingPeople: () => { x: number; y: number }[];
        nodes: { x: number; y: number }[];
        trees: { x: number; y: number; standing: boolean }[];
        piles: { x: number; y: number }[];
        animals: { x: number; y: number; alive: boolean }[];
        buildingAt: (x: number, y: number) => unknown;
      };
      camera: {
        snapTo: (x: number, y: number) => void; following: boolean;
        worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
      };
    };
  };

  // Stood somewhere genuinely empty first. Anything else under the cursor is a
  // second candidate, and the chooser is then correct to open — which is what
  // the test above asserts.
  const moved = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player;
    if (!self) return false;
    const clear = (x: number, y: number) =>
      d.sim.world.isWalkable(x, y) &&
      !d.sim.buildingAt(x, y) &&
      d.sim.livingPeople().every(p => p === self || Math.hypot(p.x - x, p.y - y) > 3) &&
      d.sim.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 3) &&
      d.sim.trees.every(t => !t.standing || Math.hypot(t.x - x, t.y - y) > 3) &&
      d.sim.piles.every(pile => Math.hypot(pile.x - x, pile.y - y) > 3) &&
      d.sim.animals.every(a => !a.alive || Math.hypot(a.x - x, a.y - y) > 3);

    for (let radius = 3; radius <= 14; radius++) {
      for (let angle = 0; angle < 24; angle++) {
        const x = Math.round(self.x + Math.cos(angle) * radius);
        const y = Math.round(self.y + Math.sin(angle) * radius);
        if (!clear(x, y)) continue;
        // Standing orders would walk them straight off the clear tile again.
        self.forgetPlans();
        self.x = x;
        self.y = y;
        d.camera.snapTo(x, y);
        d.camera.following = false;
        return true;
      }
    }
    return false;
  });
  expect(moved, 'no empty ground near the player on this seed').toBe(true);

  // Two frames so the move reaches the spatial hashes the picker queries, and
  // so the camera settles: `clampTo` runs after `snapTo` and can pull the view
  // back inside the map, which leaves a screen coordinate read too early
  // pointing at open country.
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  const at = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player!;
    return { x: d.camera.worldToScreenX(self.x), y: d.camera.worldToScreenY(self.y) };
  });

  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.picker')).toBeHidden();
  await expect(page.locator('.hud-name')).not.toBeEmpty();

  await page.locator('.hud-button', { hasText: 'Resume' }).click();
  expect(errors).toEqual([]);
});

test('a walking person is drawn between steps, not only on them', async ({ page }) => {
  // O6. The simulation runs at five steps a second and the renderer at sixty,
  // so every position used to be painted for twelve identical frames and then
  // jump about ten pixels. The gate is here rather than in `simcheck` because
  // the headless harness does not render at all.
  const errors = guardErrors(page);
  await ready(page);

  type Debug = {
    __dynasty: {
      sim: {
        player: { id: number; x: number; y: number } | null;
        world: { isWalkable: (x: number, y: number) => boolean };
        order: (person: unknown, action: string, target: unknown) => boolean;
      };
      renderer: {
        interpolator: {
          at: (kind: string, e: { id: number; x: number; y: number }, alpha: number)
            => { x: number; y: number };
        };
      };
    };
  };

  // Send them somewhere far enough that they are certainly still walking.
  const walking = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player;
    if (!self) return false;
    for (let distance = 12; distance >= 4; distance--) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = Math.round(self.x + dx * distance);
        const y = Math.round(self.y + dy * distance);
        if (d.sim.world.isWalkable(x, y) && d.sim.order(self, 'goto', { x, y })) return true;
      }
    }
    return false;
  });
  expect(walking, 'nowhere to walk to on this seed').toBe(true);

  // Sampled over a second of real time, which at five steps a second is several
  // whole steps: at least one of them catches the player mid-stride.
  const spans = await page.evaluate(() => new Promise<number[]>(resolve => {
    const d = (window as never as Debug).__dynasty;
    const seen: number[] = [];
    let frames = 0;
    const sample = () => {
      const self = d.sim.player;
      if (self) {
        // The two ends of the move currently being drawn. On a build with no
        // interpolation these are the same point and every gap is zero.
        const from = d.renderer.interpolator.at('person', self, 0);
        const to = d.renderer.interpolator.at('person', self, 1);
        seen.push(Math.hypot(to.x - from.x, to.y - from.y));
      }
      if (++frames < 60) requestAnimationFrame(sample);
      else resolve(seen);
    };
    requestAnimationFrame(sample);
  }));

  // A step of walking is about 0.32 tiles, so a real span is well under a tile
  // and comfortably above nothing at all.
  const widest = Math.max(...spans);
  expect(widest, 'the player was drawn at one fixed point all second').toBeGreaterThan(0.01);
  expect(widest, 'that is further than anybody moves in one step').toBeLessThan(2);

  expect(errors).toEqual([]);
});

test('a record says nothing to somebody who cannot read it', async ({ page }) => {
  // The rule the whole of phase 4b turns on. A band can sit on a library
  // holding the answer to its own dark age, and the panel has to say so rather
  // than quietly naming the technology anyway — a UI that reads out a stone to
  // an illiterate character hands over the one thing writing is meant to cost.
  const errors = guardErrors(page);
  await ready(page);
  await page.locator('.hud-button', { hasText: 'Pause' }).click();

  type Debug = {
    __dynasty: {
      sim: {
        player: { x: number; y: number; knownTech: Set<string> } | null;
        placeInscription: (
          form: string, x: number, y: number, author: unknown
        ) => { begin: (t: string) => boolean; addWork: (n: number) => boolean } | null;
      };
      camera: {
        snapTo: (x: number, y: number) => void; following: boolean;
        worldToScreenX: (x: number) => number; worldToScreenY: (y: number) => number;
      };
    };
  };

  // A finished stone beside the player, cut by them, saying one thing.
  const at = await page.evaluate(() => {
    const d = (window as never as Debug).__dynasty;
    const self = d.sim.player;
    if (!self) return null;
    const x = Math.round(self.x) + 1;
    const y = Math.round(self.y);
    const stone = d.sim.placeInscription('stone', x, y, self);
    if (!stone) return null;
    stone.begin('cordage');
    stone.addWork(10_000);
    self.knownTech.delete('writing');
    d.camera.snapTo(x, y);
    d.camera.following = false;
    return { x, y };
  });
  expect(at, 'no room for a stone beside the player').not.toBeNull();

  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const point = await page.evaluate((p: { x: number; y: number }) => {
    const d = (window as never as Debug).__dynasty;
    return { x: d.camera.worldToScreenX(p.x), y: d.camera.worldToScreenY(p.y) };
  }, at!);

  // Illiterate: told there are marks, and not what they say.
  await clickAndChoose(page, point.x, point.y, /carved stone/i);
  const panel = page.locator('.hud-panel');
  await expect(panel).toContainText('Carved stone', { timeout: 5_000 });
  // Singular or plural depending on how much is on the stone; the point is
  // that it is counted rather than named.
  await expect(panel).toContainText(/mark(s)? you cannot read/);
  await expect(panel).not.toContainText('Cordage');

  // The same stone, to somebody who learned to read. Nothing about the record
  // changed; the reader did.
  await page.evaluate(() => {
    (window as never as Debug).__dynasty.sim.player!.knownTech.add('writing');
  });
  await expect(panel).toContainText('Cordage', { timeout: 5_000 });
  await expect(panel).not.toContainText(/mark(s)? you cannot read/);

  await page.locator('.hud-button', { hasText: 'Resume' }).click();
  expect(errors).toEqual([]);
});

test('the craft bar shows what you can make, and why you cannot', async ({ page }) => {
  // There was no craft menu at all before this pass. `RECIPES` was reachable
  // only by right-clicking bare ground, and a recipe the actor could not make
  // was left out of that menu rather than greyed, so proving hafting changed
  // nothing anywhere the player could see. The owner reported exactly that.
  const errors = guardErrors(page);
  await ready(page);

  const bar = page.locator('.hud-craftbar');

  // Nothing known yet: the bar opens and says so, rather than opening empty.
  await page.keyboard.press('m');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Not yet known');

  // Now they know how to haft a blade, and have neither the flint nor a stick.
  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: { knownTech: Set<string> } | null } };
    }).__dynasty;
    d.sim.player?.knownTech.add('hafting');
  });

  await expect(bar).toContainText('Hand axe');
  const axe = page.locator('.hud-craftbar .hud-design', { hasText: 'Hand axe' });
  // Greyed, and carrying the reason — the standing rule that a refusal says why.
  await expect(axe).toHaveClass(/is-disabled/);
  await expect(axe).toHaveAttribute('title', /you need/i);

  // The two bars are mutually exclusive: both sit on the bottom edge.
  await page.keyboard.press('b');
  await expect(bar).toBeHidden();
  await expect(page.locator('.hud-buildbar')).toBeVisible();

  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('a proven design stops asking for its prototype materials', async ({ page }) => {
  // The defect the owner reported in as many words: cordage worked out and
  // built, and the tech web still saying "Needs 3 thatch to build one"
  // underneath it. An idea survives being proven — it stays on the person to be
  // refined — so the pane has to ask what stage it is at, not merely whether an
  // idea exists.
  const errors = guardErrors(page);
  await ready(page);

  await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: { player: {
        knownTech: Set<string>; techLevel: Map<string, number>; ideas: unknown[];
      } | null } };
    }).__dynasty;
    const player = d.sim.player;
    if (!player) return;
    player.knownTech.add('cordage');
    player.techLevel.set('cordage', 0);
    player.ideas.push({
      tech: 'cordage', stage: 'proven', insight: 0,
      story: 'kept running out of hands',
      conceivedTick: 0, effort: 40, discussedWith: [],
      trials: 3, proof: 1, failedTests: 1,
    });
  });

  await page.keyboard.press('g');
  const web = page.locator('.techweb');
  await expect(web).toBeVisible();
  await page.locator('.techweb-node', { hasText: 'Cordage' }).first().hover();

  await expect(web).toContainText('Cordage');
  await expect(web).not.toContainText('to build one');

  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('Escape opens the menu only when nothing else is in the way', async ({ page }) => {
  // The trap this guards is specific. Every graph overlay closes itself on
  // Escape from a listener registered before main.ts's own, so by the time the
  // main handler runs the graph is already shut and it looks as though nothing
  // was open. Without the capture-phase snapshot, dismissing the tech web pops
  // the pause menu on top of it — every time.
  const errors = guardErrors(page);
  await ready(page);

  const menu = page.locator('.pausemenu');
  await expect(menu).toBeHidden();

  await page.keyboard.press('g');
  await expect(page.locator('.techweb')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.techweb')).toBeHidden();
  await expect(menu).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  // The seed is on this screen and nowhere else in the game, which is what
  // makes a bug report reproducible.
  await expect(menu).toContainText('e2e-fixture');

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // The `[hidden]` rule, not just the attribute: an author `display` beats the
  // browser's own rule and leaves the overlay swallowing every click beneath it.
  await expect(menu).toHaveCSS('display', 'none');

  expect(errors).toEqual([]);
});

test('the difficulty slider stamps every field, and a hand edit reads as custom', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  await page.keyboard.press('Escape');
  await page.locator('.pausemenu button', { hasText: 'Settings' }).click();
  const settings = page.locator('.settings');
  await expect(settings).toBeVisible();
  await expect(settings.locator('.settings-preset-note')).toContainText('Normal');

  // Extreme, by index. The slider snaps to the five anchors rather than
  // interpolating, so this is a value and not a drag distance.
  const difficulty = settings.locator('.settings-difficulty-range');
  await difficulty.fill('4');
  await difficulty.dispatchEvent('input');
  await expect(settings.locator('.settings-preset-note')).toContainText('Extreme');

  const hunger = settings.locator('.settings-row', { hasText: 'Hunger' }).first();
  await expect(hunger.locator('.settings-number')).toHaveValue('0.094');

  // A live field reaches the running world at once, with no apply step.
  const applied = await page.evaluate(() => (window as never as {
    __dynasty: { sim: { config: { needs: { hungerRate: number } } } };
  }).__dynasty.sim.config.needs.hungerRate);
  expect(applied).toBeCloseTo(0.094, 5);

  // And one field moved by hand makes the preset custom without disturbing the
  // rest of the anchor.
  await hunger.locator('.settings-number').fill('0.2');
  await hunger.locator('.settings-number').dispatchEvent('change');
  await expect(settings.locator('.settings-preset-note')).toContainText('Custom');
  await expect(settings.locator('.settings-row', { hasText: 'Thirst' }).first()
    .locator('.settings-number')).toHaveValue('0.128');

  // Escape steps back to the menu it was opened from, not all the way out.
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.locator('.pausemenu')).toBeVisible();

  expect(errors).toEqual([]);
});

test('a worldgen setting says it needs a new world instead of pretending', async ({ page }) => {
  // The standing rule, applied to a settings screen: a field the world in front
  // of you cannot honour must say so rather than accepting the number silently.
  const errors = guardErrors(page);
  await ready(page);

  await page.keyboard.press('Escape');
  await page.locator('.pausemenu button', { hasText: 'Settings' }).click();
  const settings = page.locator('.settings');
  const note = settings.locator('.settings-restart-note');
  await expect(note).toBeHidden();

  const bushes = settings.locator('.settings-row', { hasText: 'Berry bushes' }).first();
  await expect(bushes.locator('.settings-tag')).toHaveText('new world');
  await bushes.locator('.settings-number').fill('500');
  await bushes.locator('.settings-number').dispatchEvent('change');

  await expect(note).toBeVisible();
  await expect(note).toContainText('berry bushes');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('the game opens on its settings, and Begin rebuilds the island they describe', async ({ page }) => {
  // The order matters and is the whole point: the settings decide how much food
  // is on the island and how many tribes are on it, so being asked to pick a
  // life out of a world that is about to be replaced is the wrong way round.
  const errors = guardErrors(page);
  // No `skipIntro`: this is the one spec that watches the game actually open.
  await page.goto('/?seed=e2e-start');

  const settings = page.locator('.settings');
  const newGame = page.locator('.newgame');
  await expect(settings).toBeVisible({ timeout: 15_000 });
  await expect(settings).toContainText('Before you begin');
  await expect(newGame).toBeHidden();
  // Nothing to go back to, and no world to replace, so neither button is here.
  await expect(settings.locator('.settings-back')).toBeHidden();
  await expect(settings.locator('button', { hasText: 'New world with these' })).toBeHidden();

  // Escape must not skip it, for the same reason character creation ignores it.
  await page.keyboard.press('Escape');
  await expect(settings).toBeVisible();
  await expect(page.locator('.pausemenu')).toBeHidden();

  const before = await page.evaluate(() => (window as never as {
    __dynasty: { sim: { config: { world: { berryBushes: number } } } };
  }).__dynasty.sim.config.world.berryBushes);
  expect(before).toBe(280);

  const difficulty = settings.locator('.settings-difficulty-range');
  await difficulty.fill('4');
  await difficulty.dispatchEvent('input');
  await settings.locator('button', { hasText: 'Begin' }).click();

  // Character creation, over the island the settings asked for — and it is a
  // genuinely different island, not the boot one with a label changed.
  await expect(settings).toBeHidden();
  await expect(newGame).toBeVisible();
  const after = await page.evaluate(() => {
    const d = (window as never as {
      __dynasty: { sim: {
        config: { world: { berryBushes: number } };
        nodes: { kind: string }[];
      } };
    }).__dynasty;
    return {
      configured: d.sim.config.world.berryBushes,
      placed: d.sim.nodes.filter(n => n.kind === 'berries').length,
    };
  });
  expect(after.configured).toBe(155);
  expect(after.placed).toBeLessThan(200);

  expect(errors).toEqual([]);
});

/**
 * M9 phase 6: the control that decides how much the character does for itself.
 *
 * The simulation half of this is covered by `src/sim/__tests__/autonomy.test.ts`
 * — no scenario run can reach it, since the headless harness never possesses
 * anybody. What is left for the browser is the half that only exists here: that
 * the three states are on screen, that the key and the buttons agree with each
 * other and with the simulation, and that the preference survives a reload.
 */
test('how much your character does for itself is a visible, remembered choice', async ({ page }) => {
  const errors = guardErrors(page);
  await ready(page);

  type Debug = { __dynasty: { sim: {
    autonomy: string;
    autonomyStall: string | null;
    player: { id: number; needs: Record<string, number>; action: string };
  } } };
  const modeOf = () => page.evaluate(
    () => (window as never as Debug).__dynasty.sim.autonomy);

  const bar = page.locator('.hud-seg');
  await expect(bar.locator('.hud-seg-button')).toHaveCount(3);
  // The state the game has always had is the one it still opens on.
  await expect(bar.locator('.hud-seg-button.is-active')).toHaveText('You steer');
  expect(await modeOf()).toBe('manual');

  // The button and the key are two ways at one setting, not two settings.
  await bar.locator('.hud-seg-button', { hasText: 'Acts alone' }).click();
  await expect(bar.locator('.hud-seg-button.is-active')).toHaveText('Acts alone');
  expect(await modeOf()).toBe('auto');

  await page.keyboard.press('r');
  await expect(bar.locator('.hud-seg-button.is-active')).toHaveText('You steer');
  expect(await modeOf()).toBe('manual');
  await page.keyboard.press('r');
  await expect(bar.locator('.hud-seg-button.is-active')).toHaveText('Stays alive');
  expect(await modeOf()).toBe('urgent');

  // The promise the middle state makes, and the report that prompted the whole
  // phase: a character left alone does not stand still until it dies of thirst.
  await page.evaluate(() => {
    (window as never as Debug).__dynasty.sim.player.needs.thirst = 84;
  });
  await expect.poll(async () => page.evaluate(
    () => (window as never as Debug).__dynasty.sim.player.action)).toBe('drink');
  // And the panel says so, rather than leaving the player to infer it.
  await expect(page.locator('.hud-doing .hud-alone')).toHaveText('stays alive');

  // A preference, not a per-session mood.
  await page.reload();
  await expect(page.locator('.hud-clock')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.locator('.hud-seg .hud-seg-button.is-active')).toHaveText('Stays alive');

  expect(errors).toEqual([]);
});
