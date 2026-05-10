/**
 * Standardized API response format
 * All routes must return responses in this format
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiErrorObject;
  message?: string;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
    [key: string]: any;
  };
}

export interface ApiErrorObject {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
}

/**
 * Format successful response
 */
export const formatSuccess = <T,>(
  data: T,
  message?: string,
  meta?: any
): ApiResponse<T> => ({
  success: true,
  data,
  message,
  ...(meta && { meta }),
});

/**
 * Format error response
 */
export const formatError = (
  code: string,
  message: string,
  statusCode: number = 400,
  details?: any
): ApiResponse => ({
  success: false,
  error: { code, message, statusCode, ...(details && { details }) },
});

/**
 * Format paginated response
 */
export const formatPaginatedSuccess = <T,>(
  data: T[],
  page: number,
  pageSize: number,
  total: number
): ApiResponse<T[]> => ({
  success: true,
  data,
  meta: {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  },
});

/**
 * Format list response (without pagination)
 */
export const formatListSuccess = <T,>(
  data: T[],
  total: number
): ApiResponse<T[]> => ({
  success: true,
  data,
  meta: { total },
});
