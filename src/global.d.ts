// Global type declarations
declare global {
  // Make ApiResponse available globally without import
  type ApiResponse<T = any> = import('@/lib/api-response').ApiResponse<T>;
}

export {};
