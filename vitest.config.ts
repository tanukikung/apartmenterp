import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    globals: true,
    isolate: true,
    passWithNoTests: false,
    setupFiles: ['tests/setup-env.ts', 'tests/setup.ts', 'tests/setup-mocks.ts', 'tests/setup-db.ts'],
    // Run test files serially within a single fork. Multiple parallel workers against
    // the same Postgres test DB cause TRUNCATE CASCADE deadlocks in setup-db beforeEach.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
    hookTimeout: 15000,
    teardownTimeout: 15000,
    testTimeout: 30000,
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
