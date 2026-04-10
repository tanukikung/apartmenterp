'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
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
        if (!roomRes.success) throw new Error((roomRes.error?.message as string | undefined) || 'ไม่พบข้อมูลห้อง');
        setRoom(roomRes.data as Room);
        if (invRes.success) {
          const raw = invRes.data;
          const arr: Invoice[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
          setInvoices(arr);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูล');
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
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/overdue" className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-[var(--on-primary)] shadow-sm transition-colors hover:bg-white/30">
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </Link>
            <div>
              <h1 className="text-base font-semibold text-[var(--on-primary)]">
                {loading ? 'กำลังโหลด...' : `ห้อง ${room?.roomNumber ?? roomId}`}
              </h1>
              <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">รายละเอียดและการดำเนินการบัญชีค้างชำระ</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
              onClick={() => void sendReminder()}
              disabled={notifyWorking || loading}
            >
              <MessageSquare className="h-4 w-4" />
              {notifyWorking ? 'กำลังส่ง...' : 'ส่งเตือน'}
            </button>
            <Link
              href={`/admin/payments?roomId=${roomId}`}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
            >
              <CreditCard className="h-4 w-4" />
              บันทึกการชำระ
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
      {notifyMsg ? (
        <div className={`auth-alert ${notifyMsg.includes('success') ? 'auth-alert-success' : 'auth-alert-error'}`}>
          {notifyMsg}
        </div>
      ) : null}

      {/* KPI row */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-[var(--on-surface-variant)]">ยอดค้างทั้งหมด</div>
              <div className="text-xl font-semibold text-[var(--on-surface)] mt-1">{loading ? '...' : totalFormatted}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50">
              <DollarSign className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-[var(--on-surface-variant)]">ใบแจ้งหนี้ค้างชำระ</div>
              <div className="text-xl font-semibold text-[var(--on-surface)] mt-1">{loading ? '...' : invoices.length}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-[var(--on-surface-variant)]">จำนวนวันค้างชำระ (สูงสุด)</div>
              <div className="text-xl font-semibold text-[var(--on-surface)] mt-1">{loading ? '...' : maxOverdueDays}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
              <Calendar className="h-5 w-5 text-[var(--on-surface-variant)]" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Overdue invoices table */}
        <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--outline-variant)]">
            <div className="text-sm font-semibold text-[var(--on-surface)]">ใบแจ้งหนี้ค้างชำระ</div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-container)] px-2.5 py-0.5 text-xs font-semibold text-[var(--on-surface)]">{invoices.length}</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--on-surface-variant)]">ใบแจ้งหนี้ #</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--on-surface-variant)]">จำนวน</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--on-surface-variant)]">วันครบกำหนด</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--on-surface-variant)]">ค้าง (วัน)</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--on-surface-variant)]">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--on-surface-variant)]">
                      กำลังโหลดใบแจ้งหนี้...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--on-surface-variant)]">
                      ไม่พบใบแจ้งหนี้ค้างชำระ
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const days = daysSince(inv.dueDate);
                    return (
                      <tr key={inv.id} className="border-b border-[var(--outline-variant)]/50 hover:bg-[var(--surface-container-low)]">
                        <td className="px-4 py-3 font-medium text-[var(--on-surface)]">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-[var(--on-surface)]">
                          {new Intl.NumberFormat('th-TH', {
                            style: 'currency',
                            currency: 'THB',
                            maximumFractionDigits: 0,
                          }).format(inv.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-[var(--on-surface)]"><ClientOnly fallback="-">{new Date(inv.dueDate).toLocaleDateString('th-TH')}</ClientOnly></td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${days > 30 ? 'text-red-700' : 'text-amber-700'}`}>
                            {days}d
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">{inv.status}</span>
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
          <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--outline-variant)]">
              <User className="h-4 w-4 text-[var(--on-surface-variant)]" />
              <div className="text-sm font-semibold text-[var(--on-surface)]">ผู้เช่าหลัก</div>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="text-sm text-[var(--on-surface-variant)]">กำลังโหลด...</div>
              ) : primaryTenant ? (
                <div className="space-y-2">
                  <div className="font-semibold text-[var(--on-surface)]">{primaryTenant.fullName}</div>
                  <div className="text-sm text-[var(--on-surface-variant)]">{primaryTenant.phone}</div>
                  <div className="text-xs text-outline-variant">
                    LINE: {primaryTenant.lineUserId ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}
                  </div>
                  <Link
                    href={`/admin/tenants/${primaryTenant.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)] w-full"
                  >
                    ดูผู้เช่า →
                  </Link>
                </div>
              ) : (
                <div className="text-sm text-[var(--on-surface-variant)]">ไม่มีผู้เช่าหลักที่กำหนด</div>
              )}
            </div>
          </section>

          <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--outline-variant)]">
              <div className="text-sm font-semibold text-[var(--on-surface)]">การดำเนินการด่วน</div>
            </div>
            <div className="grid gap-2 p-4">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
                onClick={() => void sendReminder()}
                disabled={notifyWorking}
              >
                <MessageSquare className="h-4 w-4" />
                ส่งเตือนค้างชำระ
              </button>
              <Link
                href={`/admin/payments?roomId=${roomId}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
              >
                <CreditCard className="h-4 w-4" />
                บันทึกการชำระ
              </Link>
              <Link
                href={`/admin/rooms/${roomId}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
              >
                ดูรายละเอียดห้อง →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
