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
} from 'lucide-react';

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
  if (s === 'APPROVED') return 'admin-status-good';
  if (s === 'REJECTED') return 'admin-status-bad';
  if (s === 'CORRECTION_REQUESTED') return 'border-orange-300 bg-orange-50 text-orange-700';
  return 'admin-status-warn';
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
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Reject Registration</h2>
        <p className="mb-4 text-sm text-slate-500">
          Optionally provide a reason. This will be stored with the record.
        </p>
        <textarea
          className="admin-textarea mb-4"
          placeholder="Reason for rejection (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <button className="admin-button" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button
            className="admin-button inline-flex items-center gap-1.5 border-red-500 bg-red-500 text-white hover:bg-red-600 hover:border-red-600"
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
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Request Correction</h2>
        <p className="mb-4 text-sm text-slate-500">
          Update the registration details and send a correction note to the tenant.
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Phone</label>
            <input
              className="admin-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Claimed Room</label>
            <input
              className="admin-input"
              value={claimedRoom}
              onChange={(e) => setClaimedRoom(e.target.value)}
              placeholder="Room number (e.g. 101)"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Correction Note <span className="text-red-500">*</span>
            </label>
            <textarea
              className="admin-textarea"
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              placeholder="Explain what needs to be corrected…"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="admin-button" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button
            className="admin-button inline-flex items-center gap-1.5 border-orange-500 bg-orange-500 text-white hover:bg-orange-600 hover:border-orange-600"
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

  const visible =
    activeTab === 'ALL' ? registrations : registrations.filter((r) => r.status === activeTab);

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
    <main className="admin-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Tenant Registrations</h1>
          <p className="admin-page-subtitle">
            Review and action LINE registration requests from prospective tenants.
          </p>
        </div>
        <div className="admin-toolbar">
          <span className="admin-badge">
            <Clock size={11} className="mr-1" />
            {counts.PENDING} pending
          </span>
          {counts.CORRECTION_REQUESTED > 0 && (
            <span className="admin-badge border-orange-300 bg-orange-50 text-orange-700">
              <Edit2 size={11} className="mr-1" />
              {counts.CORRECTION_REQUESTED} correction
            </span>
          )}
          <button
            className="admin-button inline-flex items-center gap-1.5"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
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
      <div className="admin-card overflow-hidden">
        {/* ── Status tabs ──────────────────────────────────────────────────── */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-white">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
                <span
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
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
            <div className="py-14 text-center text-slate-400">Loading registrations…</div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
                <MessageSquare size={22} className="text-slate-300" />
              </div>
              <div>
                <div className="font-medium text-slate-700">
                  {activeTab === 'PENDING' ? 'No pending registrations' : 'Nothing to show'}
                </div>
                <div className="text-sm text-slate-400">
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
                  className={`flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
                    reg.status === 'PENDING'
                      ? 'border-amber-200'
                      : reg.status === 'CORRECTION_REQUESTED'
                      ? 'border-orange-200'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Top row: avatar + name + badge */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-bold text-indigo-700">
                      {initials(reg.lineDisplayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-slate-900">
                        {reg.lineDisplayName ?? 'Unknown'}
                      </div>
                      <div
                        className="truncate font-mono text-[10px] text-slate-400"
                        title={reg.lineUserId}
                      >
                        {reg.lineUserId.slice(0, 20)}
                        {reg.lineUserId.length > 20 ? '…' : ''}
                      </div>
                    </div>
                    <span className={`admin-badge shrink-0 ${statusClass(reg.status)}`}>
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
                      <span className="text-slate-400">Phone</span>
                      <span className="font-medium text-slate-700">{reg.phone ?? '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Claimed Room</span>
                      <span className="font-medium text-slate-700">{reg.claimedRoom ?? '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Registered</span>
                      <span className="text-slate-600">{fmtDate(reg.createdAt)}</span>
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
                          className="admin-button flex-1 justify-center border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 hover:border-emerald-600 disabled:opacity-50"
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
                          className="admin-button flex-1 justify-center border-red-500 bg-red-500 text-white hover:bg-red-600 hover:border-red-600 disabled:opacity-50"
                          onClick={() => setRejectTarget(reg)}
                          disabled={!!working}
                        >
                          <XCircle size={13} />
                          Reject
                        </button>
                      </div>
                      <button
                        className="admin-button w-full justify-center border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
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
          <div className="admin-kpi">
            <div className="admin-kpi-label flex items-center gap-1.5">
              <Users size={12} />
              Total
            </div>
            <div className="admin-kpi-value">{counts.ALL}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label flex items-center gap-1.5">
              <Clock size={12} />
              Pending
            </div>
            <div className={`admin-kpi-value ${counts.PENDING > 0 ? 'text-amber-600' : ''}`}>
              {counts.PENDING}
            </div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label flex items-center gap-1.5">
              <CheckCircle size={12} />
              Approved
            </div>
            <div className="admin-kpi-value text-emerald-600">{counts.APPROVED}</div>
          </div>
          <div className="admin-kpi">
            <div className="admin-kpi-label flex items-center gap-1.5">
              <XCircle size={12} />
              Rejected
            </div>
            <div className={`admin-kpi-value ${counts.REJECTED > 0 ? 'text-red-500' : ''}`}>
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
