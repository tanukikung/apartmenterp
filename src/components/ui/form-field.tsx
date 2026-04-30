'use client';

import React from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, required, hint, error, children, className = '' }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      <div className="relative">
        {children}
        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-xs text-[hsl(var(--on-surface-variant))]">{hint}</p>
      )}
    </div>
  );
}
