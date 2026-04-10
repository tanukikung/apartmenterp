'use client';

import { Receipt, MessageSquare, Mail, Bell, AlertTriangle } from 'lucide-react';
import type { BillingData, LineNotifyData, EmailNotifyData } from '../hooks/useSetupWizard';

interface BillingPolicyStepProps {
  billing: BillingData;
  lineNotify: LineNotifyData;
  emailNotify: EmailNotifyData;
  onBillingChange: (data: Partial<BillingData>) => void;
  onLineNotifyChange: (data: Partial<LineNotifyData>) => void;
  onEmailNotifyChange: (data: Partial<EmailNotifyData>) => void;
  errors?: Record<string, string>;
}

function FieldRow({
  label,
  icon,
  children,
}: {
  label: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-container)] text-[var(--on-surface-variant)]">
        {icon}
      </div>
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-[var(--on-surface)]">{label}</label>
        {children}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={[
            'h-6 w-11 rounded-full transition-colors',
            checked ? 'bg-primary' : 'bg-outline',
          ].join(' ')}
        />
        <div
          className={[
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </div>
      <span className="text-sm text-[var(--on-surface)]">{label}</span>
    </label>
  );
}

export function BillingPolicyStep({
  billing,
  lineNotify,
  emailNotify,
  onBillingChange,
  onLineNotifyChange,
  onEmailNotifyChange,
  errors = {},
}: BillingPolicyStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-container)]">
          <Receipt className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--on-surface)]">นโยบายการเรียกเก็บ</h2>
          <p className="text-sm text-[var(--on-surface-variant)]">ตั้งค่าวันออกบิล วันครบกำหนด และการแจ้งเตือน</p>
        </div>
      </div>

      {/* Billing Policy */}
      <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)] p-5 space-y-5">
        <h3 className="text-sm font-semibold text-[var(--on-surface-variant)] uppercase tracking-wide">ปฏิทินการเรียกเก็บ</h3>

        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="วันออกบิล (1-28)" icon={<Receipt className="h-4 w-4" />}>
            <input
              type="number"
              min={1}
              max={28}
              value={billing.billingDay}
              onChange={(e) => onBillingChange({ billingDay: Math.max(1, Math.min(28, parseInt(e.target.value) || 1)) })}
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
            {errors.billingDay && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.billingDay}</p>}
            <p className="mt-1 text-xs text-[var(--on-surface-variant)]">ของทุกเดือน</p>
          </FieldRow>

          <FieldRow label="วันครบกำหนด (1-31)" icon={<Receipt className="h-4 w-4" />}>
            <input
              type="number"
              min={1}
              max={31}
              value={billing.dueDay}
              onChange={(e) => onBillingChange({ dueDay: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) })}
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
            {errors.dueDay && <p className="mt-1 text-xs text-[var(--color-danger)]">{errors.dueDay}</p>}
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="แจ้งเตือนก่อนครบกำหนด (วัน)" icon={<Bell className="h-4 w-4" />}>
            <input
              type="number"
              min={0}
              max={30}
              value={billing.reminderDays}
              onChange={(e) => onBillingChange({ reminderDays: Math.max(0, Math.min(30, parseInt(e.target.value) || 0)) })}
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
            <p className="mt-1 text-xs text-[var(--on-surface-variant)]">0 = ไม่ส่งแจ้งเตือน</p>
          </FieldRow>

          <FieldRow label="ค่าธรรมเนียมล่าช้า (บาท/วัน)" icon={<AlertTriangle className="h-4 w-4" />}>
            <input
              type="number"
              min={0}
              value={billing.lateFeePerDay}
              onChange={(e) => onBillingChange({ lateFeePerDay: Math.max(0, parseInt(e.target.value) || 0) })}
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
          </FieldRow>
        </div>
      </div>

      {/* LINE Notify */}
      <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-100">
              <MessageSquare className="h-4 w-4 text-green-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--on-surface)]">LINE แจ้งเตือน</h3>
              <p className="text-xs text-[var(--on-surface-variant)]">ส่งข้อความแจ้งเตือนผ่าน LINE Official</p>
            </div>
          </div>
          <Toggle
            checked={lineNotify.enabled}
            onChange={(checked) => {
              onLineNotifyChange({ enabled: checked });
            }}
            label=""
          />
        </div>

        {lineNotify.enabled && (
          <div className="space-y-4 pl-0 lg:pl-13">
            <FieldRow label="LINE Channel ID" icon={<MessageSquare className="h-4 w-4" />}>
              <input
                type="text"
                value={lineNotify.channelId}
                onChange={(e) => onLineNotifyChange({ channelId: e.target.value })}
                placeholder="1234567890"
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              />
            </FieldRow>

            <FieldRow label="LINE Channel Secret" icon={<MessageSquare className="h-4 w-4" />}>
              <input
                type="password"
                value={lineNotify.channelSecret}
                onChange={(e) => onLineNotifyChange({ channelSecret: e.target.value })}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              />
            </FieldRow>

            <FieldRow label="LINE Access Token" icon={<MessageSquare className="h-4 w-4" />}>
              <input
                type="password"
                value={lineNotify.accessToken}
                onChange={(e) => onLineNotifyChange({ accessToken: e.target.value })}
                placeholder="••••••••••••••••••••••••••••••••••••••••"
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              />
              <p className="mt-1 text-xs text-[var(--on-surface-variant)]">Long-lived access token จาก LINE Developers Console</p>
            </FieldRow>
          </div>
        )}
      </div>

      {/* Email Notify */}
      <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
              <Mail className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--on-surface)]">Email แจ้งเตือน</h3>
              <p className="text-xs text-[var(--on-surface-variant)]">ส่งอีเมลแจ้งเตือนและใบแจ้งหนี้</p>
            </div>
          </div>
          <Toggle
            checked={emailNotify.enabled}
            onChange={(checked) => {
              onEmailNotifyChange({ enabled: checked });
            }}
            label=""
          />
        </div>

        {emailNotify.enabled && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="SMTP Host" icon={<Mail className="h-4 w-4" />}>
                <input
                  type="text"
                  value={emailNotify.smtpHost}
                  onChange={(e) => onEmailNotifyChange({ smtpHost: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                />
              </FieldRow>

              <FieldRow label="SMTP Port" icon={<Mail className="h-4 w-4" />}>
                <input
                  type="text"
                  value={emailNotify.smtpPort}
                  onChange={(e) => onEmailNotifyChange({ smtpPort: e.target.value })}
                  placeholder="587"
                  className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                />
              </FieldRow>
            </div>

            <FieldRow label="SMTP Username" icon={<Mail className="h-4 w-4" />}>
              <input
                type="text"
                value={emailNotify.smtpUser}
                onChange={(e) => onEmailNotifyChange({ smtpUser: e.target.value })}
                placeholder="your-email@gmail.com"
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              />
            </FieldRow>

            <FieldRow label="SMTP Password" icon={<Mail className="h-4 w-4" />}>
              <input
                type="password"
                value={emailNotify.smtpPass}
                onChange={(e) => onEmailNotifyChange({ smtpPass: e.target.value })}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              />
              <p className="mt-1 text-xs text-[var(--on-surface-variant)]">สำหรับ Gmail ใช้ App Password 16 ตัวอักษร</p>
            </FieldRow>

            <FieldRow label="From Email" icon={<Mail className="h-4 w-4" />}>
              <input
                type="email"
                value={emailNotify.fromEmail}
                onChange={(e) => onEmailNotifyChange({ fromEmail: e.target.value })}
                placeholder="noreply@building.com"
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              />
            </FieldRow>
          </div>
        )}
      </div>
    </div>
  );
}
