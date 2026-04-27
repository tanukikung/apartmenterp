'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { RunBackupButton } from './RunBackupButton';
import { RefreshCw } from 'lucide-react';

type HealthData = {
  status: 'ok' | 'degraded' | 'error';
  services?: { database?: string; env?: string };
  version?: string;
  environment?: string;
  timestamp?: string;
};

type DeepHealthData = {
  services?: {
    redis?: string;
    outbox?: { queueLength?: number; failedCount?: number };
    worker?: { alive?: boolean; lastHeartbeatMsAgo?: number | null };
  };
  servicesDetailed?: { worker?: { lastHeartbeatAt?: string | null } };
};

type MetricsData = {
  outbox?: { queueLength?: number; failedCount?: number };
  invoices?: { total?: number; overdue?: number };
  payments?: { matchRate?: number; manualReviewCount?: number };
};

type BackupStatus = {
  latestBackupAt: string | null;
  retentionDays: number;
  dir: string;
  cron: string;
};

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null as T | null;
    const json = await res.json();
    return (json?.data as T) ?? (null as T | null);
  } catch { return null as T | null; }
}

function tone(status?: string): string {
  if (status === 'ok' || status === 'connected' || status === 'alive') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  if (status === 'degraded') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
  if (status === 'error' || status === 'down') return 'bg-red-500/20 text-red-400 border border-red-500/30';
  return 'glass-card text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--glass-border))]';
}

function statusDot(status?: string): string {
  if (status === 'ok' || status === 'connected' || status === 'alive') return 'bg-emerald-400';
  if (status === 'degraded') return 'bg-amber-400';
  if (status === 'error' || status === 'down') return 'bg-red-400';
  return 'bg-[hsl(var(--on-surface-variant))]';
}

export default function AdminSystemPage() {
  const router = useRouter();
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [deepData, setDeepData] = useState<DeepHealthData | null>(null);
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [backupData, setBackupData] = useState<BackupStatus | null>(null);

  useEffect(() => {
    async function load() {
      const [h, d, m, b] = await Promise.all([
        fetchJson<HealthData>('/api/health'),
        fetchJson<DeepHealthData>('/api/health/deep'),
        fetchJson<MetricsData>('/api/metrics'),
        fetchJson<BackupStatus>('/api/system/backup-status'),
      ]);
      setHealthData(h);
      setDeepData(d);
      setMetricsData(m);
      setBackupData(b);
    }
    void load();
  }, []);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--glass-border))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">ระบบ</h1>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">ตรวจสอบสถานะแอปพลิเคชัน เวิร์คเกอร์ ความลึกคิว และความพร้อมการสำรองข้อมูล</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.refresh()}
              className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              <RefreshCw className="h-4 w-4" />
              รีเฟรช
            </button>
            <RunBackupButton />
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all hover:scale-[1.01] active:scale-[0.99]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะระบบ</div>
          <div className="mt-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${tone(healthData?.status)}`}>
              <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${statusDot(healthData?.status)}`} />
              {healthData?.status || 'ไม่พร้อมใช้งาน'}
            </span>
          </div>
          <div className="mt-3 text-sm text-[hsl(var(--on-surface-variant))]">สภาพแวดล้อม: {healthData?.services?.env || '-'} · DB: {healthData?.services?.database || '-'}</div>
        </div>
        <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all hover:scale-[1.01] active:scale-[0.99]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เวิร์คเกอร์</div>
          <div className="mt-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${tone(deepData?.services?.worker?.alive ? 'alive' : 'down')}`}>
              <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${statusDot(deepData?.services?.worker?.alive ? 'alive' : 'down')}`} />
              {deepData?.services?.worker?.alive ? 'เปิดใช้งาน' : 'ปิด'}
            </span>
          </div>
          <div className="mt-3 text-sm text-[hsl(var(--on-surface-variant))]">เช็คสถานะ: {deepData?.services?.worker?.lastHeartbeatMsAgo ?? '-'} มิลลิวินาทีที่แล้ว</div>
        </div>
        <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all hover:scale-[1.01] active:scale-[0.99]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">คิวออกบอกซ์</div>
          <div className="mt-3 text-2xl font-extrabold text-[hsl(var(--primary))]">{metricsData?.outbox?.queueLength ?? 0}</div>
          <div className="mt-2 text-sm text-[hsl(var(--on-surface-variant))]">อีเวนต์ที่ล้มเหลว: {metricsData?.outbox?.failedCount ?? 0}</div>
        </div>
        <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all hover:scale-[1.01] active:scale-[0.99]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">อัตราจับคู่การชำระ</div>
          <div className="mt-3 text-2xl font-extrabold text-[hsl(var(--primary))]">{Math.round((metricsData?.payments?.matchRate ?? 0) * 100)}%</div>
          <div className="mt-2 text-sm text-[hsl(var(--on-surface-variant))]">ตรวจสอบด้วยตนเอง: {metricsData?.payments?.manualReviewCount ?? 0}</div>
        </div>
      </section>

      {/* Detail Cards */}
      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))]">
            <div className="text-sm font-semibold text-[hsl(var(--primary))]">สถานะแอปพลิเคชัน</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-[hsl(var(--card-foreground))]">
            <div>ภาพรวม: <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${tone(healthData?.status)}`}>{healthData?.status || 'ไม่ทราบ'}</span></div>
            <div>ฐานข้อมูล: {healthData?.services?.database || '-'}</div>
            <div>สภาพแวดล้อม: {healthData?.services?.env || '-'}</div>
            <div>เวอร์ชัน: {healthData?.version || '-'} ({healthData?.environment || '-'})</div>
            <div className="text-xs text-[hsl(var(--on-surface-variant))]">
              อัปเดตล่าสุด <ClientOnly fallback="-">{healthData?.timestamp ? new Date(healthData.timestamp).toLocaleString('th-TH') : '-'}</ClientOnly>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))]">
            <div className="text-sm font-semibold text-[hsl(var(--primary))]">เวิร์คเกอร์และคิว</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-[hsl(var(--card-foreground))]">
            <div>Redis: {deepData?.services?.redis || '-'}</div>
            <div>เวิร์คเกอร์: {deepData?.services?.worker?.alive ? 'เปิดใช้งาน' : 'ปิด'}</div>
            <div>ความยาวคิว: {deepData?.services?.outbox?.queueLength ?? 0}</div>
            <div>อีเวนต์ที่ล้มเหลว: {deepData?.services?.outbox?.failedCount ?? 0}</div>
            <div className="text-xs text-[hsl(var(--on-surface-variant))]">
              เช็คสถานะล่าสุด <ClientOnly fallback="-">{deepData?.servicesDetailed?.worker?.lastHeartbeatAt ? new Date(deepData.servicesDetailed.worker.lastHeartbeatAt).toLocaleString('th-TH') : '-'}</ClientOnly>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))]">
            <div className="text-sm font-semibold text-[hsl(var(--primary))]">สถานะการสำรองข้อมูล</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-[hsl(var(--card-foreground))]">
            <div>การสำรองล่าสุด: <ClientOnly fallback="-">{backupData?.latestBackupAt ? new Date(backupData.latestBackupAt).toLocaleString('th-TH') : '-'}</ClientOnly></div>
            <div>จำนวนวันที่เก็บรักษา: {backupData?.retentionDays ?? '-'}</div>
            <div>ไดเรกทอรีสำรอง: <span className="font-mono text-xs text-[hsl(var(--on-surface-variant))]">{backupData?.dir || '-'}</span></div>
            <div>Cron: <span className="font-mono text-xs text-[hsl(var(--on-surface-variant))]">{backupData?.cron || '-'}</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}