import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequestLike } from '../helpers/auth';

const { mockPrismaInstance } = vi.hoisted(() => {
  const configs: Record<string, object> = {};

  const mockPrisma = {
    reminderConfig: {
      count: vi.fn().mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
        return Object.values(configs).length;
      }),
      findMany: vi.fn().mockImplementation(async ({ skip, take }: { skip?: number; take?: number }) => {
        const items = Object.values(configs).slice(skip ?? 0, (skip ?? 0) + (take ?? 50));
        return items;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { periodDays?: number; id?: string } }) => {
        if (where.periodDays !== undefined) {
          return Object.values(configs).find((c: any) => c.periodDays === where.periodDays) ?? null;
        }
        if (where.id) {
          return configs[where.id] ?? null;
        }
        return null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: { id: string; periodDays: number; messageTh: string; messageEn?: string; isActive: boolean; priority: string; appliesTo: string } }) => {
        configs[data.id] = data;
        return data;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (configs[where.id]) {
          configs[where.id] = { ...configs[where.id], ...data };
          return configs[where.id];
        }
        return null;
      }),
      delete: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
        const deleted = configs[where.id];
        delete configs[where.id];
        return deleted;
      }),
    },
  };

  return { mockPrismaInstance: mockPrisma, configs };
});

vi.mock('@/lib/db/client', () => ({
  prisma: mockPrismaInstance,
}));

vi.mock('@/modules/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/line/is-configured', () => ({
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(() => ({
    pushMessage: vi.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
  })),
}));

describe('Reminder Config API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the configs store between tests
    Object.keys(mockPrismaInstance.reminderConfig.findUnique['__configs'] ?? {}).forEach(k => delete mockPrismaInstance.reminderConfig.findUnique['__configs'][k]);
    // Clear mockPrismaInstance.reminderConfig state by resetting mock implementations
    mockPrismaInstance.reminderConfig.count.mockClear();
    mockPrismaInstance.reminderConfig.findMany.mockClear();
    mockPrismaInstance.reminderConfig.findUnique.mockClear();
    mockPrismaInstance.reminderConfig.create.mockClear();
    mockPrismaInstance.reminderConfig.update.mockClear();
    mockPrismaInstance.reminderConfig.delete.mockClear();
  });

  it('GET /api/reminders/config returns list', async () => {
    const mod = await import('@/app/api/reminders/config/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/reminders/config',
      method: 'GET',
      role: 'ADMIN',
    });

    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('items');
    expect(json.data).toHaveProperty('total');
  });

  it('POST /api/reminders/config creates a new config', async () => {
    const mod = await import('@/app/api/reminders/config/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/reminders/config',
      method: 'POST',
      role: 'ADMIN',
      body: {
        periodDays: 7,
        messageTh: 'ทดสอบ reminder 7 วันก่อน',
        priority: 'NORMAL',
        appliesTo: 'ALL',
        isActive: true,
      },
    });

    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.periodDays).toBe(7);
    expect(json.data.messageTh).toBe('ทดสอบ reminder 7 วันก่อน');
  });

  it('POST /api/reminders/config rejects duplicate periodDays', async () => {
    const mod = await import('@/app/api/reminders/config/route');

    // Create first
    const req1 = makeRequestLike({
      url: 'http://localhost/api/reminders/config',
      method: 'POST',
      role: 'ADMIN',
      body: {
        periodDays: 5,
        messageTh: 'config for 5 days',
        priority: 'NORMAL',
        appliesTo: 'ALL',
        isActive: true,
      },
    });
    await (mod as any).POST(req1);

    // Try duplicate
    const req2 = makeRequestLike({
      url: 'http://localhost/api/reminders/config',
      method: 'POST',
      role: 'ADMIN',
      body: {
        periodDays: 5,
        messageTh: 'duplicate 5 days',
        priority: 'NORMAL',
        appliesTo: 'ALL',
        isActive: true,
      },
    });
    const res = await (mod as any).POST(req2);
    expect(res.status).toBe(409);
  });

  it('DELETE /api/reminders/config removes a config', async () => {
    const mod = await import('@/app/api/reminders/config/route');

    // Create one
    const createReq = makeRequestLike({
      url: 'http://localhost/api/reminders/config',
      method: 'POST',
      role: 'ADMIN',
      body: {
        periodDays: 10,
        messageTh: 'to be deleted',
        priority: 'LOW',
        appliesTo: 'ALL',
        isActive: true,
      },
    });
    const createRes = await (mod as any).POST(createReq);
    const id = createRes.json().data?.id;

    // Delete it
    const delReq = makeRequestLike({
      url: `http://localhost/api/reminders/config?id=${id}`,
      method: 'DELETE',
      role: 'ADMIN',
    });
    const delRes = await (mod as any).DELETE(delReq);
    expect(delRes.status).toBe(200);
    expect(delRes.json().success).toBe(true);
  });

  it('PUT /api/reminders/config updates a config', async () => {
    const mod = await import('@/app/api/reminders/config/route');

    const createReq = makeRequestLike({
      url: 'http://localhost/api/reminders/config',
      method: 'POST',
      role: 'ADMIN',
      body: {
        periodDays: 3,
        messageTh: 'original message',
        priority: 'NORMAL',
        appliesTo: 'ALL',
        isActive: true,
      },
    });
    const createRes = await (mod as any).POST(createReq);
    const id = createRes.json().data?.id;

    const updateReq = makeRequestLike({
      url: 'http://localhost/api/reminders/config',
      method: 'PUT',
      role: 'ADMIN',
      body: {
        id,
        isActive: false,
        messageTh: 'updated message',
      },
    });
    const updateRes = await (mod as any).PUT(updateReq);
    expect(updateRes.status).toBe(200);
    const json = updateRes.json();
    expect(json.data?.isActive).toBe(false);
    expect(json.data?.messageTh).toBe('updated message');
  });
});