import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    isolate: true,
    passWithNoTests: false,
    setupFiles: ['tests/setup-env.ts', 'tests/setup.ts', 'tests/setup-mocks.ts', 'tests/setup-db.ts'],
    hookTimeout: 5000,
    teardownTimeout: 5000,
    coverage: {
      provider: 'v8',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
