'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  // useQuery for bank accounts list
  const {
    isLoading,
    data: queryData,
    error: queryError,
  } = useQuery({
    queryKey: ['settings-bank-accounts'],
    queryFn: async () => {
      const res = await fetch('/api/settings/bank-accounts', { cache: 'no-store' });
      const json = await res.json() as { success: boolean; data?: BankAccount[]; error?: { message?: string } };
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดบัญชีธนาคารได้');
      }
      return json;
    },
  });

  // Local state mirroring original behaviour
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Sync from useQuery result to local state
  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'ไม่สามารถโหลดบัญชีธนาคารได้');
      return;
    }
    if (queryData) {
      setAccounts(queryData.data as BankAccount[]);
      setError(null);
    }
  }, [queryData, queryError]);

  // Replace load() with invalidate + refetch
  const load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['settings-bank-accounts'] });
  }, [queryClient]);

  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
      setError('กรุณากรอกทุกช่องที่จำเป็น (ID, ชื่อ, ธนาคาร, เลขบัญชี)');
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
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถสร้างบัญชีธนาคารได้');
      setForm(EMPTY_FORM);
      flashMessage('สร้างบัญชีธนาคารสำเร็จแล้ว');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถสร้างบัญชีธนาคารได้');
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
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถอัปเดตบัญชีธนาคารได้');
      cancelEdit();
      flashMessage('อัปเดตบัญชีธนาคารแล้ว');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถอัปเดตบัญชีธนาคารได้');
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
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถปิดใช้งานบัญชีธนาคารได้');
      setDeleteConfirmId(null);
      flashMessage('ปิดใช้งานบัญชีธนาคารแล้ว');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถปิดใช้งานบัญชีธนาคารได้');
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
    <main className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm transition-colors hover:border-primary30 hover:bg-surface-container"
          >
            <ArrowLeft className="h-4 w-4 text-on-primary" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-on-primary">บัญชีธนาคาร</h1>
            <p className="text-sm text-on-primary/80">
              จัดการบัญชีที่ใช้รับชำระเงินในใบแจ้งหนี้และใบเสร็จ
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
          label="บัญชีทั้งหมด"
          value={totalAccounts}
          icon={<Banknote className="h-5 w-5 text-indigo-600" />}
          color="border-indigo-100"
        />
        <KpiCard
          label="บัญชีที่ใช้งาน"
          value={activeAccounts}
          icon={<CreditCard className="h-5 w-5 text-emerald-600" />}
          color="border-emerald-100"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Left: Table */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between px-5 py-4">
            <h2 className="text-base font-semibold text-on-surface">บัญชีธนาคารทั้งหมด</h2>
            <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
              {totalAccounts} บัญชี
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-container">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-left">ธนาคาร</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-left">เลขบัญชี</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-left">PromptPay</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-center">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      ยังไม่มีบัญชีธนาคาร กรุณาเพิ่มจากฟอร์มด้านขวา
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
                              ใช้งาน
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              ไม่ใช้งาน
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {deleteConfirmId === account.id ? (
                              <>
                                <span className="mr-2 text-xs text-slate-500">ปิดใช้งาน?</span>
                                <button
                                  onClick={() => void handleDelete(account.id)}
                                  disabled={saving}
                                  className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50"
                                >
                                  ตกลง
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                                >
                                  ยกเลิก
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(account)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                                  title="แก้ไข"
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
                                    title="ปิดใช้งาน"
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
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 xl:col-span-2">
          <div className="mb-5 flex items-center gap-3 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              {isEditing ? (
                <Edit2 className="h-4 w-4 text-primary" />
              ) : (
                <PlusCircle className="h-4 w-4 text-primary" />
              )}
            </div>
            <h2 className="text-base font-semibold text-on-surface">
              {isEditing ? `แก้ไข: ${editId}` : 'เพิ่มบัญชีธนาคาร'}
            </h2>
          </div>

          <div className="space-y-4 px-5 pb-5">
            {!isEditing && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-on-surface">
                  รหัสบัญชี <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                  placeholder="เช่น ACC_KBANK_01"
                  value={form.id}
                  onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
                />
                <p className="mt-1 text-xs text-on-surface-variant">ต้องไม่ซ้ำกัน ไม่สามารถเปลี่ยนได้หลังสร้างแล้ว</p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-on-surface">
                ชื่อที่แสดง <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="เช่น บัญชีหลัก กสิกรไทย"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-on-surface">
                ชื่อธนาคาร <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="เช่น กสิกรไทย"
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
              <label className="mb-1.5 block text-sm font-medium text-on-surface">
                เลขบัญชี <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono tracking-wider"
                placeholder="xxx-x-xxxxx-x"
                value={form.bankAccountNo}
                onChange={(e) => setForm((prev) => ({ ...prev, bankAccountNo: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-on-surface">
                หมายเลข PromptPay <span className="text-on-surface-variant font-normal">(ไม่บังคับ)</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                placeholder="0XX-XXX-XXXX or เลขผู้เสียภาษี"
                value={form.promptpay}
                onChange={(e) => setForm((prev) => ({ ...prev, promptpay: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3">
              <input
                type="checkbox"
                id="active-toggle"
                checked={form.active}
                onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                className="h-4 w-4 rounded border-outline text-primary focus:ring-primary"
              />
              <label htmlFor="active-toggle" className="text-sm font-medium text-on-surface">
                ใช้งาน (พร้อมใช้ในใบแจ้งหนี้)
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              {isEditing ? (
                <>
                  <button
                    onClick={() => void handleUpdate()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors flex-1 justify-center disabled:opacity-50"
                  >
                    {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest text-on-surface hover:bg-surface-container px-4 py-2 text-sm font-medium shadow-sm transition-colors justify-center"
                  >
                    ยกเลิก
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void handleCreate()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors w-full justify-center disabled:opacity-50"
                >
                  <PlusCircle className="h-4 w-4" />
                  {saving ? 'กำลังสร้าง...' : 'เพิ่มบัญชีธนาคาร'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
