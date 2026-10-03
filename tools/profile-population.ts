/** Profile actual founders, AI, production rendering and HUD in Chromium.
 * Timings are observations, never CI pass/fail thresholds. No synthetic poses.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(root, 'artifacts/verification', `m15-population-${stamp}`);
const shots = join(root, 'artifacts/screenshots', `m15-population-${stamp}`);
mkdirSync(out, { recursive: true }); mkdirSync(shots, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const reports: unknown[] = [];
try {
  // Fresh browser for each population: the 300-person heap must not include a
  // discarded 30-person island or its browser caches. Same viewport and seed.
  for (const wanted of [30, 300]) {
    const browser = await chromium.launch();
    try {
      const browserCDP = await browser.newBrowserCDPSession();
      const resident = async () => {
        const { processInfo } = await browserCDP.send('SystemInfo.getProcessInfo');
        if (process.platform !== 'win32') return null;
        const ids = processInfo.map(p => p.id);
        // Read-only process accounting. Summed working sets include shared
        // pages more than once; this is neither unique RAM nor GPU VRAM.
        return Number(execFileSync('powershell', ['-NoProfile', '-Command',
          `(Get-Process -Id ${ids.join(',')} | Measure-Object -Property WorkingSet64 -Sum).Sum`], { encoding: 'utf8' }).trim());
      };
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const blankWorkingSetBytes = await resident();
      await page.goto(`${server.resolvedUrls!.local[0]}?seed=profile-4&defaults=1&skipIntro=1&profileHumans=${wanted}`);
      await page.waitForFunction(() => !!(window as any).__dynasty?.renderer?.art);
      const initial = await page.evaluate(() => {
        const d = (window as any).__dynasty;
        d.camera.following = false;
        // Deliberately crowded detailed view. All founders are natural family
        // spawns near one camp; no teleport, invented tasks or frozen AI.
        d.renderer.fogEnabled = false;
        return { humans: d.sim.livingPeople().length, animals: d.sim.animals.filter((a: any) => a.alive).length,
          tick: d.sim.time.tick, tickRate: d.sim.config.time.tickRate };
      });
      if (initial.humans !== wanted) throw new Error(`Founding families made ${initial.humans}, expected ${wanted}; pin another seed`);
      await page.waitForTimeout(10_000);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('HeapProfiler.collectGarbage');
      const heapStart = await cdp.send('Performance.getMetrics');
      await page.evaluate(() => {
        const d = (window as any).__dynasty;
        const samples = { frames: [] as number[], renders: [] as number[], steps: [] as number[], visible: [] as number[], last: 0 };
        (window as any).__profile = samples;
        let visible = 0;
        const atlas = d.renderer.art;
        const draw = atlas.drawPerson.bind(atlas);
        atlas.drawPerson = (...args: any[]) => { visible++; return draw(...args); };
        const step = d.sim.step.bind(d.sim);
        d.sim.step = (...args: any[]) => { const t = performance.now(); const result = step(...args); samples.steps.push(performance.now() - t); return result; };
        const render = d.renderer.render.bind(d.renderer);
        d.renderer.render = (...args: any[]) => {
          const t = performance.now();
          if (samples.last) samples.frames.push(t - samples.last);
          samples.last = t; visible = 0;
          const result = render(...args);
          samples.renders.push(performance.now() - t); samples.visible.push(visible);
          return result;
        };
      });
      const sampleStart = performance.now();
      await page.waitForTimeout(20_000);
      const elapsedMs = performance.now() - sampleStart;
      const measured = await page.evaluate(() => {
        const d = (window as any).__dynasty, s = (window as any).__profile;
        const summary = (values: number[]) => {
          const sorted = [...values].sort((a, b) => a - b);
          return { count: values.length, mean: values.reduce((sum, n) => sum + n, 0) / values.length,
            median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) };
        };
        return { humansAtEnd: d.sim.livingPeople().length, tickAtEnd: d.sim.time.tick,
          frameIntervalMs: summary(s.frames), renderSubmissionMs: summary(s.renders), simulationStepMs: summary(s.steps),
          detailedHumanDrawsPerFrame: summary(s.visible), framesOver33ms: s.frames.filter((v: number) => v > 33.34).length,
          cache: d.renderer.art.cacheStats };
      });
      await page.screenshot({ path: join(shots, `${wanted}-humans.png`) });
      await cdp.send('HeapProfiler.collectGarbage');
      const heapEnd = await cdp.send('Performance.getMetrics');
      const heap = (metrics: typeof heapEnd) => Object.fromEntries(metrics.metrics.filter(m => m.name.startsWith('JSHeap')).map(m => [m.name, m.value]));
      const report = { requestedHumans: wanted, initial, elapsedMs, ...measured,
        observedFramesPerSecond: measured.frameIntervalMs.count / (measured.frameIntervalMs.mean * measured.frameIntervalMs.count / 1000),
        browser: browser.version(), viewport: [1280, 800], zoom: 2, fog: false, seed: 'profile-4',
        blankWorkingSetBytes, gameWorkingSetBytes: await resident(), heapStart: heap(heapStart), heapEnd: heap(heapEnd), errors,
        note: 'Headless Chromium on this host, 10s warmup + 20s actual game loop. FPS is frame cadence, not GPU presentation. Render excludes HUD CPU (cadence includes HUD). Raw cache pixels, JS heap after GC, and summed Chromium process working sets are separate overlapping quantities; do not add them. One crowded band, default 5 simulation ticks/s; not a longevity/balance test.' };
      reports.push(report);
      writeFileSync(join(out, `${wanted}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
    } finally { await browser.close(); }
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify(reports, null, 2));
  console.log(`Reports: ${out}\nScreenshots: ${shots}`);
} finally { await server.close(); }
