'use client';

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardGridItem {
  id: string;
}

interface CardStat {
  label: string;
  value: string | number;
}

interface CardMeta {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  stats?: CardStat[];
  footer?: React.ReactNode;
}

interface CardGridProps<T extends object> {
  items: T[];
  /** Function to extract card metadata from each item */
  getCardMeta: (item: T) => CardMeta;
  /** Called when a card is clicked */
  onCardClick?: (item: T) => void;
  /** Called when an action button inside a card is clicked */
  onAction?: (action: string, item: T) => void;
  /** Whether to show hover lift effect (default: true) */
  hoverable?: boolean;
  /** Grid columns: '1' | '2' | '3' | '4' (default responsive: 1→2→3→4) */
  columns?: 1 | 2 | 3 | 4;
  /** Property name to use as item key (default: 'id') */
  idKey?: string;
  className?: string;
  loading?: boolean;
  loadingCount?: number;
  empty?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function CardSkeleton({ columns = 4 }: { columns?: 1 | 2 | 3 | 4 }) {
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  }[columns] as string;

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="p-5 space-y-3">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-3 w-16 rounded" />
            <div className="mt-4 flex justify-between">
              <div className="skeleton h-5 w-20 rounded" />
              <div className="skeleton h-5 w-16 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single Card
// ---------------------------------------------------------------------------

interface SingleCardProps<T extends object> {
  item: T;
  meta: CardMeta;
  onCardClick?: (item: T) => void;
  hoverable?: boolean;
}

function Card<T extends object>({ item, meta, onCardClick, hoverable = true }: SingleCardProps<T>) {
  return (
    <div
      onClick={onCardClick ? () => onCardClick(item) : undefined}
      className={
        `group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden` +
        ` transition-all duration-200` +
        (hoverable ? ' hover:shadow-xl hover:-translate-y-0.5 hover:border-primary/20 cursor-pointer' : '')
      }
    >
      <div className="p-5">
        {/* Header: title + badge */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-primary truncate">{meta.title}</h3>
            {meta.subtitle && (
              <p className="text-xs text-on-surface-variant mt-0.5 truncate">{meta.subtitle}</p>
            )}
          </div>
          {meta.badge && (
            <div className="shrink-0">{meta.badge}</div>
          )}
        </div>

        {/* Stats */}
        {meta.stats && meta.stats.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
            {meta.stats.map((stat, idx) => (
              <div key={idx} className="flex items-baseline gap-1">
                <span className="text-xs text-on-surface-variant">{stat.label}</span>
                <span className="text-sm font-semibold text-on-surface tabular-nums">{stat.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {meta.footer && (
          <div className="pt-3 border-t border-outline-variant/10">{meta.footer}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardGrid
// ---------------------------------------------------------------------------

export function CardGrid<T extends object>({
  items,
  getCardMeta,
  onCardClick,
  hoverable = true,
  columns = 4,
  idKey = 'id',
  className = '',
  loading = false,
  empty,
}: CardGridProps<T>) {
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  }[columns] as string;

  if (loading) {
    return <CardSkeleton columns={columns} />;
  }

  if (items.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  return (
    <div className={`grid gap-4 ${gridClass} ${className}`}>
      {items.map((item) => (
        <Card
          key={String((item as Record<string, unknown>)[idKey] ?? '')}
          item={item}
          meta={getCardMeta(item)}
          onCardClick={onCardClick}
          hoverable={hoverable}
        />
      ))}
    </div>
  );
}
