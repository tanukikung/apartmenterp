'use client';

import React from 'react';

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ icon, title, subtitle, actions, className = '' }: PageHeaderProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[hsl(var(--color-border))] px-6 py-5 ${className}`}
      style={{ background: 'hsl(var(--color-surface))' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-20"
          style={{ background: 'linear-gradient(135deg, hsl(var(--color-primary) / 0.15) 0%, transparent 60%)' }}
        />
      </div>
      <div className="relative flex items-center gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))]"
          style={{ background: 'hsl(var(--color-primary) / 0.15)' }}
        >
          <span style={{ color: 'hsl(var(--color-primary))' }}>{icon}</span>
        </div>
        <div>
          <h1 className="text-base font-semibold text-[hsl(var(--on-surface))]">{title}</h1>
          {subtitle && (
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
    </div>
  );
}
