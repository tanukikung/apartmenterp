import React from 'react';

type Props = {
  roomNumber?: string | null;
  floorLabel?: string | null;
  tenantName?: string | null;
  phone?: string | null;
  lineLinked?: boolean;
  contractStatus?: string | null;
  moveInDate?: string | null;
  endDate?: string | null;
  currentAmount?: number | null;
  dueDate?: string | null;
  overdueDays?: number | null;
  lastPayment?: string | null;
  invoiceStatus?: string | null;
  onSendInvoice?: () => void;
  onSendReminder?: () => void;
  onSendReceipt?: () => void;
  onUploadFile?: () => void;
  onConfirmPayment?: () => void;
  canSendViaLine?: boolean;
  sendDisabledReason?: string | null;
};

function statusTone(status?: string | null): string {
  if (!status) return '';
  if (status === 'PAID') return 'admin-status-good';
  if (status === 'OVERDUE') return 'admin-status-bad';
  if (status === 'SENT' || status === 'GENERATED' || status === 'VIEWED') return 'admin-status-warn';
  return '';
}

export function RoomDetailsCard(props: Props) {
  const {
    roomNumber,
    floorLabel,
    tenantName,
    phone,
    lineLinked,
    contractStatus,
    moveInDate,
    endDate,
    currentAmount,
    dueDate,
    overdueDays,
    lastPayment,
    invoiceStatus,
    onSendInvoice,
    onSendReminder,
    onSendReceipt,
    onUploadFile,
    onConfirmPayment,
    canSendViaLine,
    sendDisabledReason,
  } = props;

  return (
    <div className="space-y-4">
      <div className="admin-card cute-surface">
        <div className="admin-card-header">
          <div className="admin-card-title">Room Details</div>
          {lineLinked !== undefined ? (
            <span className={`admin-badge ${lineLinked ? 'admin-status-good' : ''}`}>
              {lineLinked ? 'LINE linked' : 'LINE not linked'}
            </span>
          ) : null}
        </div>
        <div className="space-y-3 p-4 text-sm text-slate-600">
          <div>Room: <span className="font-medium text-slate-900">{roomNumber || '-'}</span></div>
          <div>Floor: <span className="font-medium text-slate-900">{floorLabel || '-'}</span></div>
          <div>Tenant: <span className="font-medium text-slate-900">{tenantName || '-'}</span></div>
          <div>Phone: <span className="font-medium text-slate-900">{phone || '-'}</span></div>
          <div>Contract: <span className="font-medium text-slate-900">{contractStatus || '-'}</span></div>
          <div className="text-xs text-slate-500">
            {moveInDate ? `Move-in: ${new Date(moveInDate).toLocaleDateString()}` : null}
            {moveInDate && endDate ? ' · ' : null}
            {endDate ? `End: ${new Date(endDate).toLocaleDateString()}` : null}
          </div>
        </div>
      </div>

      <div className="admin-card cute-surface">
        <div className="admin-card-header">
          <div className="admin-card-title">Latest Invoice</div>
          {invoiceStatus ? <span className={`admin-badge ${statusTone(invoiceStatus)}`}>{invoiceStatus}</span> : null}
        </div>
        <div className="space-y-3 p-4 text-sm text-slate-600">
          {currentAmount != null ? (
            <>
              <div className="flex items-center justify-between rounded-2xl bg-pink-50/70 px-3 py-2">
                <span>Total</span>
                <span className="font-medium text-slate-900">{currentAmount.toLocaleString()}</span>
              </div>
              {dueDate ? (
                <div className="flex items-center justify-between rounded-2xl bg-sky-50/70 px-3 py-2">
                  <span>Due</span>
                  <span className="font-medium text-slate-900">{new Date(dueDate).toLocaleDateString()}</span>
                </div>
              ) : null}
              {overdueDays != null && overdueDays > 0 ? (
                <div className="flex items-center justify-between rounded-2xl bg-amber-50/80 px-3 py-2">
                  <span>Overdue</span>
                  <span className="font-medium text-red-600">{overdueDays} days</span>
                </div>
              ) : null}
              {lastPayment ? (
                <div className="flex items-center justify-between rounded-2xl bg-emerald-50/80 px-3 py-2">
                  <span>Last payment</span>
                  <span className="font-medium text-slate-900">{new Date(lastPayment).toLocaleDateString()}</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-slate-500">No invoice available.</div>
          )}
        </div>
      </div>

      <div className="admin-card cute-surface">
        <div className="admin-card-header">
          <div className="admin-card-title">Quick Actions</div>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          <button onClick={onSendInvoice} disabled={canSendViaLine === false} title={canSendViaLine === false ? sendDisabledReason || undefined : undefined} className="admin-button admin-button-primary disabled:opacity-50">
            Send invoice
          </button>
          <button onClick={onSendReminder} disabled={canSendViaLine === false} title={canSendViaLine === false ? sendDisabledReason || undefined : undefined} className="admin-button disabled:opacity-50">
            Send reminder
          </button>
          <button onClick={onSendReceipt} disabled={canSendViaLine === false} title={canSendViaLine === false ? sendDisabledReason || undefined : undefined} className="admin-button disabled:opacity-50">
            Send receipt
          </button>
          <button onClick={onUploadFile} className="admin-button">Upload file</button>
          <button onClick={onConfirmPayment} className="admin-button">Confirm payment</button>
        </div>
      </div>
    </div>
  );
}
