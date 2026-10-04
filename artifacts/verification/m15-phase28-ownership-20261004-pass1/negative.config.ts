import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
  include: ['src/sim/__tests__/authority-transfer.test.ts'],
  setupFiles: ['artifacts/verification/m15-phase28-ownership-20261004-pass1/omit-authority.setup.ts'],
  maxWorkers: 1,
  pool: 'threads',
  testTimeout: 15000,
} });
