/**
 * Structured Logging
 * Provides consistent, typed logging with context propagation
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  requestId?: string;
  userId?: string;
  userRole?: string;
  sessionId?: string;
  traceId?: string;
  timestamp?: string;
  duration?: number;
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

class StructuredLogger {
  private contextStack: LogContext[] = [];
  private isDev = process.env.NODE_ENV === 'development';

  pushContext(context: LogContext): void {
    this.contextStack.push(context);
  }

  popContext(): LogContext | undefined {
    return this.contextStack.pop();
  }

  clearContext(): void {
    this.contextStack = [];
  }

  private getContext(): LogContext {
    return Object.assign({}, ...this.contextStack, {
      timestamp: new Date().toISOString(),
    });
  }

  private formatLog(entry: LogEntry): string {
    if (this.isDev) {
      return JSON.stringify(entry, null, 2);
    }
    return JSON.stringify(entry);
  }

  private output(entry: LogEntry): void {
    const formatted = this.formatLog(entry);
    const levelMethodMap = {
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error,
      fatal: console.error,
    };
    const method = levelMethodMap[entry.level];

    method?.(formatted);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.output({
      level: 'debug',
      message,
      context: this.getContext(),
      metadata,
    });
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.output({
      level: 'info',
      message,
      context: this.getContext(),
      metadata,
    });
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.output({
      level: 'warn',
      message,
      context: this.getContext(),
      metadata,
    });
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.output({
      level: 'error',
      message,
      context: this.getContext(),
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
      metadata,
    });
  }

  fatal(message: string, error?: Error): void {
    this.output({
      level: 'fatal',
      message,
      context: this.getContext(),
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  // Performance logging
  time(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`${label} completed`, { duration });
    };
  }

  // Request logging
  logRequest(
    method: string,
    path: string,
    metadata?: Record<string, any>
  ): () => void {
    const start = Date.now();
    this.info(`${method} ${path}`, { ...metadata, type: 'request_start' });

    return () => {
      const duration = Date.now() - start;
      this.info(`${method} ${path} completed`, {
        ...metadata,
        duration,
        type: 'request_end',
      });
    };
  }

  // API call logging
  logApiCall(
    endpoint: string,
    method: string,
    statusCode?: number,
    duration?: number
  ): void {
    this.info(`API call: ${method} ${endpoint}`, {
      endpoint,
      method,
      statusCode,
      duration,
      type: 'api_call',
    });
  }

  // Database operation logging
  logDb(
    operation: 'query' | 'mutation',
    table: string,
    duration?: number,
    error?: Error
  ): void {
    const message = `DB ${operation}: ${table}`;

    if (error) {
      this.error(message, error, {
        operation,
        table,
        duration,
        type: 'db_operation',
      });
    } else {
      this.debug(message, {
        operation,
        table,
        duration,
        type: 'db_operation',
      });
    }
  }

  // Cache operations
  logCache(
    operation: 'hit' | 'miss' | 'set' | 'delete',
    key: string,
    metadata?: Record<string, any>
  ): void {
    this.debug(`Cache ${operation}: ${key}`, {
      operation,
      key,
      ...metadata,
      type: 'cache_operation',
    });
  }
}

export const logger = new StructuredLogger();

// Helper for request context
export function withRequestContext<T>(
  context: LogContext,
  fn: () => Promise<T>
): Promise<T> {
  logger.pushContext(context);
  try {
    return fn();
  } finally {
    logger.popContext();
  }
}

// Performance monitoring
export class PerformanceMonitor {
  static measure<T>(label: string, fn: () => T): T {
    const end = logger.time(label);
    try {
      return fn();
    } finally {
      end();
    }
  }

  static async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const end = logger.time(label);
    try {
      return await fn();
    } finally {
      end();
    }
  }
}

// Middleware for request logging
export async function logRequestMiddleware(
  req: any,
  handler: () => Promise<any>
): Promise<any> {
  const method = req.method;
  const path = req.nextUrl.pathname;
  const requestId = req.headers.get('x-request-id') || generateRequestId();

  const endLog = logger.logRequest(method, path, {
    requestId,
    userAgent: req.headers.get('user-agent'),
  });

  logger.pushContext({ requestId });

  try {
    return await handler();
  } finally {
    logger.popContext();
    endLog();
  }
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
