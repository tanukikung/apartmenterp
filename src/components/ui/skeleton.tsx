'use client';

interface SkeletonProps {
  className?: string;
  rows?: number;
}

export function Skeleton({ className = '', rows = 1 }: SkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-4 rounded" style={{ width: `${Math.random() * 30 + 70}%` }} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="skeleton h-4 w-12 rounded" />
      <div className="skeleton h-4 flex-1 rounded" />
      <div className="skeleton h-4 w-20 rounded" />
      <div className="skeleton h-4 w-24 rounded" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-muted">
        <div className="skeleton h-3 w-12 rounded" />
        <div className="skeleton h-3 flex-1 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="skeleton h-4 w-1/3 rounded" />
      <div className="skeleton h-8 w-2/3 rounded" />
      <div className="space-y-1.5">
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
      </div>
    </div>
  );
}

export function SkeletonKPICard() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-9 w-9 rounded-lg" />
      </div>
      <div className="skeleton h-8 w-16 rounded" />
      <div className="skeleton h-3 w-24 rounded" />
    </div>
  );
}
