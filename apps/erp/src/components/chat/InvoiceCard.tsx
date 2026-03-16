import React from 'react';

type Props = {
  invoiceId: string;
  amount: number;
  dueDate?: string | null;
  status?: string | null;
  onSend?: () => void;
  onOpen?: () => void;
};

export function InvoiceCard({ invoiceId, amount, dueDate, status, onSend, onOpen }: Props) {
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
        <button onClick={onSend} className="admin-button admin-button-primary">Send via LINE</button>
      </div>
    </div>
  );
}
