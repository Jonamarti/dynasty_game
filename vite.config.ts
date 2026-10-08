import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// A relative base, so the build works wherever it is served from: the GitHub
// Pages subpath (/dynasty_game/), a custom domain later, or `npm run preview`
// at the root. The game has no client-side router and fetches nothing at
// runtime, so there is no absolute URL that needs to know where it lives.
// Vite normalises a relative base to `/` for the dev server, so `npm run dev`
// is unaffected.
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function shortCommit(): string {
  const deployedSha = process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? '';
  if (/^[0-9a-f]{7,40}$/i.test(deployedSha)) return deployedSha.slice(0, 6).toLowerCase();
  try {
    return execFileSync('git', ['rev-parse', '--short=6', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    // Source archives may have neither Git metadata nor a CI-provided revision.
    return 'unknown';
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_COMMIT__: JSON.stringify(shortCommit()),
  },
});
