'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Edit2,
  Search,
} from 'lucide-react';

// Natural sort collator for room numbers (e.g. "101" < "201" < "1001")
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// ── Types ──────────────────────────────────────────────────────────────────────

type RegistrationStatus = 'PENDING' | 'CORRECTION_REQUESTED' | 'APPROVED' | 'REJECTED';

type RegistrationWarning =
  | 'DUPLICATE_LINE_ACCOUNT'
  | 'CLAIMED_ROOM_MISMATCH'
  | 'ROOM_FULL'
  | 'NO_PRIMARY_TENANT';

type Registration = {
  id: string;
  lineDisplayName: string | null;
  lineUserId: string;
  phone: string | null;
  claimedRoom: string | null;
  status: RegistrationStatus;
  createdAt: string;
  rejectionReason: string | null;
  correctionNote: string | null;
  warnings: RegistrationWarning[];
};

type StatusTab = 'ALL' | RegistrationStatus;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(s: RegistrationStatus) {
  if (s === 'APPROVED') return 'bg-emerald-100 text-emerald-700';
  if (s === 'REJECTED') return 'bg-red-100 text-red-600';
  if (s === 'CORRECTION_REQUESTED') return 'bg-orange-100 text-orange-700';
  return 'bg-amber-100 text-amber-700';
}

function statusIcon(s: RegistrationStatus) {
  if (s === 'APPROVED') return <CheckCircle size={11} className="mr-1" />;
  if (s === 'REJECTED') return <XCircle size={11} className="mr-1" />;
  if (s === 'CORRECTION_REQUESTED') return <Edit2 size={11} className="mr-1" />;
  return <Clock size={11} className="mr-1" />;
}

function initials(name: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
    : (parts[0][0] ?? '?').toUpperCase();
}

const WARNING_META: Record<RegistrationWarning, { label: string; color: string }> = {
  DUPLICATE_LINE_ACCOUNT: { label: 'LINE already linked to a tenant', color: 'text-red-600 bg-red-50 border-red-200' },
  CLAIMED_ROOM_MISMATCH: { label: 'Claimed room not found', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  ROOM_FULL: { label: 'Room is at capacity', color: 'text-red-600 bg-red-50 border-red-200' },
  NO_PRIMARY_TENANT: { label: 'Room has no primary tenant', color: 'text-amber-700 bg-amber-50 border-amber-200' },
};

// ── Reject modal ──────────────────────────────────────────────────────────────

function RejectModal({
  onConfirm,
  onCancel,
  working,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  working: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-on-surface">Reject Registration</h2>
        <p className="mb-4 text-sm text-on-surface-variant">
          Optionally provide a reason. This will be stored with the record.
        </p>
        <textarea
          className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface mb-4"
          placeholder="Reason for rejection (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500 bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-600 hover:border-red-600"
            onClick={() => onConfirm(reason)}
            disabled={working}
          >
            <XCircle size={14} />
            {working ? 'Rejecting…' : 'Confirm Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Correction modal ──────────────────────────────────────────────────────────

function CorrectionModal({
  reg,
  onConfirm,
  onCancel,
  working,
}: {
  reg: Registration;
  onConfirm: (data: { phone: string; claimedRoom: string; correctionNote: string }) => void;
  onCancel: () => void;
  working: boolean;
}) {
  const [phone, setPhone] = useState(reg.phone ?? '');
  const [claimedRoom, setClaimedRoom] = useState(reg.claimedRoom ?? '');
  const [correctionNote, setCorrectionNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-on-surface">Request Correction</h2>
        <p className="mb-4 text-sm text-on-surface-variant">
          Update the registration details and send a correction note to the tenant.
        </p>

        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Phone</label>
            <input
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Claimed Room</label>
            <input
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              value={claimedRoom}
              onChange={(e) => setClaimedRoom(e.target.value)}
              placeholder="Room number (e.g. 101)"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">
              Correction Note <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              placeholder="Explain what needs to be corrected…"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500 bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 hover:border-orange-600"
            onClick={() => onConfirm({ phone, claimedRoom, correctionNote })}
            disabled={working || !correctionNote.trim()}
          >
            <Edit2 size={14} />
            {working ? 'Saving…' : 'Send Correction Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TenantRegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Registration | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<Registration | null>(null);
  const [roomSearch, setRoomSearch] = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tenant-registrations?pageSize=100', { cache: 'no-store' });
      const json = await res.json() as { success: boolean; data?: { data: Registration[] }; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'Unable to load registrations');
      const rows: Registration[] = json.data?.data ?? [];
      setRegistrations(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load registrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function approve(reg: Registration) {
    setWorking(`approve:${reg.id}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-registrations/${reg.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json()) as { success: boolean; message?: string; error?: { message?: string } };
      if (!res.success) throw new Error(res.error?.message ?? 'Unable to approve');
      setMessage(`Registration for ${reg.lineDisplayName ?? reg.lineUserId} approved.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve registration');
    } finally {
      setWorking(null);
    }
  }

  async function reject(reg: Registration, reason: string) {
    setWorking(`reject:${reg.id}`);
    setRejectTarget(null);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-registrations/${reg.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      }).then((r) => r.json()) as { success: boolean; error?: { message?: string } };
      if (!res.success) throw new Error(res.error?.message ?? 'Unable to reject');
      setMessage(`Registration for ${reg.lineDisplayName ?? reg.lineUserId} rejected.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject registration');
    } finally {
      setWorking(null);
    }
  }

  async function requestCorrection(
    reg: Registration,
    data: { phone: string; claimedRoom: string; correctionNote: string }
  ) {
    setWorking(`correction:${reg.id}`);
    setCorrectionTarget(null);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-registrations/${reg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: data.phone || undefined,
          claimedRoom: data.claimedRoom || undefined,
          correctionNote: data.correctionNote,
          requestCorrection: true,
        }),
      }).then((r) => r.json()) as { success: boolean; error?: { message?: string } };
      if (!res.success) throw new Error(res.error?.message ?? 'Unable to save correction');
      setMessage(`Correction requested for ${reg.lineDisplayName ?? reg.lineUserId}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request correction');
    } finally {
      setWorking(null);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const counts = {
    ALL: registrations.length,
    PENDING: registrations.filter((r) => r.status === 'PENDING').length,
    CORRECTION_REQUESTED: registrations.filter((r) => r.status === 'CORRECTION_REQUESTED').length,
    APPROVED: registrations.filter((r) => r.status === 'APPROVED').length,
    REJECTED: registrations.filter((r) => r.status === 'REJECTED').length,
  };

  // Count APPROVED registrations per claimed room for occupancy warnings
  const approvedPerRoom = new Map<string, number>();
  for (const r of registrations) {
    if (r.status === 'APPROVED' && r.claimedRoom) {
      approvedPerRoom.set(r.claimedRoom, (approvedPerRoom.get(r.claimedRoom) ?? 0) + 1);
    }
  }

  const searchLower = roomSearch.trim().toLowerCase();
  const visible = registrations
    .filter((r) => activeTab === 'ALL' || r.status === activeTab)
    .filter((r) => !searchLower || (r.claimedRoom ?? '').toLowerCase().includes(searchLower))
    .sort((a, b) => naturalCollator.compare(a.claimedRoom ?? '', b.claimedRoom ?? ''));

  const TABS: { id: StatusTab; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'PENDING', label: 'Pending' },
    { id: 'CORRECTION_REQUESTED', label: 'Correction' },
    { id: 'APPROVED', label: 'Approved' },
    { id: 'REJECTED', label: 'Rejected' },
  ];

  const isActionable = (reg: Registration) =>
    reg.status === 'PENDING' || reg.status === 'CORRECTION_REQUESTED';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-on-primary">Tenant Registrations</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">
              Review and action LINE registration requests from prospective tenants.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">
              <Clock size={11} className="mr-1" />
              {counts.PENDING} pending
            </span>
            {counts.CORRECTION_REQUESTED > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                <Edit2 size={11} className="mr-1" />
                {counts.CORRECTION_REQUESTED} correction
              </span>
            )}
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      {message && (
        <div className="auth-alert auth-alert-success flex items-center gap-2">
          <CheckCircle size={15} className="shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        {/* ── Status tabs ──────────────────────────────────────────────────── */}
        <div className="flex overflow-x-auto border-b border-outline-variant bg-surface-container-lowest">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label}
                <span
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    active ? 'bg-primary-container text-primary' : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Registration list ─────────────────────────────────────────────── */}
        <div className="p-5">
          {loading ? (
            <div className="py-14 text-center text-on-surface-variant">Loading registrations…</div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-lowest">
                <MessageSquare size={22} className="text-outline-variant" />
              </div>
              <div>
                <div className="font-medium text-on-surface">
                  {activeTab === 'PENDING' ? 'No pending registrations' : 'Nothing to show'}
                </div>
                <div className="text-sm text-on-surface-variant">
                  {activeTab === 'PENDING'
                    ? 'All registrations have been processed.'
                    : `No ${activeTab.toLowerCase().replace('_', ' ')} registrations found.`}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((reg) => (
                <div
                  key={reg.id}
                  className={`flex flex-col gap-4 rounded-xl border bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md ${
                    reg.status === 'PENDING'
                      ? 'border-amber-300'
                      : reg.status === 'CORRECTION_REQUESTED'
                      ? 'border-orange-300'
                      : 'border-outline-variant'
                  }`}
                >
                  {/* Top row: avatar + name + badge */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-sm font-bold text-primary">
                      {initials(reg.lineDisplayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-on-surface">
                        {reg.lineDisplayName ?? 'Unknown'}
                      </div>
                      <div
                        className="truncate font-mono text-[10px] text-outline-variant"
                        title={reg.lineUserId}
                      >
                        {reg.lineUserId.slice(0, 20)}
                        {reg.lineUserId.length > 20 ? '…' : ''}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface shrink-0 ${statusClass(reg.status)}`}>
                      {statusIcon(reg.status)}
                      {reg.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* ── Warning badges ──────────────────────────────────── */}
                  {reg.warnings.length > 0 && (
                    <div className="space-y-1.5">
                      {reg.warnings.map((w) => (
                        <div
                          key={w}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${WARNING_META[w].color}`}
                        >
                          <AlertTriangle size={11} className="shrink-0" />
                          {WARNING_META[w].label}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Details */}
                  <div className="grid gap-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-outline-variant">Phone</span>
                      <span className="font-medium text-on-surface">{reg.phone ?? '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-outline-variant">Claimed Room</span>
                      <span className="font-medium text-on-surface">{reg.claimedRoom ?? '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-outline-variant">Registered</span>
                      <span className="text-on-surface-variant">{fmtDate(reg.createdAt)}</span>
                    </div>
                    {reg.correctionNote && (
                      <div className="mt-1 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">
                        <span className="font-semibold">Correction note:</span> {reg.correctionNote}
                      </div>
                    )}
                    {reg.rejectionReason && (
                      <div className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                        <span className="font-semibold">Reason:</span> {reg.rejectionReason}
                      </div>
                    )}
                  </div>

                  {/* Actions (PENDING + CORRECTION_REQUESTED) */}
                  {isActionable(reg) && (
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex gap-2">
                        <button
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 hover:border-emerald-600 disabled:opacity-50 flex-1 justify-center"
                          onClick={() => void approve(reg)}
                          disabled={
                            !!working ||
                            reg.warnings.includes('DUPLICATE_LINE_ACCOUNT') ||
                            reg.warnings.includes('ROOM_FULL') ||
                            !reg.claimedRoom
                          }
                          title={
                            reg.warnings.includes('DUPLICATE_LINE_ACCOUNT')
                              ? 'Cannot approve: LINE account already linked'
                              : reg.warnings.includes('ROOM_FULL')
                              ? 'Cannot approve: room is at capacity'
                              : !reg.claimedRoom
                              ? 'Cannot approve: no claimed room'
                              : undefined
                          }
                        >
                          <CheckCircle size={13} />
                          {working === `approve:${reg.id}` ? 'Approving…' : 'Approve'}
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-lg border border-red-500 bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-600 hover:border-red-600 disabled:opacity-50 flex-1 justify-center"
                          onClick={() => setRejectTarget(reg)}
                          disabled={!!working}
                        >
                          <XCircle size={13} />
                          Reject
                        </button>
                      </div>
                      <button
                        className="inline-flex items-center gap-2 rounded-lg border border-orange-400 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 shadow-sm transition-colors hover:bg-orange-100 disabled:opacity-50 w-full justify-center"
                        onClick={() => setCorrectionTarget(reg)}
                        disabled={!!working}
                      >
                        <Edit2 size={13} />
                        {working === `correction:${reg.id}` ? 'Saving…' : 'Request Correction'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI summary ────────────────────────────────────────────────────── */}
      {!loading && registrations.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant flex items-center gap-1.5">
              <Users size={12} />
              Total
            </div>
            <div className="text-xl font-semibold text-on-surface">{counts.ALL}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant flex items-center gap-1.5">
              <Clock size={12} />
              Pending
            </div>
            <div className={`text-xl font-semibold ${counts.PENDING > 0 ? 'text-amber-600' : 'text-on-surface'}`}>
              {counts.PENDING}
            </div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant flex items-center gap-1.5">
              <CheckCircle size={12} />
              Approved
            </div>
            <div className="text-xl font-semibold text-emerald-600">{counts.APPROVED}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant flex items-center gap-1.5">
              <XCircle size={12} />
              Rejected
            </div>
            <div className={`text-xl font-semibold ${counts.REJECTED > 0 ? 'text-red-500' : 'text-on-surface'}`}>
              {counts.REJECTED}
            </div>
          </div>
        </section>
      )}

      {/* ── Reject modal ──────────────────────────────────────────────────── */}
      {rejectTarget && (
        <RejectModal
          working={working === `reject:${rejectTarget.id}`}
          onConfirm={(reason) => void reject(rejectTarget, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {/* ── Correction modal ───────────────────────────────────────────────── */}
      {correctionTarget && (
        <CorrectionModal
          reg={correctionTarget}
          working={working === `correction:${correctionTarget.id}`}
          onConfirm={(data) => void requestCorrection(correctionTarget, data)}
          onCancel={() => setCorrectionTarget(null)}
        />
      )}
    </main>
  );
}
