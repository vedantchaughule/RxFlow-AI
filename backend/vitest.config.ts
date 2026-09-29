import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    exclude: ['dist/**', 'node_modules/**', 'tests/**/*.integration.test.ts', 'tests/workflows/**'],
  },
});
