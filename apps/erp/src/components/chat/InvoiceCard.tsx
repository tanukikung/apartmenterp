import React, { useState } from 'react';

type Props = {
  invoiceId: string;
  amount: number;
  dueDate?: string | null;
  status?: string | null;
  lineConfigured?: boolean;
  onSend?: () => void;
  onOpen?: () => void;
};

export function InvoiceCard({ invoiceId, amount, dueDate, status, lineConfigured = false, onSend, onOpen }: Props) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="rounded-[1.6rem] border border-pink-100 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium text-slate-900">Invoice</div>
        {status ? <span className="admin-badge">{status}</span> : null}
      </div>
      <div className="mt-1 text-sm text-slate-600">ID: {invoiceId}</div>
      <div className="text-sm text-slate-600">Amount: {amount.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{dueDate ? `Due: ${new Date(dueDate).toLocaleDateString()}` : null}</div>
      <div className="mt-2 flex gap-2">
        <button onClick={onOpen} className="admin-button">Open</button>
        <div className="relative">
          <button
            onClick={lineConfigured ? onSend : undefined}
            onMouseEnter={() => !lineConfigured && setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            disabled={!lineConfigured}
            className={[
              'admin-button admin-button-primary',
              !lineConfigured ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            Send via LINE
          </button>
          {showTip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 shadow-sm z-10">
              ยังไม่ได้ตั้งค่า LINE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
