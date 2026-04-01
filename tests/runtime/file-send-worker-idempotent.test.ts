import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/line/client', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    sendLineImageMessage: vi.fn(),
    sendLineMessage: vi.fn(),
    sendLineFileMessage: vi.fn(),
  };
});

describe('file-send worker registration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('is idempotent (subscribes only once) when called twice', async () => {
    const subscribe = vi.fn();
    vi.doMock('@/lib', async (importOriginal) => {
      const actual = await importOriginal<any>();
      return {
        ...actual,
        getEventBus: () => ({ subscribe }),
        sendLineImageMessage: vi.fn(),
        sendLineMessage: vi.fn(),
        sendLineFileMessage: vi.fn(),
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
