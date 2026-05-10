import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts',
      'tests/stabilization/**/*.test.ts',
    ],
    globals: true,
    isolate: true,
    setupFiles: ['tests/setup-env.ts', 'tests/setup.ts', 'tests/setup-mocks.ts', 'tests/setup-db.ts'],
    hookTimeout: 60000,
    teardownTimeout: 15000,
    testTimeout: 60000,
    // forks mode keeps each test file in its own process — prevents DB state
    // leaking between files that don't clean up their transactions.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
