import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(process.env.DYNASTY_PORT ?? 5173);
const origin = `http://localhost:${port}`;

async function responds(): Promise<boolean> {
  try {
    const response = await fetch(origin);
    return response.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (await responds()) {
    throw new Error(`Refusing to reuse an unowned Vite server at ${origin}`);
  }

  const vite = resolve('node_modules/vite/bin/vite.js');
  const child: ChildProcess = spawn(process.execPath, [vite, '--host', 'localhost', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  let spawnError: Error | undefined;
  child.once('exit', (code, signal) => { exit = { code, signal }; });
  child.once('error', error => { spawnError = error; });
  const exited = new Promise<void>(resolveExit => child.once('exit', () => resolveExit()));

  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (exit) throw new Error(`Vite exited before becoming ready (code ${exit.code}, signal ${exit.signal})`);
      if (await responds()) {
        // Return the teardown closure so it retains this exact child handle.
        // A detached npm wrapper loses that ownership on Windows and leaves Vite
        // alive after Playwright has reported every spec as finished.
        return async () => {
          if (child.exitCode === null && child.signalCode === null) child.kill();
          await Promise.race([exited, delay(10_000)]);
          const stopDeadline = Date.now() + 10_000;
          while (Date.now() < stopDeadline && await responds()) await delay(100);
          if (await responds()) throw new Error(`Vite is still listening at ${origin} after teardown`);
        };
      }
      await delay(250);
    }
    throw new Error(`Vite did not become ready at ${origin} within 60 seconds`);
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    throw error;
  }
}
