import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    isolate: true,
    setupFiles: ['tests/setup-env.ts', 'tests/setup-mocks.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'src/lib/**'],
      exclude: ['src/**/*.d.ts', 'src/app/**'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
