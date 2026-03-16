'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { updateBillingItemSchema } from '@/modules/billing/types';

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { name: string; message: string; code: string; statusCode?: number };
};

type BillingRecord = {
  id: string;
  roomId: string;
  year: number;
  month: number;
  status: string;
  subtotal: number;
  totalAmount: number;
  room?: { id: string; roomNumber: string; floorId: string };
  items?: BillingItem[];
  createdAt: string;
  updatedAt: string;
};

type BillingItem = {
  id: string;
  billingRecordId: string;
  typeCode: string;
  typeName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  createdAt: string;
  updatedAt: string;
};

type BillingRecordsList = {
  data: BillingRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ImportPreview = {
  rows: Array<{
    roomNumber: string;
    year: number;
    month: number;
    typeCode: string;
    quantity: number;
    unitPrice: number;
    description?: string;
  }>;
  preview: Array<{ roomNumber: string; year: number; month: number; total: number; count: number }>;
  warnings: Array<{
    roomNumber: string;
    year: number;
    month: number;
    expectedTotal: number;
    calculatedTotal: number;
    difference: number;
  }>;
};

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(amount);
}

function statusTone(status: string): string {
  if (status === 'INVOICED') return 'admin-status-good';
  if (status === 'LOCKED') return 'admin-status-warn';
  return '';
}

export default function BillingManager() {
  const [file, setFile] = useState<File | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [records, setRecords] = useState<BillingRecordsList | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoadingRecords(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/import/list', { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<BillingRecordsList>;
      if (!json.success) throw new Error(json.error?.message || 'Failed to load records');
      setRecords(json.data || null);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to load records');
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  const fetchRecord = useCallback(async (id: string) => {
    setRecordLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing/${id}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<BillingRecord>;
      if (!json.success) throw new Error(json.error?.message || 'Failed to load record');
      setSelectedRecord(json.data || null);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to load record');
    } finally {
      setRecordLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const resetFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreview(null);
    setMessage(null);
    setError(null);
    setFile(e.target.files?.[0] || null);
  };

  const onPreview = async () => {
    if (!file) return;
    setIsPreviewing(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/billing/import/preview', { method: 'POST', body: form });
      const json = (await res.json()) as ApiResponse<ImportPreview>;
      if (!json.success) throw new Error(json.error?.message || 'Failed to preview');
      setPreview(json.data || null);
      setMessage('Preview loaded successfully');
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to preview');
    } finally {
      setIsPreviewing(false);
    }
  };

  const onImport = async () => {
    if (!file) return;
    setIsImporting(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/billing/import/execute', { method: 'POST', body: form });
      const json = (await res.json()) as ApiResponse<{ created: Array<{ billingRecordId: string }> }>;
      if (!json.success) throw new Error(json.error?.message || 'Import failed');
      setMessage(`Import complete: ${json.data?.created.length ?? 0} record(s) created`);
      setPreview(null);
      resetFile();
      await fetchRecords();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="admin-card cute-surface">
          <div className="admin-card-header">
            <div>
              <div className="admin-card-title">Excel Import</div>
              <div className="mt-1 text-sm text-slate-500">Monthly billing import and validation workspace</div>
            </div>
            <span className="admin-badge">Input</span>
          </div>
          <div className="space-y-4 p-4">
            <div className="rounded-[1.5rem] border border-dashed border-indigo-200 bg-indigo-50/50 p-4">
              <label className="block text-sm font-medium text-slate-700">Billing workbook</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={onFileChange}
                className="mt-3 block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border file:border-indigo-200 file:bg-white file:px-4 file:py-2.5 file:text-sm file:font-medium"
              />
              <p className="mt-2 text-xs text-slate-500">Supported formats: `.xlsx`, `.xls`</p>
            </div>

            <div className="admin-toolbar">
              <button onClick={onPreview} disabled={!file || isPreviewing} className="admin-button">
                {isPreviewing ? 'Previewing...' : 'Preview'}
              </button>
              <button
                onClick={onImport}
                disabled={!file || isImporting}
                className="admin-button admin-button-primary"
              >
                {isImporting ? 'Importing...' : 'Execute Import'}
              </button>
              <a href="/billing-import-template.xlsx" target="_blank" rel="noreferrer" className="admin-button">
                Excel Template
              </a>
              <a href="/billing-import-template.md" target="_blank" rel="noreferrer" className="admin-button">
                Format Guide
              </a>
            </div>

            {message ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
            {error ? <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Imported records</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{records?.total ?? 0}</div>
              </div>
              <div className="rounded-3xl border border-sky-100 bg-sky-50/70 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Preview groups</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{preview?.preview.length ?? 0}</div>
              </div>
              <div className="rounded-3xl border border-amber-100 bg-amber-50/70 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Total warnings</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{preview?.warnings.length ?? 0}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="admin-card cute-surface">
          <div className="admin-card-header">
            <div>
              <div className="admin-card-title">Preview Summary</div>
              <div className="mt-1 text-sm text-slate-500">Check room-month totals before import</div>
            </div>
            <span className="admin-badge">{preview?.preview.length ?? 0} groups</span>
          </div>
          <div className="overflow-auto p-0">
            {!preview ? (
              <div className="p-6 text-sm text-slate-500">Upload a workbook and run preview to inspect grouped billing totals.</div>
            ) : preview.warnings.length ? (
              <div className="space-y-4 p-4">
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Some rows have a `TotalAmount` that does not match the calculated sum from billing columns. Review these before importing.
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Year</th>
                      <th>Month</th>
                      <th>Declared Total</th>
                      <th>Calculated Total</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.warnings.map((warning) => (
                      <tr key={`${warning.roomNumber}:${warning.year}:${warning.month}`}>
                        <td>{warning.roomNumber}</td>
                        <td>{warning.year}</td>
                        <td>{warning.month}</td>
                        <td>{money(warning.expectedTotal)}</td>
                        <td>{money(warning.calculatedTotal)}</td>
                        <td className="font-semibold text-amber-700">{money(warning.difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Year</th>
                    <th>Month</th>
                    <th>Items</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((group) => (
                    <tr key={`${group.roomNumber}:${group.year}:${group.month}`}>
                      <td>{group.roomNumber}</td>
                      <td>{group.year}</td>
                      <td>{group.month}</td>
                      <td>{group.count}</td>
                      <td>{money(group.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section className="admin-card cute-surface">
        <div className="admin-card-header">
          <div>
            <div className="admin-card-title">Billing Records</div>
            <div className="mt-1 text-sm text-slate-500">Imported room-month records ready for review and invoice generation</div>
          </div>
          <button onClick={() => void fetchRecords()} className="admin-button">Refresh</button>
        </div>

        <div className="overflow-auto">
          {loadingRecords ? (
            <div className="p-6 text-sm text-slate-500">Loading billing records...</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Year</th>
                  <th>Month</th>
                  <th>Status</th>
                  <th>Subtotal</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(records?.data || []).map((record) => (
                  <tr key={record.id}>
                    <td>{record.room?.roomNumber || '-'}</td>
                    <td>{record.year}</td>
                    <td>{record.month}</td>
                    <td>
                      <span className={`admin-badge ${statusTone(record.status)}`}>{record.status}</span>
                    </td>
                    <td>{money(record.subtotal ?? 0)}</td>
                    <td>{new Date(record.updatedAt).toLocaleString()}</td>
                    <td>
                      <button onClick={() => void fetchRecord(record.id)} className="admin-button admin-button-primary">
                        View / Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {!records?.data?.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">No billing records available.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <RecordDetail
        record={selectedRecord}
        loading={recordLoading}
        onClose={() => setSelectedRecord(null)}
        onSaved={async () => {
          if (selectedRecord) await fetchRecord(selectedRecord.id);
          await fetchRecords();
        }}
      />
    </div>
  );
}

function RecordDetail({
  record,
  loading,
  onClose,
  onSaved,
}: {
  record: BillingRecord | null;
  loading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  if (!record) return null;

  return (
    <section className="admin-card cute-surface">
      <div className="admin-card-header">
        <div>
          <div className="admin-card-title">Billing Record Detail</div>
          <div className="mt-1 text-sm text-slate-500">
            {record.year}-{String(record.month).padStart(2, '0')} • Room {record.room?.roomNumber || '-'}
          </div>
        </div>
        <button onClick={onClose} className="admin-button">Close</button>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="text-sm text-slate-500">Loading record...</div>
        ) : (
          <ItemsTable items={record.items || []} onSaved={onSaved} />
        )}
      </div>
    </section>
  );
}

function ItemsTable({ items, onSaved }: { items: BillingItem[]; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<Record<string, { description?: string; quantity?: string; unitPrice?: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const startEdit = (item: BillingItem) => {
    setEditing((state) => ({ ...state, [item.id]: true }));
    setForm((state) => ({
      ...state,
      [item.id]: {
        description: item.description ?? '',
        quantity: item.quantity.toFixed(2),
        unitPrice: item.unitPrice.toFixed(2),
      },
    }));
    setError(null);
  };

  const cancelEdit = (id: string) => {
    setEditing((state) => ({ ...state, [id]: false }));
    setError(null);
  };

  const save = async (item: BillingItem) => {
    const raw = form[item.id] || {};
    try {
      const parsed = updateBillingItemSchema.parse({
        description: raw.description !== undefined ? raw.description : item.description ?? undefined,
        quantity: raw.quantity !== undefined ? Number(raw.quantity) : item.quantity,
        unitPrice: raw.unitPrice !== undefined ? Number(raw.unitPrice) : item.unitPrice,
      });

      setSaving((state) => ({ ...state, [item.id]: true }));
      setError(null);
      const res = await fetch(`/api/billing/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const json = (await res.json()) as ApiResponse<BillingItem>;
      if (!json.success) throw new Error(json.error?.message || 'Failed to update item');
      setEditing((state) => ({ ...state, [item.id]: false }));
      await onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to update item');
    } finally {
      setSaving((state) => ({ ...state, [item.id]: false }));
    }
  };

  return (
    <div className="overflow-auto">
      {error ? <div className="mb-3 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isEditing = !!editing[item.id];
            const values = form[item.id] || {};
            const quantity = isEditing ? values.quantity ?? item.quantity.toFixed(2) : item.quantity.toFixed(2);
            const unitPrice = isEditing ? values.unitPrice ?? item.unitPrice.toFixed(2) : item.unitPrice.toFixed(2);
            const total = (Number(quantity) * Number(unitPrice)).toFixed(2);

            return (
              <tr key={item.id}>
                <td>{item.typeCode}</td>
                <td>
                  {isEditing ? (
                    <input
                      value={values.description ?? item.description ?? ''}
                      onChange={(e) =>
                        setForm((state) => ({
                          ...state,
                          [item.id]: { ...state[item.id], description: e.target.value },
                        }))
                      }
                      className="admin-input"
                    />
                  ) : (
                    item.description || '-'
                  )}
                </td>
                <td className="w-36">
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={quantity}
                      onChange={(e) =>
                        setForm((state) => ({
                          ...state,
                          [item.id]: { ...state[item.id], quantity: e.target.value },
                        }))
                      }
                      className="admin-input"
                    />
                  ) : (
                    quantity
                  )}
                </td>
                <td className="w-40">
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={unitPrice}
                      onChange={(e) =>
                        setForm((state) => ({
                          ...state,
                          [item.id]: { ...state[item.id], unitPrice: e.target.value },
                        }))
                      }
                      className="admin-input"
                    />
                  ) : (
                    money(Number(unitPrice))
                  )}
                </td>
                <td>{money(Number(total))}</td>
                <td>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => void save(item)}
                        disabled={saving[item.id]}
                        className="admin-button admin-button-primary"
                      >
                        {saving[item.id] ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => cancelEdit(item.id)} className="admin-button">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(item)} className="admin-button">Edit</button>
                  )}
                </td>
              </tr>
            );
          })}
          {!items.length ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No billing items in this record.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
