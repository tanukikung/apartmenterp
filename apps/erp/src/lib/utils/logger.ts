import pino from 'pino';
import fs from 'fs';
import path from 'path';

// Log levels
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

// Logger configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

function resolveLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (envLevel && ['fatal','error','warn','info','debug','trace','silent'].includes(envLevel)) {
    return envLevel;
  }
  if (isTest) return 'silent';
  return isDevelopment ? 'debug' : 'info';
}

const isProduction = process.env.NODE_ENV === 'production';
let destination: pino.DestinationStream | undefined;
if (isProduction) {
  const dir = process.env.LOG_DIR || '/logs';
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  const file = path.join(dir, 'app.log');
  destination = pino.destination({ dest: file, sync: false });
}

export const logger = pino({
  level: resolveLevel(),
  // Avoid pino-pretty transport (worker threads) in Next.js – use plain stdout instead
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: {
    service: 'apartment-erp',
  },
}, destination);

export function getLogLevel(): LogLevel {
  return (logger.level as LogLevel);
}
/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}

/**
 * Error tracking helper
 */
export interface ErrorLogContext {
  type: string;
  error: Error;
  code?: string;
  details?: Record<string, unknown>;
  userId?: string;
  requestId?: string;
}

export function logError(context: ErrorLogContext): void {
  const { type, error, code, details, userId, requestId } = context;

  logger.error({
    type,
    code,
    message: error.message,
    stack: error.stack,
    details,
    userId,
    requestId,
  });
}

/**
 * Structured logging for specific domains
 */
export const auditLogger = {
  info: (action: string, entity: string, entityId: string, details?: Record<string, unknown>) => {
    logger.info({
      type: 'audit',
      action,
      entity,
      entityId,
      ...details,
    });
  },
  error: (action: string, entity: string, entityId: string, error: Error) => {
    logger.error({
      type: 'audit_error',
      action,
      entity,
      entityId,
      message: error.message,
      stack: error.stack,
    });
  },
};

export const dbLogger = {
  query: (query: string, duration: number) => {
    logger.debug({
      type: 'db_query',
      duration: `${duration}ms`,
      query: query.substring(0, 200),
    });
  },
  slowQuery: (query: string, duration: number) => {
    logger.warn({
      type: 'slow_query',
      duration: `${duration}ms`,
      query: query.substring(0, 200),
    });
  },
  error: (error: Error, context?: Record<string, unknown>) => {
    logger.error({
      type: 'db_error',
      message: error.message,
      stack: error.stack,
      ...context,
    });
  },
};

export const eventLogger = {
  published: (eventType: string, aggregateId: string) => {
    logger.debug({
      type: 'event_published',
      eventType,
      aggregateId,
    });
  },
  consumed: (eventType: string, handler: string) => {
    logger.debug({
      type: 'event_consumed',
      eventType,
      handler,
    });
  },
  error: (eventType: string, handler: string, error: Error) => {
    logger.error({
      type: 'event_error',
      eventType,
      handler,
      message: error.message,
      stack: error.stack,
    });
  },
};

export const apiLogger = {
  request: (method: string, path: string, statusCode: number, duration: number, opts?: { requestId?: string; ip?: string }) => {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const payload: Record<string, unknown> = {
      type: 'api_request',
      method,
      path,
      statusCode,
      duration: `${duration}ms`,
    };
    if (opts?.requestId) payload.requestId = opts.requestId;
    if (opts?.ip) payload.ip = opts.ip;
    switch (level) {
      case 'error':
        logger.error(payload);
        break;
      case 'warn':
        logger.warn(payload);
        break;
      default:
        logger.info(payload);
        break;
    }
  },
};

// Export default logger
export default logger;
