'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Building2,
  CreditCard,
  MessageSquare,
  Receipt,
  Settings,
  Shield,
  Users,
  Zap,
  AlertTriangle,
  Download,
  Trash2,
  X,
  Loader2,
  CheckCircle,
  UserCheck,
  Bell,
  FileText,
} from 'lucide-react';

type StatusKind = 'active' | 'reference';

type SettingCategory = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  iconBg: string;
  iconText: string;
  status?: StatusKind;
};

// ─── Category definitions ─────────────────────────────────────────────────────

const ACCESS_CONTROL: SettingCategory[] = [
  {
    id: 'users',
    title: 'ผู้ดูแลระบบ',
    description: 'สร้างและจัดการบัญชีผู้ดูแล ชื่อที่แสดง และบทบาทการเข้าถึง',
    href: '/admin/settings/users',
    icon: <Users className="h-5 w-5" />,
    iconBg: 'bg-blue-500/20',
    iconText: 'text-blue-600',
    status: 'active',
  },
  {
    id: 'staff-requests',
    title: 'คำขอลงทะเบียนพนักงาน',
    description: 'อนุมัติหรือปฏิเสธคำขอสมัครพนักงานใหม่',
    href: '/admin/settings/staff-requests',
    icon: <UserCheck className="h-5 w-5" />,
    iconBg: 'bg-amber-500/20',
    iconText: 'text-amber-600',
    status: 'active',
  },
  {
    id: 'roles',
    title: 'บทบาทและสิทธิ์',
    description: 'ตรวจสอบระดับสิทธิ์ของเจ้าของ ผู้ดูแล และพนักงาน และสิ่งที่แต่ละบทบาทสามารถเข้าถึงได้',
    href: '/admin/settings/roles',
    icon: <Shield className="h-5 w-5" />,
    iconBg: 'bg-slate-200',
    iconText: 'text-slate-500',
    status: 'reference',
  },
];

const PROPERTY_FINANCE: SettingCategory[] = [
  {
    id: 'building',
    title: 'ข้อมูลอาคาร',
    description: 'กำหนดค่าชื่ออาคาร ที่อยู่ และข้อมูลติดต่อที่พิมพ์บนเอกสารและใบแจ้งหนี้',
    href: '/admin/settings/building',
    icon: <Building2 className="h-5 w-5" />,
    iconBg: 'bg-blue-500/20',
    iconText: 'text-blue-600',
    status: 'active',
  },
  {
    id: 'bank-accounts',
    title: 'บัญชีธนาคาร',
    description: 'จัดการบัญชีธนาคารที่ใช้สำหรับการเรียกเก็บเงิน นำเข้าข้อมูล และการจับคู่อัตโนมัติ',
    href: '/admin/settings/bank-accounts',
    icon: <CreditCard className="h-5 w-5" />,
    iconBg: 'bg-emerald-500/20',
    iconText: 'text-emerald-600',
    status: 'active',
  },
  {
    id: 'billing-policy',
    title: 'ปฏิทินการเรียกเก็บ',
    description: 'กำหนดวัน billing วันครบกำหนดชำระ และวันตัดจ่ายที่ใช้ทั่วทั้งระบบ ERP',
    href: '/admin/settings/billing-policy',
    icon: <Receipt className="h-5 w-5" />,
    iconBg: 'bg-red-500/20',
    iconText: 'text-red-600',
    status: 'active',
  },
  {
    id: 'billing-rules',
    title: 'กฏการเรียกเก็บ',
    description: 'กำหนดค่าน้ำค่าไฟเริ่มต้น และราคาต่อหน่วยสำหรับการคิดบิลอัตโนมัติ',
    href: '/admin/settings/billing-rules',
    icon: <FileText className="h-5 w-5" />,
    iconBg: 'bg-blue-500/20',
    iconText: 'text-blue-600',
    status: 'active',
  },
  {
    id: 'reminders',
    title: 'การแจ้งเตือนชำระ',
    description: 'กำหนดวันและเนื้อหาการแจ้งเตือนผู้เช่าก่อนถึงกำหนดและเมื่อเกินกำหนด',
    href: '/admin/settings/reminders',
    icon: <Bell className="h-5 w-5" />,
    iconBg: 'bg-amber-500/20',
    iconText: 'text-amber-600',
    status: 'active',
  },
];

const INTEGRATIONS: SettingCategory[] = [
  {
    id: 'integrations',
    title: 'การเชื่อมต่อ LINE',
    description: 'เชื่อมต่อบัญชี LINE Official เพื่อส่งข้อความถึงผู้เช่า ใบแจ้งหนี้ และใบเสร็จการชำระเงิน',
    href: '/admin/settings/integrations',
    icon: <MessageSquare className="h-5 w-5" />,
    iconBg: 'bg-emerald-500/20',
    iconText: 'text-emerald-600',
    status: 'active',
  },
  {
    id: 'automation',
    title: 'กฎระบบอัตโนมัติ',
    description: 'กำหนดเวลาการเรียกเก็บเงินอัตโนมัติ การแจ้งเตือนการชำระเงิน การสำรองฐานข้อมูล และการตรวจสอบค้างชำระ',
    href: '/admin/settings/automation',
    icon: <Zap className="h-5 w-5" />,
    iconBg: 'bg-amber-500/20',
    iconText: 'text-amber-600',
    status: 'active',
  },
];

// ─── Card component ───────────────────────────────────────────────────────────

function CategoryCard({ cat }: { cat: SettingCategory }) {
  return (
    <Link href={cat.href}
      className="group  rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] hover:shadow-glow cursor-pointer">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className={['flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm', cat.iconBg].join(' ')}>
            <span className={cat.iconText}>{cat.icon}</span>
          </div>
          {cat.status && (
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span className={['h-1.5 w-1.5 rounded-full', cat.status === 'active' ? 'bg-emerald-400/70' : 'bg-[hsl(var(--outline-variant))]'].join(' ')} />
              <span className={cat.status === 'active' ? 'text-emerald-400' : 'text-[hsl(var(--on-surface-variant))]'}>
                {cat.status === 'active' ? 'ใช้งาน' : 'อ้างอิง'}
              </span>
            </span>
          )}
        </div>
        <div className="font-semibold text-[hsl(var(--on-surface))] text-sm leading-snug">{cat.title}</div>
        <p className="mt-1.5 text-xs leading-relaxed text-[hsl(var(--on-surface-variant))]">{cat.description}</p>
      </div>
      <div className="border-t border-[hsl(var([hsl(var(--color-border))]))] px-5 py-3 bg-[hsl(var(--glass-bg))] flex items-center justify-between">
        <span className="text-xs font-medium text-[hsl(var(--primary))] group-hover:text-[hsl(var(--primary))]/80 transition-colors">
          ตั้งค่า →
        </span>
      </div>
    </Link>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-3 opacity-60">
      {title}
    </h2>
  );
}

// ─── Reset System Modal ───────────────────────────────────────────────────────

function ResetSystemModal({
  isOpen,
  onClose,
  onReset,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReset: (backup: boolean) => Promise<void>;
}) {
  const [resetMode, setResetMode] = useState<'backup' | 'clear'>('clear');
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleReset = async () => {
    setIsResetting(true);
    setError('');

    try {
      await onReset(resetMode === 'backup');
      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/admin/setup';
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsResetting(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
        <div className="w-full max-w-md rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))] p-6 shadow-xl" style={{ background: 'hsl(var(--card))' }}>
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">รีเซ็ตระบบเสร็จสิ้น</h2>
            <p className="mt-2 text-sm text-[hsl(var(--on-surface-variant))]">กำลังนำคุณไปยังหน้าตั้งค่า...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))] p-6 shadow-xl" style={{ background: 'hsl(var(--card))' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">รีเซ็ตระบบ</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--on-surface-variant))] hover:bg-white/5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 p-4 mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-300">
            <p className="font-medium">การรีเซ็ตจะลบข้อมูลทั้งหมด!</p>
            <p className="mt-1 text-red-300/70">รวมถึงห้องพัก ผู้เช่า สัญญาเช่า ใบแจ้งหนี้ และการชำระเงินทั้งหมด</p>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          <label
            className={[
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all',
              resetMode === 'clear'
                ? 'border-red-500/40 bg-red-500/10'
                : 'border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] hover:border-red-500/20',
            ].join(' ')}
          >
            <input
              type="radio"
              name="resetMode"
              value="clear"
              checked={resetMode === 'clear'}
              onChange={() => setResetMode('clear')}
              className="mt-0.5 h-4 w-4 accent-red-500"
            />
            <div>
              <span className="text-sm font-medium text-[hsl(var(--card-foreground))]">ล้างข้อมูลเลย</span>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">ลบข้อมูลทั้งหมดโดยไม่สำรอง</p>
            </div>
          </label>

          <label
            className={[
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all',
              resetMode === 'backup'
                ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/10'
                : 'border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary))]/20',
            ].join(' ')}
          >
            <input
              type="radio"
              name="resetMode"
              value="backup"
              checked={resetMode === 'backup'}
              onChange={() => setResetMode('backup')}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-[hsl(var(--card-foreground))]">สำรองข้อมูลก่อน</span>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">Export JSON ก่อนล้างข้อมูล</p>
            </div>
            <Download className="h-4 w-4 text-[hsl(var(--on-surface-variant))]" />
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 p-3 text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.1)' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={isResetting}
            className="flex-1 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--card-foreground))] hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleReset}
            disabled={isResetting}
            className={[
              'flex items-center gap-2 flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50',
              resetMode === 'clear'
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90',
            ].join(' ')}
          >
            {isResetting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังดำเนินการ...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                {resetMode === 'clear' ? 'ล้างข้อมูล' : 'สำรองและล้าง'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const [showResetModal, setShowResetModal] = useState(false);

  const handleReset = async (backup: boolean) => {
    const res = await fetch('/api/admin/setup/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup }),
    });

    const json = await res.json();

    if (!json.success) {
      throw new Error(json.error?.message || 'ไม่สามารถรีเซ็ตระบบได้');
    }
  };

  return (
    <>
      <main className="space-y-8">
        {/* Page-level header */}
        <div className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-6 py-5 shadow-xl" style={{ background: 'hsl(var(--card))' }}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.15) 0%, transparent 60%)' }} />
          </div>
          <div className="relative flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]" style={{ background: 'hsl(var(--primary) / 0.2)' }}>
              <Settings className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--card-foreground))]">ตั้งค่า</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
                จัดการการตั้งค่าอาคาร การเชื่อมต่อ กฎการเรียกเก็บ และบัญชีผู้ดูแล
              </p>
            </div>
          </div>
        </div>

        {/* Access Control */}
        <div>
          <SectionHeading title="การควบคุมการเข้าถึง" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ACCESS_CONTROL.map((cat) => <CategoryCard key={cat.id} cat={cat} />)}
          </div>
        </div>

        {/* Property & Finance */}
        <div>
          <SectionHeading title="อสังหาริมทรัพย์และการเงิน" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PROPERTY_FINANCE.map((cat) => <CategoryCard key={cat.id} cat={cat} />)}
          </div>
        </div>

        {/* Integrations */}
        <div>
          <SectionHeading title="การเชื่อมต่อ" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {INTEGRATIONS.map((cat) => <CategoryCard key={cat.id} cat={cat} />)}
          </div>
        </div>

        {/* Reset System */}
        <div className="border-t border-[hsl(var([hsl(var(--color-border))]))] pt-6">
          <div className="rounded-xl border border-red-500/20 p-5" style={{ background: 'rgba(239,68,68,0.05)' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[hsl(var(--card-foreground))]">รีเซ็ตระบบ</h3>
                  <p className="text-xs text-[hsl(var(--on-surface-variant))]">
                    ลบข้อมูลทั้งหมดและเริ่มต้นใหม่ (ADMIN เท่านั้น)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowResetModal(true)}
                className="flex items-center gap-2 rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" />
                รีเซ็ตระบบ
              </button>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-[hsl(var(--on-surface-variant))]/40 text-center pt-2 pb-1">
          การเปลี่ยนแปลงการตั้งค่าจะมีผลทันที เว้นแต่จะระบุไว้เป็นอย่างอื่น
        </p>
      </main>

      <ResetSystemModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onReset={handleReset}
      />
    </>
  );
}
