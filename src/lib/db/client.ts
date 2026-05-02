import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * Soft-delete middleware
 *
 * Automatically adds `deletedAt: null` to all findFirst/findMany queries on
 * Tenant and Contract models. This ensures deleted records are always
 * excluded without requiring callers to remember the filter.
 *
 * Hard deletes on these models are blocked by the model-level @ignore annotation
 * in schema.prisma — use archiveTenant() / archiveContract() instead.
 */
function softDeleteMiddleware(prisma: PrismaClient): void {
  const modelPrefix = 'model.';
  const modelsWithSoftDelete = ['Tenant', 'Contract'];

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
};

// Query logging function
interface QueryEventLike {
  duration: number;
  query: string;
}
function logQuery(event: QueryEventLike): void {
  const duration = event.duration;
  const query = event.query.replace(/\s+/g, ' ').trim();
  
  if (duration > 1000) {
    logger.warn({
      type: 'slow_query',
      duration: `${duration}ms`,
      query: query.substring(0, 200),
    });
  } else {
    logger.debug({
      type: 'query',
      duration: `${duration}ms`,
      query: query.substring(0, 200),
    });
  }
}

// Error logging function
function logError(event: 'warn' | 'error', message: string): void {
  logger.error({
    type: 'prisma_error',
    level: event,
    message,
  });
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

// Apply soft-delete middleware after instantiation
softDeleteMiddleware(prisma);

// Set up query logging in development
if (process.env.NODE_ENV === 'development') {
  (prisma as unknown as PrismaEventListener).$on(
    'query',
    (e: unknown) => logQuery(e as QueryEventLike)
  );
}

(prisma as unknown as PrismaEventListener).$on(
  'warn',
  (e: unknown) => logError('warn', (e as { message: string }).message)
);
(prisma as unknown as PrismaEventListener).$on(
  'error',
  (e: unknown) => logError('error', (e as { message: string }).message)
);

// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Closes database connections on process exit
 */
export async function disconnectPrisma(): Promise<void> {
  logger.info('Closing Prisma connection...');
  await prisma.$disconnect();
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
      await prisma.$connect();
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
 * Transaction helper with automatic rollback on error
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn);
}

/**
 * Raw query helper
 */
export async function rawQuery<T>(query: string, ...args: unknown[]): Promise<T> {
  return prisma.$queryRawUnsafe(query, ...args) as unknown as T;
}

// Re-export all Prisma types for convenience
export * from '@prisma/client';
