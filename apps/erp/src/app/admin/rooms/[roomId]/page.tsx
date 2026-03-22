'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  DoorOpen,
  FileText,
  Hash,
  History,
  Home,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Wrench,
  XCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types — match actual Prisma schema & API responses
// ─────────────────────────────────────────────────────────────────────────────

type RoomStatus = 'ACTIVE' | 'INACTIVE';

interface Room {
  roomNo: string;
  floorNo: number;
  defaultAccountId: string;
  defaultRuleCode: string;
  defaultRentAmount: string;
  hasFurniture: boolean;
  defaultFurnitureAmount: string;
  roomStatus: RoomStatus;
  lineUserId: string | null;
  createdAt: string;
  updatedAt: string;
  roomTenants: Array<{
    role: string;
    tenant: {
      id: string;
      fullName: string;
      phone: string | null;
      lineUserId: string | null;
    } | null;
  }>;
}

interface Contract {
  id: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  deposit: number | null;
  status: string;
  tenant?: {
    id: string;
    fullName: string;
    phone: string | null;
    lineUserId: string | null;
  };
}

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  year: number;
  month: number;
  totalAmount: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  room?: { roomNo: string } | null;
}

interface MaintenanceTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(date: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('th-TH', opts ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount: number | string | null | undefined): string {
  if (amount == null) return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(num);
}

function fmtDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────

function roomStatusBadge(status: RoomStatus | string): { label: string; cls: string } {
  if (status === 'ACTIVE') return { label: 'ใช้งาน', cls: 'bg-emerald-100 text-emerald-700' };
  if (status === 'INACTIVE') return { label: 'ไม่ใช้งาน', cls: 'bg-slate-100 text-slate-500' };
  return { label: status, cls: 'bg-slate-100 text-slate-600' };
}

function invoiceStatusBadge(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT:     { label: 'ร่าง',        cls: 'bg-slate-100 text-slate-600' },
    GENERATED: { label: 'สร้างแล้ว',   cls: 'bg-blue-100 text-blue-700' },
    SENT:      { label: 'ส่งแล้ว',     cls: 'bg-indigo-100 text-indigo-700' },
    VIEWED:    { label: 'เปิดดูแล้ว', cls: 'bg-violet-100 text-violet-700' },
    PAID:      { label: 'ชำระแล้ว',   cls: 'bg-emerald-100 text-emerald-700' },
    OVERDUE:   { label: 'เกินกำหนด', cls: 'bg-red-100 text-red-600' },
  };
  return map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
}

function maintenanceStatusBadge(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    OPEN:        { label: 'รอดำเนินการ', cls: 'bg-red-100 text-red-700' },
    IN_PROGRESS: { label: 'กำลังซ่อม',  cls: 'bg-amber-100 text-amber-700' },
    RESOLVED:    { label: 'เสร็จแล้ว',   cls: 'bg-emerald-100 text-emerald-700' },
    CLOSED:      { label: 'ปิดแล้ว',     cls: 'bg-slate-100 text-slate-600' },
  };
  return map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
}

function StatusBadge({ status, cls }: { status: string; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / Error / Empty
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ message = 'กำลังโหลด...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm text-on-surface-variant">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <XCircle className="h-8 w-8 text-error" />
      <p className="text-sm text-on-surface-variant">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <RefreshCw className="h-3.5 w-3.5" /> ลองใหม่
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <Icon className="h-10 w-10 text-on-surface-variant/30" />
      <p className="text-sm font-medium text-on-surface-variant">{title}</p>
      <p className="text-xs text-on-surface-variant/60">{description}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Info row
// ─────────────────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant/10 bg-surface-container-lowest/80 px-4 py-3">
      {icon && <span className="mt-0.5 shrink-0 text-on-surface-variant">{icon}</span>}
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.07em] text-on-surface-variant">{label}</div>
        <div className="mt-0.5 text-sm font-medium text-on-surface">{value}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ room }: { room: Room }) {
  const statusCfg = roomStatusBadge(room.roomStatus);
  return (
    <div className="space-y-5">
      {/* Room Info Grid */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="border-b border-outline-variant bg-surface-container px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Info className="h-4 w-4 text-on-surface-variant" />
            ข้อมูลห้อง
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <InfoRow icon={<Hash className="h-4 w-4" />} label="หมายเลขห้อง" value={<span className="font-mono font-bold">{room.roomNo}</span>} />
          <InfoRow icon={<Building2 className="h-4 w-4" />} label="ชั้น" value={`ชั้น ${room.floorNo}`} />
          <InfoRow icon={<CircleDot className="h-4 w-4" />} label="สถานะ" value={<StatusBadge status={statusCfg.label} cls={statusCfg.cls} />} />
          <InfoRow icon={<DoorOpen className="h-4 w-4" />} label="สถานะระบบ" value={room.roomStatus === 'ACTIVE' ? 'ใช้งานได้' : 'ปิดใช้งาน'} />
          <InfoRow icon={<BedDouble className="h-4 w-4" />} label="ค่าเช่าเริ่มต้น" value={fmtMoney(room.defaultRentAmount)} />
          {room.hasFurniture && (
            <InfoRow icon={<BedDouble className="h-4 w-4" />} label="ค่าเฟอร์นิเจอร์" value={fmtMoney(room.defaultFurnitureAmount)} />
          )}
          <InfoRow icon={<Building2 className="h-4 w-4" />} label="บัญชีเริ่มต้น" value={room.defaultAccountId} />
          <InfoRow icon={<FileText className="h-4 w-4" />} label="กฎเรียกเก็บ" value={room.defaultRuleCode} />
        </div>
        <div className="border-t border-outline-variant/10 px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-on-surface-variant">
            สร้างเมื่อ {fmtDateTime(room.createdAt)} · อัปเดต {fmtDateTime(room.updatedAt)}
          </div>
        </div>
      </section>
    </div>
  );
}

function TenantTab({ roomNo }: { roomNo: string }) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts?roomNo=${encodeURIComponent(roomNo)}&status=ACTIVE&pageSize=1&sortBy=createdAt&sortOrder=desc`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่สามารถโหลดข้อมูลสัญญา');
      const items: Contract[] = json.data?.data ?? json.data ?? [];
      setContract(items.length > 0 ? items[0] : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!contract) return <EmptyState icon={FileText} title="ไม่มีสัญญาเช่า" description="ห้องนี้ไม่มีสัญญาเช่าที่ใช้งานอยู่" />;

  const t = contract.tenant;

  return (
    <div className="space-y-5">
      {/* Tenant Info */}
      {t && (
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="border-b border-outline-variant bg-surface-container px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <FileText className="h-4 w-4 text-on-surface-variant" />
              ผู้เช่าปัจจุบัน
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <InfoRow icon={<FileText className="h-4 w-4" />} label="ชื่อ-นามสกุล" value={t.fullName} />
            <InfoRow icon={<Info className="h-4 w-4" />} label="โทรศัพท์" value={t.phone ?? '—'} />
            <InfoRow
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="LINE"
              value={t.lineUserId ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  เชื่อมต่อแล้ว
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                  ยังไม่เชื่อมต่อ
                </span>
              )}
            />
          </div>
        </section>
      )}

      {/* Contract Info */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="border-b border-outline-variant bg-surface-container px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <FileText className="h-4 w-4 text-on-surface-variant" />
            สัญญาเช่าที่ใช้งาน
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <InfoRow icon={<Calendar className="h-4 w-4" />} label="วันเริ่มสัญญา" value={fmt(contract.startDate)} />
          <InfoRow icon={<Calendar className="h-4 w-4" />} label="วันสิ้นสุด" value={contract.endDate ? fmt(contract.endDate) : 'ไม่กำหนด'} />
          <InfoRow icon={<FileText className="h-4 w-4" />} label="ค่าเช่ารายเดือน" value={<span className="text-primary font-semibold">{fmtMoney(contract.monthlyRent)}</span>} />
          <InfoRow icon={<FileText className="h-4 w-4" />} label="เงินมัดจำ" value={contract.deposit != null ? fmtMoney(contract.deposit) : '—'} />
          <InfoRow
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="สถานะสัญญา"
            value={<StatusBadge status={contract.status} cls={contract.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'} />}
          />
          <InfoRow icon={<Hash className="h-4 w-4" />} label="รหัสสัญญา" value={<span className="font-mono text-xs">{contract.id.slice(0, 8)}…</span>} />
        </div>
      </section>
    </div>
  );
}

function InvoicesTab({ roomNo }: { roomNo: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices?roomNo=${encodeURIComponent(roomNo)}&pageSize=20&sortBy=createdAt&sortOrder=desc`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่สามารถโหลดใบแจ้งหนี้');
      const items: Invoice[] = json.data?.data ?? json.data ?? [];
      setInvoices(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (invoices.length === 0) return <EmptyState icon={FileText} title="ไม่มีใบแจ้งหนี้" description="ยังไม่มีการออกใบแจ้งหนี้สำหรับห้องนี้" />;

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
      <div className="border-b border-outline-variant bg-surface-container px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <FileText className="h-4 w-4 text-on-surface-variant" />
          ใบแจ้งหนี้
        </div>
        <span className="text-xs text-on-surface-variant">{invoices.length} รายการ</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container">
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เลขที่ใบแจ้งหนี้</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ประจำเดือน</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ยอดรวม</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ครบกำหนด</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const badge = invoiceStatusBadge(inv.status);
              return (
                <tr key={inv.id} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-on-surface">{inv.invoiceNumber ?? inv.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-on-surface-variant">{TH_MONTHS[inv.month - 1]} {inv.year}</td>
                  <td className="px-4 py-3 text-right font-semibold text-on-surface">{fmtMoney(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{fmt(inv.dueDate)}</td>
                  <td className="px-4 py-3"><StatusBadge status={badge.label} cls={badge.cls} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaintenanceTab({ roomNo }: { roomNo: string }) {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/maintenance?roomNo=${encodeURIComponent(roomNo)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่สามารถโหลดรายการแจ้งซ่อม');
      const all: MaintenanceTicket[] = Array.isArray(json.data) ? json.data : (json.data?.data ?? []);
      setTickets(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (tickets.length === 0) return <EmptyState icon={Wrench} title="ไม่มีรายการแจ้งซ่อม" description="ไม่มีรายการแจ้งซ่อมสำหรับห้องนี้" />;

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
      <div className="border-b border-outline-variant bg-surface-container px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <Wrench className="h-4 w-4 text-on-surface-variant" />
          รายการแจ้งซ่อม
        </div>
        <span className="text-xs text-on-surface-variant">{tickets.length} รายการ</span>
      </div>
      <div className="divide-y divide-outline-variant/10">
        {tickets.map(ticket => {
          const badge = maintenanceStatusBadge(ticket.status);
          return (
            <div key={ticket.id} className="flex items-start justify-between gap-4 px-4 py-4 hover:bg-surface-container-lowest transition-colors">
              <div className="flex items-start gap-3">
                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                  ticket.status === 'OPEN' ? 'bg-red-500' :
                  ticket.status === 'IN_PROGRESS' ? 'bg-amber-500' :
                  ticket.status === 'RESOLVED' ? 'bg-emerald-500' : 'bg-slate-400'
                }`} />
                <div>
                  <p className="text-sm font-semibold text-on-surface">{ticket.title}</p>
                  {ticket.description && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{ticket.description}</p>}
                  <p className="text-xs text-on-surface-variant/60 mt-1">{fmtDateTime(ticket.createdAt)}</p>
                </div>
              </div>
              <StatusBadge status={badge.label} cls={badge.cls} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryTab({ roomNo }: { roomNo: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-logs?limit=100`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่สามารถโหลดประวัติ');
      const all: AuditLogEntry[] = json.data?.rows ?? json.data ?? [];
      // Filter client-side by roomNo in entityId or details
      const filtered = all.filter(l =>
        l.entityId === roomNo ||
        (l.details as Record<string, unknown>)?.roomNo === roomNo
      );
      setLogs(filtered.slice(0, 50));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (logs.length === 0) return <EmptyState icon={History} title="ไม่มีประวัติ" description="ไม่พบรายการประวัติสำหรับห้องนี้" />;

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
      <div className="border-b border-outline-variant bg-surface-container px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <History className="h-4 w-4 text-on-surface-variant" />
          ประวัติการดำเนินการ
        </div>
        <span className="text-xs text-on-surface-variant">{logs.length} รายการ</span>
      </div>
      <div className="divide-y divide-outline-variant/10">
        {logs.map((log, i) => (
          <div key={log.id} className="flex gap-4 px-4 py-4">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-primary-container text-primary mt-1.5 shrink-0" />
              {i < logs.length - 1 && <div className="w-px flex-1 bg-outline-variant/30 mt-1" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold text-on-surface">{log.action}</span>
                  {log.actorName && <span className="text-xs text-on-surface-variant ml-2">โดย {log.actorName}</span>}
                </div>
                <span className="text-xs text-on-surface-variant shrink-0">{fmtDateTime(log.createdAt)}</span>
              </div>
              {log.details && Object.keys(log.details).length > 0 && (
                <pre className="mt-1.5 rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'tenant' | 'invoices' | 'maintenance' | 'history';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview',    label: 'ภาพรวม',     icon: Home },
  { id: 'tenant',      label: 'สัญญา/ผู้เช่า', icon: FileText },
  { id: 'invoices',    label: 'ใบแจ้งหนี้',   icon: FileText },
  { id: 'maintenance', label: 'แจ้งซ่อม',     icon: Wrench },
  { id: 'history',     label: 'ประวัติ',       icon: History },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const roomNo = params?.roomId as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [successMsg] = useState<string | null>(null);

  const loadRoom = useCallback(async () => {
    if (!roomNo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomNo)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่พบห้องพัก');
      setRoom(json.data as Room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="space-y-6">
        <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
          <div className="flex items-center gap-3">
            <Link href="/admin/rooms" className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm hover:bg-surface-container">
              <ArrowLeft className="h-4 w-4 text-on-primary" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-on-primary">รายละเอียดห้อง</h1>
              <p className="text-sm text-on-primary/80">กำลังโหลด...</p>
            </div>
          </div>
        </section>
        <div className="flex justify-center py-20"><Spinner /></div>
      </main>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────
  if (error || !room) {
    return (
      <main className="space-y-6">
        <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
          <div className="flex items-center gap-3">
            <Link href="/admin/rooms" className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
              <ArrowLeft className="h-4 w-4 text-on-primary" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-on-primary">รายละเอียดห้อง</h1>
            </div>
          </div>
        </section>
        <div className="rounded-xl border border-error/30 bg-error-container/20 px-5 py-4 text-sm text-error">
          {error ?? 'ไม่พบห้องพัก'}
        </div>
        <button
          onClick={() => void loadRoom()}
          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm hover:bg-surface-container"
        >
          <RefreshCw className="h-4 w-4" /> ลองใหม่
        </button>
      </main>
    );
  }

  const statusCfg = roomStatusBadge(room.roomStatus);

  return (
    <main className="space-y-6">
      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-sm text-on-surface-variant">
        <Link href="/admin/rooms" className="hover:text-on-surface transition-colors">ห้องพัก</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-on-surface">{room.roomNo}</span>
      </nav>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-primary shadow-sm">
              <BedDouble className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-on-primary">ห้อง {room.roomNo}</h1>
                <StatusBadge status={statusCfg.label} cls={statusCfg.cls.replace('emerald', 'white').replace('slate', 'white/60').replace('100', '20').replace('700', 'brightness-0'.replace('500', 'brightness-0'))} />
              </div>
              <p className="text-sm text-on-primary/80 mt-0.5">
                ชั้น {room.floorNo} · ค่าเช่า {fmtMoney(room.defaultRentAmount)}/เดือน
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/rooms"
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
            >
              <ArrowLeft className="h-4 w-4" /> กลับ
            </Link>
            <button
              onClick={() => router.push(`/admin/rooms?edit=${encodeURIComponent(room.roomNo)}`)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
            >
              <Pencil className="h-4 w-4" /> แก้ไข
            </button>
          </div>
        </div>
      </section>

      {/* ── Success banner ───────────────────────────────────────────────── */}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-800">{successMsg}</p>
        </div>
      )}

      {/* ── Tab Navigation ───────────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="border-b border-outline-variant overflow-x-auto">
          <nav className="flex min-w-max">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                    ${isActive
                      ? 'border-primary text-primary bg-primary-container/30'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }
                  `}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-on-surface-variant'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'overview' && <OverviewTab room={room} />}
          {activeTab === 'tenant' && <TenantTab roomNo={room.roomNo} />}
          {activeTab === 'invoices' && <InvoicesTab roomNo={room.roomNo} />}
          {activeTab === 'maintenance' && <MaintenanceTab roomNo={room.roomNo} />}
          {activeTab === 'history' && <HistoryTab roomNo={room.roomNo} />}
        </div>
      </div>
    </main>
  );
}
