import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

async function run() {
  const url = process.env.E2E_BASE_URL || 'http://localhost:3001';
  const healthUrl = `${url}/api/health`;
  const maxAttempts = 10;
  const delay = 3000;

  // ── Step 1: Reset database directly via Prisma (bypasses API auth) ──────
  const cleanupScript = resolve(__dirname, '../../scripts/e2e-cleanup.ts');
  if (existsSync(cleanupScript)) {
    console.log('[globalSetup] Running database cleanup...');
    try {
      // Both guards are required: NODE_ENV=test (enforced at startup) and
      // ALLOW_DB_RESET=true (explicit operator consent for data deletion).
      execSync(`npx tsx "${cleanupScript}"`, {
        cwd: resolve(__dirname, '../..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ALLOW_DB_RESET: 'true',
          DATABASE_URL: process.env.DATABASE_URL,
        },
        stdio: 'pipe',
      });
      console.log('[globalSetup] Database cleanup complete.');
    } catch (err) {
      console.warn('[globalSetup] Cleanup failed (continuing anyway):', err);
    }
  }

  // ── Step 1b: Inject minimal baseline data (rooms, admin users) ───────────
  // This replaces the dependency on prisma/seed.ts for E2E testing.
  // Tests can now run on a clean DB without requiring the full seed.
  const bootstrapScript = resolve(__dirname, './bootstrap.ts');
  if (existsSync(bootstrapScript)) {
    console.log('[globalSetup] Running test bootstrap (minimal baseline data)...');
    try {
      execSync(`npx tsx "${bootstrapScript}"`, {
        cwd: resolve(__dirname, '../..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: process.env.DATABASE_URL,
        },
        stdio: 'pipe',
      });
      console.log('[globalSetup] Bootstrap complete.');
    } catch (err) {
      console.warn('[globalSetup] Bootstrap failed (continuing anyway):', err);
    }
  }

  // ── Step 2: Wait for server to be reachable ───────────────────────────────
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        console.log(`[globalSetup] Server reachable at ${url} — running tests`);
        return;
      }
      console.warn(`[globalSetup] ${healthUrl} returned ${res.status} (attempt ${attempt}/${maxAttempts})`);
    } catch (err) {
      console.warn(`[globalSetup] Cannot reach ${healthUrl} (attempt ${attempt}/${maxAttempts}): ${err}`);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delay * attempt));
    }
  }
  throw new Error(
    `[globalSetup] Server not reachable at ${url} after ${maxAttempts} attempts.\n` +
    `Start the dev server: NODE_ENV=test E2E_MODE=true npm run dev\n` +
    `Or set E2E_BASE_URL to the correct URL.`
  );
}

export default run;