// Global type declarations
import type { ApiResponse } from '@/lib/api-response';

declare global {
  // Make ApiResponse available globally without import
  type ApiResponse<T = any> = import('@/lib/api-response').ApiResponse<T>;
}

export {};
