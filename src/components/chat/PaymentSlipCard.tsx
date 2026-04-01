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
    <div className="rounded-[1.6rem] border border-line-green/20 bg-white p-3 shadow-sm">
      <div className="font-medium text-slate-900">สลิปการชำระ</div>
      <div className="mt-1 text-sm text-slate-600">เลขที่: {id}</div>
      <div className="text-sm text-slate-600">จำนวน: {amount.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{date ? new Date(date).toLocaleString('th-TH') : null}</div>
      {imageUrl ? (
        <div className="mt-2">
          <div className="relative h-40 w-full max-w-xs overflow-hidden rounded-[1.35rem] border border-line-green/20 bg-line-green-light/20">
            <Image src={imageUrl} alt="สลิปการชำระ" fill sizes="200px" style={{ objectFit: 'contain' }} priority={false} />
          </div>
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button onClick={onOpen} className="admin-button">เปิด</button>
        <button onClick={onConfirm} className="admin-button admin-button-primary">ยืนยันชำระ</button>
      </div>
    </div>
  );
}
