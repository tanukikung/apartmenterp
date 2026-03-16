'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  ChevronRight,
  Home,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Wrench,
  FileText,
  CreditCard,
  Users,
  BarChart3,
  History,
  Pencil,
  RefreshCw,
  ArrowLeft,
  Phone,
  Calendar,
  Banknote,
  Hash,
  Info,
  BedDouble,
  CircleDot,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RoomStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'SELF_USE' | 'UNAVAILABLE';
type RoomUsageType = 'RENTAL' | 'SELF_USE' | 'RESERVED' | 'STORAGE';
type RoomBillingStatus = 'BILLABLE' | 'NON_BILLABLE' | 'SUSPENDED';
type InvoiceStatus = 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE';
type BillingStatus = 'DRAFT' | 'LOCKED' | 'INVOICED';
type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

interface Room {
  id: string;
  floorId: string;
  roomNumber: string;
  status: RoomStatus;
  capacity: number;
  usageType: RoomUsageType;
  billingStatus: RoomBillingStatus;
  defaultFurnitureFee?: number | null;
  sortOrder?: number | null;
  note?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  floor?: {
    id: string;
    floorNumber: number;
    buildingId: string;
  };
}

interface Tenant {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  lineUserId?: string | null;
  createdAt: string;
}

interface Contract {
  id: string;
  roomId: string;
  tenantId: string;
  startDate: string;
  endDate?: string | null;
  monthlyRent: number;
  deposit?: number | null;
  status: string;
  tenant?: Tenant;
}

interface BillingItem {
  id: string;
  typeCode: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface BillingRecord {
  id: string;
  roomId: string;
  year: number;
  month: number;
  status: BillingStatus;
  items: BillingItem[];
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber?: string | null;
  roomId: string;
  year: number;
  month: number;
  status: InvoiceStatus;
  totalAmount: number;
  dueDate?: string | null;
  createdAt: string;
}

interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  referenceNumber?: string | null;
  paidAt?: string | null;
  status?: string;
  createdAt: string;
}

interface MaintenanceTicket {
  id: string;
  roomId: string;
  title: string;
  description?: string | null;
  status: MaintenanceStatus;
  priority?: string | null;
  createdAt: string;
  updatedAt: string;
  room?: { roomNumber: string };
  tenant?: { name: string } | null;
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  actorName?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(date: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('th-TH', opts ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(amount);
}

function fmtDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─────────────────────────────────────────────────────────────────────────────
// Status badge configs
// ─────────────────────────────────────────────────────────────────────────────

const ROOM_STATUS_CONFIG: Record<RoomStatus, { label: string; cls: string }> = {
  VACANT:      { label: 'Vacant',      cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  OCCUPIED:    { label: 'Occupied',    cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  MAINTENANCE: { label: 'Maintenance', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  SELF_USE:    { label: 'Self Use',    cls: 'bg-purple-100 text-purple-800 ring-purple-200' },
  UNAVAILABLE: { label: 'Unavailable', cls: 'bg-red-100 text-red-800 ring-red-200' },
};

const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  GENERATED: { label: 'Generated', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  SENT:      { label: 'Sent',      cls: 'bg-blue-100 text-blue-700 ring-blue-200' },
  VIEWED:    { label: 'Viewed',    cls: 'bg-indigo-100 text-indigo-700 ring-indigo-200' },
  PAID:      { label: 'Paid',      cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  OVERDUE:   { label: 'Overdue',   cls: 'bg-red-100 text-red-700 ring-red-200' },
};

const BILLING_STATUS_CONFIG: Record<BillingStatus, { label: string; cls: string }> = {
  DRAFT:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  LOCKED:   { label: 'Locked',   cls: 'bg-amber-100 text-amber-700 ring-amber-200' },
  INVOICED: { label: 'Invoiced', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
};

const MAINTENANCE_STATUS_CONFIG: Record<MaintenanceStatus, { label: string; cls: string }> = {
  OPEN:        { label: 'Open',        cls: 'bg-red-100 text-red-700 ring-red-200' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700 ring-amber-200' },
  RESOLVED:    { label: 'Resolved',    cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  CLOSED:      { label: 'Closed',      cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

function StatusBadge({ status, config }: { status: string; config: Record<string, { label: string; cls: string }> }) {
  const cfg = config[status] ?? { label: status, cls: 'bg-slate-100 text-slate-700 ring-slate-200' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / Error / Empty states
// ─────────────────────────────────────────────────────────────────────────────

function TabSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
    </div>
  );
}

function TabError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <Icon className="h-10 w-10 text-slate-300" />
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Info grid row
// ─────────────────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm font-semibold text-slate-800">{value ?? '—'}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Change Modal
// ─────────────────────────────────────────────────────────────────────────────

const ROOM_STATUS_OPTIONS: RoomStatus[] = ['VACANT', 'OCCUPIED', 'MAINTENANCE', 'SELF_USE', 'UNAVAILABLE'];

interface StatusModalProps {
  currentStatus: RoomStatus;
  roomId: string;
  onClose: () => void;
  onSuccess: (updatedRoom: Room) => void;
}

function StatusChangeModal({ currentStatus, roomId, onClose, onSuccess }: StatusModalProps) {
  const [newStatus, setNewStatus] = useState<RoomStatus>(currentStatus);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newStatus === currentStatus) {
      onClose();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason: reason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to update status');
      onSuccess(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Change Room Status</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">New Status</label>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as RoomStatus)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {ROOM_STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>
                  {ROOM_STATUS_CONFIG[s].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Enter a reason for this status change..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading ? 'Saving…' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Overview
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ room, onChangeStatus }: { room: Room; onChangeStatus: () => void }) {
  return (
    <div className="space-y-6">
      {/* Room Info Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Info className="h-4 w-4 text-indigo-500" />
            Room Information
          </h3>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          <InfoRow label="Room Number" value={<span className="font-mono">{room.roomNumber}</span>} />
          <InfoRow
            label="Floor"
            value={room.floor ? `Floor ${room.floor.floorNumber}` : '—'}
          />
          <InfoRow
            label="Status"
            value={<StatusBadge status={room.status} config={ROOM_STATUS_CONFIG} />}
          />
          <InfoRow label="Capacity" value={`${room.capacity} person${room.capacity > 1 ? 's' : ''}`} />
          <InfoRow label="Usage Type" value={room.usageType.replace('_', ' ')} />
          <InfoRow
            label="Billing Status"
            value={<StatusBadge status={room.billingStatus} config={BILLING_STATUS_CONFIG as Record<string, { label: string; cls: string }>} />}
          />
          <InfoRow
            label="Default Furniture Fee"
            value={room.defaultFurnitureFee != null ? fmtMoney(room.defaultFurnitureFee) : '—'}
          />
          <InfoRow
            label="Active"
            value={
              room.isActive ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <XCircle className="h-3.5 w-3.5" /> Inactive
                </span>
              )
            }
          />
          {room.note && (
            <div className="col-span-2 md:col-span-4">
              <InfoRow label="Note" value={room.note} />
            </div>
          )}
        </div>
      </div>

      {/* Quick Status Change */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</h3>
        <button
          onClick={onChangeStatus}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Change Room Status
        </button>
      </div>

      {/* Timestamps */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Record Timestamps</h3>
        <div className="grid grid-cols-2 gap-6">
          <InfoRow label="Created At" value={fmtDateTime(room.createdAt)} />
          <InfoRow label="Last Updated" value={fmtDateTime(room.updatedAt)} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Tenant
// ─────────────────────────────────────────────────────────────────────────────

function TenantTab({ roomId }: { roomId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts?roomId=${roomId}&status=ACTIVE&pageSize=1&sortBy=createdAt&sortOrder=desc`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to load contract data');
      const items: Contract[] = json.data?.data ?? json.data ?? [];
      setContract(items.length > 0 ? items[0] : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TabSpinner />;
  if (error) return <TabError message={error} onRetry={load} />;

  if (!contract) {
    return (
      <EmptyState
        icon={Users}
        title="No active tenant"
        description="This room currently has no active tenant or contract."
      />
    );
  }

  const tenant = contract.tenant;

  return (
    <div className="space-y-6">
      {/* Tenant Info */}
      {tenant && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              Current Tenant
            </h3>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            <InfoRow label="Name" value={tenant.name} />
            <InfoRow
              label="Phone"
              value={
                tenant.phone ? (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    {tenant.phone}
                  </span>
                ) : '—'
              }
            />
            <InfoRow label="Email" value={tenant.email ?? '—'} />
            <InfoRow
              label="LINE Status"
              value={
                tenant.lineUserId ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 ring-1 ring-inset ring-green-200">
                    <CheckCircle2 className="h-3 w-3" /> Linked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200">
                    <XCircle className="h-3 w-3" /> Not linked
                  </span>
                )
              }
            />
          </div>
        </div>
      )}

      {/* Contract Info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            Active Contract
          </h3>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          <InfoRow
            label="Start Date"
            value={
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {fmt(contract.startDate)}
              </span>
            }
          />
          <InfoRow
            label="End Date"
            value={contract.endDate ? (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {fmt(contract.endDate)}
              </span>
            ) : <span className="text-slate-400 text-sm">Open-ended</span>}
          />
          <InfoRow
            label="Monthly Rent"
            value={
              <span className="flex items-center gap-1 text-indigo-700">
                <Banknote className="h-3.5 w-3.5" />
                {fmtMoney(contract.monthlyRent)}
              </span>
            }
          />
          <InfoRow
            label="Deposit"
            value={contract.deposit != null ? fmtMoney(contract.deposit) : '—'}
          />
          <InfoRow
            label="Contract Status"
            value={
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <CheckCircle2 className="h-3 w-3" /> {contract.status}
              </span>
            }
          />
          <InfoRow label="Contract ID" value={<span className="font-mono text-xs">{contract.id.slice(0, 8)}…</span>} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Billing
// ─────────────────────────────────────────────────────────────────────────────

function BillingTab({ roomId }: { roomId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<BillingRecord[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing?roomId=${roomId}&pageSize=12&sortBy=createdAt&sortOrder=desc`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to load billing records');
      const items: BillingRecord[] = json.data?.data ?? json.data ?? [];
      setRecords(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TabSpinner />;
  if (error) return <TabError message={error} onRetry={load} />;
  if (records.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No billing records"
        description="No billing records have been created for this room yet."
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          Billing Records
        </h3>
        <span className="text-xs text-slate-400">{records.length} record{records.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {records.map(rec => {
          const total = rec.items?.reduce((s, i) => s + i.totalPrice, 0) ?? 0;
          const itemCount = rec.items?.length ?? 0;
          return (
            <div key={rec.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-sm">
                  {MONTH_NAMES[(rec.month ?? 1) - 1]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {MONTH_NAMES[(rec.month ?? 1) - 1]} {rec.year}
                  </p>
                  <p className="text-xs text-slate-500">
                    {itemCount} item{itemCount !== 1 ? 's' : ''} ·{' '}
                    {rec.items?.map(i => i.typeCode).join(', ') || 'No items'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-slate-800">{fmtMoney(total)}</span>
                <StatusBadge status={rec.status} config={BILLING_STATUS_CONFIG} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Invoices
// ─────────────────────────────────────────────────────────────────────────────

function InvoicesTab({ roomId }: { roomId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices?roomId=${roomId}&pageSize=20&sortBy=createdAt&sortOrder=desc`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to load invoices');
      const items: Invoice[] = json.data?.data ?? json.data ?? [];
      setInvoices(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TabSpinner />;
  if (error) return <TabError message={error} onRetry={load} />;
  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No invoices"
        description="No invoices have been generated for this room yet."
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-500" />
          Invoices
        </h3>
        <span className="text-xs text-slate-400">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map(inv => (
              <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-3.5">
                  <span className="font-mono text-xs text-slate-700">
                    {inv.invoiceNumber ?? inv.id.slice(0, 8) + '…'}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-slate-700">
                  {MONTH_NAMES[(inv.month ?? 1) - 1]} {inv.year}
                </td>
                <td className="px-4 py-3.5 text-slate-500 text-xs">
                  {fmt(inv.dueDate)}
                </td>
                <td className="px-4 py-3.5 text-right font-semibold text-slate-800">
                  {fmtMoney(inv.totalAmount)}
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={inv.status} config={INVOICE_STATUS_CONFIG} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Payments
// ─────────────────────────────────────────────────────────────────────────────

function PaymentsTab({ roomId }: { roomId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Payments are linked via invoices; fetch invoices first then derive payments
      // The payments API doesn't support roomId directly, so we go through invoices
      const invRes = await fetch(`/api/invoices?roomId=${roomId}&pageSize=50&sortBy=createdAt&sortOrder=desc`);
      const invJson = await invRes.json();
      if (!invRes.ok) throw new Error(invJson.message ?? 'Failed to load data');

      const invoices: Invoice[] = invJson.data?.data ?? invJson.data ?? [];
      // Collect payments from invoice data (if embedded) or show invoice payments summary
      // Since payments API returns by invoiceId, we build a summary from paid invoices
      const paidInvoices = invoices.filter(i => i.status === 'PAID');
      // Map paid invoices as payment entries (best effort without a payments list endpoint)
      const syntheticPayments: Payment[] = paidInvoices.map(inv => ({
        id: inv.id,
        invoiceId: inv.id,
        amount: inv.totalAmount,
        method: '—',
        referenceNumber: inv.invoiceNumber ?? undefined,
        paidAt: undefined,
        status: 'PAID',
        createdAt: inv.createdAt,
      }));
      setPayments(syntheticPayments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TabSpinner />;
  if (error) return <TabError message={error} onRetry={load} />;
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No payments"
        description="No payment records found for this room."
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-indigo-500" />
          Payment History
        </h3>
        <span className="text-xs text-slate-400">{payments.length} payment{payments.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-3.5 text-slate-700">{fmt(p.paidAt ?? p.createdAt)}</td>
                <td className="px-4 py-3.5 text-right font-semibold text-slate-800">{fmtMoney(p.amount)}</td>
                <td className="px-4 py-3.5 text-slate-600">{p.method}</td>
                <td className="px-4 py-3.5">
                  {p.referenceNumber ? (
                    <span className="font-mono text-xs text-slate-700">{p.referenceNumber}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    {p.status ?? 'PAID'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Maintenance
// ─────────────────────────────────────────────────────────────────────────────

function MaintenanceTab({ roomId }: { roomId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/maintenance`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to load maintenance tickets');
      const all: MaintenanceTicket[] = Array.isArray(json.data) ? json.data : (json.data?.data ?? []);
      // Filter client-side by roomId since the API doesn't support roomId param
      const filtered = all.filter(t => t.roomId === roomId);
      setTickets(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TabSpinner />;
  if (error) return <TabError message={error} onRetry={load} />;
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="No maintenance tickets"
        description="No maintenance requests have been filed for this room."
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-indigo-500" />
          Maintenance Tickets
        </h3>
        <span className="text-xs text-slate-400">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {tickets.map(ticket => (
          <div key={ticket.id} className="px-6 py-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 mt-2 ${
                  ticket.status === 'OPEN' ? 'bg-red-500' :
                  ticket.status === 'IN_PROGRESS' ? 'bg-amber-500' :
                  ticket.status === 'RESOLVED' ? 'bg-emerald-500' : 'bg-slate-400'
                }`} />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{ticket.title}</p>
                  {ticket.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{ticket.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-slate-400">{fmtDateTime(ticket.createdAt)}</span>
                    {ticket.tenant && (
                      <span className="text-xs text-slate-500">Reported by: {ticket.tenant.name}</span>
                    )}
                    {ticket.priority && (
                      <span className={`text-xs font-medium ${
                        ticket.priority === 'HIGH' || ticket.priority === 'URGENT'
                          ? 'text-red-600'
                          : ticket.priority === 'MEDIUM'
                          ? 'text-amber-600'
                          : 'text-slate-500'
                      }`}>
                        {ticket.priority} priority
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <StatusBadge status={ticket.status} config={MAINTENANCE_STATUS_CONFIG} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: History (Audit Logs)
// ─────────────────────────────────────────────────────────────────────────────

function HistoryTab({ roomId }: { roomId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-logs?entityType=ROOM&limit=50`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to load audit logs');
      const all: AuditLog[] = json.data?.rows ?? json.data ?? [];
      // Filter by entityId client-side
      const filtered = all.filter(l => l.entityId === roomId);
      setLogs(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TabSpinner />;
  if (error) return <TabError message={error} onRetry={load} />;
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No history"
        description="No audit log entries found for this room."
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <History className="h-4 w-4 text-indigo-500" />
          Audit History
        </h3>
        <span className="text-xs text-slate-400">{logs.length} entr{logs.length !== 1 ? 'ies' : 'y'}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {logs.map((log, idx) => (
          <div key={log.id} className="flex gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
            {/* Timeline dot */}
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
              {idx < logs.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold text-slate-800">{log.action}</span>
                  {log.actorName && (
                    <span className="text-xs text-slate-500 ml-2">by {log.actorName}</span>
                  )}
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{fmtDateTime(log.createdAt)}</span>
              </div>
              {log.details && Object.keys(log.details).length > 0 && (
                <div className="mt-1.5 rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
                  <pre className="text-xs text-slate-600 overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </div>
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

type TabId = 'overview' | 'tenant' | 'billing' | 'invoices' | 'payments' | 'maintenance' | 'history';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',     icon: Home },
  { id: 'tenant',       label: 'Tenant',       icon: Users },
  { id: 'billing',      label: 'Billing',      icon: BarChart3 },
  { id: 'invoices',     label: 'Invoices',     icon: FileText },
  { id: 'payments',     label: 'Payments',     icon: CreditCard },
  { id: 'maintenance',  label: 'Maintenance',  icon: Wrench },
  { id: 'history',      label: 'History',      icon: History },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadRoom = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Room not found');
      setRoom(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load room');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  function handleStatusSuccess(updatedRoom: Room) {
    setRoom(updatedRoom);
    setShowStatusModal(false);
    setSuccessMsg('Room status updated successfully.');
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  // ── Full page loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm text-slate-500">Loading room details…</p>
        </div>
      </div>
    );
  }

  // ── Full page error state ────────────────────────────────────────────────
  if (error || !room) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-lg font-semibold text-slate-800">Failed to load room</p>
          <p className="text-sm text-slate-500">{error ?? 'Room not found'}</p>
          <div className="flex gap-3">
            <button
              onClick={loadRoom}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
            <button
              onClick={() => router.push('/admin/rooms')}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Rooms
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50">
        {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1.5 py-3 text-sm text-slate-500">
              <button
                onClick={() => router.push('/admin')}
                className="hover:text-slate-800 transition-colors"
              >
                Admin
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              <button
                onClick={() => router.push('/admin/rooms')}
                className="hover:text-slate-800 transition-colors"
              >
                Rooms
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold text-slate-800">Room {room.roomNumber}</span>
            </nav>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* ── Success banner ──────────────────────────────────────────── */}
          {successMsg && (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <p className="text-sm font-medium text-emerald-800">{successMsg}</p>
            </div>
          )}

          {/* ── Room Header Card ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Left: identity */}
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white shadow-md">
                  <BedDouble className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                      Room {room.roomNumber}
                    </h1>
                    <StatusBadge status={room.status} config={ROOM_STATUS_CONFIG} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                    {room.floor && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        Floor {room.floor.floorNumber}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CircleDot className="h-3.5 w-3.5" />
                      {room.usageType.replace('_', ' ')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Hash className="h-3.5 w-3.5" />
                      {room.billingStatus}
                    </span>
                    {!room.isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 ring-1 ring-inset ring-red-200">
                        <XCircle className="h-3 w-3" /> Inactive
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => router.push('/admin/rooms')}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={() => setShowStatusModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Change Status
                </button>
                <button
                  onClick={() => router.push(`/admin/rooms?edit=${room.id}`)}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Room
                </button>
              </div>
            </div>
          </div>

          {/* ── Tab Navigation ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="border-b border-slate-200 overflow-x-auto">
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
                          ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }
                      `}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Tab content */}
            <div className="p-6">
              {activeTab === 'overview' && (
                <OverviewTab room={room} onChangeStatus={() => setShowStatusModal(true)} />
              )}
              {activeTab === 'tenant' && <TenantTab roomId={room.id} />}
              {activeTab === 'billing' && <BillingTab roomId={room.id} />}
              {activeTab === 'invoices' && <InvoicesTab roomId={room.id} />}
              {activeTab === 'payments' && <PaymentsTab roomId={room.id} />}
              {activeTab === 'maintenance' && <MaintenanceTab roomId={room.id} />}
              {activeTab === 'history' && <HistoryTab roomId={room.id} />}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Change Modal ────────────────────────────────────────────── */}
      {showStatusModal && (
        <StatusChangeModal
          currentStatus={room.status}
          roomId={room.id}
          onClose={() => setShowStatusModal(false)}
          onSuccess={handleStatusSuccess}
        />
      )}
    </>
  );
}
