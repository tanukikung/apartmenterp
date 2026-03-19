import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;

describe('worker bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    (globalThis as any).__messagingBootstrapImported = undefined;
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it('is a no-op in test mode', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';

    vi.doMock('@/modules/messaging/bootstrap', () => {
      (globalThis as any).__messagingBootstrapImported = true;
      return {
        bootstrapMessagingRuntime: vi.fn(),
      };
    });
    vi.doMock('@/infrastructure/outbox/outbox.processor', () => ({
      startOutboxWorker: vi.fn(),
    }));

    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    await import('@/server/worker');

    const outbox = await import('@/infrastructure/outbox/outbox.processor');
    expect(outbox.startOutboxWorker).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect((globalThis as any).__messagingBootstrapImported).toBeUndefined();
  });

  it('bootstraps messaging before starting the outbox worker in production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    const callOrder: string[] = [];

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
    vi.doMock('@/infrastructure/redis', () => ({
      setWorkerHeartbeat: vi.fn(async () => undefined),
      getRedisClient: vi.fn(() => null),
    }));

    vi.spyOn(global, 'setInterval').mockImplementation((handler: TimerHandler) => {
      callOrder.push('heartbeat');
      return 1 as unknown as NodeJS.Timeout;
    });

    await import('@/server/worker');
    await Promise.resolve();

    const bootstrap = await import('@/modules/messaging/bootstrap');
    const outbox = await import('@/infrastructure/outbox/outbox.processor');

    expect(bootstrap.bootstrapMessagingRuntime).toHaveBeenCalledTimes(1);
    expect(outbox.startOutboxWorker).toHaveBeenCalledTimes(1);
    expect(callOrder.slice(0, 2)).toEqual(['messaging', 'outbox']);
  });
});
