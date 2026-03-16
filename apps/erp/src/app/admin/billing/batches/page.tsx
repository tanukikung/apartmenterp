'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BatchStatus = 'UPLOADED' | 'VALIDATED' | 'IMPORTED' | 'FAILED';

interface ImportBatch {
  id: string;
  sourceFilename: string;
  createdAt: string;
  status: BatchStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedAt?: string | null;
  billingCycle?: {
    id: string;
    year: number;
    month: number;
  } | null;
}

interface ImportRow {
  id: string;
  rowNo: number;
  roomNumber: string;
  tenantName?: string | null;
  totalAmount: number;
  validationStatus: 'VALID' | 'ERROR' | 'SKIPPED';
  errorMessage?: string | null;
  validationErrorsJson?: unknown;
}

// ---------------------------------------------------------------------------
// Demo data (shown when API unavailable)
// ---------------------------------------------------------------------------

const DEMO_BATCHES: ImportBatch[] = [
  {
    id: 'demo-batch-001',
    sourceFilename: 'billing_march_2026.xlsx',
    createdAt: '2026-03-15T08:30:00Z',
    status: 'IMPORTED',
    totalRows: 120,
    validRows: 118,
    invalidRows: 2,
    importedAt: '2026-03-15T08:32:00Z',
    billingCycle: { id: 'demo-cycle-001', year: 2026, month: 3 },
  },
  {
    id: 'demo-batch-002',
    sourceFilename: 'billing_feb_2026.xlsx',
    createdAt: '2026-02-14T09:00:00Z',
    status: 'IMPORTED',
    totalRows: 118,
    validRows: 118,
    invalidRows: 0,
    importedAt: '2026-02-14T09:03:00Z',
    billingCycle: { id: 'demo-cycle-002', year: 2026, month: 2 },
  },
  {
    id: 'demo-batch-003',
    sourceFilename: 'billing_jan_corrupted.xlsx',
    createdAt: '2026-01-10T11:00:00Z',
    status: 'FAILED',
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    billingCycle: null,
  },
];

const DEMO_ROWS: ImportRow[] = [
  { id: 'r1', rowNo: 1, roomNumber: '101', tenantName: 'สมชาย ใจดี', totalAmount: 5500, validationStatus: 'VALID' },
  { id: 'r2', rowNo: 2, roomNumber: '102', tenantName: 'สมหญิง รักเรียน', totalAmount: 6200, validationStatus: 'VALID' },
  { id: 'r3', rowNo: 3, roomNumber: '999', tenantName: null, totalAmount: 4000, validationStatus: 'ERROR', errorMessage: 'Room 999 not found' },
  { id: 'r4', rowNo: 4, roomNumber: '201', tenantName: 'มานะ พากเพียร', totalAmount: 5800, validationStatus: 'VALID' },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function cycleName(cycle?: ImportBatch['billingCycle'] | null) {
  if (!cycle) return '—';
  const m = THAI_MONTHS_SHORT[cycle.month - 1] ?? String(cycle.month);
  return `${m} ${cycle.year}`;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: BatchStatus }) {
  const cfg: Record<BatchStatus, { cls: string; label: string }> = {
    UPLOADED: { cls: 'bg-blue-100 text-blue-700', label: 'Uploaded' },
    VALIDATED: { cls: 'bg-amber-100 text-amber-700', label: 'Validated' },
    IMPORTED: { cls: 'bg-green-100 text-green-700', label: 'Imported' },
    FAILED: { cls: 'bg-red-100 text-red-700', label: 'Failed' },
  };
  const { cls, label } = cfg[status] ?? { cls: 'bg-gray-100 text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function RowStatusBadge({ status }: { status: ImportRow['validationStatus'] }) {
  if (status === 'VALID') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <CheckCircle className="w-3 h-3" /> Valid
    </span>
  );
  if (status === 'ERROR') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> Error
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      Skipped
    </span>
  );
}

// ---------------------------------------------------------------------------
// Batch detail modal
// ---------------------------------------------------------------------------

interface BatchDetailModalProps {
  batch: ImportBatch;
  rows: ImportRow[];
  loading: boolean;
  onClose: () => void;
}

function BatchDetailModal({ batch, rows, loading, onClose }: BatchDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-gray-400" />
              {batch.sourceFilename}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
              <StatusBadge status={batch.status} />
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(batch.createdAt)}
              </span>
              {batch.billingCycle && (
                <span className="font-medium text-gray-700">
                  Cycle: {cycleName(batch.billingCycle)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-xs text-gray-500">Total Rows</p>
            <p className="text-xl font-bold text-gray-900">{batch.totalRows}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Valid</p>
            <p className="text-xl font-bold text-green-700">{batch.validRows}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Invalid</p>
            <p className="text-xl font-bold text-red-700">{batch.invalidRows}</p>
          </div>
        </div>

        {/* Rows table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
              <FileSpreadsheet className="h-10 w-10" />
              <p className="text-sm">No rows found for this batch.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Row #', 'Room', 'Tenant Name', 'Amount', 'Status', 'Error'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.validationStatus === 'ERROR' ? 'bg-red-50' : undefined}
                  >
                    <td className="px-4 py-2.5 text-gray-500">{row.rowNo}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{row.roomNumber}</td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {row.tenantName ?? <span className="italic text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {row.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5">
                      <RowStatusBadge status={row.validationStatus} />
                    </td>
                    <td className="px-4 py-2.5 text-red-600 text-xs">
                      {row.errorMessage ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BillingBatchesPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BatchStatus | 'ALL'>('ALL');

  // Modal
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [modalRows, setModalRows] = useState<ImportRow[]>([]);
  const [modalRowsLoading, setModalRowsLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch batches
  // -------------------------------------------------------------------------

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Try two possible endpoints
    const endpoints = ['/api/billing/import/batches', '/api/billing/batches'];

    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        if (!json.success) continue;

        const data = json.data;
        // Normalise: data may be an array or { batches: [...] }
        const list: ImportBatch[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.batches)
          ? data.batches
          : Array.isArray(data?.items)
          ? data.items
          : [];

        setBatches(list);
        setUsingDemo(false);
        setLoading(false);
        return;
      } catch {
        // try next endpoint
      }
    }

    // Graceful fallback: show demo data
    setBatches(DEMO_BATCHES);
    setUsingDemo(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // -------------------------------------------------------------------------
  // Fetch batch detail rows
  // -------------------------------------------------------------------------

  const fetchBatchRows = useCallback(async (batchId: string) => {
    setModalRowsLoading(true);
    setModalRows([]);

    const endpoints = [
      `/api/billing/import/batches/${batchId}/rows`,
      `/api/billing/batches/${batchId}/rows`,
      `/api/billing/batches/${batchId}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        if (!json.success) continue;

        const data = json.data;
        const rows: ImportRow[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data?.items)
          ? data.items
          : [];

        setModalRows(rows);
        setModalRowsLoading(false);
        return;
      } catch {
        // try next
      }
    }

    // Demo rows fallback
    if (usingDemo) {
      setModalRows(DEMO_ROWS);
    }
    setModalRowsLoading(false);
  }, [usingDemo]);

  const handleViewDetails = (batch: ImportBatch) => {
    setSelectedBatch(batch);
    fetchBatchRows(batch.id);
  };

  const handleCloseModal = () => {
    setSelectedBatch(null);
    setModalRows([]);
  };

  // -------------------------------------------------------------------------
  // Derived stats
  // -------------------------------------------------------------------------

  const totalRows = batches.reduce((s, b) => s + (b.validRows ?? 0), 0);
  const lastImport = batches
    .filter((b) => b.importedAt)
    .sort((a, b) => (b.importedAt! > a.importedAt! ? 1 : -1))[0];

  // -------------------------------------------------------------------------
  // Filtered list
  // -------------------------------------------------------------------------

  const filtered = batches.filter((b) => {
    const matchSearch =
      search.trim() === '' ||
      b.sourceFilename.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Page header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Import Batches</h1>
          <p className="admin-page-subtitle">
            View and manage all Excel billing import batches and their validation results.
          </p>
        </div>
        <div className="admin-toolbar">
          <a
            href="/admin/billing/import"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            New Import
          </a>
          <button
            onClick={fetchBatches}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      <div className="p-6 space-y-6">
        {/* Demo data notice */}
        {usingDemo && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The batch API endpoint is not available. Showing demo data for preview purposes.
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-6 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Batches</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{batches.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-6 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Rows Imported</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{totalRows.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-6 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Last Import</p>
            <p className="mt-1 text-base font-semibold text-gray-900">
              {lastImport?.importedAt ? formatDate(lastImport.importedAt) : '—'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by filename…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BatchStatus | 'ALL')}
              className="appearance-none rounded-lg border border-gray-300 bg-white pl-3 pr-8 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="VALIDATED">Validated</option>
              <option value="IMPORTED">Imported</option>
              <option value="FAILED">Failed</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <FileSpreadsheet className="h-12 w-12" />
              <p className="text-sm font-medium">No import batches found.</p>
              <a
                href="/admin/billing/import"
                className="text-sm text-blue-600 hover:underline"
              >
                Start your first import
              </a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      'Filename',
                      'Created',
                      'Status',
                      'Total Rows',
                      'Valid',
                      'Invalid',
                      'Billing Cycle',
                      '',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filtered.map((batch) => (
                    <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-green-500 shrink-0" />
                          <span className="font-medium text-gray-900 max-w-[220px] truncate">
                            {batch.sourceFilename}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(batch.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={batch.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{batch.totalRows}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-700">
                        {batch.validRows}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-700">
                        {batch.invalidRows}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {cycleName(batch.billingCycle)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleViewDetails(batch)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Row count */}
        {!loading && filtered.length > 0 && (
          <p className="text-xs text-gray-400 text-right">
            Showing {filtered.length} of {batches.length} batch{batches.length !== 1 ? 'es' : ''}
          </p>
        )}
      </div>

      {/* Modal */}
      {selectedBatch && (
        <BatchDetailModal
          batch={selectedBatch}
          rows={modalRows}
          loading={modalRowsLoading}
          onClose={handleCloseModal}
        />
      )}
    </main>
  );
}
