import { defineConfig } from '@playwright/test';

/**
 * Browser-level checks. The headless harness (`npm run sim:check`) covers the
 * simulation; this layer only answers questions the simulation cannot: does the
 * page boot, does the canvas paint, does input reach the world.
 */
/**
 * Vite's default port, overridable.
 *
 * Windows reserves blocks of TCP ports for Hyper-V and friends, and on at least
 * one machine here the reserved range 5111-5210 swallows 5173 outright: the dev
 * server dies with EACCES before a single test runs. `netsh interface ipv4 show
 * excludedportrange protocol=tcp` lists the ranges. Set DYNASTY_PORT to
 * anything outside them.
 */
const PORT = Number(process.env.DYNASTY_PORT ?? 5173);
const ORIGIN = 'http://localhost:' + PORT;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: ORIGIN,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port ' + PORT + ' --strictPort',
    url: ORIGIN,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  outputDir: 'artifacts/playwright',
});
