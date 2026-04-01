import React from 'react';

type Props = {
  receiptId: string;
  amount: number;
  issuedAt?: string | null;
  onSend?: () => void;
  onOpen?: () => void;
};

export function ReceiptCard({ receiptId, amount, issuedAt, onSend, onOpen }: Props) {
  return (
    <div className="rounded-[1.6rem] border border-line-green/20 bg-white p-3 shadow-sm">
      <div className="font-medium text-slate-900">ใบเสร็จ</div>
      <div className="mt-1 text-sm text-slate-600">เลขที่: {receiptId}</div>
      <div className="text-sm text-slate-600">จำนวน: {amount.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{issuedAt ? `ออกเมื่อ: ${new Date(issuedAt).toLocaleDateString('th-TH')}` : null}</div>
      <div className="mt-2 flex gap-2">
        <button onClick={onOpen} className="admin-button">เปิด</button>
        <button onClick={onSend} className="admin-button admin-button-primary">ส่งผ่าน LINE</button>
      </div>
    </div>
  );
}
