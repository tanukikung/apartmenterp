'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  Info,
  Pencil,
  Plus,
  QrCode,
  Star,
  Trash2,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BankAccount = {
  id: string;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
  promptpayId: string | null;
  isDefault: boolean;
};

type FormState = {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
  promptpayId: string;
  isDefault: boolean;
};

// ---------------------------------------------------------------------------
// Static fallback data shown when the API is not available
// ---------------------------------------------------------------------------

const DEMO_ACCOUNTS: BankAccount[] = [
  {
    id: 'demo-1',
    bankName: 'Siam Commercial Bank',
    bankCode: 'SCB',
    accountNumber: '***-*-**345-6',
    accountHolder: 'Building Management Co., Ltd.',
    promptpayId: '0812345678',
    isDefault: true,
  },
  {
    id: 'demo-2',
    bankName: 'Kasikorn Bank',
    bankCode: 'KBANK',
    accountNumber: '***-*-**789-0',
    accountHolder: 'Building Management Co., Ltd.',
    promptpayId: null,
    isDefault: false,
  },
];

// ---------------------------------------------------------------------------
// Empty form
// ---------------------------------------------------------------------------

const EMPTY_FORM: FormState = {
  bankName: '',
  bankCode: '',
  accountNumber: '',
  accountHolder: '',
  promptpayId: '',
  isDefault: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bankCodeColor(code: string): string {
  const map: Record<string, string> = {
    SCB: 'bg-purple-100 text-purple-700',
    KBANK: 'bg-emerald-100 text-emerald-700',
    BBL: 'bg-blue-100 text-blue-700',
    KTB: 'bg-sky-100 text-sky-700',
    BAY: 'bg-yellow-100 text-yellow-700',
    TMB: 'bg-indigo-100 text-indigo-700',
  };
  return map[code.toUpperCase()] ?? 'bg-slate-100 text-slate-700';
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsDemo(false);
    try {
      const res = await fetch('/api/settings/bank-accounts').then((r) => r.json());
      if (res.success) {
        setAccounts(res.data as BankAccount[]);
      } else {
        throw new Error(res.error?.message || 'API error');
      }
    } catch {
      // API not available — fall back to demo data
      setAccounts(DEMO_ACCOUNTS);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  function openAddForm() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(account: BankAccount) {
    setEditId(account.id);
    setForm({
      bankName: account.bankName,
      bankCode: account.bankCode,
      accountNumber: account.accountNumber,
      accountHolder: account.accountHolder,
      promptpayId: account.promptpayId ?? '',
      isDefault: account.isDefault,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function field(key: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ---------------------------------------------------------------------------
  // Save (create / update)
  // ---------------------------------------------------------------------------

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (isDemo) {
      setFormError('This is demo data. Configure the bank accounts API to enable editing.');
      return;
    }
    if (!form.bankName.trim() || !form.accountNumber.trim() || !form.accountHolder.trim()) {
      setFormError('Bank name, account number, and account holder are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    setMessage(null);
    try {
      const body = {
        bankName: form.bankName.trim(),
        bankCode: form.bankCode.trim(),
        accountNumber: form.accountNumber.trim(),
        accountHolder: form.accountHolder.trim(),
        promptpayId: form.promptpayId.trim() || null,
        isDefault: form.isDefault,
      };

      let res: { success: boolean; error?: { message?: string }; message?: string };
      if (editId) {
        res = await fetch(`/api/settings/bank-accounts/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      } else {
        res = await fetch('/api/settings/bank-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      }

      if (!res.success) throw new Error(res.error?.message || 'Unable to save');
      setMessage(editId ? 'Bank account updated.' : 'Bank account added.');
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save bank account');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete(id: string) {
    if (isDemo) {
      setError('This is demo data. Configure the bank accounts API to enable deletion.');
      return;
    }
    setDeletingId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/settings/bank-accounts/${id}`, {
        method: 'DELETE',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to delete');
      setMessage('Bank account deleted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete bank account');
    } finally {
      setDeletingId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Bank Accounts</h1>
          <p className="admin-page-subtitle">
            Manage payment collection accounts shown on invoices and PromptPay QR codes.
          </p>
        </div>
        <div className="admin-toolbar">
          <button
            onClick={openAddForm}
            className="admin-button admin-button-primary"
            disabled={showForm}
          >
            <Plus className="h-4 w-4" />
            Add Bank Account
          </button>
        </div>
      </section>

      {/* ── Demo notice ────────────────────────────────────────────────── */}
      {isDemo ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The <code className="font-mono">/api/settings/bank-accounts</code> endpoint is not
            configured. Showing demo accounts below. Add real data via the database seed or by
            implementing the API route.
          </span>
        </div>
      ) : null}

      {/* ── Global alerts ──────────────────────────────────────────────── */}
      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {/* ── Add / Edit inline form ─────────────────────────────────────── */}
      {showForm ? (
        <section className="admin-card cute-surface">
          <div className="admin-card-header">
            <div className="admin-card-title">
              {editId ? 'Edit Bank Account' : 'Add Bank Account'}
            </div>
            <button onClick={closeForm} className="admin-button" aria-label="Close form">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={(e) => void handleSave(e)} className="grid gap-4 p-4 sm:grid-cols-2">
            {formError ? <div className="auth-alert auth-alert-error sm:col-span-2">{formError}</div> : null}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Bank Name <span className="text-red-500">*</span>
              </label>
              <input
                className="admin-input"
                placeholder="e.g. Siam Commercial Bank"
                value={form.bankName}
                onChange={(e) => field('bankName', e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Bank Code
              </label>
              <input
                className="admin-input"
                placeholder="e.g. SCB, KBANK, BBL"
                value={form.bankCode}
                onChange={(e) => field('bankCode', e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Account Number <span className="text-red-500">*</span>
              </label>
              <input
                className="admin-input"
                placeholder="e.g. 123-4-56789-0"
                value={form.accountNumber}
                onChange={(e) => field('accountNumber', e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Account Holder <span className="text-red-500">*</span>
              </label>
              <input
                className="admin-input"
                placeholder="e.g. Company Name Co., Ltd."
                value={form.accountHolder}
                onChange={(e) => field('accountHolder', e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                PromptPay ID{' '}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                className="admin-input"
                placeholder="Phone or national ID"
                value={form.promptpayId}
                onChange={(e) => field('promptpayId', e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <input
                id="isDefault"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={form.isDefault}
                onChange={(e) => field('isDefault', e.target.checked)}
              />
              <label htmlFor="isDefault" className="text-sm font-medium text-slate-700 cursor-pointer">
                Set as default payment account
              </label>
            </div>

            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                className="admin-button admin-button-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : editId ? 'Update Account' : 'Add Account'}
              </button>
              <button type="button" onClick={closeForm} className="admin-button">
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* ── Account cards ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading bank accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="admin-card flex flex-col items-center justify-center gap-3 py-16 text-center">
          <CreditCard className="h-10 w-10 text-slate-300" />
          <p className="text-slate-500 text-sm">No bank accounts configured yet.</p>
          <button onClick={openAddForm} className="admin-button admin-button-primary mt-1">
            <Plus className="h-4 w-4" />
            Add First Account
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className={[
                'admin-card cute-surface relative flex flex-col gap-4 p-5',
                account.isDefault ? 'ring-2 ring-indigo-300' : '',
              ].join(' ')}
            >
              {/* Default badge */}
              {account.isDefault ? (
                <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  <Star className="h-3 w-3 fill-indigo-400 text-indigo-400" />
                  Default
                </span>
              ) : null}

              {/* Bank name + code */}
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 leading-tight">{account.bankName}</div>
                  {account.bankCode ? (
                    <span
                      className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold ${bankCodeColor(account.bankCode)}`}
                    >
                      {account.bankCode}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Account info rows */}
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <CreditCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="font-mono tracking-wide">{account.accountNumber}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Banknote className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>{account.accountHolder}</span>
                </div>
                {account.promptpayId ? (
                  <div className="flex items-center gap-2 text-slate-600">
                    <QrCode className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>PromptPay: {account.promptpayId}</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <QrCode className="h-3.5 w-3.5 shrink-0" />
                    <span>No PromptPay ID</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1 border-t border-slate-100">
                <button
                  onClick={() => openEditForm(account)}
                  className="admin-button flex-1 flex items-center justify-center gap-1.5 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => void handleDelete(account.id)}
                  disabled={deletingId === account.id}
                  className="admin-button flex items-center justify-center gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletingId === account.id ? '...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
