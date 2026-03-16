import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('file-send worker registration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('is idempotent (subscribes only once) when called twice', async () => {
    const subscribe = vi.fn();
    vi.doMock('@/lib', async () => {
      const actual = await vi.importActual<any>('@/lib');
      return {
        ...actual,
        getEventBus: () => ({ subscribe }),
        sendLineImageMessage: vi.fn(),
        sendLineMessage: vi.fn(),
      };
    });

    const mod = await import('@/modules/messaging/file-send.worker');
    mod.registerFileSendWorker({ allowInTest: true });
    const callsAfterFirst = subscribe.mock.calls.length;
    mod.registerFileSendWorker({ allowInTest: true });
    const callsAfterSecond = subscribe.mock.calls.length;
    expect(callsAfterSecond).toBe(callsAfterFirst);

    expect(subscribe).toHaveBeenCalled();
    expect(subscribe.mock.calls.length).toBeGreaterThan(0);
  });
});
