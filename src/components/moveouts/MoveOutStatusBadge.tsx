'use client';

import { Clock, Eye, Calculator, CheckCircle2, XCircle } from 'lucide-react';
import type { MoveOutStatus } from './types';
import { resolveStatusVariant } from './utils';

export function MoveOutStatusBadge({ status }: { status: MoveOutStatus }) {
  const cfg = {
    pending: {
      label: 'รอดำเนินการ',
      cls: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
      Icon: Clock,
    },
    inspection: {
      label: 'ตรวจสอบแล้ว',
      cls: 'bg-info-container text-on-info-container border-info-container/30',
      Icon: Eye,
    },
    calculated: {
      label: 'คำนวณแล้ว',
      cls: 'bg-warning-container text-on-warning-container border-warning-container/30',
      Icon: Calculator,
    },
    confirmed: {
      label: 'ยืนยันแล้ว',
      cls: 'bg-success-container text-on-success-container border-success-container/30',
      Icon: CheckCircle2,
    },
    refunded: {
      label: 'คืนเงินแล้ว',
      cls: 'bg-success-container text-on-success-container border-success-container/30',
      Icon: CheckCircle2,
    },
    cancelled: {
      label: 'ยกเลิก',
      cls: 'bg-error-container text-on-error-container border-error-container/30',
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
