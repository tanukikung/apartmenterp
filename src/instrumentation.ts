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

// Maximum age (ms) for a job's last successful run before it's considered
// "missed" on startup and re-executed immediately.
type CatchUpRule = {
  jobId: string;
  maxAgeMs: number; // if last success is older than this, re-run on startup
};

// Daily jobs must have run in the last 25 hours (1h grace for clock drift).
// Monthly-1st jobs must have run in the last 32 days.
// Weekly jobs must have run in the last 8 days.
const CATCH_UP_RULES: CatchUpRule[] = [
  { jobId: 'overdue-flag',     maxAgeMs: 25 * 60 * 60 * 1000 },
  { jobId: 'late-fee',         maxAgeMs: 25 * 60 * 60 * 1000 },
  { jobId: 'auto-reminder',    maxAgeMs: 25 * 60 * 60 * 1000 },
  { jobId: 'document-notify',  maxAgeMs: 25 * 60 * 60 * 1000 },
  { jobId: 'contract-expiry',  maxAgeMs: 25 * 60 * 60 * 1000 },
  { jobId: 'billing-generate', maxAgeMs: 32 * 24 * 60 * 60 * 1000 },
  { jobId: 'invoice-send',     maxAgeMs: 32 * 24 * 60 * 60 * 1000 },
  { jobId: 'db-cleanup',       maxAgeMs: 8  * 24 * 60 * 60 * 1000 },
  { jobId: 'outbox-cleanup',   maxAgeMs: 8  * 24 * 60 * 60 * 1000 },
];

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

  logger.info('🚀 Server starting — instrumentation hook registered');

  // ── Interval registry for graceful shutdown ─────────────────────────────
  const intervals: ReturnType<typeof setInterval>[] = [];

  // ── In-flight job registry (for graceful shutdown) ─────────────────────
  const inFlightJobs = new Set<Promise<unknown>>();

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  // Maximum time to wait for in-flight jobs before forcing shutdown.
  const SHUTDOWN_TIMEOUT_MS = 30_000;

  const shutdown = async (signal: string) => {
    logger.info({ signal }, '🛑 Shutdown signal received — clearing intervals');
    for (const id of intervals) clearInterval(id);
    intervals.length = 0;

    // Wait for in-flight jobs to finish before exiting, but do not wait forever.
    if (inFlightJobs.size > 0) {
      logger.info({ count: inFlightJobs.size }, '⏳ Waiting for in-flight jobs to complete (max 30s)');
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS));
      await Promise.race([Promise.all(inFlightJobs), timeout]);
      if (inFlightJobs.size > 0) {
        logger.warn({ remaining: inFlightJobs.size }, '⚠️  Shutdown timeout reached — forcing exit with jobs still in flight');
      } else {
        logger.info('✅ All in-flight jobs completed');
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

    // Helper: persist a CronJobRun record after each execution
    const writeCronRun = async (
      jobId: string,
      success: boolean,
      durationMs: number,
      message?: string,
      error?: string,
    ) => {
      try {
        await prisma.cronJobRun.create({
          data: {
            id: (await import('uuid')).v4(),
            jobId,
            success,
            durationMs,
            message: message ?? null,
            error: error ?? null,
          },
        });
      } catch (e) {
        logger.warn({ type: 'cron_job_run_write_failed', jobId, error: (e as Error).message });
      }
    };

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
      logger.warn({ err }, 'Failed to load automation cron config — using hardcoded schedules');
    }

    // Merge: override hardcoded schedules with DB values
    const effectiveSchedules: ScheduleEntry[] = SCHEDULES.map((s) =>
      overrideMap[s.jobId] ? { ...s, ...overrideMap[s.jobId] } : s
    );
    logger.info({ overrideCount: Object.keys(overrideMap).length, overrideMap }, 'Scheduler initialized with automation cron overrides');

    // ── Crash-recovery catch-up ────────────────────────────────────────────────
    // If the process was killed mid-night (OOM, SIGKILL, Docker restart) some
    // cron jobs may not have run at their scheduled time.  Check each rule and
    // run the job immediately if its last successful run is stale.
    ;(async () => {
      for (const rule of CATCH_UP_RULES) {
        const runner = jobRunners[rule.jobId];
        if (!runner) continue;
        try {
          const lastRun = await prisma.cronJobRun.findFirst({
            where: { jobId: rule.jobId, success: true },
            orderBy: { ranAt: 'desc' },
            select: { ranAt: true },
          });
          const ageMs = lastRun ? Date.now() - lastRun.ranAt.getTime() : Infinity;
          if (ageMs > rule.maxAgeMs) {
            logger.warn({ type: 'cron_catch_up', jobId: rule.jobId, ageMs }, '⚡ Running missed cron job on startup');
            setJobStatus(rule.jobId, { status: 'running' });
            const startMs = Date.now();
            try {
              const result = await runner();
              const durationMs = Date.now() - startMs;
              setJobStatus(rule.jobId, { status: 'idle', lastRun: new Date().toISOString(), lastMessage: result.message, durationMs });
              await writeCronRun(rule.jobId, true, durationMs, result.message);
              logger.info({ type: 'cron_catch_up_done', jobId: rule.jobId, durationMs }, '✅ Catch-up job completed');
            } catch (err: unknown) {
              const durationMs = Date.now() - startMs;
              const msg = err instanceof Error ? err.message : String(err);
              setJobStatus(rule.jobId, { status: 'error', lastRun: new Date().toISOString(), lastMessage: msg, durationMs });
              await writeCronRun(rule.jobId, false, durationMs, undefined, msg);
              logger.error({ type: 'cron_catch_up_failed', jobId: rule.jobId, error: msg });
            }
          }
        } catch (e) {
          logger.warn({ type: 'cron_catch_up_check_failed', jobId: rule.jobId, error: (e as Error).message });
        }
      }
    })();

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
            .then(async (result) => {
              inFlightJobs.delete(jobPromise);
              const durationMs = Date.now() - startMs;
              setJobStatus(jobId, {
                status: 'idle',
                lastRun: new Date().toISOString(),
                lastMessage: result.message,
                durationMs,
              });
              await writeCronRun(jobId, true, durationMs, result.message);
              logger.info({ jobId, ...result, durationMs }, '✅ Scheduled job completed');
            })
            .catch(async (err: unknown) => {
              inFlightJobs.delete(jobPromise);
              const durationMs = Date.now() - startMs;
              const message = err instanceof Error ? err.message : String(err);
              setJobStatus(jobId, {
                status: 'error',
                lastRun: new Date().toISOString(),
                lastMessage: message,
                durationMs,
              });
              await writeCronRun(jobId, false, durationMs, undefined, message);
              logger.error({ jobId, error: message }, '❌ Scheduled job failed');
            });
          inFlightJobs.add(jobPromise);
        }
      })();
    }, 60_000));

    // ── Messaging runtime bootstrap ────────────────────────────────────
    try {
      const { bootstrapMessagingRuntime } = await import('./modules/messaging/bootstrap');
      await bootstrapMessagingRuntime();
      logger.info('📨 Messaging runtime bootstrapped');
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, '⚠️  Messaging runtime bootstrap failed — messaging disabled');
    }

    // ── Rich menu bootstrap — handled via admin UI at POST /api/line/rich-menu ─
    // Rich menu creation requires ADMIN session (HTTP-only cookie), so it cannot
    // be bootstrapped here without a proper request context. Admin can trigger it
    // from /admin/settings/integrations or by calling POST /api/line/rich-menu.

    // ── Outbox worker ────────────────────────────────────────────────────
    try {
      const { startOutboxWorker } = await import('./infrastructure/outbox/outbox.processor');
      startOutboxWorker();
      logger.info('📤 Outbox worker started');
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, '⚠️  Outbox worker failed to start — outbox processing disabled');
    }

    // ── Legacy cron jobs (runs 3am/4am/8am/9am) ───────────────────────────
    try {
      const { startCronIfEnabled } = await import('./server/cron');
      startCronIfEnabled();
      logger.info('⏰ Legacy cron jobs started');
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, '⚠️  Legacy cron failed to start');
    }

    // ── Worker heartbeat ─────────────────────────────────────────────────
    // Set the in-memory heartbeat so GET /api/admin/jobs reports
    // workerAvailable=true and the UI enables "Run Now" buttons.
    try {
      const { setWorkerHeartbeat } = await import('./infrastructure/redis');
      await setWorkerHeartbeat(30);
      intervals.push(setInterval(() => { void setWorkerHeartbeat(30); }, 10_000));
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, '⚠️  Worker heartbeat failed — heartbeat will not be maintained');
    }

    logger.info('⏰ Job scheduler started');
  } catch (err) {
    // Scheduler failure is non-fatal — jobs can still be triggered manually via the UI.
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ error: msg }, '⚠️  Job scheduler failed to start — manual execution still available');
  }
}
