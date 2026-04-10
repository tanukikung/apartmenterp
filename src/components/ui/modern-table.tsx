'use client';

import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc' | undefined;

export interface ColumnDef<T> {
  key: string;
  header: string;
  /** Render a custom cell. Receives the full row item. */
  render?: (item: T) => React.ReactNode;
  /** Text alignment: 'left' | 'right' | 'center' (default: left) */
  align?: 'left' | 'right' | 'center';
  /** Make column sortable */
  sortable?: boolean;
  /** Width hint (e.g. '120px', '10rem', 'auto') */
  width?: string;
  /** Minimum width */
  minWidth?: string;
  /** Custom class for the <td> cell */
  cellClassName?: string;
}

export interface TableAction<T> {
  label: string;
  onClick: (item: T) => void;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}

interface ModernTableProps<T extends object> {
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  loadingRows?: number;
  /** Row click handler */
  onRowClick?: (item: T) => void;
  /** Bulk selection */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Inline actions per row */
  actions?: TableAction<T>[];
  /** Pagination config */
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  /** Property name to use as row key (default: 'id') */
  idKey?: string;
  /** Optional header bar inside the card (e.g. title + badge) */
  header?: React.ReactNode;
  /** Empty state */
  empty?: React.ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortIcon({ direction }: { direction: SortDirection | undefined }) {
  if (!direction) return <ChevronsUpDown className="h-3.5 w-3.5 text-on-surface-variant/40" />;
  if (direction === 'asc') return <ChevronUp className="h-3.5 w-3.5 text-primary" />;
  return <ChevronDown className="h-3.5 w-3.5 text-primary" />;
}

interface ThProps<T> {
  column: ColumnDef<T>;
  sorted?: SortDirection;
  onSort?: () => void;
}

function Th<T>({ column, sorted, onSort }: ThProps<T>) {
  const alignClass = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
  }[column.align ?? 'left'];

  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant whitespace-nowrap',
        alignClass,
        column.sortable && 'cursor-pointer select-none hover:text-on-surface group',
      )}
      style={{ width: column.width, minWidth: column.minWidth }}
      onClick={column.sortable ? onSort : undefined}
    >
      <div className={cn('flex items-center gap-1', alignClass === 'right' ? 'justify-end' : alignClass === 'center' ? 'justify-center' : 'justify-start')}>
        <span>{column.header}</span>
        {column.sortable && <SortIcon direction={sorted} />}
      </div>
    </th>
  );
}

function Checkbox({ checked, onChange, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; indeterminate?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = indeterminate ?? false; }}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
    />
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ModernTable<T extends object>({
  columns,
  data,
  loading = false,
  loadingRows = 5,
  onRowClick,
  selectable = false,
  selectedIds,
  onSelectionChange,
  actions,
  pagination,
  idKey = 'id',
  header,
  empty,
  className = '',
}: ModernTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(undefined);

  // Helper to get row ID
  function getRowId(row: T): string {
    return String((row as Record<string, unknown>)[idKey] ?? '');
  }

  // Sort handling
  function handleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortKey(null);
      setSortDir(undefined);
    } else {
      setSortDir('asc');
    }
  }

  // Selection helpers
  const selected = selectedIds ?? new Set<string>();
  const allSelected = data.length > 0 && data.every((r) => selected.has(getRowId(r)));
  const someSelected = data.some((r) => selected.has(getRowId(r)));

  function toggleAll(checked: boolean) {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(new Set(data.map((r) => getRowId(r))));
    } else {
      onSelectionChange(new Set());
    }
  }

  function toggleOne(id: string) {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  // Sort data
  const sortedData = React.useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === 'asc' ? -1 : 1;
      if (bVal == null) return sortDir === 'asc' ? 1 : -1;
      const cmp = String(aVal).localeCompare(String(bVal), 'th-TH', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 0;

  return (
    <div className={cn('bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden', className)}>
      {/* Optional header bar */}
      {header && (
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          {header}
        </div>
      )}
      {/* Table wrapper */}
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low/50">
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <Checkbox checked={allSelected} onChange={toggleAll} indeterminate={!allSelected && someSelected} />
                </th>
              )}
              {columns.map((col) => (
                <Th
                  key={col.key}
                  column={col}
                  sorted={sortKey === col.key ? sortDir : undefined}
                  onSort={col.sortable ? () => handleSort(col.key) : undefined}
                />
              ))}
              {actions && actions.length > 0 && (
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant w-10">
                  {/* Actions column header — no label */}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {/* Loading skeleton */}
            {loading && Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} className="border-b border-outline-variant/5">
                {selectable && (
                  <td className="px-4 py-3"><div className="skeleton h-4 w-4 rounded" /></td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="skeleton h-4 rounded" style={{ width: `${Math.random() * 40 + 40}%` }} />
                  </td>
                ))}
                {actions && <td />}
              </tr>
            ))}

            {/* Empty state */}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="px-4 py-12">
                  {empty ?? (
                    <div className="flex flex-col items-center gap-2 text-center text-sm text-on-surface-variant">
                      <svg className="h-8 w-8 opacity-40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      <p>ไม่พบข้อมูล</p>
                    </div>
                  )}
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!loading && sortedData.map((row, rowIdx) => {
              const rowId = getRowId(row);
              const isSelected = selected.has(rowId);
              return (
                <tr
                  key={rowId}
                  className={cn(
                    'border-b border-outline-variant/5 transition-colors',
                    rowIdx % 2 === 1 ? 'bg-surface-container-low/30' : '',
                    isSelected ? 'bg-primary-container/10' : 'hover:bg-surface-container/50',
                    onRowClick && 'cursor-pointer',
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onChange={() => toggleOne(rowId)} />
                    </td>
                  )}
                  {columns.map((col) => {
                    const alignClass = {
                      left: 'text-left',
                      right: 'text-right',
                      center: 'text-center',
                    }[col.align ?? 'left'];
                    return (
                      <td key={col.key} className={cn('px-4 py-3 text-on-surface-variant', alignClass)}>
                        {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </td>
                    );
                  })}
                  {actions && actions.length > 0 && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {actions.map((action, idx) => (
                          <button
                            key={idx}
                            onClick={() => action.onClick(row)}
                            disabled={action.disabled}
                            title={action.label}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                              action.variant === 'primary'
                                ? 'border-primary/20 bg-primary-container/10 text-primary hover:bg-primary-container/20'
                                : action.variant === 'danger'
                                ? 'border-error-container/30 bg-error-container/10 text-error hover:bg-error-container/20'
                                : 'border-outline bg-surface-container-lowest text-on-surface hover:bg-surface-container',
                              action.disabled && 'opacity-40 cursor-not-allowed',
                            )}
                          >
                            {action.icon}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-outline-variant px-4 py-3">
          <span className="text-xs text-on-surface-variant">
            หน้า {pagination.page} จาก {totalPages} &middot; {pagination.total} รายการ
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
            >
              ← ก่อนหน้า
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
            >
              ถัดไป →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
