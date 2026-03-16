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
    worker?: { status: ServiceStatus; lastHeartbeatAt: string | null };
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
    return <AlertTriangle className={`${size} text-slate-400`} />;
  return <Clock className={`${size} text-slate-300`} />;
}

function statusLabel(status: ServiceStatus | null): string {
  switch (status) {
    case 'ok':
    case 'connected':
      return 'OK';
    case 'degraded':
      return 'Degraded';
    case 'error':
      return 'Error';
    case 'not_configured':
      return 'Not Configured';
    default:
      return 'Unknown';
  }
}

function statusCardBorder(status: ServiceStatus | null): string {
  if (status === 'ok' || status === 'connected') return 'border-emerald-200 bg-emerald-50/40';
  if (status === 'degraded') return 'border-amber-200 bg-amber-50/40';
  if (status === 'error') return 'border-red-200 bg-red-50/40';
  return 'border-slate-200 bg-slate-50/40';
}

function statusTextColor(status: ServiceStatus | null): string {
  if (status === 'ok' || status === 'connected') return 'text-emerald-700';
  if (status === 'degraded') return 'text-amber-700';
  if (status === 'error') return 'text-red-700';
  return 'text-slate-500';
}

function globalBadgeClass(status: 'ok' | 'degraded' | 'error' | undefined): string {
  if (status === 'ok') return 'admin-badge admin-status-good';
  if (status === 'degraded') return 'admin-badge admin-status-warn';
  if (status === 'error') return 'admin-badge admin-status-bad';
  return 'admin-badge';
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
      label: 'Database',
      icon: <Database className="h-6 w-6" />,
      status: dbStatus,
      detail:
        dbStatus === 'ok'
          ? `PostgreSQL connected`
          : data.error
            ? data.error.slice(0, 80)
            : 'Connection failed',
      latencyMs: detailed?.database?.latencyMs ?? data.latencies?.databaseMs,
    },
    {
      id: 'line',
      label: 'LINE API',
      icon: <MessageSquare className="h-6 w-6" />,
      status:
        data.missingEnv?.some((k) => k.toLowerCase().includes('line')) === false
          ? 'ok'
          : 'not_configured',
      detail:
        data.missingEnv?.some((k) => k.toLowerCase().includes('line')) === false
          ? 'Channel credentials configured'
          : 'LINE_CHANNEL_ID or LINE_ACCESS_TOKEN not set',
    },
    {
      id: 'redis',
      label: 'Redis',
      icon: <Zap className="h-6 w-6" />,
      status:
        detailed?.redis?.status === 'ok'
          ? 'ok'
          : data.services.redis === 'connected'
            ? 'ok'
            : data.services.redis === 'error'
              ? 'error'
              : 'not_configured',
      detail:
        detailed?.redis?.status === 'ok' || data.services.redis === 'connected'
          ? 'Redis connected'
          : data.services.redis === 'error'
            ? 'Redis connection failed'
            : 'Redis not configured (optional)',
      latencyMs: detailed?.redis?.latencyMs,
    },
    {
      id: 'memory',
      label: 'Memory',
      icon: <MemoryStick className="h-6 w-6" />,
      status: 'ok',
      detail: 'Node.js runtime — heap usage tracked server-side',
    },
    {
      id: 'disk',
      label: 'Disk',
      icon: <HardDrive className="h-6 w-6" />,
      status: 'ok',
      detail: 'Disk usage not exposed via this endpoint',
    },
    {
      id: 'worker',
      label: 'Background Worker',
      icon: <Activity className="h-6 w-6" />,
      status: detailed?.worker?.status ?? 'not_configured',
      detail: detailed?.worker?.lastHeartbeatAt
        ? `Last heartbeat: ${fmtTs(detailed.worker.lastHeartbeatAt)}`
        : 'No heartbeat received',
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
      name: 'Application Server',
      status: data.services.app === 'ok' ? 'ok' : 'error',
      lastHeartbeat: data.timestamp,
    },
    {
      name: 'PostgreSQL Database',
      status:
        data.services.database === 'connected' || data.services.database === 'ok'
          ? 'ok'
          : 'error',
      lastHeartbeat: data.timestamp,
    },
    {
      name: 'Redis Cache',
      status:
        detailed?.redis?.status === 'ok' || data.services.redis === 'connected'
          ? 'ok'
          : data.services.redis === 'error'
            ? 'error'
            : 'not_configured',
      lastHeartbeat: data.services.redis === 'connected' ? data.timestamp : null,
    },
    {
      name: 'Outbox Processor',
      status: detailed?.outbox?.status ?? 'not_configured',
      lastHeartbeat:
        detailed?.outbox
          ? data.timestamp
          : null,
    },
    {
      name: 'Background Worker',
      status: detailed?.worker?.status ?? 'not_configured',
      lastHeartbeat: detailed?.worker?.lastHeartbeatAt ?? null,
    },
    {
      name: 'LINE Messaging',
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
        'rounded-2xl border p-4 flex flex-col gap-2',
        statusCardBorder(card.status),
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="text-slate-500">{card.icon}</span>
        {statusIcon(card.status)}
      </div>
      <div>
        <div className="font-semibold text-slate-800">{card.label}</div>
        <div className={['text-xs font-medium mt-0.5', statusTextColor(card.status)].join(' ')}>
          {statusLabel(card.status)}
          {card.latencyMs != null ? ` · ${card.latencyMs}ms` : ''}
        </div>
      </div>
      {card.detail ? (
        <p className="text-xs text-slate-500 leading-relaxed">{card.detail}</p>
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
      // Use basic health endpoint (deep requires Redis)
      const res = await fetch('/api/health').then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Health check failed');
      setData(res.data as HealthData);
      setLastChecked(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach health endpoint');
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
      <main className="admin-page">
        <section className="admin-page-header">
          <div>
            <h1 className="admin-page-title">System Health</h1>
            <p className="admin-page-subtitle">Running diagnostics...</p>
          </div>
        </section>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — error
  // ---------------------------------------------------------------------------

  if (error && !data) {
    return (
      <main className="admin-page">
        <section className="admin-page-header">
          <div>
            <h1 className="admin-page-title">System Health</h1>
          </div>
          <div className="admin-toolbar">
            <button onClick={() => void load(true)} className="admin-button">
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </section>
        <div className="auth-alert auth-alert-error">{error}</div>
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
    <main className="admin-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">System Health</h1>
          <p className="admin-page-subtitle">
            {lastChecked
              ? `Last checked: ${fmtTs(lastChecked)}`
              : 'Live diagnostics across all services.'}
          </p>
        </div>
        <div className="admin-toolbar">
          <span className={globalBadgeClass(data.status)}>
            {data.status?.toUpperCase() ?? 'UNKNOWN'}
          </span>
          <span className="admin-badge text-slate-500">v{data.version}</span>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="admin-button"
          >
            <RefreshCw className={['h-4 w-4', refreshing ? 'animate-spin' : ''].join(' ')} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {/* ── Health indicator cards ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
          Service Indicators
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {healthCards.map((card) => (
            <HealthCardItem key={card.id} card={card} />
          ))}
        </div>
      </section>

      {/* ── Missing env vars warning ───────────────────────────────────── */}
      {data.missingEnv && data.missingEnv.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4" />
            Missing environment variables
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.missingEnv.map((key) => (
              <li
                key={key}
                className="rounded bg-amber-100 px-2 py-0.5 font-mono text-xs text-amber-900"
              >
                {key}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Service status list ─────────────────────────────────────── */}
        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title flex items-center gap-2">
              <Server className="h-4 w-4 text-slate-400" />
              Service Status
            </div>
            <span className="admin-badge">{serviceRows.length} services</span>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Last Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.map((row) => (
                  <tr key={row.name}>
                    <td>
                      <div className="flex items-center gap-2 font-medium text-slate-800">
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
                    <td className="text-xs text-slate-500">{fmtTs(row.lastHeartbeat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Background jobs ──────────────────────────────────────────── */}
        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title flex items-center gap-2">
              <Gauge className="h-4 w-4 text-slate-400" />
              Background Jobs
            </div>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Last Run</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.name}>
                    <td className="font-medium text-slate-800 text-sm">{job.name}</td>
                    <td className="text-xs text-slate-500">{fmtTs(job.lastRun)}</td>
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
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400">
                  Queue Length
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {outbox.queueLength}
                </div>
              </div>
              <div
                className={[
                  'rounded-2xl border px-4 py-3',
                  outbox.failedCount > 0
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-100 bg-slate-50',
                ].join(' ')}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400">
                  Failed Events
                </div>
                <div
                  className={[
                    'mt-1 text-2xl font-bold',
                    outbox.failedCount > 0 ? 'text-red-600' : 'text-slate-900',
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
      <section className="admin-card cute-surface">
        <div className="admin-card-header">
          <div className="admin-card-title flex items-center gap-2">
            <Wifi className="h-4 w-4 text-slate-400" />
            Environment
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400">Version</div>
            <div className="mt-1 font-mono text-sm font-medium text-slate-800">{data.version}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400">Environment</div>
            <div className="mt-1 font-mono text-sm font-medium text-slate-800">{data.environment}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.07em] text-slate-400">DB Latency</div>
            <div className="mt-1 font-mono text-sm font-medium text-slate-800">
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
