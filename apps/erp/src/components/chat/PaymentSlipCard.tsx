import React from 'react';
import Image from 'next/image';

type Props = {
  id: string;
  amount: number;
  date?: string | null;
  imageUrl?: string | null;
  onConfirm?: () => void;
  onOpen?: () => void;
};

export function PaymentSlipCard({ id, amount, date, imageUrl, onConfirm, onOpen }: Props) {
  return (
    <div className="rounded-[1.6rem] border border-pink-100 bg-white p-3 shadow-sm">
      <div className="font-medium text-slate-900">Payment Slip</div>
      <div className="mt-1 text-sm text-slate-600">ID: {id}</div>
      <div className="text-sm text-slate-600">Amount: {amount.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{date ? new Date(date).toLocaleString() : null}</div>
      {imageUrl ? (
        <div className="mt-2">
          <div className="relative h-40 w-full max-w-xs overflow-hidden rounded-[1.35rem] border border-pink-100 bg-pink-50/50">
            <Image src={imageUrl} alt="Payment slip" fill sizes="200px" style={{ objectFit: 'contain' }} priority={false} />
          </div>
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button onClick={onOpen} className="admin-button">Open</button>
        <button onClick={onConfirm} className="admin-button admin-button-primary">Confirm payment</button>
      </div>
    </div>
  );
}
