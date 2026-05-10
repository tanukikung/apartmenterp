'use client';

import Link from 'next/link';
import React from 'react';
import {
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/hooks/useTheme';
import { useTableState } from '@/hooks/useTableState';

// ============================================================================
// Types
// ============================================================================

type CycleStatus = 'OPEN' | 'LOCKED' | 'CLOSED';
type InvoiceStatus = 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';

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

type _Invoice = {
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
};

interface KpiData {
  openCycles: number;
  totalBilledThisMonth: number;
  totalRecords: number;
  totalActiveRooms: number;
  missingRooms: number;
  pendingInvoices: number;
}

// ============================================================================
// Constants
// ============================================================================

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const _STATUS_FILTER_OPTIONS: { value: CycleStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'ทุกสถานะ' },
  { value: 'OPEN', label: 'เปิด' },
  { value: 'LOCKED', label: 'ล็อก' },
  { value: 'CLOSED', label: 'ปิด' },
];

const _INVOICE_TABS: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'GENERATED', label: 'รอส่ง' },
  { value: 'SENT', label: 'ส่งแล้ว' },
  { value: 'VIEWED', label: 'เปิดแล้ว' },
  { value: 'PAID', label: 'ชำระแล้ว' },
  { value: 'OVERDUE', label: 'เกินกำหนด' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
];

// ============================================================================
// Components
// ============================================================================

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const t = useTheme();

  return (
    <div
      className="rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200"
      style={{
        backgroundColor: t.colors.background.primary,
        border: `1px solid ${t.colors.border.light}`,
      }}
    >
      <p
        className="text-xs font-bold uppercase tracking-widest mb-1"
        style={{ color: t.colors.text.secondary }}
      >
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: t.colors.text.primary }}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs" style={{ color: t.colors.text.secondary }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CycleStatus }) {
  const t = useTheme();

  const statusConfig: Record<CycleStatus, { bg: string; text: string; label: string }> = {
    OPEN: {
      bg: t.colors.success.light,
      text: t.colors.success.dark,
      label: 'เปิด',
    },
    LOCKED: {
      bg: t.colors.warning.light,
      text: t.colors.warning.dark,
      label: 'ล็อก',
    },
    CLOSED: {
      bg: t.colors.info.light,
      text: t.colors.info.dark,
      label: 'ปิด',
    },
  };

  const config = statusConfig[status];

  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        backgroundColor: config.bg,
        color: config.text,
      }}
    >
      {config.label}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function BillingPage() {
  const t = useTheme();
  const table = useTableState({ pageSize: 10 });

  // Fetch KPI data
  const { data: kpiData } = useQuery({
    queryKey: ['billing-kpi'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/summary');
      if (!res.ok) throw new Error('Failed to fetch KPI');
      const json = await res.json();
      return json.data as KpiData;
    },
  });

  // Fetch billing cycles
  const { data: cyclesData } = useQuery({
    queryKey: ['billing-cycles', table.page, table.pageSize, table.sortField],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(table.page),
        pageSize: String(table.pageSize),
      });
      if (table.sortField) {
        params.append('sortBy', table.sortField);
        params.append('sortOrder', table.sortDirection || 'asc');
      }

      const res = await fetch(`/api/billing/periods?${params}`);
      if (!res.ok) throw new Error('Failed to fetch cycles');
      const json = await res.json();
      return json.data;
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: t.colors.text.primary }}>
            บิล
          </h1>
          <p className="mt-1 text-sm" style={{ color: t.colors.text.secondary }}>
            จัดการรอบบิล สร้างใบแจ้งหนี้ และติดตามการชำระเงิน
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/billing/wizard"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:shadow-lg active:scale-95"
            style={{
              backgroundColor: t.colors.primary[500],
              color: t.colors.text.inverse,
            }}
          >
            <Zap className="h-4 w-4" />
            สร้างรอบบิล
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KPICard
          label="รอบบิลที่เปิด"
          value={String(kpiData?.openCycles ?? 0)}
        />
        <KPICard
          label="บิลเดือนนี้"
          value={`฿${(kpiData?.totalBilledThisMonth ?? 0).toLocaleString()}`}
        />
        <KPICard
          label="ห้องที่ขาดข้อมูล"
          value={String(kpiData?.missingRooms ?? 0)}
          sub={`จาก ${kpiData?.totalActiveRooms ?? 0} ห้อง`}
        />
      </div>

      {/* Cycles Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          borderColor: t.colors.border.light,
          backgroundColor: t.colors.background.primary,
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: t.colors.background.secondary, borderColor: t.colors.border.light }}>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: t.colors.text.primary }}>
                  เดือน/ปี
                </th>
                <th className="px-4 py-3 text-left font-semibold" style={{ color: t.colors.text.primary }}>
                  สถานะ
                </th>
                <th className="px-4 py-3 text-right font-semibold" style={{ color: t.colors.text.primary }}>
                  จำนวนบิล
                </th>
                <th className="px-4 py-3 text-right font-semibold" style={{ color: t.colors.text.primary }}>
                  จำนวน
                </th>
              </tr>
            </thead>
            <tbody>
              {cyclesData?.data?.map((cycle: BillingCycle) => (
                <tr
                  key={cycle.id}
                  style={{
                    borderColor: t.colors.border.light,
                    backgroundColor: t.colors.background.primary,
                  }}
                  className="border-t hover:bg-opacity-50"
                >
                  <td className="px-4 py-3" style={{ color: t.colors.text.primary }}>
                    {THAI_MONTHS[cycle.month - 1]} {cycle.year}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={cycle.status} />
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: t.colors.text.primary }}>
                    {cycle.invoiceCount}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: t.colors.text.primary }}>
                    ฿{cycle.totalAmount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div
          className="flex items-center justify-between border-t px-4 py-3"
          style={{ borderColor: t.colors.border.light }}
        >
          <p className="text-xs" style={{ color: t.colors.text.secondary }}>
            หน้า {table.page + 1} จาก {Math.ceil((cyclesData?.total ?? 0) / table.pageSize)}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => table.goToPage(table.page - 1)}
              disabled={table.page === 0}
              className="px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: t.colors.background.secondary,
                color: t.colors.text.primary,
                border: `1px solid ${t.colors.border.light}`,
              }}
            >
              ← ก่อนหน้า
            </button>
            <button
              onClick={() => table.goToPage(table.page + 1)}
              disabled={(table.page + 1) * table.pageSize >= (cyclesData?.total ?? 0)}
              className="px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: t.colors.background.secondary,
                color: t.colors.text.primary,
                border: `1px solid ${t.colors.border.light}`,
              }}
            >
              ถัดไป →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
