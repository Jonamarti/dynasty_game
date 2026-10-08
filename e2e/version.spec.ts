import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const commit = execFileSync('git', ['rev-parse', '--short=6', 'HEAD'], { encoding: 'utf8' }).trim();
const shots = process.env.DYNASTY_CAPTURE_DIR ?? 'artifacts/screenshots/m15-version-menu-2026-10-08T-03';

test('the main menu shows the package version and checked-out commit', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=version-menu&lang=es');

  const label = page.locator('.worldpicker-version');
  await expect(label).toBeVisible({ timeout: 30_000 });
  await expect(label).toHaveText(`v${version} (${commit})`);
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeGreaterThan(1200);
  expect(box!.y + box!.height).toBeGreaterThan(750);
  await page.screenshot({ path: shots + '/01-version-in-main-menu-es.png' });
});
