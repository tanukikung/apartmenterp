import { describe, it, expect, vi, beforeAll } from 'vitest';

describe('worker bootstrap is no-op in test mode', () => {
  beforeAll(() => {
    (globalThis as any).__fileSendWorkerImported = undefined;
    vi.mock('@/modules/messaging/file-send.worker', () => {
      (globalThis as any).__fileSendWorkerImported = true;
      return {
        registerFileSendWorker: vi.fn(),
      };
    });
    vi.mock('@/infrastructure/outbox/outbox.processor', async () => {
      const actual = await vi.importActual<any>('@/infrastructure/outbox/outbox.processor');
      return {
        ...actual,
        startOutboxWorker: vi.fn(),
      };
    });
  });

  it('does not start outbox worker or heartbeat, and does not import worker module', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    await import('@/server/worker');
    const mod = await import('@/infrastructure/outbox/outbox.processor');
    expect(mod.startOutboxWorker).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect((globalThis as any).__fileSendWorkerImported).toBeUndefined();
  });
});
