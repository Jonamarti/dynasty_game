import { defineConfig } from 'vite';

// A relative base, so the build works wherever it is served from: the GitHub
// Pages subpath (/dynasty_game/), a custom domain later, or `npm run preview`
// at the root. The game has no client-side router and fetches nothing at
// runtime, so there is no absolute URL that needs to know where it lives.
// Vite normalises a relative base to `/` for the dev server, so `npm run dev`
// is unaffected.
export default defineConfig({
  base: './',
});
