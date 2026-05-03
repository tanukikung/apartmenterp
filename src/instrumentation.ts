/**
 * Next.js instrumentation hook — runs once when the server starts.
 *
 * IMPORTANT: This file must only use dynamic imports. Static top-level imports
 * are processed by webpack and can bundle Node.js built-ins (crypto, fs) that
 * break in the Edge runtime. Dynamic imports are resolved at runtime by Node.js.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

type JobRunner = () => Promise<{ count: number; message: string }>;
type SetJobStatusFn = (id: string, update: Record<string, unknown>) => void;

// ── Schedule entry ────────────────────────────────────────────────────────────
type ScheduleEntry = {
  jobId: string;
  hour: number;
  minute: number;
  dayOfWeek?: number;  // 0 = Sunday
  dayOfMonth?: number; // 1–31
};

const SCHEDULES: ScheduleEntry[] = [
  { jobId: 'overdue-flag',       hour: 1, minute: 0 },
  { jobId: 'billing-generate',   hour: 6, minute: 0, dayOfMonth: 1 },
  { jobId: 'invoice-send',       hour: 7, minute: 0, dayOfMonth: 1 },
  { jobId: 'late-fee',           hour: 2, minute: 0 },
  { jobId: 'db-cleanup',         hour: 3, minute: 0, dayOfWeek: 0 },
  { jobId: 'outbox-cleanup',    hour: 4, minute: 0, dayOfWeek: 0 },
  { jobId: 'document-notify',   hour: 7, minute: 0 },
  { jobId: 'document-cleanup',  hour: 7, minute: 0, dayOfWeek: 0 },
  { jobId: 'backup-cleanup',     hour: 8, minute: 0 },
  { jobId: 'contract-expiry',   hour: 9, minute: 0 },
  { jobId: 'auto-reminder',     hour: 8, minute: 0 },
];

export async function register() {
  // Only run in the Node.js server runtime (not Edge, not during builds).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // ── Sentry (optional — continues gracefully without it) ─────────────────────
  try {
    const { default: Sentry } = await import('@sentry/nextjs');
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  } catch { /* Sentry optional */ }

  // Validate environment at startup.
  const { runStartupChecks } = await import('@/lib/config/startup-check');
  runStartupChecks();

  // Lazy-import to avoid webpack bundling native Node modules.
  const { default: logger } = await import('./lib/utils/logger');

  logger.info({ type: 'server_startup' }, '🚀 Server starting — instrumentation hook registered');

  // ── Interval registry for graceful shutdown ─────────────────────────────
  const intervals: ReturnType<typeof setInterval>[] = [];

  // ── In-flight job registry (for graceful shutdown) ─────────────────────
  const inFlightJobs = new Set<Promise<unknown>>();

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  // Maximum time to wait for in-flight jobs before forcing shutdown.
  const SHUTDOWN_TIMEOUT_MS = 30_000;

  const shutdown = async (signal: string) => {
    logger.info({ type: 'server_shutdown', signal }, '🛑 Shutdown signal received — clearing intervals');
    for (const id of intervals) clearInterval(id);
    intervals.length = 0;

    // Wait for in-flight jobs to finish before exiting, but do not wait forever.
    if (inFlightJobs.size > 0) {
      logger.info({ type: 'server_shutdown_wait', count: inFlightJobs.size }, '⏳ Waiting for in-flight jobs to complete (max 30s)');
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS));
      await Promise.race([Promise.all(inFlightJobs), timeout]);
      if (inFlightJobs.size > 0) {
        logger.warn({ type: 'server_shutdown_timeout', remaining: inFlightJobs.size }, '⚠️  Shutdown timeout reached — forcing exit with jobs still in flight');
      } else {
        logger.info({ type: 'server_shutdown_complete' }, '✅ All in-flight jobs completed');
      }
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // ── Scheduled job runner ────────────────────────────────────────────────
  let jobRunners: Record<string, JobRunner> = {};
  let setJobStatus: SetJobStatusFn = () => undefined;

  try {
    const runnerModule = await import('./modules/jobs/job-runner');
    const storeModule  = await import('./modules/jobs/job-store');
    const { prisma }   = await import('./lib');
    jobRunners  = runnerModule.JOB_RUNNERS as Record<string, JobRunner>;
    setJobStatus = storeModule.setJobStatus as SetJobStatusFn;

    // ── Load automation cron config from DB (if any) and merge with SCHEDULES ─────
    // Supports overrides for: reminderCron, overdueCron, billingCron
    function parseCronExpr(expr: string): { hour: number; minute: number; dayOfMonth?: number; dayOfWeek?: number } | null {
      // node-cron format: minute hour dayOfMonth month dayOfWeek
      const parts = expr.trim().split(/\s+/);
      if (parts.length < 5) return null;
      const [min, hr, dom, , dow] = parts;
      const h = parseInt(hr, 10);
      const m = parseInt(min, 10);
      if (isNaN(h) || isNaN(m)) return null;
      const result: { hour: number; minute: number; dayOfMonth?: number; dayOfWeek?: number } = { hour: h, minute: m };
      if (dom !== '*') result.dayOfMonth = parseInt(dom, 10);
      if (dow !== '*') result.dayOfWeek = parseInt(dow, 10);
      return result;
    }

    // Build a map of overrides from DB config
    const overrideMap: Record<string, { hour: number; minute: number; dayOfMonth?: number; dayOfWeek?: number }> = {};
    try {
      const configs = await prisma.config.findMany({
        where: { key: { in: ['automation.reminderCron', 'automation.overdueCron', 'automation.billingCron'] } },
      });
      for (const cfg of configs) {
        const parsed = parseCronExpr(String(cfg.value ?? ''));
        if (parsed) {
          if (cfg.key === 'automation.reminderCron') overrideMap['auto-reminder'] = parsed;
          if (cfg.key === 'automation.overdueCron')  overrideMap['overdue-flag'] = parsed;
          if (cfg.key === 'automation.billingCron')  overrideMap['billing-generate'] = parsed;
        }
      }
    } catch (err) {
      logger.warn({ type: 'cron_config_load_failed', err }, 'Failed to load automation cron config — using hardcoded schedules');
    }

    // Merge: override hardcoded schedules with DB values
    const effectiveSchedules: ScheduleEntry[] = SCHEDULES.map((s) =>
      overrideMap[s.jobId] ? { ...s, ...overrideMap[s.jobId] } : s
    );
    logger.info({ type: 'scheduler_init', overrideCount: Object.keys(overrideMap).length, overrideMap }, 'Scheduler initialized with automation cron overrides');

    // Start a once-per-minute ticker that checks the schedule
    intervals.push(setInterval(() => {
      (() => {
        const now = new Date();
        const h   = now.getHours();
        const m   = now.getMinutes();
        const dow = now.getDay();
        const dom = now.getDate();

        for (const s of effectiveSchedules) {
          if (s.hour !== h || s.minute !== m) continue;
          if (s.dayOfWeek  !== undefined && s.dayOfWeek  !== dow) continue;
          if (s.dayOfMonth !== undefined && s.dayOfMonth !== dom) continue;

          const runner = jobRunners[s.jobId];
          if (!runner) continue;

          const jobId = s.jobId;
          setJobStatus(jobId, { status: 'running' });
          const startMs = Date.now();

          const jobPromise = runner()
            .then((result) => {
              inFlightJobs.delete(jobPromise);
              const durationMs = Date.now() - startMs;
              setJobStatus(jobId, {
                status: 'idle',
                lastRun: new Date().toISOString(),
                lastMessage: result.message,
                durationMs,
              });
              logger.info({ type: 'job_completed', jobId, ...result, durationMs }, '✅ Scheduled job completed');
            })
            .catch((err: unknown) => {
              inFlightJobs.delete(jobPromise);
              const durationMs = Date.now() - startMs;
              const message = err instanceof Error ? err.message : String(err);
              setJobStatus(jobId, {
                status: 'error',
                lastRun: new Date().toISOString(),
                lastMessage: message,
                durationMs,
              });
              logger.error({ type: 'job_failed', jobId, error: message }, '❌ Scheduled job failed');
            });
          inFlightJobs.add(jobPromise);
        }
      })();
    }, 60_000));

    // ── Messaging runtime bootstrap ────────────────────────────────────
    try {
      const { bootstrapMessagingRuntime } = await import('./modules/messaging/bootstrap');
      await bootstrapMessagingRuntime();
      logger.info({ type: 'messaging_runtime_bootstrap' }, '📨 Messaging runtime bootstrapped');
    } catch (err) {
      logger.error({ type: 'messaging_runtime_failed', error: err instanceof Error ? err.message : String(err) }, '⚠️  Messaging runtime bootstrap failed — messaging disabled');
    }

    // ── Rich menu bootstrap — handled via admin UI at POST /api/line/rich-menu ─
    // Rich menu creation requires ADMIN session (HTTP-only cookie), so it cannot
    // be bootstrapped here without a proper request context. Admin can trigger it
    // from /admin/settings/integrations or by calling POST /api/line/rich-menu.

    // ── Outbox worker ────────────────────────────────────────────────────
    try {
      const { startOutboxWorker } = await import('./infrastructure/outbox/outbox.processor');
      startOutboxWorker();
      logger.info({ type: 'outbox_worker_start' }, '📤 Outbox worker started');
    } catch (err) {
      logger.error({ type: 'outbox_worker_failed', error: err instanceof Error ? err.message : String(err) }, '⚠️  Outbox worker failed to start — outbox processing disabled');
    }

    // ── Legacy cron jobs (runs 3am/4am/8am/9am) ───────────────────────────
    try {
      const { startCronIfEnabled } = await import('./server/cron');
      startCronIfEnabled();
      logger.info({ type: 'legacy_cron_start' }, '⏰ Legacy cron jobs started');
    } catch (err) {
      logger.error({ type: 'legacy_cron_failed', error: err instanceof Error ? err.message : String(err) }, '⚠️  Legacy cron failed to start');
    }

    // ── Worker heartbeat ─────────────────────────────────────────────────
    // Set the in-memory heartbeat so GET /api/admin/jobs reports
    // workerAvailable=true and the UI enables "Run Now" buttons.
    try {
      const { setWorkerHeartbeat } = await import('./infrastructure/redis');
      await setWorkerHeartbeat(30);
      intervals.push(setInterval(() => { void setWorkerHeartbeat(30); }, 10_000));
    } catch (err) {
      logger.error({ type: 'worker_heartbeat_failed', error: err instanceof Error ? err.message : String(err) }, '⚠️  Worker heartbeat failed — heartbeat will not be maintained');
    }

    logger.info({ type: 'job_scheduler_start' }, '⏰ Job scheduler started');
  } catch (err) {
    // Scheduler failure is non-fatal — jobs can still be triggered manually via the UI.
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ type: 'job_scheduler_failed', error: msg }, '⚠️  Job scheduler failed to start — manual execution still available');
  }
}
