'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Layers,
  FileSignature,
  LogOut,
  MessageSquare,
  MessageCircle,
  Zap,
  FileText,
  FileBox,
  Truck,
  BarChart3,
  ClipboardCheck,
  Timer,
  Save,
  Loader2,
} from 'lucide-react';
import {
  DEFAULT_MODULE_FLAGS,
  type ModuleKey,
  type ModuleFlags,
} from '@/lib/permissions';

// ─── Types ──────────────────────────────────────────────────────────────────

type ModuleDef = {
  key: ModuleKey;
  label: string;
  description: string;
  icon: React.ElementType;
  category: string;
};

const MODULE_DEFS: ModuleDef[] = [
  // สัญญาและผู้เช่า
  { key: 'contracts', label: 'สัญญาเช่า', description: 'จัดการสัญญาเช่า สร้างสัญญาใหม่ ดูรายละเอียดผู้เช่า และติดตามวันหมดสัญญา', icon: FileSignature, category: 'สัญญาและผู้เช่า' },
  { key: 'moveouts', label: 'ย้ายออก', description: 'บันทึกการย้ายออก คืนเงินมัดจำ และอัปเดตสถานะห้องให้พร้อมเช่าใหม่', icon: LogOut, category: 'สัญญาและผู้เช่า' },
  // การสื่อสาร
  { key: 'line', label: 'LINE', description: 'เชื่อมต่อ LINE Official Account สำหรับส่งข้อความและใบแจ้งหนี้ให้ผู้เช่า', icon: Zap, category: 'การสื่อสาร' },
  { key: 'chat', label: 'แชท', description: 'สนทนากับผู้เช่าแต่ละห้องได้โดยตรง ตอบคำถามหรือส่งข้อมูลเพิ่มเติม', icon: MessageCircle, category: 'การสื่อสาร' },
  { key: 'messageSequences', label: 'ข้อความอัตโนมัติ', description: 'ตั้งลำดับข้อความที่ส่งอัตโนมัติเมื่อมีเหตุการณ์ต่างๆ เช่น ลงทะเบียน หรือย้ายออก', icon: MessageSquare, category: 'การสื่อสาร' },
  // เอกสาร
  { key: 'documents', label: 'เอกสาร', description: 'สร้างและส่งเอกสารให้ผู้เช่า เช่น ใบเสร็จ ใบแจ้งหนี้ หนังสือแจ้งเตือน', icon: FileText, category: 'เอกสาร' },
  { key: 'templates', label: 'แม่แบบ', description: 'สร้างและแก้ไขแม่แบบเอกสาร เช่น สัญญาเช่า ใบเสร็จ โดยใช้ตัวแปรต่างๆ', icon: FileBox, category: 'เอกสาร' },
  // ระบบ
  { key: 'deliveryOrders', label: 'พัสดุ', description: 'บันทึกรายการพัสดุที่ได้รับสำหรับผู้เช่าแต่ละห้อง แจ้งผู้เช่าผ่าน LINE', icon: Truck, category: 'ระบบ' },
  { key: 'analytics', label: 'วิเคราะห์', description: 'ดูกราฟความเข้าพัก รายได้ สถานะห้อง และตัวชี้วัดอื่นๆ ของอาคาร', icon: BarChart3, category: 'ระบบ' },
  { key: 'auditLogs', label: 'บันทึกตรวจสอบ', description: 'ดูประวัติการเปลี่ยนแปลงในระบบทั้งหมด เช่น ใครแก้ไขอะไร เมื่อไหร่', icon: ClipboardCheck, category: 'ระบบ' },
  { key: 'automation', label: 'ระบบอัตโนมัติ', description: 'ตั้งเวลางานอัตโนมัติ เช่น สร้างบิลรายเดือน ส่งเตือนค่าเช่า สำรองฐานข้อมูล', icon: Timer, category: 'ระบบ' },
];

// Group modules by category
const CATEGORIES = [...new Set(MODULE_DEFS.map((m) => m.category))];

// ─── Toggle Component ───────────────────────────────────────────────────────

function ModuleToggle({
  moduleKey,
  enabled,
  onChange,
  saving,
}: {
  moduleKey: ModuleKey;
  enabled: boolean;
  onChange: (key: ModuleKey, value: boolean) => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-white/30 border border-white/10'}`}>
        {enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(moduleKey, !enabled)}
        disabled={saving}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed',
          enabled ? 'bg-emerald-500' : 'bg-white/10',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
            enabled ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsModulesPage() {
  const [modules, setModules] = useState<ModuleFlags>(DEFAULT_MODULE_FLAGS);
  const [original, setOriginal] = useState<ModuleFlags>(DEFAULT_MODULE_FLAGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchModules = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/modules');
      const data = await res.json();
      if (data.data?.modules) {
        setModules({ ...DEFAULT_MODULE_FLAGS, ...data.data.modules });
        setOriginal({ ...DEFAULT_MODULE_FLAGS, ...data.data.modules });
      }
    } catch {
      // use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const handleChange = (key: ModuleKey, value: boolean) => {
    setModules((prev: ModuleFlags) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const isDirty = JSON.stringify(modules) !== JSON.stringify(original);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modules),
      });
      const data = await res.json();
      if (data.success) {
        setOriginal(modules);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10  via-[hsl(225,25%,8%)] to-[hsl(225,25%,6%)] px-6 py-5 shadow-xl shadow-black/30">
        <div className="absolute inset-0 " />
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5-md">
              <Layers className="h-5 w-5 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">การจัดการโมดูล</h1>
              <p className="text-xs text-white/50 mt-0.5">เปิดหรือปิดส่วนต่างๆ ของระบบตามความต้องการ</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-xs text-emerald-400 animate-pulse">บันทึกแล้ว</span>
            )}
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-all hover:bg-primary/20 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/settings" className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors">
          <ArrowLeft className="h-4 w-4" /> ตั้งค่า
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-white/60">การจัดการโมดูล</span>
      </div>

      {/* Info banner */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-sm text-primary/80">
        <span className="font-semibold">💡 เคล็ดลับ:</span> เปิดเฉพาะโมดูลที่คุณใช้งานจริง — โมดูลที่ปิดจะถูกซ่อนจากเมนูด้านซ้าย แต่ข้อมูลเดิมจะไม่สูญหาย
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-[hsl(225,25%,6%)] p-5 animate-pulse">
              <div className="h-4 w-32 rounded bg-white/5 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-14 rounded-xl bg-white/5" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map((category) => {
            const categoryModules = MODULE_DEFS.filter((m) => m.category === category);
            return (
              <div key={category} className="rounded-2xl border border-white/10 bg-[hsl(225,25%,6%)] overflow-hidden shadow-xl shadow-black/20">
                <div className="px-5 py-3 border-b border-white/5">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{category}</h2>
                </div>
                <div className="divide-y divide-white/5">
                  {categoryModules.map((def) => {
                    const Icon = def.icon;
                    const enabled = modules[def.key] ?? true;
                    return (
                      <div key={def.key} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
                          <Icon className="h-4 w-4 text-white/50" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white">{def.label}</div>
                          <div className="text-xs text-white/40 truncate">{def.description}</div>
                        </div>
                        <ModuleToggle
                          moduleKey={def.key}
                          enabled={enabled}
                          onChange={handleChange}
                          saving={saving}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
