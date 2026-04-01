'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children only on the client side, preventing SSR hydration mismatches
 * caused by locale/timezone-dependent formatting (e.g. toLocaleString).
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <>{fallback}</>;
}
