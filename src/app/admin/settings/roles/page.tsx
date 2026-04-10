'use client';

import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

type RoleDef = {
  role: string;
  label: string;
  description: string;
  permissions: string[];
};

const ROLES: RoleDef[] = [
  {
    role: 'OWNER',
    label: 'เจ้าของ',
    description: 'เข้าถึงทุกฟังก์ชันโดยไม่มีข้อจำกัด รวมถึงการตั้งค่าระบบและข้อมูลการเงิน',
    permissions: [
      'ทุกโมดูลแอดมิน',
      'จัดการผู้ใช้',
      'ตั้งค่าและนโยบายการเรียกเก็บ',
      'รายงานการเงิน',
      'เข้าถึงบันทึกตรวจสอบ',
      'จัดการระบบ',
    ],
  },
  {
    role: 'ADMIN',
    label: 'ผู้ดูแล',
    description: 'เข้าถึงการดำเนินการทั้งหมด ยกเว้นการตั้งค่าระดับเจ้าของ',
    permissions: [
      'จัดการทรัพย์สิน (ชั้น ห้อง ผู้เช่า)',
      'การเรียกเก็บและการชำระ',
      'จัดการเอกสาร',
      'แชทและการแจ้งเตือน',
      'รายงานและการวิเคราะห์',
      'บันทึกตรวจสอบ (อ่านอย่างเดียว)',
    ],
  },
  {
    role: 'STAFF',
    label: 'พนักงาน',
    description: 'ดำเนินการประจำวัน: สื่อสารกับผู้เช่า บันทึกการชำระ รายงานเบื้องต้น',
    permissions: [
      'ดูห้องและผู้เช่า',
      'บันทึกการชำระ',
      'ส่งข้อความผ่าน LINE',
      'ดูใบแจ้งหนี้และเอกสาร',
      'ดูรายงานเบื้องต้น',
    ],
  },
];

function permissionBadge(perm: string) {
  return (
    <span
      key={perm}
      className="inline-flex items-center rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container)] px-2.5 py-0.5 text-xs text-[var(--on-surface-variant)]"
    >
      {perm}
    </span>
  );
}

export default function SettingsRolesPage() {
  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Shield className="h-5 w-5 text-[var(--on-primary)]" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[var(--on-primary)]">บทบาทและสิทธิ์</h1>
              <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">
                ภาพรวมบทบาทระบบและระดับการเข้าถึง
              </p>
            </div>
          </div>
          <Link href="/admin/settings/users" className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-white/30">
            จัดการผู้ใช้ →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/settings" className="flex items-center gap-1 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]">
          <ArrowLeft className="h-4 w-4" /> ตั้งค่า
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-[var(--on-surface)]">บทบาทและสิทธิ์</span>
      </div>

      {/* Role cards */}
      <div className="grid gap-5 md:grid-cols-3">
        {ROLES.map((r) => {
          const colorMap: Record<string, { border: string; bg: string; iconBg: string; iconColor: string; badge: string }> = {
            OWNER: { border: 'border-purple-200', bg: 'bg-purple-50/60', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
            ADMIN: { border: 'border-[var(--primary)]/20', bg: 'bg-[var(--primary-container)]/20', iconBg: 'bg-[var(--primary-container)]', iconColor: 'text-[var(--primary)]', badge: 'bg-[var(--primary-container)] text-[var(--primary)]' },
            STAFF: { border: 'border-[var(--outline-variant)]', bg: 'bg-[var(--surface-container)]', iconBg: 'bg-[var(--surface-container-high)]', iconColor: 'text-[var(--on-surface-variant)]', badge: 'bg-[var(--surface-container)] text-[var(--on-surface-variant)]' },
          };
          const c = colorMap[r.role] ?? colorMap.STAFF;
          return (
            <div key={r.role} className={`rounded-2xl border p-5 shadow-sm ${c.border} ${c.bg}`}>
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.iconBg}`}>
                  <Shield className={`h-5 w-5 ${c.iconColor}`} />
                </div>
                <div>
                  <div className="font-semibold text-[var(--on-surface)]">{r.label}</div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${c.badge}`}>
                    {r.role}
                  </span>
                </div>
              </div>
              <p className="mb-4 text-sm text-[var(--on-surface-variant)]">{r.description}</p>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]/60">สิทธิ์</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.permissions.map((perm) => permissionBadge(perm))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div className="rounded-2xl border border-[var(--primary)]/20 bg-[var(--primary-container)]/10 px-5 py-4 text-sm text-[var(--primary)]">
        <span className="font-semibold">หมายเหตุ:</span> การกำหนดบทบาท đượcจัดการใน{' '}
        <Link href="/admin/settings/users" className="font-semibold underline underline-offset-2">
          ผู้ใช้แอดมิน
        </Link>
        การปรับแต่งสิทธิ์เพิ่มเติมยังไม่รองรับในขณะนี้ — ติดต่อผู้ดูแลระบบของคุณเพื่อเปลี่ยนแปลงบทบาท
      </div>
    </main>
  );
}
