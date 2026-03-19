'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart2,
  Building2,
  ClipboardList,
  CreditCard,
  Server,
} from 'lucide-react';

type Summary = {
  monthlyRevenue: number;
  unpaidInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  createdAt: string;
};

type ReportCard = {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  colorBg: string;
  colorBorder: string;
  colorText: string;
};

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

const REPORT_CARDS: ReportCard[] = [
  {
    title: 'Revenue Report',
    description: 'Monthly invoiced, collected, and outstanding totals',
    icon: <BarChart2 className="h-6 w-6" />,
    href: '/admin/reports/revenue',
    colorBg: 'bg-blue-50',
    colorBorder: 'border-blue-200',
    colorText: 'text-blue-700',
  },
  {
    title: 'Occupancy Report',
    description: 'Room occupancy rates and vacancy trends over time',
    icon: <Building2 className="h-6 w-6" />,
    href: '/admin/reports/occupancy',
    colorBg: 'bg-emerald-50',
    colorBorder: 'border-emerald-200',
    colorText: 'text-emerald-700',
  },
  {
    title: 'Collections Report',
    description: 'Payment collection rates and outstanding balances',
    icon: <CreditCard className="h-6 w-6" />,
    href: '/admin/reports/collections',
    colorBg: 'bg-indigo-50',
    colorBorder: 'border-indigo-200',
    colorText: 'text-indigo-700',
  },
  {
    title: 'Audit Report',
    description: 'Filtered audit trail with pagination and entity-type breakdown',
    icon: <ClipboardList className="h-6 w-6" />,
    href: '/admin/reports/audit',
    colorBg: 'bg-slate-50',
    colorBorder: 'border-slate-200',
    colorText: 'text-slate-700',
  },
  {
    title: 'System Logs',
    description: 'System health, backups, and operational logs',
    icon: <Server className="h-6 w-6" />,
    href: '/admin/system',
    colorBg: 'bg-purple-50',
    colorBorder: 'border-purple-200',
    colorText: 'text-purple-700',
  },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminReportsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setSummaryLoading(true);
      setAuditLoading(true);
      try {
        const [summaryRes, auditRes] = await Promise.all([
          fetch('/api/analytics/summary', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/audit-logs?limit=10', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (summaryRes.success) setSummary(summaryRes.data);
        if (auditRes.success) setAuditRows(auditRes.data?.rows ?? []);
      } finally {
        setSummaryLoading(false);
        setAuditLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Reports &amp; Analytics</h1>
          <p className="admin-page-subtitle">
            Financial reports, occupancy analytics, and system activity
          </p>
        </div>
      </section>

      {/* Report category cards */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Report Categories
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {REPORT_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`group flex items-start gap-4 rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${card.colorBg} ${card.colorBorder}`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-white/70 shadow-sm ${card.colorBorder} ${card.colorText}`}
              >
                {card.icon}
              </div>
              <div>
                <div className={`font-semibold ${card.colorText} group-hover:underline`}>
                  {card.title}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{card.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Quick stats */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Quick Stats
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="admin-kpi">
            <div className="admin-kpi-label">Monthly Revenue</div>
            <div className="admin-kpi-value">
              {summaryLoading ? '...' : money(summary?.monthlyRevenue ?? 0)}
            </div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Paid Invoices</div>
            <div className="admin-kpi-value">
              {summaryLoading ? '...' : (summary?.paidInvoices ?? 0)}
            </div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Unpaid Invoices</div>
            <div className="admin-kpi-value">
              {summaryLoading ? '...' : (summary?.unpaidInvoices ?? 0)}
            </div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label">Overdue Invoices</div>
            <div className="admin-kpi-value text-red-700">
              {summaryLoading ? '...' : (summary?.overdueInvoices ?? 0)}
            </div>
          </div>
        </div>
      </section>

      {/* Recent activity timeline */}
      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title">Recent Activity</div>
          <Link href="/admin/audit-logs" className="admin-button text-xs">
            View All
          </Link>
        </div>

        {auditLoading ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            Loading recent activity...
          </div>
        ) : auditRows.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            No recent activity found.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {auditRows.map((row, i) => (
              <li key={row.id} className="flex items-start gap-4 px-6 py-3">
                {/* Timeline dot */}
                <div className="relative flex flex-col items-center">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-indigo-400 ring-2 ring-white" />
                  {i < auditRows.length - 1 && (
                    <div className="absolute top-4 h-full w-px bg-slate-100" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{row.action}</span>
                    <span className="admin-badge">{row.entityType}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    by {row.userName || row.userId} &middot; {timeAgo(row.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
