/**
 * Standardized application error with code and status
 */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error codes
 */
export const ERROR_CODES = {
  // 400 - Client errors
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // 401 - Authentication
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // 403 - Authorization
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // 404 - Not found
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // 409 - Conflict
  CONFLICT: 'CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INVALID_STATE: 'INVALID_STATE',

  // 429 - Rate limit
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // 500 - Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Business logic errors
  BUSINESS_LOGIC_ERROR: 'BUSINESS_LOGIC_ERROR',
  INVALID_OPERATION: 'INVALID_OPERATION',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Create AppError with code
 */
export const createError = (
  code: ErrorCode,
  message: string,
  statusCode?: number,
  details?: any
): AppError => {
  const defaultStatusCode: Record<string, number> = {
    INVALID_INPUT: 400,
    VALIDATION_ERROR: 400,
    INVALID_JSON: 400,
    MISSING_REQUIRED_FIELD: 400,
    UNAUTHORIZED: 401,
    INVALID_CREDENTIALS: 401,
    SESSION_EXPIRED: 401,
    FORBIDDEN: 403,
    INSUFFICIENT_PERMISSIONS: 403,
    NOT_FOUND: 404,
    RESOURCE_NOT_FOUND: 404,
    CONFLICT: 409,
    DUPLICATE_ENTRY: 409,
    INVALID_STATE: 409,
    RATE_LIMIT_EXCEEDED: 429,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500,
    DATABASE_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
    EXTERNAL_SERVICE_ERROR: 502,
    BUSINESS_LOGIC_ERROR: 400,
    INVALID_OPERATION: 400,
    PRECONDITION_FAILED: 412,
  };

  return new AppError(
    code,
    message,
    statusCode ?? defaultStatusCode[code] ?? 500,
    details
  );
};
