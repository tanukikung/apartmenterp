'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Calendar, DollarSign, Download, FileText, User } from 'lucide-react';

type InvoiceItem = {
  id: string;
  description: string;
  amount: number;
  quantity: number;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  dueDate: string;
  createdAt: string;
  room?: {
    id: string;
    roomNumber: string;
    floor?: { floorNumber: number } | null;
  } | null;
  tenant?: {
    id: string;
    fullName: string;
    phone: string;
  } | null;
  items?: InvoiceItem[];
};

function statusBadgeClass(status: string): string {
  if (status === 'PAID') return 'admin-badge admin-status-good';
  if (status === 'OVERDUE') return 'admin-badge admin-status-error';
  if (status === 'UNPAID') return 'admin-badge admin-status-warn';
  return 'admin-badge';
}

export default function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/invoices/${documentId}`, { cache: 'no-store' }).then((r) => r.json());
        if (!res.success) throw new Error((res.error?.message as string | undefined) || 'Document not found');
        setInvoice(res.data as Invoice);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load document');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [documentId]);

  function handleDownloadPdf() {
    setPdfMsg('PDF generation is not available in this environment.');
    setTimeout(() => setPdfMsg(null), 4000);
  }

  if (loading) {
    return (
      <main className="admin-page">
        <div className="py-16 text-center text-slate-500">Loading document...</div>
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="admin-page">
        <div className="auth-alert auth-alert-error">{error ?? 'Document not found'}</div>
        <Link href="/admin/documents" className="admin-button mt-4">
          ← Documents
        </Link>
      </main>
    );
  }

  const totalFormatted = new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(invoice.totalAmount);

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/documents"
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Documents
          </Link>
          <span className="text-slate-300">/</span>
          <div>
            <h1 className="admin-page-title">{invoice.invoiceNumber}</h1>
            <p className="admin-page-subtitle">Invoice document detail</p>
          </div>
        </div>
        <div className="admin-toolbar">
          <button className="admin-button flex items-center gap-2" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        </div>
      </section>

      {pdfMsg ? <div className="auth-alert auth-alert-error">{pdfMsg}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main details */}
        <div className="space-y-6">
          {/* Invoice summary card */}
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-500" />
                Invoice Details
              </div>
              <span className={statusBadgeClass(invoice.status)}>{invoice.status}</span>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Invoice #</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{invoice.invoiceNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Amount</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{totalFormatted}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <Calendar className="h-3 w-3" /> Due Date
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {new Date(invoice.dueDate).toLocaleDateString('th-TH', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <Calendar className="h-3 w-3" /> Created
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {new Date(invoice.createdAt).toLocaleDateString('th-TH', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Line items */}
          <section className="admin-card overflow-hidden">
            <div className="admin-card-header">
              <div className="admin-card-title">Line Items</div>
            </div>
            {invoice.items && invoice.items.length > 0 ? (
              <div className="overflow-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td className="text-right">{item.quantity}</td>
                        <td className="text-right font-semibold">
                          {new Intl.NumberFormat('th-TH', {
                            style: 'currency',
                            currency: 'THB',
                            maximumFractionDigits: 0,
                          }).format(item.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                      <td colSpan={2} className="text-right">
                        Total
                      </td>
                      <td className="text-right">{totalFormatted}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-500">No line items recorded.</div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Room */}
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-slate-400" /> Room
              </div>
            </div>
            <div className="p-4">
              {invoice.room ? (
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-slate-900">{invoice.room.roomNumber}</div>
                  {invoice.room.floor && (
                    <div className="text-sm text-slate-500">Floor {invoice.room.floor.floorNumber}</div>
                  )}
                  <Link
                    href={`/admin/rooms/${invoice.room.id}`}
                    className="admin-button block w-full text-center text-xs"
                  >
                    View Room →
                  </Link>
                </div>
              ) : (
                <div className="text-sm text-slate-400">No room linked</div>
              )}
            </div>
          </section>

          {/* Tenant */}
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-1.5">
                <User className="h-4 w-4 text-slate-400" /> Tenant
              </div>
            </div>
            <div className="p-4">
              {invoice.tenant ? (
                <div className="space-y-2">
                  <div className="font-semibold text-slate-900">{invoice.tenant.fullName}</div>
                  <div className="text-sm text-slate-500">{invoice.tenant.phone}</div>
                  <Link
                    href={`/admin/tenants/${invoice.tenant.id}`}
                    className="admin-button block w-full text-center text-xs"
                  >
                    View Tenant →
                  </Link>
                </div>
              ) : (
                <div className="text-sm text-slate-400">No tenant linked</div>
              )}
            </div>
          </section>

          {/* Amount */}
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-slate-400" /> Amount
              </div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-slate-900">{totalFormatted}</div>
              <span className={`mt-2 inline-flex ${statusBadgeClass(invoice.status)}`}>
                {invoice.status}
              </span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
