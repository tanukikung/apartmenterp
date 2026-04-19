'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Primitive = string | number | null | undefined;
type Serializable = Primitive | boolean;

/**
 * Persist a piece of UI state in the URL query string. On reload, the
 * state is re-hydrated from the URL; on change, the URL is updated via
 * `router.replace` (no history entry).
 *
 * Usage:
 *   const [q, setQ] = useUrlState('q', '');
 *   const [page, setPage] = useUrlState('page', 1, Number);
 *
 * Falsy values (empty string, 0, null, undefined, false) are omitted from the
 * URL to keep it clean.
 */
export function useUrlState<T extends Serializable>(
  key: string,
  defaultValue: T,
  parse?: (raw: string) => T,
): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const readFromUrl = useCallback((): T => {
    const raw = searchParams.get(key);
    if (raw === null) return defaultValue;
    if (parse) return parse(raw);
    // Infer from default value type
    if (typeof defaultValue === 'number') return (Number(raw) as unknown) as T;
    if (typeof defaultValue === 'boolean') return ((raw === 'true') as unknown) as T;
    return (raw as unknown) as T;
  }, [searchParams, key, defaultValue, parse]);

  const [state, setState] = useState<T>(readFromUrl);

  // Sync back when route-driven URL changes (browser back/forward)
  useEffect(() => {
    setState(readFromUrl());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setValue = useCallback(
    (next: T) => {
      setState(next);
      const params = new URLSearchParams(searchParams.toString());
      const empty =
        next === null ||
        next === undefined ||
        next === '' ||
        next === defaultValue ||
        (typeof next === 'number' && Number.isNaN(next));
      if (empty) {
        params.delete(key);
      } else {
        params.set(key, String(next));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, key, defaultValue],
  );

  return [state, setValue];
}
