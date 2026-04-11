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
  const shutdown = async (signal: string) => {
    logger.info({ signal }, '🛑 Shutdown signal received — clearing intervals');
    for (const id of intervals) clearInterval(id);
    intervals.length = 0;

    // Wait for in-flight jobs to finish before exiting.
    if (inFlightJobs.size > 0) {
      logger.info({ count: inFlightJobs.size }, '⏳ Waiting for in-flight jobs to complete');
      await Promise.all(inFlightJobs);
      logger.info('✅ All in-flight jobs completed');
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
    jobRunners  = runnerModule.JOB_RUNNERS as Record<string, JobRunner>;
    setJobStatus = storeModule.setJobStatus as SetJobStatusFn;

    // Start a once-per-minute ticker that checks the schedule
    intervals.push(setInterval(() => {
      (() => {
        const now = new Date();
        const h   = now.getHours();
        const m   = now.getMinutes();
        const dow = now.getDay();
        const dom = now.getDate();

        for (const s of SCHEDULES) {
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
              logger.info({ jobId, ...result, durationMs }, '✅ Scheduled job completed');
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
