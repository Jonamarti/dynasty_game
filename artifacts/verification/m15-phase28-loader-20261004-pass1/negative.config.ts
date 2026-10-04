import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
  include: ['src/sim/__tests__/live-checkpoint-continuation.test.ts'],
  setupFiles: ['artifacts/verification/m15-phase28-loader-20261004-pass1/omit-cache.setup.ts'],
  maxWorkers: 1,
  pool: 'threads',
  testTimeout: 15000,
} });
