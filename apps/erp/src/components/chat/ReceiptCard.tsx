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
    <div className="rounded-[1.6rem] border border-pink-100 bg-white p-3 shadow-sm">
      <div className="font-medium text-slate-900">Receipt</div>
      <div className="mt-1 text-sm text-slate-600">ID: {receiptId}</div>
      <div className="text-sm text-slate-600">Amount: {amount.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{issuedAt ? `Issued: ${new Date(issuedAt).toLocaleDateString()}` : null}</div>
      <div className="mt-2 flex gap-2">
        <button onClick={onOpen} className="admin-button">Open</button>
        <button onClick={onSend} className="admin-button admin-button-primary">Send via LINE</button>
      </div>
    </div>
  );
}
