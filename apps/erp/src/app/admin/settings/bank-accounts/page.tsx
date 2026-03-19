'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Edit2,
  PlusCircle,
  Trash2,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BankAccount = {
  id: string;
  name: string;
  bankName: string;
  bankAccountNo: string;
  promptpay: string | null;
  active: boolean;
};

type CreateForm = {
  id: string;
  name: string;
  bankName: string;
  bankAccountNo: string;
  promptpay: string;
  active: boolean;
};

const EMPTY_FORM: CreateForm = {
  id: '',
  name: '',
  bankName: '',
  bankAccountNo: '',
  promptpay: '',
  active: true,
};

// ---------------------------------------------------------------------------
// Bank color helpers
// ---------------------------------------------------------------------------

const BANK_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  กสิกรไทย:    { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500'  },
  kbank:       { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500'  },
  กรุงเทพ:    { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'     },
  bbl:         { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'     },
  ไทยพาณิชย์: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-500'   },
  scb:         { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-500'   },
  กรุงไทย:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500'     },
  ktb:         { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500'     },
  tmbthanachart: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200',  dot: 'bg-orange-500'   },
  ttb:         { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-500'   },
};

function getBankColor(bankName: string) {
  const key = bankName.toLowerCase().replace(/\s/g, '');
  for (const [k, v] of Object.entries(BANK_COLORS)) {
    if (key.includes(k.toLowerCase())) return v;
  }
  return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl border ${color} bg-white p-5 shadow-sm`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums text-slate-900">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded-lg bg-slate-100" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/bank-accounts', { cache: 'no-store' });
      const json = (await res.json()) as { success: boolean; data?: BankAccount[]; error?: { message?: string } };
      if (!json.success || !json.data) throw new Error(json.error?.message ?? 'Failed to load bank accounts');
      setAccounts(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function flashMessage(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }

  function startEdit(account: BankAccount) {
    setEditId(account.id);
    setForm({
      id: account.id,
      name: account.name,
      bankName: account.bankName,
      bankAccountNo: account.bankAccountNo,
      promptpay: account.promptpay ?? '',
      active: account.active,
    });
    setDeleteConfirmId(null);
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    if (!form.id || !form.name || !form.bankName || !form.bankAccountNo) {
      setError('Please fill in all required fields (ID, Name, Bank, Account No).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          bankName: form.bankName,
          bankAccountNo: form.bankAccountNo,
          promptpay: form.promptpay || null,
          active: form.active,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'Failed to create bank account');
      setForm(EMPTY_FORM);
      flashMessage('Bank account created successfully.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bank account');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  async function handleUpdate() {
    if (!editId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/bank-accounts/${encodeURIComponent(editId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          bankName: form.bankName,
          bankAccountNo: form.bankAccountNo,
          promptpay: form.promptpay || null,
          active: form.active,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'Failed to update bank account');
      cancelEdit();
      flashMessage('Bank account updated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bank account');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete (soft)
  // ---------------------------------------------------------------------------

  async function handleDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/bank-accounts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'Failed to deactivate bank account');
      setDeleteConfirmId(null);
      flashMessage('Bank account deactivated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate bank account');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter((a) => a.active).length;
  const isEditing = editId !== null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="admin-page-title">Bank Accounts</h1>
            <p className="admin-page-subtitle">
              Manage payment destination accounts used in invoices and receipts.
            </p>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {message && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="Total Accounts"
          value={totalAccounts}
          icon={<Banknote className="h-5 w-5 text-indigo-600" />}
          color="border-indigo-100"
        />
        <KpiCard
          label="Active Accounts"
          value={activeAccounts}
          icon={<CreditCard className="h-5 w-5 text-emerald-600" />}
          color="border-emerald-100"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Left: Table */}
        <div className="admin-card xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">All Bank Accounts</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {totalAccounts} total
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="admin-table w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Bank</th>
                  <th className="px-4 py-3 text-left">Account No</th>
                  <th className="px-4 py-3 text-left">PromptPay</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      No bank accounts yet. Add one using the form.
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => {
                    const colors = getBankColor(account.bankName);
                    return (
                      <tr key={account.id} className={editId === account.id ? 'bg-indigo-50/60' : undefined}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.dot}`} />
                            <div>
                              <div className="font-medium text-slate-900">{account.name}</div>
                              <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
                                {account.bankName}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-700 tabular-nums">
                          {account.bankAccountNo}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {account.promptpay ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {account.active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {deleteConfirmId === account.id ? (
                              <>
                                <span className="mr-2 text-xs text-slate-500">Deactivate?</span>
                                <button
                                  onClick={() => void handleDelete(account.id)}
                                  disabled={saving}
                                  className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                                >
                                  No
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(account)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                                  title="Edit"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                {account.active && (
                                  <button
                                    onClick={() => {
                                      setDeleteConfirmId(account.id);
                                      setEditId(null);
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                    title="Deactivate"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Add / Edit form */}
        <div className="admin-card xl:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
              {isEditing ? (
                <Edit2 className="h-4 w-4 text-indigo-600" />
              ) : (
                <PlusCircle className="h-4 w-4 text-indigo-600" />
              )}
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              {isEditing ? `Edit: ${editId}` : 'Add Bank Account'}
            </h2>
          </div>

          <div className="space-y-4">
            {!isEditing && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Account ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="admin-input w-full font-mono"
                  placeholder="e.g. ACC_KBANK_01"
                  value={form.id}
                  onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
                />
                <p className="mt-1 text-xs text-slate-400">Unique identifier. Cannot be changed after creation.</p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="admin-input w-full"
                placeholder="e.g. KBank Main Account"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Bank Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="admin-input w-full"
                placeholder="e.g. กสิกรไทย"
                list="bank-suggestions"
                value={form.bankName}
                onChange={(e) => setForm((prev) => ({ ...prev, bankName: e.target.value }))}
              />
              <datalist id="bank-suggestions">
                {['กสิกรไทย', 'กรุงเทพ', 'ไทยพาณิชย์', 'กรุงไทย', 'TMBThanachart', 'กรุงศรีอยุธยา', 'ออมสิน', 'ทหารไทย'].map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              {form.bankName && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${getBankColor(form.bankName).dot}`} />
                  <span className={`text-xs font-medium ${getBankColor(form.bankName).text}`}>
                    {form.bankName}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Account Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="admin-input w-full font-mono tracking-wider"
                placeholder="xxx-x-xxxxx-x"
                value={form.bankAccountNo}
                onChange={(e) => setForm((prev) => ({ ...prev, bankAccountNo: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                PromptPay Number <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                className="admin-input w-full font-mono"
                placeholder="0XX-XXX-XXXX or Tax ID"
                value={form.promptpay}
                onChange={(e) => setForm((prev) => ({ ...prev, promptpay: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                id="active-toggle"
                checked={form.active}
                onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <label htmlFor="active-toggle" className="text-sm font-medium text-slate-700">
                Active (available for use in invoices)
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              {isEditing ? (
                <>
                  <button
                    onClick={() => void handleUpdate()}
                    disabled={saving}
                    className="admin-button admin-button-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="admin-button flex items-center justify-center gap-2"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void handleCreate()}
                  disabled={saving}
                  className="admin-button admin-button-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
                >
                  <PlusCircle className="h-4 w-4" />
                  {saving ? 'Creating...' : 'Add Bank Account'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
