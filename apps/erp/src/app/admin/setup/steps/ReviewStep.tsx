'use client';

import { useState } from 'react';
import {
  Shield,
  Building2,
  Home,
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

  const { admin, building, rooms, billing, lineNotify, emailNotify } = state;

  const summaryItems: SummaryItem[] = [
    {
      icon: <Shield className="h-4 w-4" />,
      iconBg: 'bg-primary-container',
      iconColor: 'text-primary',
      label: 'ผู้ดูแลระบบ',
      value: `${admin.displayName} (@${admin.username})`,
    },
    {
      icon: <Building2 className="h-4 w-4" />,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-700',
      label: 'อาคาร',
      value: building.name || 'ไม่ได้ระบุ',
    },
    {
      icon: <Home className="h-4 w-4" />,
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-700',
      label: 'ห้องพัก',
      value: `${rooms.floors} ชั้น × ${rooms.roomsPerFloor} ห้อง = ${rooms.floors * rooms.roomsPerFloor} ห้อง (${rooms.format})`,
    },
    {
      icon: <Receipt className="h-4 w-4" />,
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-700',
      label: 'นโยบายการเรียกเก็บ',
      value: `ออกบิลวันที่ ${billing.billingDay}, ครบกำหนดวันที่ ${billing.dueDay}`,
    },
    {
      icon: <MessageSquare className="h-4 w-4" />,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-700',
      label: 'LINE แจ้งเตือน',
      value: lineNotify.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
    },
    {
      icon: <Mail className="h-4 w-4" />,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-700',
      label: 'Email แจ้งเตือน',
      value: emailNotify.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
    },
  ];

  if (submitResult) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-on-surface">ตั้งค่าระบบเสร็จสิ้น!</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            ระบบได้ถูกตั้งค่าเรียบร้อยแล้ว คุณสามารถเข้าสู่ระบบด้วยบัญชีผู้ดูแลที่สร้างไว้
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5 space-y-4">
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">สรุปการตั้งค่า</h3>

          {summaryItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.iconBg].join(' ')}>
                <span className={item.iconColor}>{item.icon}</span>
              </div>
              <div className="flex-1">
                <p className="text-xs text-on-surface-variant">{item.label}</p>
                <p className="text-sm font-medium text-on-surface">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-primary-container p-4 text-center">
          <p className="text-sm font-medium text-on-primary-container">
            สร้างห้องพักแล้ว <span className="text-lg font-bold">{submitResult.roomsCreated}</span> ห้อง
          </p>
        </div>

        <a
          href="/admin/dashboard"
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-on-primary hover:bg-primary/90 transition-colors"
        >
          ไปยังหน้าหลัก
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container">
          <CheckCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-on-surface">สรุปและเริ่มตั้งค่าระบบ</h2>
          <p className="text-sm text-on-surface-variant">ตรวจสอบข้อมูลก่อนเริ่มตั้งค่า</p>
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5 space-y-4">
        <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">รายการที่จะสร้าง</h3>

        {summaryItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.iconBg].join(' ')}>
              <span className={item.iconColor}>{item.icon}</span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-on-surface-variant">{item.label}</p>
              <p className="text-sm font-medium text-on-surface">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {isSubmitting && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">กำลังสร้างข้อมูล...</span>
            <span className="font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-container">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-on-surface-variant text-center">{statusText}</p>
        </div>
      )}

      {submitError && (
        <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">เกิดข้อผิดพลาด</p>
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        </div>
      )}

      <button
        onClick={async () => {
          // Simulate progress
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
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
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

      <p className="text-xs text-on-surface-variant text-center">
        การตั้งค่านี้จะสร้างข้อมูลเริ่มต้นทั้งหมดในครั้งเดียว ไม่สามารถย้อนกลับได้
      </p>
    </div>
  );
}
