'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  HardDrive,
  MessageSquare,
  MemoryStick,
  RefreshCw,
  Server,
  Wifi,
  XCircle,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceStatus = 'ok' | 'connected' | 'degraded' | 'error' | 'not_configured';

type HealthData = {
  status: 'ok' | 'degraded' | 'error';
  services: {
    database: ServiceStatus;
    env: ServiceStatus;
    app: ServiceStatus;
    redis?: ServiceStatus;
  };
  servicesDetailed?: {
    database?: { status: ServiceStatus; latencyMs: number | null };
    redis?: { status: ServiceStatus; latencyMs: number | null };
    outbox?: { status: ServiceStatus; queueLength: number; failedCount: number };
    worker?: { status: ServiceStatus; lastHeartbeatAt: string | null; heartbeatSource?: 'redis' | 'in_memory' };
  };
  version: string;
  environment: string;
  latencies?: { databaseMs: number | null };
  missingEnv?: string[];
  error?: string;
  timestamp: string;
};

type HealthCard = {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: ServiceStatus | null;
  detail: string | null;
  latencyMs?: number | null;
};

type BackgroundJob = {
  name: string;
  lastRun: string | null;
  nextRun: string | null;
  status: ServiceStatus;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusIcon(status: ServiceStatus | null, size = 'h-5 w-5') {
  if (status === 'ok' || status === 'connected')
    return <CheckCircle2 className={`${size} text-emerald-500`} />;
  if (status === 'degraded')
    return <AlertTriangle className={`${size} text-amber-500`} />;
  if (status === 'error')
    return <XCircle className={`${size} text-red-500`} />;
  if (status === 'not_configured')
    return <AlertTriangle className={`${size} text-[var(--on-surface-variant)]`} />;
  return <Clock className={`${size} text-outline-variant`} />;
}

function statusLabel(status: ServiceStatus | null): string {
  switch (status) {
    case 'ok':
    case 'connected':
      return 'ปกติ';
    case 'degraded':
      return 'เสื่อม';
    case 'error':
      return 'ข้อผิดพลาด';
    case 'not_configured':
      return 'ไม่ได้ตั้งค่า';
    default:
      return 'ไม่ทราบ';
  }
}

function statusCardBorder(status: ServiceStatus | null): string {
  if (status === 'ok' || status === 'connected') return 'border-emerald-200 bg-emerald-50/40';
  if (status === 'degraded') return 'border-amber-200 bg-amber-50/40';
  if (status === 'error') return 'border-red-200 bg-red-50/40';
  return 'border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]';
}

function statusTextColor(status: ServiceStatus | null): string {
  if (status === 'ok' || status === 'connected') return 'text-emerald-700';
  if (status === 'degraded') return 'text-amber-700';
  if (status === 'error') return 'text-red-700';
  return 'text-[var(--on-surface-variant)]';
}

function globalBadgeClass(status: 'ok' | 'degraded' | 'error' | undefined): string {
  if (status === 'ok') return 'inline-flex items-center gap-2 rounded-full bg-[var(--success-container)]/30 px-3 py-1 text-xs font-semibold text-[var(--color-success)]';
  if (status === 'degraded') return 'inline-flex items-center gap-2 rounded-full bg-[var(--warning-container)]/30 px-3 py-1 text-xs font-semibold text-[var(--color-warning)]';
  if (status === 'error') return 'inline-flex items-center gap-2 rounded-full bg-[var(--error-container)]/30 px-3 py-1 text-xs font-semibold text-[var(--color-danger)]';
  return 'inline-flex items-center gap-2 rounded-full bg-[var(--surface-container-lowest)] px-3 py-1 text-xs font-semibold text-[var(--on-surface-variant)]';
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Derive health cards from API response
// ---------------------------------------------------------------------------

function buildHealthCards(data: HealthData): HealthCard[] {
  const detailed = data.servicesDetailed;
  const dbStatus: ServiceStatus =
    data.services.database === 'connected' || data.services.database === 'ok'
      ? 'ok'
      : (data.services.database ?? 'error');

  const cards: HealthCard[] = [
    {
      id: 'database',
      label: 'ฐานข้อมูล',
      icon: <Database className="h-6 w-6" />,
      status: dbStatus,
      detail:
        dbStatus === 'ok'
          ? `เชื่อมต่อแล้ว`
          : data.error
            ? data.error.slice(0, 80)
            : 'การเชื่อมต่อล้มเหลว',
      latencyMs: detailed?.database?.latencyMs ?? data.latencies?.databaseMs,
    },
    {
      id: 'line',
      label: 'API LINE',
      icon: <MessageSquare className="h-6 w-6" />,
      status:
        data.missingEnv?.some((k) => k.toLowerCase().includes('line')) === false
          ? 'ok'
          : 'not_configured',
      detail:
        data.missingEnv?.some((k) => k.toLowerCase().includes('line')) === false
          ? 'กำหนดค่าข้อมูลรับรองแล้ว'
          : 'ไม่ได้ตั้งค่า LINE_CHANNEL_ID หรือ LINE_ACCESS_TOKEN',
    },
    {
      id: 'redis',
      label: 'Redis',
      icon: <Zap className="h-6 w-6" />,
      status: detailed?.redis?.status ?? 'not_configured',
      detail:
        detailed?.redis?.status === 'ok'
          ? 'เชื่อมต่อ Redis แล้ว'
          : detailed?.redis?.status === 'not_configured'
            ? 'ไม่ได้ตั้งค่า (ตัวเลือก - ใช้ in-memory heartbeat)'
            : 'การเชื่อมต่อ Redis ล้มเหลว',
      latencyMs: detailed?.redis?.latencyMs,
    },
    {
      id: 'memory',
      label: 'หน่วยความจำ',
      icon: <MemoryStick className="h-6 w-6" />,
      status: 'ok',
      detail: 'รันไทม์ Node.js — การใช้งาน heap ติดตามฝั่งเซิร์ฟเวอร์',
    },
    {
      id: 'disk',
      label: 'ดิสก์',
      icon: <HardDrive className="h-6 w-6" />,
      status: 'ok',
      detail: 'ข้อมูลการใช้งานดิสก์ไม่แสดงผ่าน endpoint นี้',
    },
    {
      id: 'worker',
      label: 'โปรแกรมทำงานเบื้องหลัง',
      icon: <Activity className="h-6 w-6" />,
      status: detailed?.worker?.status ?? 'not_configured',
      detail: detailed?.worker?.lastHeartbeatAt
        ? `สัญญาณชีพล่าสุด: ${fmtTs(detailed.worker.lastHeartbeatAt)} (${detailed.worker.heartbeatSource === 'in_memory' ? 'in-memory' : 'Redis'})`
        : detailed?.worker?.heartbeatSource === 'in_memory'
          ? 'Worker กำลังทำงาน (ใช้ in-memory heartbeat - Redis ไม่ได้ตั้งค่า)'
          : 'Worker ไม่ได้ทำงาน หรือ Worker process ไม่ได้เริ่มต้น',
    },
  ];

  return cards;
}

// ---------------------------------------------------------------------------
// Derive service list
// ---------------------------------------------------------------------------

type ServiceRow = {
  name: string;
  status: ServiceStatus;
  lastHeartbeat: string | null;
};

function buildServiceRows(data: HealthData): ServiceRow[] {
  const detailed = data.servicesDetailed;
  return [
    {
      name: 'เซิร์ฟเวอร์แอปพลิเคชัน',
      status: data.services.app === 'ok' ? 'ok' : 'error',
      lastHeartbeat: data.timestamp,
    },
    {
      name: 'ฐานข้อมูล PostgreSQL',
      status:
        data.services.database === 'connected' || data.services.database === 'ok'
          ? 'ok'
          : 'error',
      lastHeartbeat: data.timestamp,
    },
    {
      name: 'แคช Redis',
      status:
        detailed?.redis?.status === 'ok'
          ? 'ok'
          : detailed?.redis?.status === 'not_configured'
            ? 'not_configured'
            : 'error',
      lastHeartbeat: detailed?.redis?.status === 'ok' ? data.timestamp : null,
    },
    {
      name: 'ตัวประมวลผลกล่องขาออก',
      status: detailed?.outbox?.status ?? 'not_configured',
      lastHeartbeat:
        detailed?.outbox
          ? data.timestamp
          : null,
    },
    {
      name: 'โปรแกรมทำงานเบื้องหลัง',
      status: detailed?.worker?.status ?? 'not_configured',
      lastHeartbeat: detailed?.worker?.lastHeartbeatAt ?? null,
    },
    {
      name: 'การส่งข้อความ LINE',
      status: data.missingEnv?.some((k) => k.toLowerCase().includes('line'))
        ? 'not_configured'
        : 'ok',
      lastHeartbeat: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Static background jobs (not exposed by /api/health, shown for completeness)
// ---------------------------------------------------------------------------

const STATIC_JOBS: BackgroundJob[] = [
  { name: 'Invoice Generator', lastRun: null, nextRun: null, status: 'not_configured' },
  { name: 'Payment Auto-Matcher', lastRun: null, nextRun: null, status: 'not_configured' },
  { name: 'Overdue Checker', lastRun: null, nextRun: null, status: 'not_configured' },
  { name: 'Outbox Event Processor', lastRun: null, nextRun: null, status: 'not_configured' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthCardItem({ card }: { card: HealthCard }) {
  return (
    <div
      className={[
        'rounded-xl border p-4 flex flex-col gap-2',
        statusCardBorder(card.status),
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="text-[var(--on-surface-variant)]">{card.icon}</span>
        {statusIcon(card.status)}
      </div>
      <div>
        <div className="font-semibold text-[var(--on-surface)]">{card.label}</div>
        <div className={['text-xs font-medium mt-0.5', statusTextColor(card.status)].join(' ')}>
          {statusLabel(card.status)}
          {card.latencyMs != null ? ` · ${card.latencyMs}ms` : ''}
        </div>
      </div>
      {card.detail ? (
        <p className="text-xs text-[var(--on-surface-variant)] leading-relaxed">{card.detail}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      // Use deep health endpoint to get outbox queue stats and worker heartbeat
      const res = await fetch('/api/health/deep').then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ตรวจสอบสถานะระบบไม่สำเร็จ');
      setData(res.data as HealthData);
      setLastChecked(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเข้าถึงเอนด์พอยต์สถานะสุขภาพ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // ---------------------------------------------------------------------------
  // Render — loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <main className="space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-[var(--on-primary)]">สถานะระบบ</h1>
              <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">กำลังตรวจสอบ...</p>
            </div>
            <div className="flex items-center gap-3"></div>
          </div>
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — error
  // ---------------------------------------------------------------------------

  if (error && !data) {
    return (
      <main className="space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-[var(--on-primary)]">สถานะระบบ</h1>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => void load(true)} className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
                <RefreshCw className="h-4 w-4" />
                ลองอีกครั้ง
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--error-container)]/20 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>
      </main>
    );
  }

  if (!data) return null;

  const healthCards = buildHealthCards(data);
  const serviceRows = buildServiceRows(data);
  const outbox = data.servicesDetailed?.outbox;

  // Build jobs list enriched with outbox data
  const jobs: BackgroundJob[] = STATIC_JOBS.map((job) => {
    if (job.name === 'Outbox Event Processor' && outbox) {
      return {
        ...job,
        status: outbox.status,
        lastRun: data.timestamp,
      };
    }
    if (job.name === 'Background Worker' && data.servicesDetailed?.worker) {
      return {
        ...job,
        status: data.servicesDetailed.worker.status,
        lastRun: data.servicesDetailed.worker.lastHeartbeatAt,
      };
    }
    return job;
  });

  return (
    <main className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-[var(--on-primary)]">สถานะระบบ</h1>
            <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">
              {lastChecked
                ? `ตรวจสอบล่าสุด: ${fmtTs(lastChecked)}`
                : 'การวินิจฉัยแบบเรียลไทม์ข้างบริการทั้งหมด'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={globalBadgeClass(data.status)}>
              {data.status?.toUpperCase() ?? 'UNKNOWN'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface-variant)] shadow-sm">v{data.version}</span>
            <button
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
            >
              <RefreshCw className={['h-4 w-4', refreshing ? 'animate-spin' : ''].join(' ')} />
              {refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--error-container)]/20 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div> : null}

      {/* ── Health indicator cards ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
          ตัวชี้วัดบริการ
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {healthCards.map((card) => (
            <HealthCardItem key={card.id} card={card} />
          ))}
        </div>
      </section>

      {/* ── Missing env vars warning ───────────────────────────────────── */}
      {data.missingEnv && data.missingEnv.length > 0 ? (
        <section className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--warning-container)]/20 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold text-[var(--color-warning)] text-sm">
            <AlertTriangle className="h-4 w-4" />
            ตัวแปรสภาพแวดล้อมที่ขาดหายไป
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.missingEnv.map((key) => (
              <li
                key={key}
                className="rounded bg-[var(--warning-container)]/50 px-2 py-0.5 font-mono text-xs text-[var(--color-warning)]"
              >
                {key}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Service status list ─────────────────────────────────────── */}
        <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--outline-variant)]/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--on-surface)]">
              <Server className="h-4 w-4 text-[var(--on-surface-variant)]" />
              สถานะบริการ
            </div>
            <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1 text-xs font-medium text-[var(--on-surface-variant)] shadow-sm">{serviceRows.length} บริการ</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>บริการ</th>
                  <th>สถานะ</th>
                  <th>สัญญาณชีพล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.map((row) => (
                  <tr key={row.name}>
                    <td>
                      <div className="flex items-center gap-2 font-medium text-[var(--on-surface)]">
                        {statusIcon(row.status, 'h-4 w-4')}
                        {row.name}
                      </div>
                    </td>
                    <td>
                      <span
                        className={[
                          'text-xs font-semibold',
                          statusTextColor(row.status),
                        ].join(' ')}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="text-xs text-[var(--on-surface-variant)]">{fmtTs(row.lastHeartbeat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Background jobs ──────────────────────────────────────────── */}
        <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--outline-variant)]/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--on-surface)]">
              <Gauge className="h-4 w-4 text-[var(--on-surface-variant)]" />
              งานเบื้องหลัง
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>งาน</th>
                  <th>รันล่าสุด</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.name}>
                    <td className="font-medium text-[var(--on-surface)] text-sm">{job.name}</td>
                    <td className="text-xs text-[var(--on-surface-variant)]">{fmtTs(job.lastRun)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {statusIcon(job.status, 'h-3.5 w-3.5')}
                        <span className={['text-xs font-semibold', statusTextColor(job.status)].join(' ')}>
                          {statusLabel(job.status)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Outbox stats */}
          {outbox ? (
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--outline-variant)]/10 p-4">
              <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)] px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[var(--on-surface-variant)]">
                  ความยาวคิว
                </div>
                <div className="mt-1 text-2xl font-bold text-[var(--on-surface)]">
                  {outbox.queueLength}
                </div>
              </div>
              <div
                className={[
                  'rounded-xl border px-4 py-3',
                  outbox.failedCount > 0
                    ? 'border-[var(--color-danger)]/30 bg-[var(--error-container)]/20'
                    : 'border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)]',
                ].join(' ')}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[var(--on-surface-variant)]">
                  เหตุการณ์ที่ล้มเหลว
                </div>
                <div
                  className={[
                    'mt-1 text-2xl font-bold',
                    outbox.failedCount > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--on-surface)]',
                  ].join(' ')}
                >
                  {outbox.failedCount}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* ── Environment info ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] shadow-lg">
        <div className="px-4 py-3 border-b border-[var(--outline-variant)]/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--on-surface)]">
            <Wifi className="h-4 w-4 text-[var(--on-surface-variant)]" />
            สภาพแวดล้อม
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)]/60 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[var(--on-surface-variant)]">เวอร์ชัน</div>
            <div className="mt-1 font-mono text-sm font-medium text-[var(--on-surface)]">{data.version}</div>
          </div>
          <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)]/60 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[var(--on-surface-variant)]">สภาพแวดล้อม</div>
            <div className="mt-1 font-mono text-sm font-medium text-[var(--on-surface)]">{data.environment}</div>
          </div>
          <div className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container-lowest)]/60 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[var(--on-surface-variant)]">เวลาตอบสนอง DB</div>
            <div className="mt-1 font-mono text-sm font-medium text-[var(--on-surface)]">
              {data.latencies?.databaseMs != null
                ? `${data.latencies.databaseMs}ms`
                : data.servicesDetailed?.database?.latencyMs != null
                  ? `${data.servicesDetailed.database.latencyMs}ms`
                  : 'N/A'}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
