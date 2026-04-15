'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import React from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  AlertTriangle,
  BarChart2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CycleStatus = 'OPEN' | 'LOCKED' | 'CLOSED';

interface BillingCycle {
  id: string;
  year: number;
  month: number;
  status: CycleStatus;
  building: { id: string; name: string } | null;
  totalRecords: number;
  totalRooms: number;
  missingRooms: number;
  totalAmount: number;
  invoiceCount: number;
  pendingInvoices: number;
  billingDate: string | null;
  dueDate: string | null;
  createdAt: string;
}

type InvoiceStatus = 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
interface Invoice {
  id: string;
  invoiceNumber: string;
  roomNo: string;
  tenantName: string;
  periodLabel: string;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  paidAt: string | null;
}

interface KpiData {
  openCycles: number;
  totalBilledThisMonth: number;
  totalRecords: number;
  totalActiveRooms: number;
  missingRooms: number;
  pendingInvoices: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const STATUS_BADGE: Record<CycleStatus, { cls: string; label: string }> = {
  OPEN:   { cls: 'bg-blue-100 text-blue-700 border-blue-200',     label: 'เปิด'   },
  LOCKED: { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'ล็อก' },
  CLOSED: { cls: 'bg-surface-container text-on-surface-variant', label: 'ปิด' },
};

const INVOICE_STATUS_BADGE: Record<InvoiceStatus, { cls: string; label: string }> = {
  GENERATED:  { cls: 'bg-surface-container text-on-surface-variant',    label: 'รอส่ง' },
  SENT:       { cls: 'bg-primary-container text-primary-container',     label: 'ส่งแล้ว' },
  VIEWED:     { cls: 'bg-tertiary-container text-on-tertiary-container', label: 'เปิดแล้ว' },
  PAID:       { cls: 'bg-tertiary-container text-on-tertiary-container', label: 'ชำระแล้ว' },
  OVERDUE:    { cls: 'bg-error-container text-on-error-container',       label: 'เกินกำหนด' },
  CANCELLED:  { cls: 'bg-surface-container text-on-surface-variant',    label: 'ยกเลิก' },
};

const STATUS_FILTER_OPTIONS: { value: CycleStatus | 'ALL'; label: string }[] = [
  { value: 'ALL',    label: 'ทุกสถานะ' },
  { value: 'OPEN',   label: 'เปิด'   },
  { value: 'LOCKED', label: 'ล็อก' },
  { value: 'CLOSED', label: 'ปิด' },
];

const INVOICE_TABS: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'GENERATED', label: 'รอส่ง' },
  { value: 'SENT', label: 'ส่งแล้ว' },
  { value: 'VIEWED', label: 'เปิดแล้ว' },
  { value: 'PAID', label: 'ชำระแล้ว' },
  { value: 'OVERDUE', label: 'เกินกำหนด' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
];

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [{ value: 'ALL', label: 'ทุกเดือน' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    options.push({
      value: `${y}-${String(m).padStart(2, '0')}`,
      label: `${THAI_MONTHS[m - 1]} ${y + 543}`,
    });
  }
  return options;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thaiMonthYear(year: number, month: number): string {
  const m = THAI_MONTHS[month - 1] ?? String(month);
  return `${m} ${year + 543}`;
}

function formatBaht(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function deriveKpis(cycles: BillingCycle[]): KpiData {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const openCycles = cycles.filter((c) => c.status === 'OPEN').length;
  const currentCycle = cycles.find((c) => c.year === thisYear && c.month === thisMonth);
  const totalBilledThisMonth = cycles
    .filter((c) => c.year === thisYear && c.month === thisMonth)
    .reduce((s, c) => s + (c.totalAmount ?? 0), 0);
  const totalRecords = cycles.reduce((s, c) => s + (c.totalRecords ?? 0), 0);
  const pendingInvoices = cycles.reduce((s, c) => s + (c.pendingInvoices ?? 0), 0);
  return {
    openCycles,
    totalBilledThisMonth,
    totalRecords,
    totalActiveRooms: currentCycle?.totalRooms ?? 0,
    missingRooms: currentCycle?.missingRooms ?? 0,
    pendingInvoices,
  };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CycleStatus }) {
  const { cls, label } = STATUS_BADGE[status] ?? {
    cls: 'bg-surface-container text-on-surface-variant',
    label: status,
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { cls, label } = INVOICE_STATUS_BADGE[status] ?? {
    cls: 'bg-surface-container text-on-surface-variant',
    label: status,
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI card — M3 surface-container-lowest
// ---------------------------------------------------------------------------

function KpiCard({
  label, value, sub, icon, iconBg, iconColor,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; iconBg: string; iconColor: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-on-surface">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-on-surface-variant">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row action state
// ---------------------------------------------------------------------------

type BatchState = 'idle' | 'locking' | 'generating' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminBillingPage() {
  const [activeTab, setActiveTab] = useState<'cycles' | 'invoices'>('cycles');

  const [statusFilter, setStatusFilter] = useState<CycleStatus | 'ALL'>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');

  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [invoiceSearch, setInvoiceSearch] = useState('');

  const [batchState, setBatchState] = useState<Record<string, BatchState>>({});
  const [batchMsg,   setBatchMsg]   = useState<Record<string, string>>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sendTargetInvoiceId, setSendTargetInvoiceId] = useState<string | null>(null);
  const [batchGenerateConfirmOpen, setBatchGenerateConfirmOpen] = useState(false);
  const [batchGenerateTarget, setBatchGenerateTarget] = useState<{ periodId: string; needsLock: boolean } | null>(null);

  const monthOptions = getMonthOptions();

  // TanStack Query for billing cycles
  const { data: cyclesData, isLoading: loading, isError: cyclesError, refetch: refetchCycles } = useQuery<{ data: { data: BillingCycle[] } }>({
    queryKey: ['billing-cycles'],
    queryFn: async () => {
      const res = await fetch('/api/billing-cycles?pageSize=50&sortBy=year&sortOrder=desc', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Billing API unavailable: ${res.status}`);
      return res.json();
    },
    staleTime: 0,
  });

  const cycles: BillingCycle[] = cyclesData?.data?.data ?? [];

  // TanStack Query for invoices (lazy — only runs when activeTab === 'invoices')
  const { data: invoicesData, isLoading: invoiceLoading, isError: invoicesError, refetch: refetchInvoices } = useQuery<{ data: { data: Invoice[] } }>({
    queryKey: ['billing-invoices'],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '50', sortBy: 'createdAt', sortOrder: 'desc' });
      const res = await fetch(`/api/invoices?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`ไม่สามารถโหลดใบแจ้งหนี้: ${res.status}`);
      return res.json();
    },
    enabled: activeTab === 'invoices',
  });

  const invoices: Invoice[] = invoicesData?.data?.data ?? [];
  const kpis = deriveKpis(cycles);

  const handleTabChange = (tab: 'cycles' | 'invoices') => {
    setActiveTab(tab);
  };

  /**
   * Batch: Lock all DRAFT records → then generate all invoices for a period.
   * needsLock = true  → OPEN / IMPORTED  (must lock first)
   * needsLock = false → LOCKED           (already locked, just generate)
   */
  async function handleBatchGenerate(periodId: string, needsLock: boolean) {
    const set = (s: BatchState) => setBatchState(p => ({ ...p, [periodId]: s }));
    const msg = (m: string)      => setBatchMsg(p  => ({ ...p, [periodId]: m  }));

    set('locking');
    msg('');
    setSendError(null);

    try {
      // ── Step 1: Lock all DRAFT records (skip if already LOCKED) ──────────
      if (needsLock) {
        const lockRes = await fetch(`/api/billing/periods/${periodId}/lock-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const lockJson = await lockRes.json();
        if (!lockRes.ok) {
          throw new Error(lockJson.error?.message ?? `ไม่สามารถล็อกรายการ: รหัส ${lockRes.status}`);
        }
        msg(`ล็อก ${lockJson.data?.locked ?? 0} รายการแล้ว…`);
      }

      // ── Step 2: Generate invoices for all LOCKED records ─────────────────
      set('generating');
      const genRes = await fetch(`/api/billing/periods/${periodId}/generate-invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const genJson = await genRes.json();
      if (!genRes.ok) {
        throw new Error(genJson.error?.message ?? `ไม่สามารถสร้างใบแจ้งหนี้: รหัส ${genRes.status}`);
      }

      const { generated, skipped, errors } = genJson.data ?? {};
      const summary = [
        `สร้าง ${generated ?? 0} ใบ`,
        skipped  ? `ข้าม ${skipped} ใบ` : '',
        errors   ? `ผิดพลาด ${errors} ใบ` : '',
      ].filter(Boolean).join(' • ');

      set('done');
      msg(summary);
      if (errors > 0) {
        setSendError(`${summary} — มีข้อผิดพลาด`);
      } else {
        setSendSuccess(`${summary} — สำเร็จ`);
      }
      void refetchCycles();
      void refetchInvoices();
    } catch (err) {
      set('error');
      const m = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      msg(m);
      setSendError(m);
    }
  }

  async function handleSendInvoice(invoiceId: string) {
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST', cache: 'no-store' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || `ส่งไม่สำเร็จ: รหัส ${res.status}`);
      }
      setSendSuccess(`ส่งใบแจ้งหนี้สำเร็จแล้ว`);
      void refetchInvoices();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered lists
  // ---------------------------------------------------------------------------

  const filteredCycles = cycles.filter((c) => {
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchMonth = monthFilter === 'ALL' || monthFilter === `${c.year}-${String(c.month).padStart(2, '0')}`;
    return matchStatus && matchMonth;
  });

  const filteredInvoices = invoices.filter((inv) => {
    const matchStatus = invoiceStatusFilter === 'ALL' || inv.status === invoiceStatusFilter;
    const matchSearch =
      !invoiceSearch.trim() ||
      inv.invoiceNumber.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.roomNo.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.tenantName.toLowerCase().includes(invoiceSearch.toLowerCase());
    return matchStatus && matchSearch;
  });

  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">บิล</h1>
          <p className="mt-1 text-sm text-on-surface-variant">จัดการรอบบิล สร้างใบแจ้งหนี้ และติดตามการชำระเงิน</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/billing/wizard" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90">
            <Zap className="h-4 w-4" />
            Billing Wizard
          </Link>
          <Link href="/admin/billing/import" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container hover:shadow-sm">
            <FileSpreadsheet className="h-4 w-4" />
            นำเข้า Excel
          </Link>
          <button
            onClick={() => { setActiveTab('invoices'); void refetchInvoices(); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
          >
            <ReceiptText className="h-4 w-4" />
            ใบแจ้งหนี้
            {overdueCount > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold text-white">{overdueCount}</span>
            )}
          </button>
          <button
            onClick={() => void (activeTab === 'cycles' ? refetchCycles() : refetchInvoices())}
            disabled={loading || invoiceLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <RefreshCw className={`h-4 w-4 ${loading || invoiceLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="inline-flex items-center gap-1 rounded-xl bg-surface-container p-1 w-fit">
        {[
          { id: 'cycles', label: 'รอบบิล', icon: <ReceiptText className="h-4 w-4" />, count: cycles.length },
          { id: 'invoices', label: 'ใบแจ้งหนี้', icon: <FileText className="h-4 w-4" />, badge: overdueCount > 0 ? `${overdueCount} ค้าง` : null },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id as 'cycles' | 'invoices')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-surface-container-lowest text-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
            }`}
          >
            {tab.icon}
            {tab.label}
            {'count' in tab && (
              <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                {tab.count}
              </span>
            )}
            {'badge' in tab && tab.badge && (
              <span className="rounded-full bg-error-container px-2 py-0.5 text-[11px] font-semibold text-on-error-container">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Alerts ─────────────────────────────────────────── */}
      {sendError && (
        <div className="px-4 py-3 rounded-lg bg-error-container/10 border border-error-container/20 text-sm text-color-danger font-medium">
          {sendError}
        </div>
      )}
      {sendSuccess && (
        <div className="px-4 py-3 rounded-lg bg-tertiary-container/10 border border-tertiary-container/20 text-sm text-tertiary-container font-medium">
          {sendSuccess}
        </div>
      )}

      {/* ── CYCLE TAB ─────────────────────────────────────────── */}
      {activeTab === 'cycles' && (
        <>
          {/* API unavailable notice */}
          {!loading && cyclesError && (
            <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <span className="font-semibold">Billing API ไม่พร้อมใช้งาน</span>{' '}
                เริ่มต้นโดยนำเข้ารอบการเรียกเก็บครั้งแรกผ่าน Excel
              </div>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 animate-pulse">
                  <div className="flex items-start gap-4">
                    <div className="h-11 w-11 rounded-xl bg-surface-container" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 w-20 rounded bg-surface-container" />
                      <div className="h-6 w-16 rounded bg-surface-container" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <>
                <KpiCard label="รอบบิลที่เปิด" value={kpis.openCycles} sub="OPEN + LOCKED" icon={<Zap className="h-5 w-5" />} iconBg="bg-primary-container" iconColor="text-primary" />
                <KpiCard label="ยอดเรียกเก็บเดือนนี้" value={`฿${formatBaht(kpis.totalBilledThisMonth)}`} icon={<BarChart2 className="h-5 w-5" />} iconBg="bg-tertiary-container" iconColor="text-on-tertiary-container" />
                <KpiCard label="รายการทั้งหมด" value={kpis.totalRecords.toLocaleString()} sub="ทุกรอบบิล" icon={<FileText className="h-5 w-5" />} iconBg="bg-surface-container" iconColor="text-on-surface-variant" />
                <KpiCard label="ใบแจ้งหนี้รอชำระ" value={kpis.pendingInvoices} sub="ยังไม่ได้ชำระ" icon={<ReceiptText className="h-5 w-5" />} iconBg="bg-amber-100" iconColor="text-amber-700" />
                <KpiCard
                  label="ห้องไม่มีข้อมูล (เดือนนี้)"
                  value={kpis.missingRooms > 0 ? kpis.missingRooms : '—'}
                  sub={kpis.missingRooms > 0 ? `จาก ${kpis.totalActiveRooms} ห้อง` : 'ครบทุกห้อง'}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  iconBg={kpis.missingRooms > 0 ? 'bg-red-100' : 'bg-emerald-100'}
                  iconColor={kpis.missingRooms > 0 ? 'text-red-600' : 'text-emerald-600'}
                />
              </>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CycleStatus | 'ALL')}
                className="appearance-none rounded-lg border border-outline bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
            </div>

            <div className="relative">
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="appearance-none rounded-lg border border-outline bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
            </div>

            {(statusFilter !== 'ALL' || monthFilter !== 'ALL') && (
              <button
                onClick={() => { setStatusFilter('ALL'); setMonthFilter('ALL'); }}
                className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredCycles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FileSpreadsheet className="mb-3 h-12 w-12 text-outline-variant" />
                {cycles.length === 0 ? (
                  <>
                    <p className="font-semibold text-on-surface">ยังไม่มีรอบบิล</p>
                    <p className="mt-1 text-sm text-on-surface-variant">เริ่มต้นโดย Import Excel</p>
                    <Link href="/admin/billing/import" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90">
                      <FileSpreadsheet className="h-4 w-4" />
                      นำเข้า Excel
                    </Link>
                  </>
                ) : (
                  <p className="font-semibold text-on-surface">ไม่พบรอบบิลที่ตรงกับตัวกรอง</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      {['เดือน/ปี', 'สถานะ', 'รายการ', 'ความครอบคลุม', 'ยอดรวม', 'ใบแจ้งหนี้', 'วันครบกำหนด', 'จัดการ'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCycles.map((cycle) => {
                      const bs   = batchState[cycle.id] ?? 'idle';
                      const bmsg = batchMsg[cycle.id] ?? '';
                      const busy = bs === 'locking' || bs === 'generating';

                      // What action is available?
                      const needsLock   = cycle.status === 'OPEN';
                      const needsGen    = cycle.status === 'LOCKED';
                      const canBatch    = needsLock || needsGen;

                      return (
                        <React.Fragment key={cycle.id}>
                          <tr className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">
                              {thaiMonthYear(cycle.year, cycle.month)}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={cycle.status} />
                            </td>
                            <td className="px-4 py-3 text-right text-on-surface-variant">
                              {(cycle.totalRecords ?? 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {cycle.totalRooms > 0 ? (
                                  <>
                                    <div className="flex-1 h-1.5 rounded-full bg-outline-variant overflow-hidden max-w-[60px]">
                                      <div
                                        className={`h-full rounded-full ${(cycle.missingRooms ?? 0) > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                        style={{ width: `${Math.round(((cycle.totalRooms - (cycle.missingRooms ?? 0)) / cycle.totalRooms) * 100)}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-medium whitespace-nowrap ${(cycle.missingRooms ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      {cycle.totalRooms - (cycle.missingRooms ?? 0)}/{cycle.totalRooms}
                                    </span>
                                    {(cycle.missingRooms ?? 0) > 0 && (
                                      <span className="text-[10px] text-amber-600 whitespace-nowrap">
                                        (−{cycle.missingRooms})
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-outline">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-on-surface whitespace-nowrap">
                              ฿{formatBaht(cycle.totalAmount ?? 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-on-surface-variant">
                              {cycle.invoiceCount > 0 ? (
                                <span>
                                  {cycle.invoiceCount}
                                  {cycle.pendingInvoices > 0 && (
                                    <span className="ml-1.5 text-xs text-color-danger">({cycle.pendingInvoices} รอ)</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-outline">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap text-xs">
                              <ClientOnly fallback={<span className="text-outline">—</span>}>{cycle.dueDate
                                ? new Date(cycle.dueDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
                                : <span className="text-outline">—</span>
                              }</ClientOnly>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/admin/billing/${cycle.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-outline px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                                >
                                  ดูรายละเอียด
                                </Link>

                                {canBatch && bs !== 'done' && (
                                  <button
                                    onClick={() => { setBatchGenerateTarget({ periodId: cycle.id, needsLock }); setBatchGenerateConfirmOpen(true); }}
                                    disabled={busy}
                                    title={needsLock ? 'ล็อกทั้งหมด แล้วสร้างใบแจ้งหนี้' : 'สร้างใบแจ้งหนี้ทั้งหมด'}
                                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
                                  >
                                    {bs === 'locking' ? (
                                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังล็อก…</>
                                    ) : bs === 'generating' ? (
                                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังสร้างบิล…</>
                                    ) : needsLock ? (
                                      <><Zap className="h-3.5 w-3.5" /> ล็อก + สร้างทั้งหมด</>
                                    ) : (
                                      <><Send className="h-3.5 w-3.5" /> สร้างทั้งหมด</>
                                    )}
                                  </button>
                                )}

                                {bs === 'done' && bmsg && (
                                  <span className="text-xs font-medium text-tertiary-container">✓ {bmsg}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          {bs === 'error' && bmsg && (
                            <tr className="bg-error-container/10">
                              <td colSpan={7} className="px-4 py-2">
                                <div className="flex items-center gap-2 text-xs text-on-error-container">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  {bmsg}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loading && filteredCycles.length > 0 && (
            <p className="text-right text-xs text-on-surface-variant">
              แสดง {filteredCycles.length} จาก {cycles.length} รอบบิล
            </p>
          )}
        </>
      )}

      {/* ── INVOICE TAB ──────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <>
          {/* Invoice search + filter */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
              <input
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="ค้นหาเลขใบแจ้งหนี้, ห้อง, ชื่อผู้เช่า..."
                className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 pl-9 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="relative">
              <select
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value as InvoiceStatus | 'ALL')}
                className="appearance-none rounded-lg border border-outline bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {INVOICE_TABS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
            </div>
          </div>

          {/* Invoice table */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            {invoiceLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <ReceiptText className="mb-3 h-12 w-12 text-outline-variant" />
                <p className="font-semibold text-on-surface">ไม่พบใบแจ้งหนี้</p>
                <p className="mt-1 text-sm text-on-surface-variant">สร้างรอบบิลและ Generate Invoice ก่อน</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      {['เลขที่ใบแจ้งหนี้', 'ห้อง', 'ผู้เช่า', 'เดือน/ปี', 'ยอดรวม', 'สถานะ', 'ครบกำหนด', 'จัดการ'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3 font-semibold text-on-surface">{inv.roomNo}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{inv.tenantName}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{inv.periodLabel}</td>
                        <td className="px-4 py-3 text-right font-semibold text-on-surface whitespace-nowrap">
                          ฿{formatBaht(inv.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap text-xs">
                          <ClientOnly fallback={<span className="text-outline">—</span>}>{inv.dueDate
                            ? new Date(inv.dueDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
                            : <span className="text-outline">—</span>
                          }</ClientOnly>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {inv.status !== 'PAID' && (
                              <button
                                onClick={() => { setSendTargetInvoiceId(inv.id); setSendConfirmOpen(true); }}
                                className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                              >
                                <Send className="h-3 w-3" />
                                ส่ง
                              </button>
                            )}
                            <Link href={`/admin/invoices/${inv.id}`} className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container">
                              ดู →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!invoiceLoading && (
            <p className="text-right text-xs text-on-surface-variant">
              แสดง {filteredInvoices.length} ใบแจ้งหนี้
            </p>
          )}
        </>
      )}
      <ConfirmDialog
        open={sendConfirmOpen}
        title="ส่งใบแจ้งหนี้?"
        description="ระบบจะส่งใบแจ้งหนี้ไปยัง LINE ของผู้เช่า — การดำเนินการนี้ไม่สามารถยกเลิกได้"
        confirmLabel="ส่งเลย"
        cancelLabel="ยกเลิก"
        onConfirm={() => { setSendConfirmOpen(false); if (sendTargetInvoiceId) { void handleSendInvoice(sendTargetInvoiceId); } }}
        onCancel={() => setSendConfirmOpen(false)}
      />
      <ConfirmDialog
        open={batchGenerateConfirmOpen}
        title={batchGenerateTarget?.needsLock ? 'ล็อกและสร้างใบแจ้งหนี้?' : 'สร้างใบแจ้งหนี้ทั้งหมด?'}
        description={batchGenerateTarget?.needsLock
          ? 'ระบบจะ Lock บิลที่ยังไม่ได้ Lock ทั้งหมด แล้วสร้างใบแจ้งหนี้ — การดำเนินการนี้ไม่สามารถยกเลิกได้'
          : 'ระบบจะสร้างใบแจ้งหนี้สำหรับทุกห้องที่ยังไม่มีใบแจ้งหนี้ — การดำเนินการนี้ไม่สามารถยกเลิกได้'}
        confirmLabel="ดำเนินการต่อ"
        dangerous
        onConfirm={() => {
          setBatchGenerateConfirmOpen(false);
          if (batchGenerateTarget) {
            void handleBatchGenerate(batchGenerateTarget.periodId, batchGenerateTarget.needsLock);
          }
        }}
        onCancel={() => { setBatchGenerateConfirmOpen(false); setBatchGenerateTarget(null); }}
      />
    </main>
  );
}
