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
} from 'lucide-react';

type StatusKind = 'active' | 'reference';

type SettingCategory = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  iconBg: string;
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
    iconBg: 'bg-primary-container',
    status: 'active',
  },
  {
    id: 'roles',
    title: 'บทบาทและสิทธิ์',
    description: 'ตรวจสอบระดับสิทธิ์ของเจ้าของ ผู้ดูแล และพนักงาน และสิ่งที่แต่ละบทบาทสามารถเข้าถึงได้',
    href: '/admin/settings/roles',
    icon: <Shield className="h-5 w-5" />,
    iconBg: 'bg-surface-container',
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
    iconBg: 'bg-blue-100',
    status: 'active',
  },
  {
    id: 'bank-accounts',
    title: 'บัญชีธนาคาร',
    description: 'จัดการบัญชีธนาคารที่ใช้สำหรับการเรียกเก็บเงิน นำเข้าข้อมูล และการจับคู่อัตโนมัติ',
    href: '/admin/settings/bank-accounts',
    icon: <CreditCard className="h-5 w-5" />,
    iconBg: 'bg-emerald-100',
    status: 'active',
  },
  {
    id: 'billing-policy',
    title: 'ปฏิทินการเรียกเก็บ',
    description: 'กำหนดวัน billing วันครบกำหนดชำระ และวันตัดจ่ายที่ใช้ทั่วทั้งระบบ ERP',
    href: '/admin/settings/billing-policy',
    icon: <Receipt className="h-5 w-5" />,
    iconBg: 'bg-rose-100',
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
    iconBg: 'bg-green-100',
    status: 'active',
  },
  {
    id: 'automation',
    title: 'กฎระบบอัตโนมัติ',
    description: 'กำหนดเวลาการเรียกเก็บเงินอัตโนมัติ การแจ้งเตือนการชำระเงิน การสำรองฐานข้อมูล และการตรวจสอบค้างชำระ',
    href: '/admin/settings/automation',
    icon: <Zap className="h-5 w-5" />,
    iconBg: 'bg-amber-100',
    status: 'active',
  },
];

// ─── Card component ───────────────────────────────────────────────────────────

function CategoryCard({ cat }: { cat: SettingCategory }) {
  return (
    <Link href={cat.href}
      className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden transition-all hover:shadow-lg hover:border-primary/20">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className={['flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm', cat.iconBg].join(' ')}>
            <span className={cat.iconBg.includes('primary-container') ? 'text-primary' : cat.iconBg.includes('surface-container') ? 'text-on-surface-variant' : 'text-on-surface'}>{cat.icon}</span>
          </div>
          {cat.status && (
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span className={['h-1.5 w-1.5 rounded-full', cat.status === 'active' ? 'bg-tertiary-container' : 'bg-outline-variant'].join(' ')} />
              <span className={cat.status === 'active' ? 'text-on-tertiary-container' : 'text-on-surface-variant'}>
                {cat.status === 'active' ? 'ใช้งาน' : 'อ้างอิง'}
              </span>
            </span>
          )}
        </div>
        <div className="font-semibold text-on-surface text-sm leading-snug">{cat.title}</div>
        <p className="mt-1.5 text-xs leading-relaxed text-on-surface-variant">{cat.description}</p>
      </div>
      <div className="border-t border-outline-variant/10 px-5 py-3 bg-surface-container/50 flex items-center justify-between">
        <span className="text-xs font-medium text-primary group-hover:text-primary/80 transition-colors">
          ตั้งค่า →
        </span>
      </div>
    </Link>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-on-surface">รีเซ็ตระบบเสร็จสิ้น</h2>
            <p className="mt-2 text-sm text-on-surface-variant">กำลังนำคุณไปยังหน้าตั้งค่า...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-on-surface">รีเซ็ตระบบ</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4 mb-4">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-medium">การรีเซ็ตจะลบข้อมูลทั้งหมด!</p>
            <p className="mt-1">รวมถึงห้องพัก ผู้เช่า สัญญาเช่า ใบแจ้งหนี้ และการชำระเงินทั้งหมด</p>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          <label
            className={[
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all',
              resetMode === 'clear'
                ? 'border-red-500 bg-red-50'
                : 'border-outline bg-surface-container-lowest hover:border-primary/50',
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
              <span className="text-sm font-medium text-on-surface">ล้างข้อมูลเลย</span>
              <p className="text-xs text-on-surface-variant mt-0.5">ลบข้อมูลทั้งหมดโดยไม่สำรอง</p>
            </div>
          </label>

          <label
            className={[
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all',
              resetMode === 'backup'
                ? 'border-primary bg-primary-container/30'
                : 'border-outline bg-surface-container-lowest hover:border-primary/50',
            ].join(' ')}
          >
            <input
              type="radio"
              name="resetMode"
              value="backup"
              checked={resetMode === 'backup'}
              onChange={() => setResetMode('backup')}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-on-surface">สำรองข้อมูลก่อน</span>
              <p className="text-xs text-on-surface-variant mt-0.5">Export JSON ก่อนล้างข้อมูล</p>
            </div>
            <Download className="h-4 w-4 text-on-surface-variant" />
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={isResetting}
            className="flex-1 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleReset}
            disabled={isResetting}
            className={[
              'flex items-center gap-2 flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50',
              resetMode === 'clear'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-primary text-on-primary hover:bg-primary/90',
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
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Settings className="h-5 w-5 text-on-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-on-primary">ตั้งค่า</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">
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
        <div className="border-t border-outline-variant/10 pt-6">
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-on-surface">รีเซ็ตระบบ</h3>
                  <p className="text-xs text-on-surface-variant">
                    ลบข้อมูลทั้งหมดและเริ่มต้นใหม่ (ADMIN เท่านั้น)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowResetModal(true)}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                รีเซ็ตระบบ
              </button>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-on-surface-variant/60 text-center pt-2 pb-1">
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
