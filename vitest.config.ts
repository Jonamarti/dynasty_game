import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // e2e/ holds Playwright specs, which have their own runner. Without this
    // exclusion vitest tries to execute them and reports a phantom failure.
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
  },
});
