/* eslint-disable @typescript-eslint/no-explicit-any */
// NOTE: Direct prisma access bypasses pool guard. All database operations MUST go through
// withTransaction(), withReadTransaction(), or rawQuery() to benefit from:
//   - MAX_CONCURRENT_QUERIES limit (fail-fast on pool exhaustion)
//   - Pool exhaustion error detection (P2037, P2024 → DB_POOL_EXHAUSTED)
//   - DB_QUERY_TOTAL and DB_POOL_EXHAUSTED metrics

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { incrementCounter, observeHistogram } from '@/lib/metrics/registry';

/**
 * Pool exhaustion error code — thrown when the concurrent query guard
 * detects that the pending request counter has exceeded MAX_CONCURRENT_QUERIES.
 */
export const DB_POOL_EXHAUSTED = 'DB_POOL_EXHAUSTED';

// ── Pool Guard ─────────────────────────────────────────────────────────────────

/**
 * Maximum concurrent `$transaction()` calls allowed before the guard
 * starts rejecting requests with `DB_POOL_EXHAUSTED`.
 *
 * Configure via `MAX_CONCURRENT_DB_QUERIES` env (default: 80).
 * The fail-fast threshold should be set below Prisma's pool limit to
 * give the guard time to reject before the underlying pool truly exhausts.
 */
const MAX_CONCURRENT_QUERIES = parseInt(
  process.env.MAX_CONCURRENT_DB_QUERIES ?? '80',
  10,
);

/**
 * Module-level counter tracking in-flight `$transaction()` calls.
 * Incremented before query execution, decremented after (success or failure).
 */
let pendingConnectionRequests = 0;

/**
 * Throws DB_POOL_EXHAUSTED if the guard detects pool saturation.
 * Used as a fail-fast mechanism — it does NOT queue or wait.
 */
function checkPoolGuard(): void {
  if (pendingConnectionRequests >= MAX_CONCURRENT_QUERIES) {
    incrementCounter('db_pool_exhausted_total');
    const err = new Error('Connection pool exhausted');
    (err as any).code = DB_POOL_EXHAUSTED;
    throw err;
  }
}

/**
 * Wraps an async operation with pool guard entry/exit instrumentation.
 * Ensures the counter is always decremented, even on thrown errors.
 */
async function withPoolGuard<T>(fn: () => Promise<T>): Promise<T> {
  checkPoolGuard();
  pendingConnectionRequests++;
  try {
    return await fn();
  } finally {
    pendingConnectionRequests--;
  }
}

// ── Unguarded query detection ───────────────────────────────────────────────────

/**
 * Set of stack traces for detected unguarded queries.
 * Used for runtime auditing of code that bypasses the pool guard.
 */
const detectedUnguardedQueries = new Set<string>();

/**
 * Wraps a Prisma client in a Proxy that emits a warning log and increments
 * the `db_unguarded_query_total` metric whenever any model method is called
 * directly (i.e. outside of withTransaction / withReadTransaction / rawQuery).
 *
 * This is a detection mechanism, NOT a prevention — it does not block queries.
 * The wrapped client is used internally so that existing code paths continue
 * to work while administrators can observe which call sites bypass the guard.
 */
function createProxiedPrisma(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        // Guard against "await prisma" — the prisma client itself is thenable
        return Reflect.get(target, prop, receiver);
      }

      const value = Reflect.get(target, prop, receiver);

      if (typeof value !== 'function') {
        return value;
      }

      // Wrap every method call with an unguarded-query warning
      return function (...args: unknown[]) {
        // Capture stack trace for auditing — only store first 3 to avoid memory bloat
        const stack = new Error().stack ?? '';
        const shortStack = stack.split('\n').slice(0, 4).join('\n');

        if (!detectedUnguardedQueries.has(shortStack)) {
          detectedUnguardedQueries.add(shortStack);
          logger.warn({
            type: 'unguarded_db_query',
            // Log a short excerpt of the call site
            stack: shortStack,
          });
          incrementCounter('db_unguarded_query_total');
        }

        return Reflect.apply(value, target, args);
      };
    },
  }) as unknown as PrismaClient;
}

// ── Soft-delete middleware ─────────────────────────────────────────────────────

/**
 * Soft-delete middleware
 *
 * Automatically adds `deletedAt: null` to all findFirst/findMany/findUnique queries
 * on Tenant, Contract, Invoice, Payment, and RoomBilling models. This ensures
 * deleted records are always excluded without requiring callers to remember the filter.
 *
 * Hard deletes on these models are blocked by the model-level @ignore annotation
 * in schema.prisma. Use soft-delete (set deletedAt) and restore instead.
 *
 * Phase 8.4: Extended to Invoice, Payment, RoomBilling
 */
function softDeleteMiddleware(prisma: PrismaClient): void {
  const modelsWithSoftDelete = ['Tenant', 'Contract', 'Invoice', 'Payment', 'RoomBilling'];

  prisma.$use(async (params, next) => {
    // Only intercept findFirst/findMany on soft-delete models
    if (
      params.action === 'findFirst' ||
      params.action === 'findMany' ||
      params.action === 'findUnique'
    ) {
      const model = params.model as string;
      if (modelsWithSoftDelete.includes(model)) {
        // Push deletedAt filter onto the query's where clause
        const where = params.args.where ?? {};
        // Avoid overwriting an explicit deletedAt filter if caller provides one
        if (!where.deletedAt) {
          params.args.where = { ...where, deletedAt: null };
        }
      }
    }
    return next(params);
  });
}

/** Typing for Prisma event listener registration — used to type $on calls */
type PrismaEventListener = {
  $on(event: 'query' | 'warn' | 'error', cb: (e: unknown) => void): void;
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  readPrisma: PrismaClient | undefined;
};

// ── Query logging ─────────────────────────────────────────────────────────────

interface QueryEventLike {
  duration: number;
  query: string;
}

// ── Performance instrumentation ─────────────────────────────────────────────────

let _trackSlowQuery: ((duration: number, query: string, source: 'write' | 'read') => void) | null = null;

export function registerSlowQueryTracker(fn: (duration: number, query: string, source: 'write' | 'read') => void): void {
  _trackSlowQuery = fn;
}

function logQuery(event: QueryEventLike, source: 'write' | 'read' = 'write'): void {
  const duration = event.duration;
  const query = event.query.replace(/\s+/g, ' ').trim();

  // Track slow queries for diagnostics (100ms threshold for load test profiling)
  _trackSlowQuery?.(duration, query, source);

  // Emit slow-query metric for observability (500ms = P95 target boundary)
  if (duration > 500) {
    try {
      observeHistogram('db_query_duration_seconds', duration / 1000, { source });
      if (duration > 1000) incrementCounter('db_slow_queries_total', { source });
    } catch { /* metrics optional */ }
  }

  if (duration > 100) {
    logger.warn({
      type: 'slow_query',
      source,
      duration: `${duration}ms`,
      query: query.substring(0, 200),
    });
  } else if (process.env.NODE_ENV === 'development') {
    logger.debug({
      type: 'query',
      source,
      duration: `${duration}ms`,
      query: query.substring(0, 200),
    });
  }
}

// ── Error logging ─────────────────────────────────────────────────────────────

function logError(event: 'warn' | 'error', message: string): void {
  logger.error({
    type: 'prisma_error',
    level: event,
    message,
  });
}

// ── Prisma client factory ──────────────────────────────────────────────────────

function makePrismaClient(url?: string): PrismaClient {
  const client = new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: [
      { level: 'query', emit: 'event' },
      { level: 'warn',  emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });
  softDeleteMiddleware(client);
  return client;
}

// ── Write DB (primary) ─────────────────────────────────────────────────────────

// NOTE: Direct prisma access is DEPRECATED. Use withTransaction() for all DB operations.
// The proxied client is used internally so that existing code paths continue working.
// When code calls prisma.invoice.findUnique() directly (bypassing withTransaction),
// the proxy emits a warning and increments db_unguarded_query_total.
const _prismaInternal: PrismaClient =
  globalForPrisma.prisma ?? makePrismaClient();

export const prisma = createProxiedPrisma(_prismaInternal);

// ── Read DB (replica if DATABASE_REPLICA_URL is set, otherwise same as write) ─

const _readDbInternal: PrismaClient =
  globalForPrisma.readPrisma ??
  (process.env.DATABASE_REPLICA_URL
    ? makePrismaClient(process.env.DATABASE_REPLICA_URL)
    : _prismaInternal);

export const readDb =
  _readDbInternal === _prismaInternal
    ? prisma
    : createProxiedPrisma(_readDbInternal);

// Set up query logging on the underlying (un-proxied) clients so the proxy
// does not interfere with event listener registration.
(_prismaInternal as unknown as PrismaEventListener).$on(
  'query',
  (e: unknown) => logQuery(e as QueryEventLike, 'write')
);
if (_readDbInternal !== _prismaInternal) {
  (_readDbInternal as unknown as PrismaEventListener).$on(
    'query',
    (e: unknown) => logQuery(e as QueryEventLike, 'read')
  );
}

(_prismaInternal as unknown as PrismaEventListener).$on(
  'warn',
  (e: unknown) => logError('warn', (e as { message: string }).message)
);
(_prismaInternal as unknown as PrismaEventListener).$on(
  'error',
  (e: unknown) => logError('error', (e as { message: string }).message)
);

// Register slow-query tracker for diagnostics. Keep this async side effect out
// of top-level await so worker scripts can run through CommonJS transforms.
void import('@/lib/diagnostics/performance')
  .then((diag) => {
    if (diag?.trackSlowQuery) registerSlowQueryTracker(diag.trackSlowQuery);
  })
  .catch(() => { /* diagnostics optional */ });

// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma     = _prismaInternal;
  globalForPrisma.readPrisma = _readDbInternal;
}

// ── Pool exhaustion detection ──────────────────────────────────────────────────

/**
 * Detects Prisma pool exhaustion errors (P2037, P2024) and re-throws
 * as DB_POOL_EXHAUSTED so callers can handle them distinctly.
 */
function detectPoolExhaustion(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2037' || error.code === 'P2024')
  ) {
    incrementCounter('db_pool_exhausted_total');
    const err = new Error('DB connection pool exhausted');
    (err as any).code = DB_POOL_EXHAUSTED;
    // Fire alerting — lazy import to avoid circular deps
    import('@/lib/alerting/alerts').then(({ alertDbPoolExhausted }) => {
      alertDbPoolExhausted('prisma-pool', 0).catch(() => {});
    });
    throw err;
  }
  throw error;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Graceful shutdown handler
 * Closes database connections on process exit
 */
export async function disconnectPrisma(): Promise<void> {
  logger.info('Closing Prisma connection...');
  await _prismaInternal.$disconnect();
  if (_readDbInternal !== _prismaInternal) await _readDbInternal.$disconnect();
  logger.info('Prisma connection closed');
}

/**
 * Connect with retry logic
 */
export async function connectPrisma(): Promise<void> {
  const maxRetries = 5;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await _prismaInternal.$connect();
      logger.info('Prisma connected successfully');
      return;
    } catch (error) {
      logger.error({
        type: 'prisma_connect_error',
        attempt,
        maxRetries,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (attempt === maxRetries) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

/**
 * Transaction helper with automatic rollback on error.
 *
 * Guards against pool exhaustion:
 * - Increments pendingConnectionRequests before the query
 * - Decrements it after (success or failure)
 * - Checks MAX_CONCURRENT_QUERIES limit and throws DB_POOL_EXHAUSTED if exceeded
 * - Catches Prisma pool errors (P2037, P2024) and re-throws as DB_POOL_EXHAUSTED
 *
 * This is a fail-fast mechanism — it does NOT queue or wait for a slot.
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return withPoolGuard(async () => {
    try {
      incrementCounter('db_query_total');
      return await _prismaInternal.$transaction(fn);
    } catch (error: unknown) {
      detectPoolExhaustion(error);
    }
  });
}

/**
 * Read-only transaction helper (uses readDb replica when available).
 * Same pool guard applies.
 */
export async function withReadTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return withPoolGuard(async () => {
    try {
      incrementCounter('db_query_total');
      return await (_readDbInternal === _prismaInternal
        ? _prismaInternal
        : _readDbInternal).$transaction(fn);
    } catch (error: unknown) {
      detectPoolExhaustion(error);
    }
  });
}

/**
 * Raw query helper with pool guard + metrics.
 */
export async function rawQuery<T>(query: string, ...args: unknown[]): Promise<T> {
  return withPoolGuard(async () => {
    try {
      incrementCounter('db_query_total');
      return await _prismaInternal.$queryRawUnsafe(query, ...args) as unknown as T;
    } catch (error: unknown) {
      detectPoolExhaustion(error);
    }
  });
}

// Re-export all Prisma types for convenience
export * from '@prisma/client';
