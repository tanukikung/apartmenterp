'use client';

interface SkeletonProps {
  className?: string;
  rows?: number;
}

/**
 * Skeletons use the `shimmer-wave` class defined in globals.css which has a
 * smooth gradient sweep. Each row gets a staggered animation-delay so the
 * wave cascades down the list for a more alive feel.
 */

const WIDTHS = [90, 72, 84, 68, 96, 76, 80, 65] as const;

export function Skeleton({ className = '', rows = 1 }: SkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="shimmer-wave h-4 rounded-md"
          style={{ width: `${WIDTHS[i % WIDTHS.length]}%`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function SkeletonRow({ index = 0 }: { index?: number }) {
  const delay = `${index * 60}ms`;
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-outline-variant/20 last:border-0">
      <div className="shimmer-wave h-4 w-12 rounded-md" style={{ animationDelay: delay }} />
      <div className="shimmer-wave h-4 flex-1 rounded-md" style={{ animationDelay: delay }} />
      <div className="shimmer-wave h-4 w-20 rounded-md" style={{ animationDelay: delay }} />
      <div className="shimmer-wave h-4 w-24 rounded-md" style={{ animationDelay: delay }} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="border border-outline-variant/30 rounded-xl overflow-hidden bg-surface-container-lowest">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-surface-container-low/50 border-b border-outline-variant/30">
        <div className="shimmer-wave h-3 w-12 rounded" />
        <div className="shimmer-wave h-3 flex-1 rounded" />
        <div className="shimmer-wave h-3 w-20 rounded" />
        <div className="shimmer-wave h-3 w-24 rounded" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} index={i} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-3 anim-fade-in">
      <div className="shimmer-wave h-4 w-1/3 rounded" />
      <div className="shimmer-wave h-8 w-2/3 rounded" style={{ animationDelay: '80ms' }} />
      <div className="space-y-1.5 pt-1">
        <div className="shimmer-wave h-3 w-full rounded" style={{ animationDelay: '160ms' }} />
        <div className="shimmer-wave h-3 w-4/5 rounded" style={{ animationDelay: '240ms' }} />
      </div>
    </div>
  );
}

export function SkeletonKPICard({ index = 0 }: { index?: number }) {
  const delay = `${index * 80}ms`;
  return (
    <div
      className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-3 anim-slide-up"
      style={{ animationDelay: delay, animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between">
        <div className="shimmer-wave h-3 w-20 rounded" style={{ animationDelay: delay }} />
        <div className="shimmer-wave h-9 w-9 rounded-lg" style={{ animationDelay: delay }} />
      </div>
      <div className="shimmer-wave h-8 w-16 rounded" style={{ animationDelay: `calc(${delay} + 100ms)` }} />
      <div className="shimmer-wave h-3 w-24 rounded" style={{ animationDelay: `calc(${delay} + 200ms)` }} />
    </div>
  );
}
