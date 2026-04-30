'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  placeholder?: string;
  filters?: FilterOption[];
  activeFilter?: string;
  onFilterChange?: (v: string) => void;
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  placeholder = 'ค้นหา...',
  filters = [],
  activeFilter,
  onFilterChange,
  className = '',
}: FilterBarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] py-2 pl-9 pr-3 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all"
        />
      </div>

      {/* Filter select */}
      {filters.length > 0 && (
        <select
          value={activeFilter ?? ''}
          onChange={(e) => onFilterChange?.(e.target.value)}
          className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--on-surface))] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all cursor-pointer"
        >
          {filters.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
