import { useMemo } from 'react';
import { theme, Theme } from '@/lib/theme';

export function useTheme(): Theme {
  return useMemo(() => theme, []);
}

export function useThemeColor(path: string): string {
  const t = useTheme();
  return getNestedValue(t.colors, path) || '';
}

export function useThemeSpacing(size: keyof typeof theme.spacing): string {
  const t = useTheme();
  return t.spacing[size];
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, prop) => current?.[prop], obj);
}
