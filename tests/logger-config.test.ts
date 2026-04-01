import { describe, it, expect, vi } from 'vitest';

describe('Logger configuration', () => {
  it('respects LOG_LEVEL override', async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = 'warn';
    const mod = await import('@/lib/utils/logger');
    expect(mod.getLogLevel()).toBe('warn');
    delete process.env.LOG_LEVEL;
  });

  it('apiLogger.request emits shape with requestId and ip', async () => {
    vi.resetModules();
    const { apiLogger, logger } = await import('@/lib/utils/logger');
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => (undefined as any));
    apiLogger.request('GET', '/api/health', 200, 12, { requestId: 'r-1', ip: '1.2.3.4' });
    const arg = (infoSpy as any).mock.calls[0][0];
    expect(arg).toMatchObject({
      type: 'api_request',
      method: 'GET',
      path: '/api/health',
      statusCode: 200,
      duration: '12ms',
      requestId: 'r-1',
      ip: '1.2.3.4',
    });
  });
});

