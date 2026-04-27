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
    <div className="rounded-[1.6rem] border border-line-green/20 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium text-slate-900">ใบแจ้งหนี้</div>
        {status ? <span className="admin-badge">{status}</span> : null}
      </div>
      <div className="mt-1 text-sm text-slate-600">เลขที่: {invoiceId}</div>
      <div className="text-sm text-slate-600">จำนวน: {amount.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{dueDate ? `วันครบกำหนด: ${new Date(dueDate).toLocaleDateString('th-TH')}` : null}</div>
      <div className="mt-2 flex gap-2">
        <button onClick={onOpen} className="admin-button">เปิด</button>
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
            ส่งผ่าน LINE
          </button>
          {showTip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-lg border border-warning-container/30 bg-warning-container/10 px-2 py-1 text-xs text-on-warning-container shadow-sm z-10">
              ยังไม่ได้ตั้งค่า LINE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
