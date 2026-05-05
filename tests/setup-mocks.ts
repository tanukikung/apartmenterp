import { vi } from 'vitest';
import { mockPrismaClient } from './mocks/prisma';
import './helpers/line-mock';

// Create mock immediately (before vi.mock hoisting)
if (!(globalThis as any).__PRISMA_MOCK__) {
  (globalThis as any).__PRISMA_MOCK__ = mockPrismaClient();
}

// Ensure $queryRaw is available at the top level for health checks and other raw queries
const baseMock = (globalThis as any).__PRISMA_MOCK__;
if (!baseMock.$queryRaw) {
  baseMock.$queryRaw = vi.fn().mockResolvedValue([]);
}

// Build a forwarding proxy — forward ALL property accesses to realPrisma
// when USE_PRISMA_TEST_DB is 'true' at access time.
// This is dynamic: even if async init started with true, a test that sets
// USE_PRISMA_TEST_DB='false' before importing prisma will get mock behavior.
function createForwardingProxy(): typeof baseMock {
  return new Proxy(baseMock, {
    get(target, prop) {
      // Re-check the env var at access time — not at proxy creation time.
      // This handles the case where a test file sets USE_PRISMA_TEST_DB='false'
      // AFTER setup-mocks.ts async init started but before prisma is imported.
      if (process.env.USE_PRISMA_TEST_DB !== 'true') {
        return Reflect.get(target, prop);
      }
      const rp = (globalThis as any).__REAL_PRISMA__;
      if (rp) {
        const val = Reflect.get(rp, prop);
        if (typeof val === 'function') return val.bind(rp);
        return val;
      }
      return Reflect.get(target, prop);
    },
  });
}

// vi.mock factory — MUST NOT capture `prisma` by value; access __PRISMA_MOCK__ at call time
vi.mock('@/lib/db/client', () => {
  // Use a getter so we always get the CURRENT __PRISMA_MOCK__, not a captured value.
  // This is critical when USE_PRISMA_TEST_DB=true and the async IIFE replaces
  // __PRISMA_MOCK__ with a forwarding proxy to real Prisma.
  let _prisma: any;
  Object.defineProperty(exports, 'prisma', {
    get: () => (globalThis as any).__PRISMA_MOCK__,
    configurable: true,
  });
  const connectPrisma = async () => {};
  const disconnectPrisma = async () => {};
  const withTransaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    return (globalThis as any).__PRISMA_MOCK__.$transaction(fn);
  };
  const rawQuery = vi.fn(async () => null);
  return { get prisma() { return (globalThis as any).__PRISMA_MOCK__; }, connectPrisma, disconnectPrisma, withTransaction, rawQuery };
});

// Async initialization for USE_PRISMA_TEST_DB — creates real Prisma and updates
// __REAL_PRISMA__. The forwarding proxy (created above and at the end of this block)
// will forward to it ONLY when USE_PRISMA_TEST_DB is still 'true' at access time.
// If a test file sets USE_PRISMA_TEST_DB='false' before importing '@/lib/db/client',
// the proxy's get trap will return the base mock instead of realPrisma.
if (process.env.USE_PRISMA_TEST_DB === 'true') {
  const g = globalThis as any;
  if (!g.__REAL_TXSWAP__) {
    (async () => {
      try {
        const { PrismaClient } = await import('@prisma/client');
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) throw new Error('[setup-mocks] DATABASE_URL is not set — check .env.test');
        const realPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
        (globalThis as any).__REAL_PRISMA__ = realPrisma;
        // Install the forwarding proxy — test files that set USE_PRISMA_TEST_DB='false'
        // before importing prisma will get mock behavior via the proxy's get trap.
        (globalThis as any).__PRISMA_MOCK__ = createForwardingProxy();
        g.__REAL_TXSWAP__ = true;
        // eslint-disable-next-line no-console
        console.log('[setup-mocks] USE_PRISMA_TEST_DB=true — forwarding proxy active');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[setup-mocks] real Prisma swap failed:', e);
      }
    })();
  }
} else {
  // eslint-disable-next-line no-console
  console.log('[setup-mocks] USE_PRISMA_TEST_DB=false — using mock prisma');
}

vi.mock('@/lib/line/client', () => {
  return {
    getLineClient: vi.fn(() => ({} as any)),
    getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
    sendLineMessage: vi.fn(async () => ({ status: 200 })),
    sendFlexMessage: vi.fn(async () => ({ status: 200 })),
    sendInvoiceMessage: vi.fn(async () => ({ status: 200 })),
    sendReminderMessage: vi.fn(async () => ({ status: 200 })),
    sendOverdueNotice: vi.fn(async () => ({ status: 200 })),
    sendWelcomeMessage: vi.fn(async () => ({ status: 200 })),
    sendTemplateMessage: vi.fn(async () => ({ status: 200 })),
    sendReplyMessage: vi.fn(async () => ({ status: 200 })),
    sendLineImageMessage: vi.fn(async () => ({ status: 200 })),
    sendLineFileMessage: vi.fn(async () => ({ status: 200 })),
    sendTextWithQuickReply: vi.fn(async () => ({ status: 200 })),
    getLineUserProfile: vi.fn(async () => null),
    verifyLineSignature: vi.fn(() => true),
    parseWebhookEvent: vi.fn((raw: any) => raw),
    isLineConfigured: vi.fn(() => false),
  };
});