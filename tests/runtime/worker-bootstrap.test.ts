import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalNextRuntime = process.env.NEXT_RUNTIME;

describe('instrumentation bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    (globalThis as any).__messagingBootstrapImported = undefined;
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    (process.env as Record<string, string | undefined>).NEXT_RUNTIME = originalNextRuntime;
  });

  it('is a no-op when NEXT_RUNTIME is not nodejs', async () => {
    delete (process.env as Record<string, string | undefined>).NEXT_RUNTIME;

    vi.doMock('@/modules/messaging/bootstrap', () => {
      (globalThis as any).__messagingBootstrapImported = true;
      return {
        bootstrapMessagingRuntime: vi.fn(),
      };
    });

    const mod = await import('@/instrumentation');
    await mod.register();

    expect((globalThis as any).__messagingBootstrapImported).toBeUndefined();
  });

  it('bootstraps messaging before starting the outbox worker', async () => {
    (process.env as Record<string, string | undefined>).NEXT_RUNTIME = 'nodejs';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    const callOrder: string[] = [];

    vi.doMock('@/modules/jobs/job-runner', () => ({
      JOB_RUNNERS: {},
    }));
    vi.doMock('@/modules/jobs/job-store', () => ({
      setJobStatus: vi.fn(),
    }));
    vi.doMock('@/modules/messaging/bootstrap', () => ({
      bootstrapMessagingRuntime: vi.fn(async () => {
        callOrder.push('messaging');
      }),
    }));
    vi.doMock('@/infrastructure/outbox/outbox.processor', () => ({
      startOutboxWorker: vi.fn(() => {
        callOrder.push('outbox');
      }),
    }));
    vi.doMock('@/server/cron', () => ({
      startCronIfEnabled: vi.fn(() => {
        callOrder.push('cron');
      }),
    }));
    vi.doMock('@/infrastructure/redis', () => ({
      setWorkerHeartbeat: vi.fn(async () => {
        callOrder.push('heartbeat');
      }),
    }));
    vi.doMock('@/lib/utils/logger', () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    vi.spyOn(global, 'setInterval').mockImplementation(() => 1 as unknown as NodeJS.Timeout);

    const mod = await import('@/instrumentation');
    await mod.register();

    const bootstrap = await import('@/modules/messaging/bootstrap');
    const outbox = await import('@/infrastructure/outbox/outbox.processor');

    expect(bootstrap.bootstrapMessagingRuntime).toHaveBeenCalledTimes(1);
    expect(outbox.startOutboxWorker).toHaveBeenCalledTimes(1);
    expect(callOrder.slice(0, 2)).toEqual(['messaging', 'outbox']);
  });
});
