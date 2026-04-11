import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useApiQuery<T>(queryKey: string[], url: string) {
  return useQuery<T>({
    queryKey,
    queryFn: () => fetch(url).then((r) => r.json()),
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
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? 'Request failed');
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
