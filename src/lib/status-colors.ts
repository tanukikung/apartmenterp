/**
 * Shared status badge color utilities.
 * Uses CSS design tokens from globals.css (:root / .dark blocks).
 */

export type StatusColor = 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'neutral';

export function statusBadgeClass(color: StatusColor): string {
  return `bg-[hsl(var(--status-${color}-bg))] text-[hsl(var(--status-${color}-text))] rounded-full px-2.5 py-0.5 text-xs font-semibold`;
}

export function statusBadgeClassWithBorder(color: StatusColor): string {
  return `bg-[hsl(var(--status-${color}-bg))] text-[hsl(var(--status-${color}-text))] border border-[hsl(var(--status-${color}-bg))]/60 rounded-full px-2.5 py-0.5 text-xs font-semibold`;
}

/** Status text color only — for icons, counts, etc. */
export function statusTextClass(color: StatusColor): string {
  return `text-[hsl(var(--status-${color}-text))]`;
}

/** Status icon background only */
export function statusBgClass(color: StatusColor): string {
  return `bg-[hsl(var(--status-${color}-bg))]`;
}
