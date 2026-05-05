// Database
export {
  prisma,
  connectPrisma,
  disconnectPrisma,
  withTransaction,
} from './db/client';

// Export all Prisma types
export * from './db/client';

// Events
export {
  EventBus,
  EventBuilder,
  createEventBus,
  getEventBus,
  createEventBuilder,
  EventTypes,
} from './events';

export type {
  DomainEvent,
  EventHandler,
  EventHandlerMap,
  EventBusOptions,
  EventMetadata,
} from './events';

// Outbox
export {
  OutboxProcessor,
  getOutboxProcessor,
  createOutboxProcessor,
  publishEvent,
} from './outbox';

export type {
  OutboxProcessorOptions,
  ProcessedResult,
} from './outbox';

// LINE — server-only, NOT re-exported to clients
// Import directly from '@/lib/line' in server-side code only

// Utils
export {
  logger,
  createLogger,
  logError,
  auditLogger,
  dbLogger,
  eventLogger,
  apiLogger,
} from './utils/logger';

export {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  formatError,
  safeJSONParse,
  type ApiResponse,
  type ErrorResponse,
  type SuccessResponse,
} from './utils/errors';

// Re-export commonly used utils
export * from './utils/index';
