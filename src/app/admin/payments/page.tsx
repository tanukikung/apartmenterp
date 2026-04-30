'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle,
  CheckCircle2,
  Download,
  FileText,
  Hash,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  X,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { exportToCsv } from '@/lib/utils/export-csv';
import { statusBadgeClassWithBorder, statusBgClass } from '@/lib/status-colors';
import { ModernTable } from '@/components/ui/modern-table';
import { useToast } from '@/components/providers/ToastProvider';
import { useUrlState } from '@/hooks/useUrlState';
import { CurrencyInput } from '@/components/ui/CurrencyInput';


// ============================================================================
// Constants
// ============================================================================
const AMOUNT_TOLERANCE = 0.01;

// ============================================================================
// Types
// ============================================================================

type ReviewTransaction = {
  id: string;
  amount: number;
  transactionDate: string;
  description?: string | null;
  reference?: string | null;
  status: string;
  invoice?: {
    id: string;
    room?: {
      roomNumber?: string;
      roomNo?: string;
      tenants?: Array<{ tenant?: { firstName?: string; lastName?: string } | null }>;
    } | null;
  } | null;
};

type ReviewPayload = {
  transactions: ReviewTransaction[];
  total: number;
};

type Payment = {
  id: string;
  reference: string | null;
  amount: number;
  transactionDate: string;
  description: string | null;
  status: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  roomId: string;
  room: { roomNumber?: string; roomNo?: string } | null;
  totalAmount: number;
  dueDate: string | null;
  status: 'SENT' | 'OVERDUE';
  tenant?: { id: string; fullName: string; phone: string } | null;
  tenantName?: string | null;
};

type MatchType = 'FULL' | 'PARTIAL' | 'OVERPAY' | 'UNDERPAY';

type MatchResult = {
  paymentId: string;
  invoiceId: string;
  paymentAmount: number;
  invoiceAmount: number;
  matchType: MatchType;
  difference: number;
};

type WizardStep = 1 | 2 | 3;

interface PreviewRow {
  index: number;
  col1: string;
  col2: string;
  col3: string;
  col4: string;
}

// ============================================================================
// Helpers
// ============================================================================

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: 'THB', maximumFractionDigits: 2,
  }).format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function determineMatchType(paymentAmount: number, invoiceAmount: number): MatchType {
  const diff = paymentAmount - invoiceAmount;
  if (Math.abs(diff) <= AMOUNT_TOLERANCE) return 'FULL';
  if (paymentAmount > invoiceAmount) return 'OVERPAY';
  return 'UNDERPAY';
}

function matchTypeConfig(mt: MatchType) {
  switch (mt) {
    case 'FULL':
      return { label: 'ตรงทั้งหมด', color: 'success' as const };
    case 'PARTIAL':
    case 'UNDERPAY':
      return { label: mt === 'PARTIAL' ? 'บางส่วน' : 'ชำระไม่ครบ', color: 'warning' as const };
    case 'OVERPAY':
      return { label: 'ชำระเกิน', color: 'danger' as const };
  }
}

function amountCompareIndicator(paymentAmount: number, invoiceAmount: number) {
  const diff = paymentAmount - invoiceAmount;
  if (Math.abs(diff) <= AMOUNT_TOLERANCE) return { icon: '✓', cls: 'text-[hsl(var(--color-success))] font-bold', title: 'ตรงยอด' };
  if (diff > 0) return { icon: '↑', cls: 'text-[hsl(var(--color-primary))] font-bold', title: `เกิน ${money(diff)}` };
  return { icon: '≈', cls: 'text-[hsl(var(--color-warning))] font-bold', title: `ขาด ${money(Math.abs(diff))}` };
}

function invoiceStatusBadge(status: 'SENT' | 'OVERDUE') {
  if (status === 'OVERDUE') return statusBadgeClassWithBorder('danger');
  return statusBadgeClassWithBorder('info');
}

function parseCsvToPreviewRows(csvText: string, maxRows = 10): PreviewRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: PreviewRow[] = [];
  for (let i = 0; i < Math.min(lines.length, maxRows + 1); i++) {
    const line = lines[i];
    const cells: string[] = [];
    let current = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cells.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    cells.push(current.trim());
    rows.push({ index: i + 1, col1: cells[0] ?? '', col2: cells[1] ?? '', col3: cells[2] ?? '', col4: cells[3] ?? '' });
  }
  return rows;
}

function readFilePreview(file: File): Promise<PreviewRow[]> {
  return new Promise((resolve) => {
    if (!file.name.toLowerCase().endsWith('.csv')) { resolve([]); return; }
    const reader = new FileReader();
    reader.onload = (e) => { resolve(parseCsvToPreviewRows(e.target?.result as string, 10)); };
    reader.onerror = () => resolve([]);
    reader.readAsText(file);
  });
}

// ============================================================================
// Tab configuration
// ============================================================================

type Tab = 'review' | 'match' | 'upload' | 'manual';

const TABS: { id: Tab; label: string }[] = [
  { id: 'review', label: 'รายการรอตรวจ' },
  { id: 'match', label: 'จับคู่ชำระ' },
  { id: 'upload', label: 'อัปโหลด Statement' },
  { id: 'manual', label: 'บันทึกมือ' },
];

// ============================================================================
// Shared sub-components
// ============================================================================

function PanelHeader({ title, count, loading, onRefresh }: { title: string; count: number; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">{title}</span>
        <span className="inline-flex items-center rounded-full bg-[hsl(var(--primary)/0.15)] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--primary))] border border-[hsl(var(--color-primary)/0.3)]">{count}</span>
      </div>
      <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-2 py-1 text-xs text-[hsl(var(--on-surface-variant))] transition-colors hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98] disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative px-3 py-2">
      <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] py-1.5 pl-8 pr-3 text-xs text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface-variant))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/0.2)]" />
      {value ? <button onClick={() => onChange('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))] active:scale-[0.98]"><X className="h-3.5 w-3.5" /></button> : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <FileText className="h-8 w-8 text-[hsl(var(--on-surface-variant))]" />
      <p className="text-xs text-[hsl(var(--on-surface-variant))]">{message}</p>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--on-surface-variant))]" />
      <p className="text-xs text-[hsl(var(--on-surface-variant))]">{message}</p>
    </div>
  );
}

// ============================================================================
// Tab 1: Review Queue
// ============================================================================

function ReviewQueueTab() {
  const router = useRouter();
  const { data: reviewData, isLoading: loading } = useQuery<{ review: ReviewPayload | null; matched: ReviewPayload | null }>({
    queryKey: ['payments-review-queue'],
    queryFn: async () => {
      const [reviewRes, matchedRes] = await Promise.all([
        fetch('/api/payments/review?limit=10&offset=0').then((r) => r.json()),
        fetch('/api/payments/matched?limit=10&offset=0').then((r) => r.json()),
      ]);
      return {
        review: reviewRes.success ? reviewRes.data : null,
        matched: matchedRes.success ? matchedRes.data : null,
      };
    },
  });

  const review = reviewData?.review ?? null;
  const matched = reviewData?.matched ?? null;

  const stats = useMemo(() => ({
    review: review?.total ?? 0,
    autoMatched: matched?.total ?? 0,
  }), [review, matched]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5 transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">รอตรวจสอบ</p>
          <p className="mt-1 text-2xl font-extrabold text-[hsl(var(--on-surface))]">{stats.review}</p>
        </div>
        <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5 transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">จับคู่อัตโนมัติแล้ว</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600">{stats.autoMatched}</p>
        </div>
      </div>

      {/* Tables */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Manual Review */}
        <ModernTable
          header={
            <>
              <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">รายการรอตรวจสอบ</span>
              <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-600 border border-amber-500/30">{review?.total ?? 0}</span>
            </>
          }
          columns={[
            { key: 'transactionDate', header: 'วันที่', sortable: true, render: (t) => <span className="text-xs text-[hsl(var(--on-surface))]/70">{fmtDateTime(t.transactionDate)}</span> },
            { key: 'amount', header: 'จำนวน', sortable: true, align: 'right', render: (t) => <span className="text-xs font-semibold tabular-nums text-[hsl(var(--on-surface))]">{money(t.amount)}</span> },
            { key: 'reference', header: 'อ้างอิง', render: (t) => <span className="text-xs max-w-[120px] truncate block text-[hsl(var(--on-surface))]/40">{t.reference || t.description || '-'}</span> },
            { key: 'invoice', header: 'ใบแจ้งหนี้', render: (t) => <span className="text-xs text-[hsl(var(--on-surface))]/40">{t.invoice?.id ? `${t.invoice.id.slice(0, 8)}` : '-'}</span> },
          ]}
          data={review?.transactions ?? []}
          loading={loading}
          actions={[
            { label: 'ดู →', onClick: (t) => { router.push(`/admin/payments/${t.id}`); } },
          ]}
          empty={<div className="py-8 text-xs text-center text-[hsl(var(--on-surface))]/40">ไม่มีรายการรอตรวจสอบ</div>}
        />

        {/* Auto Matched */}
        <ModernTable
          header={
            <>
              <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">จับคู่อัตโนมัติแล้ว</span>
              <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-600 border border-emerald-500/30">{matched?.total ?? 0}</span>
            </>
          }
          columns={[
            { key: 'transactionDate', header: 'วันที่', sortable: true, render: (t) => <span className="text-xs text-[hsl(var(--on-surface))]/70">{fmtDateTime(t.transactionDate)}</span> },
            { key: 'amount', header: 'จำนวน', sortable: true, align: 'right', render: (t) => <span className="text-xs font-semibold tabular-nums text-[hsl(var(--on-surface))]">{money(t.amount)}</span> },
            { key: 'room', header: 'ห้อง', render: (t) => <span className="text-xs text-[hsl(var(--on-surface))]/40">{t.invoice?.room?.roomNumber ?? t.invoice?.room?.roomNo ?? '-'}</span> },
            { key: 'invoice', header: 'ใบแจ้งหนี้', render: (t) => <span className="text-xs text-[hsl(var(--on-surface))]/40">{t.invoice?.id ? `${t.invoice.id.slice(0, 8)}` : '-'}</span> },
          ]}
          data={matched?.transactions ?? []}
          loading={loading}
          actions={[
            { label: 'ดู →', onClick: (t) => { router.push(`/admin/payments/${t.id}`); } },
          ]}
          empty={<div className="py-8 text-xs text-center text-[hsl(var(--on-surface))]/40">ไม่มีรายการจับคู่อัตโนมัติ</div>}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Tab 2: Match Workstation
// ============================================================================

function PaymentsPanel({ payments, loading, selectedPaymentId, onSelect, onRefresh }: {
  payments: Payment[]; loading: boolean; selectedPaymentId: string | null;
  onSelect: (p: Payment | null) => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useUrlState('pq', '');
  // Debounce the search term so URL updates don't happen on every keystroke.
  const [searchDebounced, setSearchDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const filtered = payments.filter((p) => {
    if (!searchDebounced) return true;
    const q = searchDebounced.toLowerCase();
    return p.reference?.toLowerCase().includes(q) || String(p.amount).includes(q) || p.description?.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
      <PanelHeader title="การชำระที่ต้องจับคู่" count={payments.length} loading={loading} onRefresh={onRefresh} />
      <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาอ้างอิงหรือจำนวน..." />
      <div className="flex-1 overflow-y-auto">
        {loading ? <LoadingState message="กำลังโหลด..." />
          : filtered.length === 0 ? <EmptyState message={search ? 'ไม่พบรายการที่ค้นหา' : 'ไม่มีการชำระที่รอจับคู่'} />
          : <ul className="divide-y divide-[hsl(var(--color-border))] px-3 pb-3">
            {filtered.map((payment) => {
              const isSelected = payment.id === selectedPaymentId;
              return (
                <li key={payment.id}>
                  <button onClick={() => onSelect(isSelected ? null : payment)}
                    className={['rounded-xl border p-3 my-1.5 text-left transition-all active:scale-[0.98]',
                      isSelected ? 'border border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 ring-1 ring-[hsl(var(--primary))]/50' : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] hover:border border-[hsl(var(--primary))]/30 hover:bg-[hsl(var(--color-surface))]/[0.06]'].join(' ')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[hsl(var(--on-surface))] truncate">{payment.reference ?? 'ไม่มีอ้างอิง'}</span>
                          <span className="shrink-0 inline-flex items-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--on-surface))]/50">รอจับคู่</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[hsl(var(--on-surface))]/40">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(payment.transactionDate)}</span>
                          {payment.description ? <span className="truncate max-w-[200px]">{payment.description}</span> : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-[hsl(var(--on-surface))] tabular-nums">{money(payment.amount)}</div>
                        <div className="mt-1 text-[10px] font-semibold text-blue-600">{isSelected ? 'เลือกแล้ว' : 'เลือก'}</div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>}
      </div>
    </div>
  );
}

function InvoicesPanel({ invoices, loading, selectedPayment, onMatchRequest, onRefresh }: {
  invoices: Invoice[]; loading: boolean; selectedPayment: Payment | null;
  onMatchRequest: (invoice: Invoice) => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useUrlState('iq', '');
  const [filter, setFilter] = useUrlState<'ALL' | 'SENT' | 'OVERDUE'>('istatus', 'ALL');
  // Debounce the search so URL updates don't happen on every keystroke.
  const [searchDebounced, setSearchDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const filtered = invoices.filter((inv) => {
    if (filter !== 'ALL' && inv.status !== filter) return false;
    if (!searchDebounced) return true;
    const q = searchDebounced.toLowerCase();
    const rn = (inv.room?.roomNumber ?? inv.room?.roomNo ?? '').toLowerCase();
    return inv.invoiceNumber.toLowerCase().includes(q) || rn.includes(q)
      || (inv.tenant?.fullName ?? inv.tenantName ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
      <PanelHeader title="ใบแจ้งหนี้ค้างชำระ" count={invoices.length} loading={loading} onRefresh={onRefresh} />
      <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาห้องหรือเลขที่ใบแจ้งหนี้..." />
      <div className="flex gap-1 border-b border-[hsl(var(--color-border))] px-3 pb-2">
        {(['ALL', 'SENT', 'OVERDUE'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={['rounded-md px-2.5 py-1 text-[11px] font-semibold transition active:scale-[0.98]',
              filter === f ? 'bg-[hsl(var(--primary))] text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)]' : 'text-[hsl(var(--on-surface))]/40 hover:bg-[hsl(var(--color-surface))]/[0.06] hover:text-[hsl(var(--on-surface))]'].join(' ')}>{f === 'ALL' ? 'ทั้งหมด' : f === 'SENT' ? 'ส่งแล้ว' : 'ค้างชำระ'}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? <LoadingState message="กำลังโหลด..." />
          : filtered.length === 0 ? <EmptyState message={search ? 'ไม่พบรายการที่ค้นหา' : 'ไม่มีใบแจ้งหนี้ค้างชำระ'} />
          : <ul className="divide-y divide-[hsl(var(--color-border))] px-3 pb-3">
            {filtered.map((invoice) => {
              const indicator = selectedPayment ? amountCompareIndicator(selectedPayment.amount, invoice.totalAmount) : null;
              const tenantName = invoice.tenant?.fullName ?? invoice.tenantName ?? null;
              return (
                <li key={invoice.id}>
                  <div className={['rounded-lg border p-3 my-1.5 transition-all active:scale-[0.98]',
                    selectedPayment ? 'border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 hover:bg-[hsl(var(--primary))]/10' : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]'].join(' ')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-[hsl(var(--on-surface))] truncate">{invoice.invoiceNumber}</span>
                          <span className={invoiceStatusBadge(invoice.status)}>{invoice.status === 'OVERDUE' ? 'ค้างชำระ' : 'ส่งแล้ว'}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[hsl(var(--on-surface))]/40">
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />ห้อง {invoice.room?.roomNumber ?? invoice.room?.roomNo ?? '-'}</span>
                          {tenantName ? <span className="truncate">{tenantName}</span> : null}
                          {invoice.dueDate ? <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />ครบกำหนด {fmtDate(invoice.dueDate)}</span> : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {indicator ? <span className={`text-sm ${indicator.cls}`} title={indicator.title}>{indicator.icon}</span> : null}
                          <div className="text-sm font-bold text-[hsl(var(--on-surface))] tabular-nums">{money(invoice.totalAmount)}</div>
                        </div>
                      </div>
                    </div>
                    {selectedPayment ? (
                      <div className="mt-2 flex justify-end">
                        <button onClick={() => onMatchRequest(invoice)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--primary))] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98]">
                          <ArrowRight className="h-3 w-3" />จับคู่กับที่เลือก
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>}
      </div>
    </div>
  );
}

type ConfirmState = 'idle' | 'confirming' | 'success' | 'error';

function MatchPreviewPanel({ selectedPayment, selectedInvoice, matchedTodayCount, onConfirm, onClear, onMatchAnother }: {
  selectedPayment: Payment | null; selectedInvoice: Invoice | null; matchedTodayCount: number;
  onConfirm: () => Promise<MatchResult | null>; onClear: () => void; onMatchAnother: () => void;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmState>('idle');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (confirmState === 'success') return;
    setConfirmState('idle');
    setErrorMsg(null);
  }, [selectedPayment?.id, selectedInvoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm() {
    setConfirmState('confirming');
    setErrorMsg(null);
    const result = await onConfirm();
    if (result) { setLastResult(result); setConfirmState('success'); }
    else { setConfirmState('error'); setErrorMsg('การจับคู่ล้มเหลว กรุณาลองใหม่'); }
  }

  if (confirmState === 'success' && lastResult) {
    const cfg = matchTypeConfig(lastResult.matchType);
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-sm font-semibold text-emerald-600">จับคู่สำเร็จ</span></div>
          <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-600 border border-emerald-500/30">{matchedTodayCount} วันนี้</span>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="rounded-lg border border-emerald-500/30 bg-[hsl(var(--color-surface))] p-4">
            <div className="flex items-center gap-2 text-emerald-600"><Check className="h-5 w-5" /><span className="font-semibold">จับคู่สำเร็จแล้ว!</span></div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[hsl(var(--on-surface))]/40">การชำระ</span><span className="font-medium tabular-nums text-[hsl(var(--on-surface))]">{money(lastResult.paymentAmount)}</span></div>
              <div className="flex justify-between"><span className="text-[hsl(var(--on-surface))]/40">ใบแจ้งหนี้</span><span className="font-medium tabular-nums text-[hsl(var(--on-surface))]">{money(lastResult.invoiceAmount)}</span></div>
              <div className="border-t border-[hsl(var(--color-border))] pt-2 flex justify-between">
                <span className="text-[hsl(var(--on-surface))]/40">ส่วนต่าง</span>
                <span className={`font-semibold tabular-nums ${lastResult.difference === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {lastResult.difference === 0 ? 'ไม่มี' : money(Math.abs(lastResult.difference))}
                </span>
              </div>
            </div>
            <div className="mt-3"><span className={statusBadgeClassWithBorder(cfg.color)}>{cfg.label}</span></div>
          </div>
          <button onClick={onMatchAnother} className="w-full rounded-lg bg-[hsl(var(--primary))] py-2.5 text-sm font-semibold text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98]">จับคู่รายการถัดไป</button>
        </div>
      </div>
    );
  }

  if (!selectedPayment && !selectedInvoice) {
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3">
          <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">พรีวิวการจับคู่</span>
          <span className="inline-flex items-center rounded-full bg-[hsl(var(--primary))]/20 px-2 py-0.5 text-xs font-semibold text-blue-600 border border-[hsl(var(--primary))]/30">{matchedTodayCount} วันนี้</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--color-surface))]/[0.06]"><ArrowRight className="h-6 w-6 text-[hsl(var(--on-surface))]/30" /></div>
          <p className="text-sm text-[hsl(var(--on-surface))]/50">เลือกการชำระและใบแจ้งหนี้เพื่อพรีวิวการจับคู่</p>
          <p className="text-xs text-[hsl(var(--on-surface))]/30">กด M เพื่อจับคู่รายการที่เลือก</p>
        </div>
      </div>
    );
  }

  if (!selectedPayment || !selectedInvoice) {
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3">
          <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">พรีวิวการจับคู่</span>
          <span className="inline-flex items-center rounded-full bg-[hsl(var(--primary))]/20 px-2 py-0.5 text-xs font-semibold text-blue-600 border border-[hsl(var(--primary))]/30">{matchedTodayCount} วันนี้</span>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          {selectedPayment ? (
            <div className="rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">ชำระเงิน</div>
              <div className="text-base font-bold text-[hsl(var(--on-surface))] tabular-nums">{money(selectedPayment.amount)}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[hsl(var(--on-surface))]/40">
                {selectedPayment.reference ? <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{selectedPayment.reference}</span> : null}
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(selectedPayment.transactionDate)}</span>
                {selectedPayment.description ? <span>{selectedPayment.description}</span> : null}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-[hsl(var(--color-border))]/[0.1] p-4 text-center text-xs text-[hsl(var(--on-surface))]/30">ยังไม่เลือกการชำระ</div>
          )}
          <div className="flex justify-center"><ArrowRight className="h-5 w-5 text-[hsl(var(--on-surface))]/30" /></div>
          {selectedInvoice ? (
            <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--on-surface))]/40">ใบแจ้งหนี้</div>
              <div className="text-base font-bold text-[hsl(var(--on-surface))] tabular-nums">{money(selectedInvoice.totalAmount)}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[hsl(var(--on-surface))]/40">
                <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{selectedInvoice.invoiceNumber}</span>
                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />ห้อง {selectedInvoice.room?.roomNumber ?? selectedInvoice.room?.roomNo ?? '-'}</span>
                {selectedInvoice.dueDate ? <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />ครบกำหนด {fmtDate(selectedInvoice.dueDate)}</span> : null}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-[hsl(var(--color-border))]/[0.1] p-4 text-center text-xs text-[hsl(var(--on-surface))]/30">เลือกใบแจ้งหนี้จากแผงด้านขวาแล้วกด &quot;จับคู่กับที่เลือก&quot;</div>
          )}
        </div>
      </div>
    );
  }

  const matchType = determineMatchType(selectedPayment.amount, selectedInvoice.totalAmount);
  const cfg = matchTypeConfig(matchType);
  const difference = selectedPayment.amount - selectedInvoice.totalAmount;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3">
        <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">พรีวิวการจับคู่</span>
        <span className="inline-flex items-center rounded-full bg-[hsl(var(--primary))]/20 px-2 py-0.5 text-xs font-semibold text-blue-600 border border-[hsl(var(--primary))]/30">{matchedTodayCount} วันนี้</span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className={['rounded-lg border p-3 text-center', statusBgClass(cfg.color), 'border border-[hsl(var(--status-' + cfg.color + '-bg))]/60'].join(' ')}>
          <span className={statusBadgeClassWithBorder(cfg.color)}>{cfg.label}</span>
        </div>
        <div className="rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">การชำระ</div>
          <div className="text-base font-bold text-[hsl(var(--on-surface))] tabular-nums">{money(selectedPayment.amount)}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[hsl(var(--on-surface))]/40">
            {selectedPayment.reference ? <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{selectedPayment.reference}</span> : null}
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(selectedPayment.transactionDate)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[hsl(var(--on-surface))]/20"><div className="h-px flex-1 bg-[hsl(var(--on-surface))]/[0.07]" /><ArrowRight className="h-4 w-4 shrink-0" /><div className="h-px flex-1 bg-[hsl(var(--on-surface))]/[0.07]" /></div>
        <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--on-surface))]/40">ใบแจ้งหนี้</div>
          <div className="text-base font-bold text-[hsl(var(--on-surface))] tabular-nums">{money(selectedInvoice.totalAmount)}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[hsl(var(--on-surface))]/40">
            <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{selectedInvoice.invoiceNumber}</span>
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />ห้อง {selectedInvoice.room?.roomNumber ?? selectedInvoice.room?.roomNo ?? '-'}</span>
            {selectedInvoice.dueDate ? <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />ครบกำหนด {fmtDate(selectedInvoice.dueDate)}</span> : null}
          </div>
        </div>
        <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[hsl(var(--on-surface))]/40">จำนวนที่ชำระ</span><span className="font-semibold tabular-nums text-[hsl(var(--on-surface))]">{money(selectedPayment.amount)}</span></div>
            <div className="flex justify-between"><span className="text-[hsl(var(--on-surface))]/40">จำนวนในใบแจ้งหนี้</span><span className="font-semibold tabular-nums text-[hsl(var(--on-surface))]">{money(selectedInvoice.totalAmount)}</span></div>
            <div className="border-t border-[hsl(var(--color-border))] pt-2 flex justify-between">
              <span className="text-[hsl(var(--on-surface))]/40">ส่วนต่าง</span>
              <span className={['font-bold tabular-nums', difference === 0 ? 'text-emerald-600' : difference > 0 ? 'text-blue-600' : 'text-amber-600'].join(' ')}>
                {difference === 0 ? 'ไม่มี' : `${difference > 0 ? '+' : ''}${money(difference)}`}
              </span>
            </div>
          </div>
        </div>
        {confirmState === 'error' && errorMsg ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"><AlertCircle className="h-4 w-4 shrink-0" />{errorMsg}</div>
        ) : null}
        <div className="flex flex-col gap-2">
          <button onClick={() => void handleConfirm()} disabled={confirmState === 'confirming'}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] py-2.5 text-sm font-semibold text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
            {confirmState === 'confirming' ? <><Loader2 className="h-4 w-4 animate-spin" /><span>กำลังยืนยัน...</span></> : <><Check className="h-4 w-4" /><span>ยืนยันการจับคู่</span></>}
          </button>
          <button onClick={onClear} disabled={confirmState === 'confirming'}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] py-2 text-sm text-[hsl(var(--on-surface))]/60 transition-all hover:bg-[hsl(var(--color-surface))]/[0.08] hover:border-[hsl(var(--color-border))] active:scale-[0.98] disabled:opacity-50">
            <XCircle className="h-4 w-4" />ล้างการเลือก
          </button>
        </div>
        <p className="text-center text-[11px] text-[hsl(var(--on-surface))]/30">กด <kbd className="rounded border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.06] px-1 py-0.5 font-mono text-[10px] text-[hsl(var(--on-surface))]/60">M</kbd> เพื่อยืนยันการจับคู่</p>
      </div>
    </div>
  );
}

function MatchWorkstationTab() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [matchedTodayCount, setMatchedTodayCount] = useState(0);
  const matchRef = useRef<(() => void) | null>(null);
  const toast = useToast();

  const { data: paymentsData, isLoading: paymentsLoading, isError: paymentsError, error: paymentsErr, refetch: refetchPayments } = useQuery<{ data: { transactions: Payment[] } }>({
    queryKey: ['payments-for-match'],
    queryFn: async () => {
      const res = await fetch('/api/payments/review?limit=50&offset=0');
      const json = await res.json();
      if (!res.ok) throw new Error(`ไม่สามารถโหลดการชำระ: ${res.status}`);
      return json;
    },
  });

  const { data: invoicesData, isLoading: invoicesLoading, isError: invoicesError, error: invoicesErr, refetch: refetchInvoices } = useQuery<Invoice[]>({
    queryKey: ['invoices-for-match'],
    queryFn: async () => {
      const [sentRes, overdueRes] = await Promise.all([
        fetch('/api/invoices?status=SENT&pageSize=50').then((r) => r.json()),
        fetch('/api/invoices?status=OVERDUE&pageSize=50').then((r) => r.json()),
      ]);
      const sentRows: Invoice[] = Array.isArray(sentRes.data) ? sentRes.data : (sentRes.data?.data ?? sentRes.invoices ?? []);
      const overdueRows: Invoice[] = Array.isArray(overdueRes.data) ? overdueRes.data : (overdueRes.data?.data ?? overdueRes.invoices ?? []);
      const seen = new Set<string>();
      const merged: Invoice[] = [];
      for (const inv of [...sentRows, ...overdueRows]) { if (!seen.has(inv.id)) { seen.add(inv.id); merged.push(inv); } }
      return merged;
    },
  });

  // Sync query data into local state for panel rendering
  useEffect(() => {
    if (paymentsData?.data?.transactions) setPayments(paymentsData.data.transactions);
  }, [paymentsData]);

  useEffect(() => {
    if (invoicesData) setInvoices(invoicesData);
  }, [invoicesData]);

  const handleSelectPayment = (payment: Payment | null) => { setSelectedPayment(payment); setSelectedInvoice(null); };
  const handleMatchRequest = (invoice: Invoice) => { setSelectedInvoice(invoice); };
  const handleClear = () => { setSelectedPayment(null); setSelectedInvoice(null); };
  const handleMatchAnother = () => { setSelectedPayment(null); setSelectedInvoice(null); void refetchPayments(); void refetchInvoices(); };

  async function handleConfirm(): Promise<MatchResult | null> {
    if (!selectedPayment || !selectedInvoice) return null;
    try {
      const res = await fetch('/api/payments/match/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: selectedPayment.id, invoiceId: selectedInvoice.id }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body?.error?.message ?? `Server error ${res.status}`); }
      const result: MatchResult = {
        paymentId: selectedPayment.id, invoiceId: selectedInvoice.id,
        paymentAmount: selectedPayment.amount, invoiceAmount: selectedInvoice.totalAmount,
        matchType: determineMatchType(selectedPayment.amount, selectedInvoice.totalAmount),
        difference: selectedPayment.amount - selectedInvoice.totalAmount,
      };
      setMatchedTodayCount((c) => c + 1);
      setPayments((prev) => prev.filter((p) => p.id !== selectedPayment.id));
      setInvoices((prev) => prev.filter((i) => i.id !== selectedInvoice.id));
      toast.success('จับคู่การชำระเงินสำเร็จ');
      return result;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ไม่สามารถยืนยันการจับคู่ได้');
      return null;
    }
  }

  useEffect(() => {
    matchRef.current = () => { if (selectedPayment && selectedInvoice) { void handleConfirm(); } };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'm' || e.key === 'M') { matchRef.current?.(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-600 border border-emerald-500/30">
            <CheckCircle2 className="h-3.5 w-3.5" />{matchedTodayCount} จับคู่วันนี้
          </span>
        </div>
        <button onClick={() => { void refetchPayments(); void refetchInvoices(); }} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all hover:bg-[hsl(var(--color-surface))]/[0.1] hover:border-[hsl(var(--color-border))] active:scale-[0.98]">
          <RefreshCw className="h-4 w-4" />รีเฟรชทั้งหมด
        </button>
      </div>

      {paymentsError ? <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400"><AlertCircle className="h-4 w-4 shrink-0" />การชำระ: {paymentsErr?.message}</div> : null}
      {invoicesError ? <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400"><AlertCircle className="h-4 w-4 shrink-0" />ใบแจ้งหนี้: {invoicesErr?.message}</div> : null}

      <div className="grid min-h-[600px] gap-4 xl:grid-cols-3">
        <PaymentsPanel payments={payments} loading={paymentsLoading} selectedPaymentId={selectedPayment?.id ?? null}
          onSelect={handleSelectPayment} onRefresh={() => void refetchPayments()} />
        <InvoicesPanel invoices={invoices} loading={invoicesLoading} selectedPayment={selectedPayment}
          onMatchRequest={handleMatchRequest} onRefresh={() => void refetchInvoices()} />
        <MatchPreviewPanel selectedPayment={selectedPayment} selectedInvoice={selectedInvoice} matchedTodayCount={matchedTodayCount}
          onConfirm={handleConfirm} onClear={handleClear} onMatchAnother={handleMatchAnother} />
      </div>
    </div>
  );
}

// ============================================================================
// Tab 3: Upload Statement
// ============================================================================

const UPLOAD_STEPS: { n: WizardStep; label: string }[] = [
  { n: 1, label: 'เลือกไฟล์' },
  { n: 2, label: 'พรีวิว' },
  { n: 3, label: 'นำเข้า' },
];

function UploadStepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center mb-8">
      {UPLOAD_STEPS.map((step, idx) => {
        const done = current > step.n;
        const active = current === step.n;
        return (
          <React.Fragment key={step.n}>
            <div className="flex flex-col items-center gap-1">
              <div className={['w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                done ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600' : active ? 'bg-[hsl(var(--primary))] border border-[hsl(var(--primary))] text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)]' : 'bg-[hsl(var(--color-surface))] border-[hsl(var(--color-border))] text-[hsl(var(--on-surface))]/40'].join(' ')}>
                {done ? <CheckCircle className="w-4 h-4" /> : step.n}
              </div>
              <span className={['text-xs font-medium whitespace-nowrap', active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-[hsl(var(--on-surface))]/40'].join(' ')}>{step.label}</span>
            </div>
            {idx < UPLOAD_STEPS.length - 1 && <div className={['flex-1 h-0.5 mx-2 mt-[-14px]', current > step.n ? 'bg-emerald-500/50' : 'bg-[hsl(var(--color-surface))]/[0.1]'].join(' ')} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function UploadTab() {
  const [step, setStep] = useState<WizardStep>(1);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); const dropped = e.dataTransfer.files[0]; if (dropped) setSelectedFile(dropped); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }, []);
  const handleDragLeave = useCallback(() => setDragging(false), []);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) setSelectedFile(file); };

  const handleNext = async () => {
    setErrorMessage(null);
    if (step === 1) {
      if (!selectedFile) { setErrorMessage('กรุณาเลือกไฟล์ก่อนดำเนินการต่อ'); return; }
      const rows = await readFilePreview(selectedFile);
      setPreviewRows(rows);
      setStep(2);
    } else if (step === 2) { setStep(3); }
  };

  const handleBack = () => { setErrorMessage(null); setSuccessMessage(null); if (step === 2) setStep(1); else if (step === 3) setStep(2); };

  const handleProcessImport = async () => {
    if (!selectedFile) return;
    setImporting(true); setErrorMessage(null); setSuccessMessage(null);
    const formData = new FormData(); formData.append('file', selectedFile);
    try {
      const res = await fetch('/api/payments/statement-upload', { method: 'POST', body: formData });
      if (!res.ok) { const json = await res.json().catch(() => ({})) as { error?: { message?: string } }; setErrorMessage(json?.error?.message ?? `อัปโหลดล้มเหลว (${res.status})`); return; }
      const json = await res.json() as { success?: boolean; data?: { totalEntries?: number; imported?: number; matched?: number; unmatched?: number } };
      if (json.success === false) { setErrorMessage('เซิร์ฟเวอร์ปฏิเสธการอัปโหลด กรุณาตรวจสอบรูปแบบไฟล์และลองใหม่'); return; }
      const imported = json?.data?.imported ?? 0;
      const matched = json?.data?.matched ?? 0;
      const unmatched = json?.data?.unmatched ?? 0;
      setSuccessMessage(`นำเข้าแล้ว: ${imported} รายการ · จับคู่อัตโนมัติ ${matched} รายการ · รอตรวจสอบ ${unmatched} รายการ`);
    } catch { setErrorMessage('เกิดข้อผิดพลาดทางเครือข่าย กรุณาลองใหม่'); }
    finally { setImporting(false); }
  };

  const handleReset = () => { setStep(1); setSelectedFile(null); setPreviewRows([]); setSuccessMessage(null); setErrorMessage(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <UploadStepIndicator current={step} />

      {errorMessage && <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{errorMessage}</span></div>}
      {successMessage && <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{successMessage}</span></div>}

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
            <h2 className="text-sm font-semibold text-[hsl(var(--on-surface))]">ขั้นตอนที่ 1: เลือกไฟล์</h2>
            <span className="inline-flex items-center rounded-full bg-[hsl(var(--color-surface))]/[0.06] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--on-surface))]/50 border border-[hsl(var(--color-border))]">CSV / Excel</span>
          </div>
          <div className="p-5">
            <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={['relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 cursor-pointer transition-all active:scale-[0.98]',
                dragging ? 'border border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(99,102,241,0.15)]' : selectedFile ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-surface))]'].join(' ')}>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileChange} />
              {selectedFile ? (
                <><FileText className="h-12 w-12 text-emerald-600" /><p className="text-base font-medium text-[hsl(var(--on-surface))]">{selectedFile.name}</p><p className="text-sm text-[hsl(var(--on-surface))]/40">{(selectedFile.size / 1024).toFixed(1)} KB — คลิกเพื่อเปลี่ยน</p></>
              ) : (
                <><Upload className="h-12 w-12 text-[hsl(var(--on-surface))]/30" /><p className="text-base font-medium text-[hsl(var(--on-surface))]">คลิกหรือลากไฟล์มาวาง</p><p className="text-sm text-[hsl(var(--on-surface))]/30">รองรับ: CSV, Excel (.xlsx) · สูงสุด 10MB</p></>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={handleNext} className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98]">
                ถัดไป
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && selectedFile && (
        <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
            <h2 className="text-sm font-semibold text-[hsl(var(--on-surface))]">ขั้นตอนที่ 2: พรีวิว</h2>
            <span className="inline-flex items-center rounded-full bg-[hsl(var(--color-surface))]/[0.06] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--on-surface))]/50 border border-[hsl(var(--color-border))]">{selectedFile.name}</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3 text-sm text-[hsl(var(--on-surface))]">
              <FileText className="w-5 h-5 text-[hsl(var(--on-surface))]/30 shrink-0" />
              <div><p className="font-medium">{selectedFile.name}</p><p className="text-[hsl(var(--on-surface))]/30 text-xs">{(selectedFile.size / 1024).toFixed(1)} KB &middot; ประมวลผลแล้ว</p></div>
            </div>
            {previewRows.length === 0 ? (
              <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-6 text-center text-sm text-[hsl(var(--on-surface))]/40">
                <FileText className="w-8 h-8 text-[hsl(var(--on-surface))]/20 mx-auto mb-2" /><p className="font-medium text-[hsl(var(--on-surface))]">พรีวิวไม่พร้อมสำหรับไฟล์ Excel</p><p className="text-xs text-[hsl(var(--on-surface))]/30 mt-1">ไฟล์จะถูกประมวลผลเต็มรูปแบบระหว่างการนำเข้า</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[hsl(var(--color-border))] overflow-hidden">
                <table className="min-w-full divide-y divide-[hsl(var(--color-border))] text-sm">
                  <thead className="bg-[hsl(var(--color-surface))]/[0.06]"><tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--on-surface))]/40 w-12">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--on-surface))]/40">คอลัมน์ 1</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--on-surface))]/40">คอลัมน์ 2</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[hsl(var(--on-surface))]/40">คอลัมน์ 3</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--on-surface))]/40">คอลัมน์ 4</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.02]">
                    {previewRows.map((row) => (
                      <tr key={row.index} className={row.index === 1 ? 'bg-[hsl(var(--color-surface))]/[0.06] font-medium text-[hsl(var(--on-surface))]' : 'text-[hsl(var(--on-surface))]/50'}>
                        <td className="px-4 py-2.5 text-xs text-[hsl(var(--on-surface))]/40">{row.index}</td>
                        <td className="px-4 py-2.5">{row.col1}</td>
                        <td className="px-4 py-2.5">{row.col2}</td>
                        <td className="px-4 py-2.5 text-right">{row.col3}</td>
                        <td className="px-4 py-2.5">{row.col4}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-[hsl(var(--on-surface))]/30">แสดง {previewRows.length} รายการแรกจากไฟล์ การประมวลผลเต็มรูปแบบจะเกิดขึ้นระหว่างการนำเข้า</p>
            <div className="flex items-center justify-between">
              <button onClick={handleBack} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 transition-all hover:bg-[hsl(var(--color-surface))]/[0.08] hover:border-[hsl(var(--color-border))] active:scale-[0.98]">กลับ</button>
              <button onClick={handleNext} className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98]">ถัดไป</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
            <h2 className="text-sm font-semibold text-[hsl(var(--on-surface))]">ขั้นตอนที่ 3: นำเข้า</h2>
          </div>
          <div className="p-5 space-y-4">
            {successMessage ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <CheckCircle className="w-14 h-14 text-emerald-600" />
                <div><p className="text-lg font-semibold text-[hsl(var(--on-surface))]">นำเข้าสำเร็จ!</p><p className="text-sm text-[hsl(var(--on-surface))]/40 mt-1">{successMessage}</p></div>
                <div className="flex gap-3 mt-2">
                  <button onClick={handleReset} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 transition-all hover:bg-[hsl(var(--color-surface))]/[0.08] hover:border-[hsl(var(--color-border))] active:scale-[0.98]">อัปโหลดไฟล์ใหม่</button>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-4 text-sm text-[hsl(var(--on-surface))] space-y-2">
                  <p className="font-medium text-[hsl(var(--on-surface))]">พร้อมนำเข้า:</p>
                  {selectedFile && <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-[hsl(var(--on-surface))]/30" /><span>{selectedFile.name}</span><span className="text-[hsl(var(--on-surface))]/30">({(selectedFile.size / 1024).toFixed(1)} KB)</span></div>}
                  <p className="text-[hsl(var(--on-surface))]/30 text-xs">ระบบจะพยายามจับคู่แต่ละรายการกับใบแจ้งหนี้ที่ค้างชำระ รายการที่ไม่ตรงจะถูกส่งเข้าแถวตรวจสอบ</p>
                </div>
                <div className="flex items-center justify-between">
                  <button onClick={handleBack} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 transition-all hover:bg-[hsl(var(--color-surface))]/[0.08] hover:border-[hsl(var(--color-border))] active:scale-[0.98] disabled:opacity-50" disabled={importing}>กลับ</button>
                  <button onClick={handleProcessImport} disabled={importing}
                    className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed">
                    {importing ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg><span>กำลังประมวลผล...</span></>
                      : <><Upload className="w-4 h-4" />เริ่มนำเข้า</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab 4: Manual Payment Entry
// ============================================================================

function ManualPaymentTab() {
  type ManualInvoiceOption = {
    id: string;
    invoiceNumber: string;
    roomNo: string;
    totalAmount: number;
    status: string;
    tenantName: string | null;
  };
  const [selectedInvoice, setSelectedInvoice] = useState<ManualInvoiceOption | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CHECK' | 'TRANSFER'>('CASH');
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ManualInvoiceOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const _toast = { success: (msg: string) => setMessage({ type: 'success', text: msg }), error: (msg: string) => setMessage({ type: 'error', text: msg }) };

  // Debounced invoice search
  useEffect(() => {
    if (!invoiceSearch.trim() || invoiceSearch.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/invoices?q=${encodeURIComponent(invoiceSearch)}&status=GENERATED,SENT,VIEWED,OVERDUE&pageSize=10`);
        const json = await res.json();
        const invoices: ManualInvoiceOption[] = (json.data?.data ?? json.data ?? []).map((inv: Record<string, unknown>) => ({
          id: inv.id as string,
          invoiceNumber: inv.invoiceNumber as string,
          roomNo: (inv.roomNo as string) ?? ((inv.room as Record<string, unknown>)?.roomNo as string) ?? '',
          totalAmount: Number(inv.totalAmount),
          status: inv.status as string,
          tenantName: (inv.tenantName as string) ?? (((inv.tenant as Record<string, unknown>)?.fullName as string) ?? null),
        }));
        setSearchResults(invoices);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [invoiceSearch]);

  function selectInvoice(invoice: ManualInvoiceOption) {
    setSelectedInvoice(invoice);
    setAmount(invoice?.totalAmount ?? null);
    setInvoiceSearch(invoice ? `${invoice.invoiceNumber} - ห้อง ${invoice.roomNo}` : '');
    setShowDropdown(false);
  }

  function handleClear() {
    setSelectedInvoice(null);
    setAmount(null);
    setPaymentMethod('CASH');
    setPaidAt(new Date().toISOString().slice(0, 10));
    setNotes('');
    setMessage(null);
    setInvoiceSearch('');
    setSearchResults([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInvoice) {
      setMessage({ type: 'error', text: 'กรุณาเลือกใบแจ้งหนี้' });
      return;
    }
    if (!amount || amount <= 0) {
      setMessage({ type: 'error', text: 'กรุณากรอกจำนวนเงิน' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          amount,
          paymentMethod,
          paidAt: new Date(paidAt).toISOString(),
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: json.message || 'บันทึกการชำระแล้ว' });
        handleClear();
      } else {
        setMessage({ type: 'error', text: json.error?.message || 'ไม่สามารถบันทึกการชำระ' });
      }
    } catch {
      setMessage({ type: 'error', text: 'เกิดข้อผิดพลาดเครือข่าย กรุณาลองใหม่' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
        <div className="border-b border-[hsl(var(--color-border))] px-4 py-3">
          <h2 className="text-sm font-semibold text-[hsl(var(--on-surface))]">บันทึกการชำระเงิน</h2>
          <p className="text-xs text-[hsl(var(--on-surface))]/40 mt-0.5">บันทึกการชำระเงินสด / เช็ค / โอนเงิน โดยไม่ต้องนำเข้าจากสมุดบัญชี</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {message && (
            <div className={`rounded-lg px-4 py-3 text-sm ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
              {message.text}
            </div>
          )}

          {/* Invoice Search */}
          <div className="relative">
            <label className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface))]/40 block mb-1.5">ใบแจ้งหนี้</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--on-surface))]/30 pointer-events-none" />
              <input
                type="text"
                value={invoiceSearch}
                onChange={e => {
                  setInvoiceSearch(e.target.value);
                  if (selectedInvoice) setSelectedInvoice(null);
                }}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder="ค้นหาเลขที่ใบแจ้งหนี้หรือห้อง..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/30 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[hsl(var(--on-surface))]/40" />}
            </div>
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl shadow-[0_8px_32px_hsl(var(--color-primary)/_0.15)] max-h-60 overflow-y-auto">
                {searchResults.map(inv => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => selectInvoice(inv)}
                    className="w-full text-left px-3 py-2.5 hover:bg-[hsl(var(--color-surface))]/[0.06] transition-colors border-b border-[hsl(var(--color-border))]/[0.05] last:border-0"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-[hsl(var(--on-surface))]">{inv.invoiceNumber}</div>
                        <div className="text-xs text-[hsl(var(--on-surface))]/40">ห้อง {inv.roomNo} · {inv.tenantName || 'ไม่ระบุ'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-[hsl(var(--on-surface))] tabular-nums">{money(inv.totalAmount)}</div>
                        <div className={`text-xs font-medium ${inv.status === 'OVERDUE' ? 'text-red-400' : 'text-[hsl(var(--on-surface))]/40'}`}>
                          {inv.status === 'OVERDUE' ? 'ค้างชำระ' : inv.status}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && searchResults.length === 0 && invoiceSearch.length >= 2 && !searching && (
              <div className="absolute z-50 mt-1 w-full bg-[#0a0a0f] border border-[hsl(var(--color-border))]/[0.1] rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] px-3 py-4 text-center text-sm text-[hsl(var(--on-surface))]/40">
                ไม่พบใบแจ้งหนี้
              </div>
            )}
            {selectedInvoice && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>เลือก: {selectedInvoice.invoiceNumber} · {money(selectedInvoice.totalAmount)}</span>
              </div>
            )}
          </div>

          {/* Amount and Method */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface))]/40 block mb-1.5">จำนวน (บาท)</label>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                ariaLabel="จำนวน (บาท)"
                required
                className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/30 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface))]/40 block mb-1.5">วิธีการชำระ</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as 'CASH' | 'CHECK' | 'TRANSFER')}
                className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--on-surface))] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
              >
                <option value="CASH">เงินสด</option>
                <option value="CHECK">เช็ค</option>
                <option value="TRANSFER">โอนเงิน</option>
              </select>
            </div>
          </div>

          {/* Date and Notes */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface))]/40 block mb-1.5">วันที่ชำระ</label>
              <input
                type="date"
                value={paidAt}
                onChange={e => setPaidAt(e.target.value)}
                className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--on-surface))] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface))]/40 block mb-1.5">หมายเหตุ (ไม่บังคับ)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/30 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                placeholder="เช่น รับเงินที่เคาน์เตอร์"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !selectedInvoice}
              className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังบันทึก...</> : <><CheckCircle className="h-4 w-4" />บันทึกการชำระ</>}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--on-surface))]/60 transition-all hover:bg-[hsl(var(--color-surface))]/[0.08] hover:border-[hsl(var(--color-border))] active:scale-[0.98]"
            >
              <X className="h-4 w-4" />ล้าง
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AdminPaymentsIndexPage() {
  const [activeTab, setActiveTab] = useUrlState<Tab>('tab', 'review');

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--on-surface))]">การเงิน</h1>
          <p className="mt-1 text-sm text-[hsl(var(--on-surface))]/40">ตรวจสอบและจับคู่การชำระเงินกับใบแจ้งหนี้</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={async () => {
            const [reviewRes, matchedRes] = await Promise.all([
              fetch('/api/payments/review?limit=50&offset=0').then(r => r.json()),
              fetch('/api/payments/matched?limit=50&offset=0').then(r => r.json()),
            ]);
            const reviewRows: Record<string, unknown>[] = reviewRes.success ? (reviewRes.data?.transactions ?? []) : [];
            const matchedRows: Record<string, unknown>[] = matchedRes.success ? (matchedRes.data?.transactions ?? []) : [];
            const allRows = [...reviewRows, ...matchedRows].map((t: Record<string, unknown>) => ({
              date: t.transactionDate ?? '',
              room: ((t.invoice as Record<string, unknown>)?.room as Record<string, unknown>)?.roomNumber ?? ((t.invoice as Record<string, unknown>)?.room as Record<string, unknown>)?.roomNo ?? '',
              tenant: '',
              amount: t.amount ?? 0,
              status: t.status ?? '',
              reference: t.reference ?? t.description ?? '',
              queue: reviewRows.includes(t) ? 'รอตรวจ' : 'จับคู่แล้ว',
            }));
            exportToCsv('payments-export', allRows, [
              { key: 'date', header: 'วันที่' }, { key: 'room', header: 'ห้อง' }, { key: 'tenant', header: 'ผู้เช่า' },
              { key: 'amount', header: 'จำนวน' }, { key: 'status', header: 'สถานะ' }, { key: 'reference', header: 'อ้างอิง' },
              { key: 'queue', header: 'แถว' },
            ]);
          }} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all hover:bg-[hsl(var(--color-surface))]/[0.1] hover:border-[hsl(var(--color-border))] active:scale-[0.98]">
            <Download className="h-4 w-4" />ส่งออก CSV
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="inline-flex items-center gap-1 rounded-xl bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] p-1 w-fit">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={['px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98]',
              activeTab === tab.id
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--on-surface))] shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                : 'text-[hsl(var(--on-surface))]/50 hover:bg-[hsl(var(--color-surface))]/[0.06] hover:text-[hsl(var(--on-surface))]'].join(' ')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'review' && <ReviewQueueTab />}
        {activeTab === 'match' && <MatchWorkstationTab />}
        {activeTab === 'upload' && <UploadTab />}
        {activeTab === 'manual' && <ManualPaymentTab />}
      </div>
    </main>
  );
}
