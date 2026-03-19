'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { exportToCsv } from '@/lib/utils/export-csv';

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
      roomTenants?: Array<{
        tenant?: {
          firstName?: string;
          lastName?: string;
        } | null;
      }>;
    } | null;
  } | null;
};

type ReviewPayload = {
  transactions: ReviewTransaction[];
  total: number;
};

export default function AdminPaymentsIndexPage() {
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [matched, setMatched] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [reviewRes, matchedRes] = await Promise.all([
          fetch('/api/payments/review?limit=10&offset=0').then((r) => r.json()),
          fetch('/api/payments/matched?limit=10&offset=0').then((r) => r.json()),
        ]);
        if (reviewRes.success) setReview(reviewRes.data);
        if (matchedRes.success) setMatched(matchedRes.data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const stats = useMemo(() => ({
    review: review?.total ?? 0,
    autoMatched: matched?.total ?? 0,
    totalVisible: (review?.transactions.length ?? 0) + (matched?.transactions.length ?? 0),
  }), [review, matched]);

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Payments</h1>
          <p className="admin-page-subtitle">Live payment-matching queue from the backend, split by manual review and auto-matched transactions.</p>
        </div>
        <div className="admin-toolbar">
          <button
            onClick={() => {
              const reviewRows = (review?.transactions ?? []).map((t) => ({
                date: t.transactionDate,
                room: t.invoice?.room?.roomNumber ?? '',
                tenant:
                  t.invoice?.room?.roomTenants
                    ?.map((rt) => `${rt.tenant?.firstName ?? ''} ${rt.tenant?.lastName ?? ''}`.trim())
                    .filter(Boolean)
                    .join(', ') ?? '',
                amount: t.amount,
                status: t.status,
                reference: t.reference ?? t.description ?? '',
                bank: '',
                queue: 'Review',
              }));
              const matchedRows = (matched?.transactions ?? []).map((t) => ({
                date: t.transactionDate,
                room: t.invoice?.room?.roomNumber ?? '',
                tenant:
                  t.invoice?.room?.roomTenants
                    ?.map((rt) => `${rt.tenant?.firstName ?? ''} ${rt.tenant?.lastName ?? ''}`.trim())
                    .filter(Boolean)
                    .join(', ') ?? '',
                amount: t.amount,
                status: t.status,
                reference: t.reference ?? t.description ?? '',
                bank: '',
                queue: 'Auto Matched',
              }));
              exportToCsv('payments-export', [...reviewRows, ...matchedRows], [
                { key: 'date',      header: 'Date' },
                { key: 'room',      header: 'Room No' },
                { key: 'tenant',    header: 'Tenant' },
                { key: 'amount',    header: 'Amount' },
                { key: 'status',    header: 'Status' },
                { key: 'reference', header: 'Reference' },
                { key: 'bank',      header: 'Bank' },
                { key: 'queue',     header: 'Queue' },
              ]);
            }}
            className="admin-button flex items-center gap-2"
            disabled={loading}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <Link href="/admin/payments/upload-statement" className="admin-button">Upload Statement</Link>
          <Link href="/admin/payments/review-match" className="admin-button admin-button-primary">Open Review Queue</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="admin-kpi"><div className="admin-kpi-label">Needs Review</div><div className="admin-kpi-value">{stats.review}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Auto Matched</div><div className="admin-kpi-value">{stats.autoMatched}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Visible Rows</div><div className="admin-kpi-value">{stats.totalVisible}</div></div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title">Manual Review Queue</div>
            <span className="admin-badge">{review?.total ?? 0}</span>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Matched Invoice</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading payment queue...</td></tr>
                ) : !review?.transactions.length ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No transactions waiting for review.</td></tr>
                ) : (
                  review.transactions.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.transactionDate).toLocaleString()}</td>
                      <td>{item.amount.toLocaleString()}</td>
                      <td>{item.reference || item.description || '-'}</td>
                      <td>{item.invoice?.id || '-'}</td>
                      <td>
                        <Link href={`/admin/payments/${item.id}`} className="admin-button text-xs">View →</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title">Auto Matched Queue</div>
            <span className="admin-badge">{matched?.total ?? 0}</span>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Room</th>
                  <th>Invoice</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading matches...</td></tr>
                ) : !matched?.transactions.length ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No auto-matched transactions.</td></tr>
                ) : (
                  matched.transactions.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.transactionDate).toLocaleString()}</td>
                      <td>{item.amount.toLocaleString()}</td>
                      <td>{item.invoice?.room?.roomNumber || '-'}</td>
                      <td>{item.invoice?.id || '-'}</td>
                      <td>
                        <Link href={`/admin/payments/${item.id}`} className="admin-button text-xs">View →</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
