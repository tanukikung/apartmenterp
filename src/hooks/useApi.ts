import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse } from '@/lib/api-response';

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public url?: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    cache: 'no-store',
    credentials: 'include',
  });

  // Parse response
  const json = (await res.json()) as ApiResponse<T>;

  // Check for API-level success
  if (!json.success) {
    const errorMessage = json.error?.message ?? 'Request failed';
    const errorCode = json.error?.code ?? 'UNKNOWN_ERROR';
    const statusCode = json.error?.statusCode ?? res.status;

    throw new ApiError(
      errorMessage,
      errorCode,
      statusCode,
      url,
      json.error?.details
    );
  }

  // Check HTTP status for non-200 responses
  if (!res.ok) {
    throw new ApiError(
      json.error?.message || `HTTP ${res.status}`,
      'HTTP_ERROR',
      res.status,
      url
    );
  }

  // Merge meta (pagination info) into the returned object so paginated hooks
  // receive { data: T[], page, pageSize, total, totalPages } instead of just T[]
  if (json.meta && typeof json.meta === 'object') {
    return { data: json.data, ...json.meta } as T;
  }
  return json as T;
}

export function useApiData<T>(
  url: string | null,
  queryKey: string[]
) {
  return useQuery<T, Error>({
    queryKey: [queryKey[0], ...queryKey.slice(1), url],
    queryFn: () => (url ? fetchApi<T>(url) : Promise.reject(new Error('URL is null'))),
    enabled: Boolean(url),
  });
}

export function useApiMutation<TInput, TOutput>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  invalidateKeys: string[]
) {
  const queryClient = useQueryClient();
  return useMutation<TOutput, Error, TInput>({
    mutationFn: async (data: TInput) => {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const json = await res.json();
          if (json.error?.message) {
            errorMessage = json.error.message;
          }
        } catch {
          // Response might not be JSON
        }
        throw new ApiError(errorMessage, 'HTTP_ERROR', res.status, url);
      }

      const json = await res.json();
      if (!json.success) {
        const err = new ApiError(
          json.error?.message ?? 'Request failed',
          json.error?.code,
          res.status,
          url
        );
        throw err;
      }
      return json.data as TOutput;
    },
    onSuccess: () => {
      invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
    },
  });
}
