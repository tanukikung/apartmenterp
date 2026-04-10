import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeRequestLike } from '../helpers/auth';
import { hashPassword } from '@/lib/auth/password';

vi.mock('@/lib/line/is-configured', () => ({
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(() => ({
    pushMessage: vi.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
  })),
}));

describe('Broadcast API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/broadcast returns list with pagination', async () => {
    const mod = await import('@/app/api/broadcast/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/broadcast?page=1&pageSize=10',
      method: 'GET',
      role: 'ADMIN',
    });

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('items');
    expect(json.data).toHaveProperty('total');
    expect(json.data).toHaveProperty('page');
    expect(json.data).toHaveProperty('pageSize');
  });

  it('GET /api/broadcast/[id] returns 404 for unknown id', async () => {
    const mod = await import('@/app/api/broadcast/[id]/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/broadcast?id=00000000-0000-0000-0000-000000000000',
      method: 'GET',
      role: 'ADMIN',
    });

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(404);
  });

  it('POST /api/broadcast creates a broadcast record', async () => {
    const mod = await import('@/app/api/broadcast/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/broadcast',
      method: 'POST',
      role: 'ADMIN',
      body: {
        message: 'ทดสอบการประกาศ',
        target: 'ALL',
      },
    });

    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('id');
    expect(json.data.message).toBe('ทดสอบการประกาศ');
    expect(json.data.target).toBe('ALL');
  });

  it('POST /api/broadcast with FLOORS target filters rooms', async () => {
    const mod = await import('@/app/api/broadcast/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/broadcast',
      method: 'POST',
      role: 'ADMIN',
      body: {
        message: 'ประกาศถึงชั้น 1-3',
        target: 'FLOORS',
        targetFloors: [1, 2, 3],
      },
    });

    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(201);
    expect(res.status).toBeLessThanOrEqual(201);
    const json = await res.json();
    expect(json.data?.target).toBe('FLOORS');
    expect(json.data?.targetFloors).toEqual([1, 2, 3]);
  });

  it('POST /api/broadcast with empty message returns 400', async () => {
    const mod = await import('@/app/api/broadcast/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/broadcast',
      method: 'POST',
      role: 'ADMIN',
      body: { message: '' },
    });

    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(400);
  });
});