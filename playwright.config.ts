import { defineConfig } from '@playwright/test';

/**
 * Browser-level checks. The headless harness (`npm run sim:check`) covers the
 * simulation; this layer only answers questions the simulation cannot: does the
 * page boot, does the canvas paint, does input reach the world.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  outputDir: 'artifacts/playwright',
});
