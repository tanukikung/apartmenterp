import pino from 'pino';
import fs from 'fs';
import path from 'path';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

function resolveLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (envLevel && ['fatal','error','warn','info','debug','trace','silent'].includes(envLevel)) {
    return envLevel;
  }
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';
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

export const logger = pino(
  {
    level: resolveLevel(),
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    base: {
      service: 'apartment-erp',
    },
  },
  destination
);

export function createLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}

export function apiRequestLog(input: {
  method: string;
  path: string;
  statusCode?: number;
  durationMs?: number;
  requestId?: string;
  ip?: string;
}) {
  const level: 'error' | 'warn' | 'info' =
    input.statusCode && input.statusCode >= 500
      ? 'error'
      : input.statusCode && input.statusCode >= 400
      ? 'warn'
      : 'info';
  const logFn = level === 'error' ? logger.error.bind(logger) : level === 'warn' ? logger.warn.bind(logger) : logger.info.bind(logger);
  logFn({
    type: 'api_request',
    method: input.method,
    path: input.path,
    statusCode: input.statusCode,
    duration: input.durationMs !== undefined ? `${input.durationMs}ms` : undefined,
    requestId: input.requestId,
    ip: input.ip,
  });
}
