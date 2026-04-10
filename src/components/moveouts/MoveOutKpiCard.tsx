'use client';

import React from 'react';

export function MoveOutKpiCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 flex items-center gap-4 py-4 px-5">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}
      >
        <Icon size={20} className="text-white" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--on-surface-variant)]">
          {label}
        </div>
        <div className="text-2xl font-bold text-[var(--on-surface)] leading-tight">
          {value}
        </div>
        {sub && (
          <div className="text-[11px] text-[var(--on-surface-variant)] mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
