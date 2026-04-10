'use client';

import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  /** SVG icon or React node to display */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-3 px-6 py-16 text-center ${className}`}>
      {/* Icon container */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container">
        {icon ? (
          <div className="text-on-surface-variant">{icon}</div>
        ) : (
          /* Default document icon */
          <svg
            className="h-7 w-7 text-on-surface-variant"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        )}
      </div>

      {/* Text */}
      <div className="space-y-1">
        <p className="text-base font-semibold text-on-surface">{title}</p>
        {description && (
          <p className="text-sm text-on-surface-variant max-w-sm">{description}</p>
        )}
      </div>

      {/* Action */}
      {action && (
        <div className="mt-2">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
