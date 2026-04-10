'use client';

import { Clock, Eye, Calculator, CheckCircle2, XCircle } from 'lucide-react';
import type { MoveOutStatus } from './types';
import { resolveStatusVariant } from './utils';

export function MoveOutStatusBadge({ status }: { status: MoveOutStatus }) {
  const cfg = {
    pending: {
      label: 'รอดำเนินการ',
      cls: 'bg-gray-100 text-gray-700 border-gray-200',
      Icon: Clock,
    },
    inspection: {
      label: 'ตรวจสอบแล้ว',
      cls: 'bg-blue-100 text-blue-700 border-blue-200',
      Icon: Eye,
    },
    calculated: {
      label: 'คำนวณแล้ว',
      cls: 'bg-amber-100 text-amber-700 border-amber-200',
      Icon: Calculator,
    },
    confirmed: {
      label: 'ยืนยันแล้ว',
      cls: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      Icon: CheckCircle2,
    },
    refunded: {
      label: 'คืนเงินแล้ว',
      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      Icon: CheckCircle2,
    },
    cancelled: {
      label: 'ยกเลิก',
      cls: 'bg-red-100 text-red-700 border-red-200',
      Icon: XCircle,
    },
  }[resolveStatusVariant(status)];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${cfg.cls}`}
    >
      <cfg.Icon size={10} />
      {cfg.label}
    </span>
  );
}
