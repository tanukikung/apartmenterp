'use client';

import React from 'react';
import { motion } from 'framer-motion';

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
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-[hsl(var(--color-surface))] rounded-xl border border-[hsl(var(--color-border))]/10 overflow-hidden anim-fade-in"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
        >
          <div className="p-5 space-y-3">
            <div className="shimmer-wave h-4 w-24 rounded" style={{ animationDelay: `${i * 60}ms` }} />
            <div className="shimmer-wave h-3 w-16 rounded" style={{ animationDelay: `${i * 60 + 80}ms` }} />
            <div className="mt-4 flex justify-between">
              <div className="shimmer-wave h-5 w-20 rounded" style={{ animationDelay: `${i * 60 + 160}ms` }} />
              <div className="shimmer-wave h-5 w-16 rounded" style={{ animationDelay: `${i * 60 + 240}ms` }} />
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

function Card<T extends object>({ item, meta, onCardClick, hoverable = true, index = 0 }: SingleCardProps<T> & { index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.32), ease: [0.2, 0.8, 0.2, 1] }}
      whileHover={hoverable ? { y: -4 } : undefined}
      onClick={onCardClick ? () => onCardClick(item) : undefined}
      className={
        `group relative bg-[hsl(var(--color-surface))] rounded-xl border border-[hsl(var(--color-border))]/10 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)] overflow-hidden` +
        ` transition-[box-shadow,border-color] duration-200` +
        (hoverable
          ? ' hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(99,102,241,0.2)] hover:border-[hsl(var(--color-primary))]/30 cursor-pointer'
          : '')
      }
    >
      {/* Subtle gradient wash on hover */}
      {hoverable && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/0 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}
      <div className="relative p-5">
        {/* Header: title + badge */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-primary truncate group-hover:text-primary transition-colors">{meta.title}</h3>
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
    </motion.div>
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
      {items.map((item, index) => (
        <Card
          key={String((item as Record<string, unknown>)[idKey] ?? '')}
          item={item}
          meta={getCardMeta(item)}
          onCardClick={onCardClick}
          hoverable={hoverable}
          index={index}
        />
      ))}
    </div>
  );
}
