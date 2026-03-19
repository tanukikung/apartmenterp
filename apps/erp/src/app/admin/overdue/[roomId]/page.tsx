'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CreditCard,
  DollarSign,
  MessageSquare,
  User,
} from 'lucide-react';
import { daysSince } from '../date-utils';

type Invoice = {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  dueDate: string;
  status: string;
  createdAt: string;
};

type RoomTenantEntry = {
  tenant?: {
    id: string;
    fullName: string;
    phone: string;
    lineUserId: string | null;
  } | null;
  role: string;
};

type Room = {
  id: string;
  roomNumber: string;
  floor?: { floorNumber: number } | null;
  roomTenants?: RoomTenantEntry[] | null;
};

export default function OverdueRoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifyWorking, setNotifyWorking] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [roomRes, invRes] = await Promise.all([
          fetch(`/api/rooms/${roomId}`, { cache: 'no-store' }).then((r) => r.json()),
          fetch(`/api/invoices?roomId=${roomId}&status=OVERDUE&pageSize=50`, { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (!roomRes.success) throw new Error((roomRes.error?.message as string | undefined) || 'Room not found');
        setRoom(roomRes.data as Room);
        if (invRes.success) {
          const raw = invRes.data;
          const arr: Invoice[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
          setInvoices(arr);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load data');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [roomId]);

  async function sendReminder() {
    const primaryTenant = room?.roomTenants?.find((rt) => rt.role === 'PRIMARY')?.tenant;
    if (!primaryTenant) {
      setNotifyMsg('No primary tenant linked to this room.');
      return;
    }
    setNotifyWorking(true);
    setNotifyMsg(null);
    try {
      const res = await fetch(`/api/tenants/${primaryTenant.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'overdue_reminder' }),
      }).then((r) => r.json());
      if (res.success) {
        setNotifyMsg('Reminder sent successfully.');
      } else {
        setNotifyMsg((res.error?.message as string | undefined) || 'Failed to send reminder.');
      }
    } catch {
      setNotifyMsg('Unable to send reminder.');
    } finally {
      setNotifyWorking(false);
    }
  }

  const primaryTenant = room?.roomTenants?.find((rt) => rt.role === 'PRIMARY')?.tenant;
  const totalOverdue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const oldestDue = invoices.reduce<string | null>((oldest, inv) => {
    if (!oldest) return inv.dueDate;
    return inv.dueDate < oldest ? inv.dueDate : oldest;
  }, null);
  const maxOverdueDays = oldestDue ? daysSince(oldestDue) : 0;

  const totalFormatted = new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(totalOverdue);

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/overdue"
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Overdue
          </Link>
          <span className="text-slate-300">/</span>
          <div>
            <h1 className="admin-page-title">
              {loading ? 'Loading...' : `Room ${room?.roomNumber ?? roomId}`}
            </h1>
            <p className="admin-page-subtitle">Overdue account detail &amp; actions</p>
          </div>
        </div>
        <div className="admin-toolbar">
          <button
            className="admin-button flex items-center gap-2"
            onClick={() => void sendReminder()}
            disabled={notifyWorking || loading}
          >
            <MessageSquare className="h-4 w-4" />
            {notifyWorking ? 'Sending...' : 'Send Reminder'}
          </button>
          <Link
            href={`/admin/payments?roomId=${roomId}`}
            className="admin-button admin-button-primary flex items-center gap-2"
          >
            <CreditCard className="h-4 w-4" />
            Record Payment
          </Link>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
      {notifyMsg ? (
        <div className={`auth-alert ${notifyMsg.includes('success') ? 'auth-alert-success' : 'auth-alert-error'}`}>
          {notifyMsg}
        </div>
      ) : null}

      {/* KPI row */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="admin-kpi">
          <div className="flex items-start justify-between">
            <div>
              <div className="admin-kpi-label">Total Overdue</div>
              <div className="admin-kpi-value text-red-700">{loading ? '...' : totalFormatted}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50">
              <DollarSign className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
        <div className="admin-kpi">
          <div className="flex items-start justify-between">
            <div>
              <div className="admin-kpi-label">Overdue Invoices</div>
              <div className="admin-kpi-value">{loading ? '...' : invoices.length}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="admin-kpi">
          <div className="flex items-start justify-between">
            <div>
              <div className="admin-kpi-label">Days Overdue (max)</div>
              <div className="admin-kpi-value text-red-700">{loading ? '...' : maxOverdueDays}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
              <Calendar className="h-5 w-5 text-slate-600" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Overdue invoices table */}
        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title">Overdue Invoices</div>
            <span className="admin-badge">{invoices.length}</span>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Days Overdue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      Loading invoices...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      No overdue invoices found.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const days = daysSince(inv.dueDate);
                    return (
                      <tr key={inv.id}>
                        <td className="font-medium">{inv.invoiceNumber}</td>
                        <td>
                          {new Intl.NumberFormat('th-TH', {
                            style: 'currency',
                            currency: 'THB',
                            maximumFractionDigits: 0,
                          }).format(inv.totalAmount)}
                        </td>
                        <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                        <td>
                          <span className={`font-semibold ${days > 30 ? 'text-red-700' : 'text-amber-700'}`}>
                            {days}d
                          </span>
                        </td>
                        <td>
                          <span className="admin-badge admin-status-error">{inv.status}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sidebar */}
        <div className="space-y-4">
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-1.5">
                <User className="h-4 w-4 text-slate-400" /> Primary Tenant
              </div>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="text-sm text-slate-500">Loading...</div>
              ) : primaryTenant ? (
                <div className="space-y-2">
                  <div className="font-semibold text-slate-900">{primaryTenant.fullName}</div>
                  <div className="text-sm text-slate-500">{primaryTenant.phone}</div>
                  <div className="text-xs text-slate-400">
                    LINE: {primaryTenant.lineUserId ? 'Linked' : 'Not linked'}
                  </div>
                  <Link
                    href={`/admin/tenants/${primaryTenant.id}`}
                    className="admin-button block w-full text-center text-xs"
                  >
                    View Tenant →
                  </Link>
                </div>
              ) : (
                <div className="text-sm text-slate-400">No primary tenant assigned.</div>
              )}
            </div>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Quick Actions</div>
            </div>
            <div className="grid gap-2 p-4">
              <button
                className="admin-button flex items-center justify-center gap-2"
                onClick={() => void sendReminder()}
                disabled={notifyWorking}
              >
                <MessageSquare className="h-4 w-4" />
                Send Overdue Reminder
              </button>
              <Link
                href={`/admin/payments?roomId=${roomId}`}
                className="admin-button admin-button-primary flex items-center justify-center gap-2"
              >
                <CreditCard className="h-4 w-4" />
                Record Payment
              </Link>
              <Link
                href={`/admin/rooms/${roomId}`}
                className="admin-button flex items-center justify-center gap-2"
              >
                View Room Detail →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
