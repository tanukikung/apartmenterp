'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Pencil,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

type ValidationIssue = {
  field?: string;
  message?: string;
  code?: string;
};

type BatchRow = {
  id: string;
  rowNo: number;
  sourceSheet: string | null;
  sourceRow: number | null;
  roomNumber: string;
  tenantName: string | null;
  rentAmount: number | null;
  waterAmount: number | null;
  electricAmount: number | null;
  furnitureAmount: number | null;
  otherAmount: number | null;
  totalAmount: number | null;
  note: string | null;
  validationStatus: 'VALID' | 'WARNING' | 'ERROR';
  validationErrors: ValidationIssue[];
  matchedRoom: {
    id: string;
    roomNumber: string;
  } | null;
  matchedContract: {
    id: string;
    primaryTenantName: string | null;
  } | null;
  importedBillingRecordId: string | null;
  parsedJson: unknown;
};

type BatchDetail = {
  id: string;
  uploadedFileId?: string | null;
  sourceFilename: string;
  templateVersion: string | null;
  status: 'UPLOADED' | 'VALIDATED' | 'IMPORTED' | 'FAILED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  createdAt: string;
  importedAt: string | null;
  billingCycle: {
    id: string;
    year: number;
    month: number;
    status: string;
    building: {
      id: string;
      name: string;
    } | null;
  } | null;
  rows: BatchRow[];
};

type RowEditForm = {
  roomNumber: string;
  rentAmount: string;
  waterAmount: string;
  electricAmount: string;
  furnitureAmount: string;
  otherAmount: string;
  totalAmount: string;
  note: string;
};

function money(value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(status: BatchDetail['status']) {
  if (status === 'IMPORTED') return 'admin-badge admin-status-good';
  if (status === 'FAILED') return 'admin-badge admin-status-bad';
  if (status === 'VALIDATED') return 'admin-badge admin-status-warn';
  return 'admin-badge';
}

function rowBadge(status: BatchRow['validationStatus']) {
  if (status === 'VALID') return 'admin-badge admin-status-good';
  if (status === 'ERROR') return 'admin-badge admin-status-bad';
  return 'admin-badge admin-status-warn';
}

function toInputValue(value: number | null) {
  return value == null ? '' : String(value);
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function BillingBatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<BatchRow | null>(null);
  const [editForm, setEditForm] = useState<RowEditForm | null>(null);
  const [savingRow, setSavingRow] = useState(false);
  const [executing, setExecuting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/billing/import/batches/${batchId}`, {
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to load import batch');
      }
      setBatch(json.data as BatchDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load import batch');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    if (!batch) return { totalAmount: 0, mappedRooms: 0, linkedRecords: 0 };
    return {
      totalAmount: batch.rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0),
      mappedRooms: batch.rows.filter((row) => row.matchedRoom).length,
      linkedRecords: batch.rows.filter((row) => row.importedBillingRecordId).length,
    };
  }, [batch]);

  function openEditor(row: BatchRow) {
    setEditingRow(row);
    setEditForm({
      roomNumber: row.roomNumber,
      rentAmount: toInputValue(row.rentAmount),
      waterAmount: toInputValue(row.waterAmount),
      electricAmount: toInputValue(row.electricAmount),
      furnitureAmount: toInputValue(row.furnitureAmount),
      otherAmount: toInputValue(row.otherAmount),
      totalAmount: toInputValue(row.totalAmount),
      note: row.note ?? '',
    });
  }

  async function saveRow() {
    if (!editingRow || !editForm) return;

    setSavingRow(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/billing/import/batches/${batchId}/rows/${editingRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber: editForm.roomNumber,
          rentAmount: parseOptionalNumber(editForm.rentAmount),
          waterAmount: parseOptionalNumber(editForm.waterAmount),
          electricAmount: parseOptionalNumber(editForm.electricAmount),
          furnitureAmount: parseOptionalNumber(editForm.furnitureAmount),
          otherAmount: parseOptionalNumber(editForm.otherAmount),
          totalAmount: parseOptionalNumber(editForm.totalAmount),
          note: editForm.note.trim() || null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to update batch row');
      }

      setMessage(`Row ${editingRow.rowNo} updated and revalidated.`);
      setEditingRow(null);
      setEditForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update batch row');
    } finally {
      setSavingRow(false);
    }
  }

  async function executeBatch() {
    if (!batch) return;

    setExecuting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/billing/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to execute batch');
      }

      setMessage(`Batch imported successfully. ${json.data?.totalImported ?? 0} billing records created.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute batch');
    } finally {
      setExecuting(false);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-4">
          <Link href="/admin/billing/batches" className="admin-button flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="admin-page-title">Batch Detail</h1>
            <p className="admin-page-subtitle">
              Review staged rows, correct mismatches in place, and commit the batch when everything is clean.
            </p>
          </div>
        </div>
        <div className="admin-toolbar">
          {batch?.uploadedFileId ? (
            <Link href={`/admin/billing/batches/${batchId}/office`} className="admin-button">
              Open In ONLYOFFICE
            </Link>
          ) : null}
          {batch && batch.status !== 'IMPORTED' ? (
            <button
              onClick={() => void executeBatch()}
              className="admin-button admin-button-primary"
              disabled={executing || batch.invalidRows > 0 || batch.warningRows > 0}
            >
              {executing ? 'Importing...' : 'Commit Batch'}
            </button>
          ) : null}
          <button onClick={() => void load()} className="admin-button flex items-center gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {message ? (
        <div className="auth-alert auth-alert-success flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading batch detail...
        </div>
      ) : !batch ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileSpreadsheet className="h-10 w-10 text-slate-300" />
          <div className="font-semibold text-slate-700">Batch not found</div>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="admin-kpi">
              <div className="admin-kpi-label">Filename</div>
              <div className="mt-2 text-sm font-medium text-slate-700">{batch.sourceFilename}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Status</div>
              <div className="mt-2">
                <span className={statusBadge(batch.status)}>{batch.status}</span>
              </div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Rows</div>
              <div className="admin-kpi-value">{batch.totalRows}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Mapped Rooms</div>
              <div className="admin-kpi-value">{totals.mappedRooms}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Batch Total</div>
              <div className="admin-kpi-value">{money(totals.totalAmount)}</div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="admin-card overflow-hidden">
              <div className="admin-card-header">
                <div className="admin-card-title">Staged Rows</div>
                <span className="admin-badge">
                  {batch.warningRows} warning / {batch.invalidRows} error
                </span>
              </div>
              <div className="overflow-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Room</th>
                      <th>Tenant</th>
                      <th>Total</th>
                      <th>Match</th>
                      <th>Status</th>
                      <th>Issue</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="text-slate-500">{row.rowNo}</td>
                        <td className="font-semibold text-slate-800">{row.roomNumber}</td>
                        <td>{row.tenantName ?? '—'}</td>
                        <td>{money(row.totalAmount)}</td>
                        <td>
                          {row.matchedRoom ? (
                            <div className="text-sm text-slate-700">
                              <div className="font-medium">{row.matchedRoom.roomNumber}</div>
                              <div className="text-xs text-slate-400">
                                {row.matchedContract?.primaryTenantName ?? 'No active contract'}
                              </div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span className={rowBadge(row.validationStatus)}>{row.validationStatus}</span>
                        </td>
                        <td className="text-sm text-slate-600">
                          {row.validationErrors[0]?.message ?? '—'}
                        </td>
                        <td>
                          {batch.status !== 'IMPORTED' ? (
                            <button type="button" onClick={() => openEditor(row)} className="admin-button text-xs">
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <section className="admin-card p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Cycle
                </div>
                <div className="mt-3 text-lg font-semibold text-slate-900">
                  {batch.billingCycle ? `${String(batch.billingCycle.month).padStart(2, '0')}/${batch.billingCycle.year}` : '—'}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {batch.billingCycle?.building?.name ?? 'Main building'}
                </div>
                {batch.billingCycle ? (
                  <Link href={`/admin/billing/${batch.billingCycle.id}`} className="admin-button mt-4 w-full justify-center">
                    Open Billing Cycle
                  </Link>
                ) : null}
                {batch.uploadedFileId ? (
                  <Link href={`/admin/billing/batches/${batch.id}/office`} className="admin-button mt-3 w-full justify-center">
                    Open Workbook In ONLYOFFICE
                  </Link>
                ) : null}
              </section>

              <section className="admin-card p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Audit
                </div>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <div>
                    <div className="text-xs text-slate-400">Created</div>
                    <div className="font-medium text-slate-800">{dateTime(batch.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Imported</div>
                    <div className="font-medium text-slate-800">{dateTime(batch.importedAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Linked billing records</div>
                    <div className="font-medium text-slate-800">{totals.linkedRecords}</div>
                  </div>
                </div>
              </section>

              <section className="admin-card p-5">
                <div className="mb-3 flex items-center gap-2 text-slate-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold">Ready rows</span>
                </div>
                <p className="text-sm text-slate-500">
                  Rows marked `VALID` are safe to commit. Rows marked `WARNING` or `ERROR` can now be corrected directly from this screen and revalidated immediately.
                </p>
              </section>

              {batch.warningRows > 0 || batch.invalidRows > 0 ? (
                <section className="admin-card p-5">
                  <div className="mb-3 flex items-center gap-2 text-slate-800">
                    {batch.invalidRows > 0 ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <TriangleAlert className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="font-semibold">Review required</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    This batch contains {batch.warningRows} warning row{batch.warningRows === 1 ? '' : 's'} and {batch.invalidRows} blocking error row{batch.invalidRows === 1 ? '' : 's'}.
                  </p>
                </section>
              ) : null}
            </div>
          </section>

          {editingRow && editForm ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
              <div className="w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Edit staged row</h2>
                    <p className="text-sm text-slate-500">
                      Row {editingRow.rowNo} can be corrected and revalidated without re-uploading the workbook.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRow(null);
                      setEditForm(null);
                    }}
                    className="admin-button"
                  >
                    Close
                  </button>
                </div>

                <div className="grid gap-4 p-6 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Room Number</span>
                    <input
                      className="admin-input"
                      value={editForm.roomNumber}
                      onChange={(event) => setEditForm((current) => current ? { ...current, roomNumber: event.target.value } : current)}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Declared Total</span>
                    <input
                      className="admin-input"
                      value={editForm.totalAmount}
                      onChange={(event) => setEditForm((current) => current ? { ...current, totalAmount: event.target.value } : current)}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Rent</span>
                    <input
                      className="admin-input"
                      value={editForm.rentAmount}
                      onChange={(event) => setEditForm((current) => current ? { ...current, rentAmount: event.target.value } : current)}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Water</span>
                    <input
                      className="admin-input"
                      value={editForm.waterAmount}
                      onChange={(event) => setEditForm((current) => current ? { ...current, waterAmount: event.target.value } : current)}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Electric</span>
                    <input
                      className="admin-input"
                      value={editForm.electricAmount}
                      onChange={(event) => setEditForm((current) => current ? { ...current, electricAmount: event.target.value } : current)}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Furniture</span>
                    <input
                      className="admin-input"
                      value={editForm.furnitureAmount}
                      onChange={(event) => setEditForm((current) => current ? { ...current, furnitureAmount: event.target.value } : current)}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">Other</span>
                    <input
                      className="admin-input"
                      value={editForm.otherAmount}
                      onChange={(event) => setEditForm((current) => current ? { ...current, otherAmount: event.target.value } : current)}
                    />
                  </label>
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Note</span>
                    <textarea
                      className="admin-textarea"
                      rows={3}
                      value={editForm.note}
                      onChange={(event) => setEditForm((current) => current ? { ...current, note: event.target.value } : current)}
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRow(null);
                      setEditForm(null);
                    }}
                    className="admin-button"
                    disabled={savingRow}
                  >
                    Cancel
                  </button>
                  <button type="button" onClick={() => void saveRow()} className="admin-button admin-button-primary" disabled={savingRow}>
                    {savingRow ? 'Saving...' : 'Save and Revalidate'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
