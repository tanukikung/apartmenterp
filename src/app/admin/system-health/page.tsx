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
  Radio,
  RefreshCw,
  Server,
  Wifi,
  XCircle,
  Zap,
} from 'lucide-react';

type ServiceStatus = 'ok' | 'connected' | 'degraded' | 'error' | 'not_configured';

type HealthData = {
  status: 'ok' | 'degraded' | 'error';
  services: { database: ServiceStatus; env: ServiceStatus; app: ServiceStatus; redis?: ServiceStatus; backup?: { lastAttempt: string | null; lastSuccess: string | null; lastError: string | null } };
  servicesDetailed?: { database?: { status: ServiceStatus; latencyMs: number | null }; redis?: { status: ServiceStatus; latencyMs: number | null }; outbox?: { status: ServiceStatus; queueLength: number; failedCount: number }; worker?: { status: ServiceStatus; lastHeartbeatAt: string | null; heartbeatSource?: 'redis' | 'in_memory' }; backup?: { status: ServiceStatus; lastAttempt: string | null; lastSuccess: string | null; lastError: string | null; consecutiveFailures: number } };
  version: string;
  environment: string;
  latencies?: { databaseMs: number | null };
  missingEnv?: string[];
  error?: string;
  timestamp: string;
};

type HealthCard = { id: string; label: string; icon: React.ReactNode; status: ServiceStatus | null; detail: string | null; latencyMs?: number | null };

type Alert = { id: string; severity: 'critical' | 'warning' | 'info'; source: string; message: string; timestamp: string };

function statusIcon(status: ServiceStatus | null, size = 'h-5 w-5') {
  if (status === 'ok' || status === 'connected') return <CheckCircle2 className={`${size}`} style={{ color: '#4ade80' }} />;
  if (status === 'degraded') return <AlertTriangle className={`${size}`} style={{ color: '#fbbf24' }} />;
  if (status === 'error') return <XCircle className={`${size}`} style={{ color: '#f87171' }} />;
  if (status === 'not_configured') return <AlertTriangle className={`${size}`} style={{ color: 'hsl(var(--on-surface-variant))' }} />;
  return <Clock className={`${size}`} style={{ color: 'hsl(var(--on-surface-variant))' }} />;
}

function statusLabel(status: ServiceStatus | null): string {
  switch (status) {
    case 'ok': case 'connected': return 'ปกติ';
    case 'degraded': return 'เสื่อม';
    case 'error': return 'ข้อผิดพลาด';
    case 'not_configured': return 'ไม่ได้ตั้งค่า';
    default: return 'ไม่ทราบ';
  }
}

function statusCardBorder(status: ServiceStatus | null): string {
  if (status === 'ok' || status === 'connected') return 'border-emerald-500/30';
  if (status === 'degraded') return 'border-amber-500/30';
  if (status === 'error') return 'border-red-500/30';
  return 'border-[hsl(var([hsl(var(--color-border))]))]';
}

function statusBg(status: ServiceStatus | null): string {
  if (status === 'ok' || status === 'connected') return 'rgba(34,197,94,0.1)';
  if (status === 'degraded') return 'rgba(251,191,36,0.1)';
  if (status === 'error') return 'rgba(239,68,68,0.1)';
  return 'transparent';
}

function statusTextColor(status: ServiceStatus | null): string {
  if (status === 'ok' || status === 'connected') return 'text-emerald-400';
  if (status === 'degraded') return 'text-amber-400';
  if (status === 'error') return 'text-red-400';
  return 'text-[hsl(var(--on-surface-variant))]';
}

function globalBadgeClass(status: 'ok' | 'degraded' | 'error' | undefined): string {
  if (status === 'ok') return 'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold';
  if (status === 'degraded') return 'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold';
  if (status === 'error') return 'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold';
  return 'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold';
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildHealthCards(data: HealthData): HealthCard[] {
  const detailed = data.servicesDetailed;
  const dbStatus: ServiceStatus = data.services.database === 'connected' || data.services.database === 'ok' ? 'ok' : (data.services.database ?? 'error');

  return [
    { id: 'database', label: 'ฐานข้อมูล', icon: <Database className="h-6 w-6" />, status: dbStatus, detail: dbStatus === 'ok' ? 'เชื่อมต่อแล้ว' : data.error ? data.error.slice(0, 80) : 'การเชื่อมต่อล้มเหลว', latencyMs: detailed?.database?.latencyMs ?? data.latencies?.databaseMs },
    { id: 'line', label: 'API LINE', icon: <MessageSquare className="h-6 w-6" />, status: data.missingEnv?.some((k) => k.toLowerCase().includes('line')) === false ? 'ok' : 'not_configured', detail: data.missingEnv?.some((k) => k.toLowerCase().includes('line')) === false ? 'กำหนดค่าข้อมูลรับรองแล้ว' : 'ไม่ได้ตั้งค่า LINE_CHANNEL_ID หรือ LINE_ACCESS_TOKEN' },
    { id: 'redis', label: 'Redis', icon: <Zap className="h-6 w-6" />, status: detailed?.redis?.status ?? 'not_configured', detail: detailed?.redis?.status === 'ok' ? 'เชื่อมต่อ Redis แล้ว' : detailed?.redis?.status === 'not_configured' ? 'ไม่ได้ตั้งค่า (ใช้ in-memory heartbeat)' : 'การเชื่อมต่อ Redis ล้มเหลว', latencyMs: detailed?.redis?.latencyMs },
    { id: 'memory', label: 'หน่วยความจำ', icon: <HardDrive className="h-6 w-6" />, status: 'ok', detail: 'รันไทม์ Node.js — การใช้งาน heap ติดตามฝั่งเซิร์ฟเวอร์' },
    { id: 'disk', label: 'ดิสก์', icon: <HardDrive className="h-6 w-6" />, status: 'ok', detail: 'ข้อมูลการใช้งานดิสก์ไม่แสดงผ่าน endpoint นี้' },
    { id: 'worker', label: 'โปรแกรมทำงานเบื้องหลัง', icon: <Activity className="h-6 w-6" />, status: detailed?.worker?.status ?? 'not_configured', detail: detailed?.worker?.lastHeartbeatAt ? `สัญญาณชีพล่าสุด: ${fmtTs(detailed.worker.lastHeartbeatAt)} (${detailed.worker.heartbeatSource === 'in_memory' ? 'in-memory' : 'Redis'})` : detailed?.worker?.heartbeatSource === 'in_memory' ? 'Worker กำลังทำงาน (ใช้ in-memory heartbeat)' : 'Worker ไม่ได้ทำงาน หรือ Worker process ไม่ได้เริ่มต้น' },
  ];
}

const JOB_LABELS: Record<string, string> = {
  'overdue-flag': 'Mark Overdue Invoices', 'billing-generate': 'Generate Billing Period',
  'invoice-send': 'Send Invoices', 'late-fee': 'Late Fee Check', 'db-cleanup': 'Database Cleanup',
  'contract-expiry': 'Contract Expiry Check', 'outbox-cleanup': 'Outbox Cleanup',
  'document-notify': 'Document Notify', 'document-cleanup': 'Document Cleanup', 'backup-cleanup': 'Backup Cleanup',
};

function HealthCardItem({ card }: { card: HealthCard }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] ${statusCardBorder(card.status)}`} style={{ backgroundColor: statusBg(card.status), borderColor: `rgba(${card.status === 'ok' || card.status === 'connected' ? '34,197,94' : card.status === 'degraded' ? '251,191,36' : card.status === 'error' ? '239,68,68' : '100,116,139'},0.3)` }}>
      <div className="flex items-center justify-between">
        <span className="text-[hsl(var(--on-surface-variant))]">{card.icon}</span>
        {statusIcon(card.status)}
      </div>
      <div>
        <div className="font-semibold text-[hsl(var(--card-foreground))]">{card.label}</div>
        <div className={`text-xs font-medium mt-0.5 ${statusTextColor(card.status)}`}>
          {statusLabel(card.status)}{card.latencyMs != null ? ` · ${card.latencyMs}ms` : ''}
        </div>
      </div>
      {card.detail ? <p className="text-xs text-[hsl(var(--on-surface-variant))] leading-relaxed">{card.detail}</p> : null}
    </div>
  );
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [jobEntries, setJobEntries] = useState<Record<string, { lastRun: string | null; lastMessage: string | null; durationMs: number | null; status: 'idle' | 'running' | 'error' }>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [wsAudit, setWsAudit] = useState<{
    connections: number;
    messagesDelivered: number;
    avgLatency: string | null;
    uptime: string;
  } | null>(null);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
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

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/jobs');
      const json = await res.json();
      if (json.success && json.data?.jobs) {
        const map: Record<string, { lastRun: string | null; lastMessage: string | null; durationMs: number | null; status: 'idle' | 'running' | 'error' }> = {};
        for (const job of json.data.jobs) {
          map[job.id] = { lastRun: job.lastRun, lastMessage: job.lastMessage, durationMs: job.durationMs, status: job.status };
        }
        setJobEntries(map);
      }
    } catch { /* silent */ }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-health/alerts');
      const json = await res.json();
      if (json.success && json.data?.alerts) setAlerts(json.data.alerts as Alert[]);
    } catch { /* silent */ }
  }, []);

  const loadWsAudit = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ws-audit');
      const json = await res.json();
      if (json.success && json.data) {
        setWsAudit({
          connections: json.data.connections,
          messagesDelivered: json.data.messagesDelivered,
          avgLatency: json.data.avgLatency,
          uptime: json.data.uptime,
        });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void load();
    void loadJobs();
    void loadAlerts();
    void loadWsAudit();
    const interval = setInterval(() => { void load(); void loadJobs(); void loadAlerts(); void loadWsAudit(); }, 30_000);
    return () => clearInterval(interval);
  }, [load, loadJobs, loadAlerts, loadWsAudit]);

  if (loading) {
    return (
      <main className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
          </div>
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--card-foreground))]">สถานะระบบ</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">กำลังตรวจสอบ...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
          </div>
          <div className="relative flex items-center justify-between gap-4">
            <h1 className="text-base font-semibold text-[hsl(var(--card-foreground))]">สถานะระบบ</h1>
            <button onClick={() => void load(true)} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95">
              <RefreshCw className="h-4 w-4" />ลองอีกครั้ง
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-red-500/30 px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>{error}</div>
      </main>
    );
  }

  if (!data) return null;

  const healthCards = buildHealthCards(data);
  const outbox = data.servicesDetailed?.outbox;

  const jobs = Object.entries(JOB_LABELS).map(([id, name]) => {
    const entry = jobEntries[id];
    return { id, name, lastRun: entry?.lastRun ?? null, lastMessage: entry?.lastMessage ?? null, durationMs: entry?.durationMs ?? null, status: entry?.status ?? 'idle' };
  });

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-[hsl(var(--card-foreground))]">สถานะระบบ</h1>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
              {lastChecked ? `ตรวจสอบล่าสุด: ${fmtTs(lastChecked)}` : 'การวินิจฉัยแบบเรียลไทม์ข้างบริการทั้งหมด'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={globalBadgeClass(data.status)} style={data.status === 'ok' ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80' } : data.status === 'degraded' ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' } : { background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
              {data.status?.toUpperCase() ?? 'UNKNOWN'}
            </span>
            {alerts.filter((a) => a.severity === 'critical' || a.severity === 'warning').length > 0 && (
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-red-400" style={{ background: 'rgba(239,68,68,0.15)' }}>
                <AlertTriangle className="h-3.5 w-3.5" />
                {alerts.filter((a) => a.severity === 'critical' || a.severity === 'warning').length} การแจ้งเตือน
              </span>
            )}
            <span className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm">v{data.version}</span>
            <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>{error}</div> : null}

      {/* Health cards */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[hsl(var(--on-surface-variant))]">ตัวชี้วัดบริการ</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {healthCards.map((card) => <HealthCardItem key={card.id} card={card} />)}
        </div>
      </section>

      {/* Missing env vars */}
      {data.missingEnv && data.missingEnv.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 px-4 py-3" style={{ background: 'rgba(251,191,36,0.1)' }}>
          <div className="flex items-center gap-2 font-semibold text-amber-400 text-sm">
            <AlertTriangle className="h-4 w-4" />ตัวแปรสภาพแวดล้อมที่ขาดหายไป
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.missingEnv.map((key) => (
              <li key={key} className="rounded px-2 py-0.5 font-mono text-xs text-amber-400" style={{ background: 'rgba(251,191,36,0.15)' }}>{key}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Alerts panel */}
      {alerts.length > 0 && (
        <section className="rounded-xl border border-red-500/30 px-4 py-3" style={{ background: 'rgba(239,68,68,0.05)' }}>
          <div className="mb-3 flex items-center gap-2 font-semibold text-red-400 text-sm">
            <AlertTriangle className="h-4 w-4" />การแจ้งเตือนล่าสุด ({alerts.length})
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm" style={alert.severity === 'critical' ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.2)' } : alert.severity === 'warning' ? { background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.2)' } : { background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                {alert.severity === 'critical' ? <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" /> : alert.severity === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" /> : <Activity className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium" style={alert.severity === 'critical' ? { color: 'hsl(0,72%,68%)' } : alert.severity === 'warning' ? { color: 'hsl(38,92%,65%)' } : { color: 'hsl(var(--color-primary-light))' }}>{alert.message}</div>
                  <div className="mt-0.5 text-xs text-[hsl(var(--on-surface-variant))]">{alert.source} &middot; {fmtTs(alert.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Service status */}
        <section className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  overflow-hidden">
          <div className="border-b border-[hsl(var([hsl(var(--color-border))]))] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--card-foreground))]">
              <Server className="h-4 w-4 text-[hsl(var(--primary))]" />สถานะบริการ
            </div>
            <span className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-3 py-1 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm">7 บริการ</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var([hsl(var(--color-border))]))]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">บริการ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สัญญาณชีพล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'เซิร์ฟเวอร์แอปพลิเคชัน', status: data.services.app === 'ok' ? 'ok' : 'error' as ServiceStatus, last: data.timestamp },
                  { name: 'ฐานข้อมูล PostgreSQL', status: data.services.database === 'connected' || data.services.database === 'ok' ? 'ok' : 'error' as ServiceStatus, last: data.timestamp },
                  { name: 'แคช Redis', status: data.servicesDetailed?.redis?.status ?? 'not_configured' as ServiceStatus, last: data.servicesDetailed?.redis?.status === 'ok' ? data.timestamp : null },
                  { name: 'ตัวประมวลผลกล่องขาออก', status: data.servicesDetailed?.outbox?.status ?? 'not_configured' as ServiceStatus, last: data.servicesDetailed?.outbox ? data.timestamp : null },
                  { name: 'โปรแกรมทำงานเบื้องหลัง', status: data.servicesDetailed?.worker?.status ?? 'not_configured' as ServiceStatus, last: data.servicesDetailed?.worker?.lastHeartbeatAt ?? null },
                  { name: 'การสำรองข้อมูล (Backup)', status: data.servicesDetailed?.backup?.status ?? 'not_configured' as ServiceStatus, last: data.servicesDetailed?.backup?.lastAttempt ?? null },
                  { name: 'การส่งข้อความ LINE', status: data.missingEnv?.some((k) => k.toLowerCase().includes('line')) ? 'not_configured' : 'ok' as ServiceStatus, last: null },
                ].map((row) => (
                  <tr key={row.name} className="border-b border-[hsl(var([hsl(var(--color-border))]))] hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-[hsl(var(--card-foreground))]">
                        {statusIcon(row.status, 'h-4 w-4')} {row.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${statusTextColor(row.status)}`}>{statusLabel(row.status)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--on-surface-variant))]">{fmtTs(row.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Background jobs */}
        <section className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  overflow-hidden">
          <div className="border-b border-[hsl(var([hsl(var(--color-border))]))] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--card-foreground))]">
              <Gauge className="h-4 w-4 text-[hsl(var(--primary))]" />งานเบื้องหลัง
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var([hsl(var(--color-border))]))]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">งาน</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">รันล่าสุด</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ระยะเวลา</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ข้อความ</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-[hsl(var([hsl(var(--color-border))]))] hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-[hsl(var(--card-foreground))]">{job.name}</td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--on-surface-variant))]">{fmtTs(job.lastRun)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {statusIcon(job.status as ServiceStatus, 'h-3.5 w-3.5')}
                        <span className={`text-xs font-semibold ${statusTextColor(job.status as ServiceStatus)}`}>{statusLabel(job.status as ServiceStatus)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--on-surface-variant))]">{job.durationMs != null ? `${(job.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-[hsl(var(--on-surface-variant))] max-w-[160px] truncate" title={job.lastMessage ?? undefined}>{job.lastMessage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {outbox && (
            <div className="grid grid-cols-2 gap-3 border-t border-[hsl(var([hsl(var(--color-border))]))] p-4">
              <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[hsl(var(--on-surface-variant))]">ความยาวคิว</div>
                <div className="mt-1 text-2xl font-bold text-[hsl(var(--card-foreground))]">{outbox.queueLength}</div>
              </div>
              <div className={`rounded-xl border px-4 py-3 ${outbox.failedCount > 0 ? 'border-red-500/30' : 'border-[hsl(var([hsl(var(--color-border))]))]'}`} style={outbox.failedCount > 0 ? { background: 'rgba(239,68,68,0.1)' } : {}}>
                <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[hsl(var(--on-surface-variant))]">เหตุการณ์ที่ล้มเหลว</div>
                <div className={`mt-1 text-2xl font-bold ${outbox.failedCount > 0 ? 'text-red-400' : 'text-[hsl(var(--card-foreground))]'}`}>{outbox.failedCount}</div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* WebSocket section */}
      <section className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] overflow-hidden">
        <div className="border-b border-[hsl(var([hsl(var(--color-border))]))] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--card-foreground))]">
            <Radio className="h-4 w-4 text-[hsl(var(--primary))]" />WebSocket
          </div>
        </div>
        {wsAudit ? (
          <div className="grid gap-3 p-4 sm:grid-cols-4">
            <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[hsl(var(--on-surface-variant))]">การเชื่อมต่อที่ใช้งาน</div>
              <div className="mt-1 text-2xl font-bold text-[hsl(var(--card-foreground))]">{wsAudit.connections}</div>
            </div>
            <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[hsl(var(--on-surface-variant))]">ข้อความส่งวันนี้</div>
              <div className="mt-1 text-2xl font-bold text-[hsl(var(--card-foreground))]">{wsAudit.messagesDelivered}</div>
            </div>
            <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[hsl(var(--on-surface-variant))]">เวลาตอบสนองเฉลี่ย</div>
              <div className="mt-1 text-2xl font-bold text-[hsl(var(--card-foreground))]">{wsAudit.avgLatency ?? '—'}</div>
            </div>
            <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[hsl(var(--on-surface-variant))]">Uptime</div>
              <div className="mt-1 font-mono text-sm font-medium text-[hsl(var(--card-foreground))]">{wsAudit.uptime}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center p-4 text-sm text-[hsl(var(--on-surface-variant))]">
            กำลังโหลดข้อมูล...
          </div>
        )}
      </section>

      {/* Environment info */}
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="px-4 py-3 border-b border-[hsl(var([hsl(var(--color-border))]))] flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--card-foreground))]">
            <Wifi className="h-4 w-4 text-[hsl(var(--primary))]" />สภาพแวดล้อม
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {[
            { label: 'เวอร์ชัน', value: data.version },
            { label: 'สภาพแวดล้อม', value: data.environment },
            { label: 'เวลาตอบสนอง DB', value: data.latencies?.databaseMs != null ? `${data.latencies.databaseMs}ms` : data.servicesDetailed?.database?.latencyMs != null ? `${data.servicesDetailed.database.latencyMs}ms` : 'N/A' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.07em] text-[hsl(var(--on-surface-variant))]">{label}</div>
              <div className="mt-1 font-mono text-sm font-medium text-[hsl(var(--card-foreground))]">{value}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}