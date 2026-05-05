import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  fullyParallel: false,
  retries: 1,
  workers: 2,
  globalSetup: './global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 60000,
    navigationTimeout: 60000,
  },
  webServer: process.env.E2E_WEB_SERVER !== 'false' ? {
    command: 'npm run dev',
    port: 3001,
    env: {
      // NODE_ENV=test is required for E2E_MODE to be accepted (see startup-check.ts).
      // E2E_MODE=true enables test-specific behaviors (bypassed rate limits, etc.)
      // that are safe ONLY because the test database is fully isolated.
      NODE_ENV: 'test',
      E2E_MODE: 'true',
    },
    reuseExistingServer: true,
    timeout: 60000,
    stdout: 'ignore',
    stderr: 'ignore',
  } : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});