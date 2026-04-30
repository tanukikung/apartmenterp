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

export default function SettingsRolesPage() {
  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[hsl(225,25%,6%)] via-[hsl(225,25%,8%)] to-[hsl(225,25%,6%)] px-6 py-5 shadow-xl shadow-black/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),_transparent_60%)]" />
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <Shield className="h-5 w-5 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">บทบาทและสิทธิ์</h1>
              <p className="text-xs text-white/50 mt-0.5">ภาพรวมบทบาทระบบและระดับการเข้าถึง</p>
            </div>
          </div>
          <Link href="/admin/settings/users" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98]">
            จัดการผู้ใช้ →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/settings" className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors">
          <ArrowLeft className="h-4 w-4" /> ตั้งค่า
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-white/60">บทบาทและสิทธิ์</span>
      </div>

      {/* Role cards */}
      <div className="grid gap-5 md:grid-cols-3">
        {ROLES.map((r) => {
          const colorMap: Record<string, { border: string; iconBg: string; iconColor: string; badge: string }> = {
            OWNER: { border: 'border-purple-500/30', iconBg: 'bg-purple-500/10', iconColor: 'text-purple-400', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
            ADMIN: { border: 'border-primary/30', iconBg: 'bg-primary/10', iconColor: 'text-primary', badge: 'bg-primary/10 text-primary border-primary/30' },
            STAFF: { border: 'border-white/10', iconBg: 'bg-white/5', iconColor: 'text-white/50', badge: 'bg-white/5 text-white/50 border-white/10' },
          };
          const c = colorMap[r.role] ?? colorMap.STAFF;
          return (
            <div key={r.role} className={`rounded-2xl border ${c.border} bg-[hsl(225,25%,6%)] p-5 shadow-xl shadow-black/20`}>
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.iconBg}`}>
                  <Shield className={`h-5 w-5 ${c.iconColor}`} />
                </div>
                <div>
                  <div className="font-semibold text-white">{r.label}</div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${c.badge}`}>
                    {r.role}
                  </span>
                </div>
              </div>
              <p className="mb-4 text-sm text-white/50">{r.description}</p>
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-white/20">สิทธิ์</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.permissions.map((perm) => (
                    <span key={perm} className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/50">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-sm text-primary">
        <span className="font-semibold">หมายเหตุ:</span> การกำหนดบทบาท đượcจัดการใน{' '}
        <Link href="/admin/settings/users" className="font-semibold underline underline-offset-2 hover:text-primary/80 transition-colors">
          ผู้ใช้แอดมิน
        </Link>
        การปรับแต่งสิทธิ์เพิ่มเติมยังไม่รองรับในขณะนี้ — ติดต่อผู้ดูแลระบบของคุณเพื่อเปลี่ยนแปลงบทบาท
      </div>
    </main>
  );
}
