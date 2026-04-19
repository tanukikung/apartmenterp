import { afterAll } from 'vitest';
import { getRedisClient } from '@/infrastructure/redis';
import fs from 'fs';
import path from 'path';
// Cleanup helper removed to avoid unresolved import; no registered cleanups in current tests

// Ensure .env.test variables are available if not already loaded
try {
  if (!process.env.DATABASE_URL) {
    const candidates = [
      path.join(process.cwd(), '.env.test'),
      path.join(process.cwd(), '..', '.env.test'),
      path.join(process.cwd(), '..', '..', '.env.test'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      const content = fs.readFileSync(found, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          let value = trimmed.slice(eq + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (!(key in process.env)) {
            process.env[key] = value;
          }
        }
      }
    }
  }
} catch {
  // ignore
}

afterAll(async () => {
  if (process.env.DEBUG_TEST_HANDLES === '1') {
    try {
      const handles = (process as any)._getActiveHandles?.() || [];
      const reqs = (process as any)._getActiveRequests?.() || [];
      // eslint-disable-next-line no-console
      console.log('DEBUG_ACTIVE_HANDLES_START');
      for (const h of handles) {
        const name = h?.constructor?.name || typeof h;
        // eslint-disable-next-line no-console
        console.log('HANDLE', name);
      }
      for (const r of reqs) {
        const name = r?.constructor?.name || typeof r;
        // eslint-disable-next-line no-console
        console.log('REQUEST', name);
      }
      // eslint-disable-next-line no-console
      console.log('DEBUG_ACTIVE_HANDLES_END');
    } catch {
      // ignore
    }
  }

  // No registered test cleanups to run
  const client = getRedisClient();
  if (client && client.isOpen) {
    await client.quit().catch(() => undefined);
  }
  // Guard against hanging afterAll — some test files import modules that
  // pin handles (e.g. timers from instrumentation.ts). Cap cleanup at 2s.
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | void> =>
    Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
  try {
    const { prisma } = await import('@/lib/db/client');
    await withTimeout(prisma.$disconnect(), 2000);
  } catch {
    // ignore
  }
});
