'use client';

import { useState } from 'react';
import {
  Shield,
  Building2,
  Home,
  Landmark,
  Receipt,
  MessageSquare,
  Mail,
  CheckCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { SetupWizardState } from '../hooks/useSetupWizard';

interface ReviewStepProps {
  state: SetupWizardState;
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
  submitError?: string;
  submitResult?: { adminUserId: string; roomsCreated: number };
}

interface SummaryItem {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}

export function ReviewStep({
  state,
  onSubmit,
  isSubmitting,
  submitError,
  submitResult,
}: ReviewStepProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  const { admin, building, rooms, bankAccount, billing, lineNotify, emailNotify } = state;

  const totalRooms = rooms.floors * rooms.roomsPerFloor;
  const roomValue = `${rooms.floors} ชั้น · ${totalRooms} ห้อง (ชั้นละ ${rooms.roomsPerFloor} ห้อง)`;
  const bankValue = bankAccount.bankName
    ? `${bankAccount.bankName} · ${bankAccount.bankAccountNo || 'ไม่ได้ระบุเลขบัญชี'}`
    : 'ยังไม่ได้ระบุ (เพิ่มทีหลังได้)';

  const summaryItems: SummaryItem[] = [
    {
      icon: <Shield className="h-4 w-4" />,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      label: 'ผู้ดูแลระบบ',
      value: `${admin.displayName} (@${admin.username})`,
    },
    {
      icon: <Building2 className="h-4 w-4" />,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
      label: 'อาคาร',
      value: building.name || 'ไม่ได้ระบุ',
    },
    {
      icon: <Home className="h-4 w-4" />,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      label: 'ห้องพัก',
      value: roomValue,
    },
    {
      icon: <Landmark className="h-4 w-4" />,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      label: 'บัญชีธนาคาร',
      value: bankValue,
    },
    {
      icon: <Receipt className="h-4 w-4" />,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      label: 'นโยบายการเรียกเก็บ',
      value: `ออกบิลวันที่ ${billing.billingDay}, ครบกำหนดวันที่ ${billing.dueDay}`,
    },
    {
      icon: <MessageSquare className="h-4 w-4" />,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      label: 'LINE แจ้งเตือน',
      value: lineNotify.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
    },
    {
      icon: <Mail className="h-4 w-4" />,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
      label: 'Email แจ้งเตือน',
      value: emailNotify.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
    },
  ];

  if (submitResult) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold text-[hsl(var(--on-surface))]">ตั้งค่าระบบเสร็จสิ้น!</h2>
          <p className="mt-2 text-sm text-[hsl(var(--on-surface))]/40">
            ระบบได้ถูกตั้งค่าเรียบร้อยแล้ว คุณสามารถเข้าสู่ระบบด้วยบัญชีผู้ดูแลที่สร้างไว้
          </p>
        </div>

        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[hsl(var(--on-surface))]/40 uppercase tracking-wide">สรุปการตั้งค่า</h3>

          {summaryItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.iconBg].join(' ')}>
                <span className={item.iconColor}>{item.icon}</span>
              </div>
              <div className="flex-1">
                <p className="text-xs text-[hsl(var(--on-surface))]/30">{item.label}</p>
                <p className="text-sm font-medium text-[hsl(var(--on-surface))]/80">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 text-center">
          <p className="text-sm font-medium text-[hsl(var(--on-surface))]/70">
            สร้างห้องพักแล้ว <span className="text-lg font-bold text-primary">{submitResult.roomsCreated}</span> ห้อง
          </p>
        </div>

        <a
          href="/admin/dashboard"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-[hsl(var(--on-surface))] hover:bg-primary/90 hover:scale-105 active:scale-[0.98] transition-all"
        >
          ไปยังหน้าหลัก
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur-md">
          <CheckCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--on-surface))]">สรุปและเริ่มตั้งค่าระบบ</h2>
          <p className="text-sm text-[hsl(var(--on-surface))]/40">ตรวจสอบข้อมูลก่อนเริ่มตั้งค่า</p>
        </div>
      </div>

      <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[hsl(var(--on-surface))]/40 uppercase tracking-wide">รายการที่จะสร้าง</h3>

        {summaryItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.iconBg].join(' ')}>
              <span className={item.iconColor}>{item.icon}</span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-[hsl(var(--on-surface))]/30">{item.label}</p>
              <p className="text-sm font-medium text-[hsl(var(--on-surface))]/70">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {isSubmitting && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[hsl(var(--on-surface))]/40">กำลังสร้างข้อมูล...</span>
            <span className="font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[hsl(var(--color-surface))]">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-[hsl(var(--on-surface))]/30 text-center">{statusText}</p>
        </div>
      )}

      {submitError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-sm p-4">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">เกิดข้อผิดพลาด</p>
            <p className="text-sm text-red-400/70">{submitError}</p>
          </div>
        </div>
      )}

      <button
        onClick={async () => {
          const progressInterval = setInterval(() => {
            setProgress((p) => Math.min(p + 10, 90));
            setStatusText('กำลังสร้างห้องพัก...');
          }, 200);

          try {
            await onSubmit();
            clearInterval(progressInterval);
            setProgress(100);
            setStatusText('เสร็จสิ้น!');
          } catch {
            clearInterval(progressInterval);
            setProgress(0);
          }
        }}
        disabled={isSubmitting}
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-[hsl(var(--on-surface))] hover:bg-primary/90 hover:scale-105 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังตั้งค่าระบบ...
          </>
        ) : (
          'เริ่มตั้งค่าระบบ'
        )}
      </button>

      <p className="text-xs text-[hsl(var(--on-surface))]/30 text-center">
        การตั้งค่านี้จะสร้างข้อมูลเริ่มต้นทั้งหมดในครั้งเดียว ไม่สามารถย้อนกลับได้
      </p>
    </div>
  );
}
