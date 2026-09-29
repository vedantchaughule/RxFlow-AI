import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/workflows/**/*.workflow.test.ts'],
    setupFiles: ['./tests/setup.ts', './tests/workflows/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
    teardownTimeout: 30_000,
    exclude: ['dist/**', 'node_modules/**'],
  },
});
