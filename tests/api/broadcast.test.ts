import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeRequestLike } from '../helpers/auth';
import { hashPassword } from '@/lib/auth/password';

// Mock uuid to return predictable values
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

// Create shared mock prisma instance with proper state management
const mockPrisma = {
  broadcast: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(({ data }: any) => {
      return Promise.resolve({
        id: data.id || 'broadcast-uuid-created',
        ...data,
        status: 'PENDING',
        sentCount: 0,
        failedCount: 0,
        sentAt: null,
      });
    }),
    update: vi.fn().mockImplementation(({ where, data }: any) => {
      return Promise.resolve({
        id: where.id,
        message: 'Test broadcast',
        target: 'ALL',
        targetFloors: [],
        targetRooms: [],
        ...data,
      });
    }),
    count: vi.fn().mockResolvedValue(0),
  },
  room: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'room-1',
        roomNo: '101',
        roomStatus: 'OCCUPIED',
        floorNo: 1,
        tenants: [
          {
            tenant: {
              id: 'tenant-1',
              lineUserId: 'U123',
              displayName: 'Test Tenant',
            },
          },
        ],
      },
    ]),
  },
  tenant: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  $transaction: vi.fn((fn: (tx: any) => Promise<unknown>) => fn(mockPrisma as any)),
};

vi.mock('@/lib/db/client', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/line/is-configured', () => ({
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(() => ({
    pushMessage: vi.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
  })),
}));

vi.mock('@/modules/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

describe('Broadcast API', () => {
  beforeEach(() => {
    // Reset mock implementations
    mockPrisma.broadcast.findMany.mockResolvedValue([]);
    mockPrisma.broadcast.count.mockResolvedValue(0);
    mockPrisma.room.findMany.mockResolvedValue([
      {
        id: 'room-1',
        roomNo: '101',
        roomStatus: 'OCCUPIED',
        floorNo: 1,
        tenants: [{ tenant: { id: 'tenant-1', lineUserId: 'U123', displayName: 'Test Tenant' } }],
      },
    ]);
  });

  it('GET /api/broadcast returns list with pagination', async () => {
    mockPrisma.broadcast.findMany.mockResolvedValue([{ id: 'bc-1', message: 'Test', target: 'ALL' }]);
    mockPrisma.broadcast.count.mockResolvedValue(1);
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
    mockPrisma.broadcast.findUnique.mockImplementation(({ where }: any) => Promise.resolve(null));
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
    // Set up findUnique to return the created broadcast
    mockPrisma.broadcast.findUnique.mockResolvedValue({
      id: 'test-uuid-123',
      message: 'ทดสอบการประกาศ',
      target: 'ALL',
      targetFloors: [],
      targetRooms: [],
      status: 'COMPLETED',
      sentCount: 0,
      failedCount: 0,
    });
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
    // Set up findUnique to return the created broadcast
    mockPrisma.broadcast.findUnique.mockResolvedValue({
      id: 'test-uuid-123',
      message: 'ประกาศถึงชั้น 1-3',
      target: 'FLOORS',
      targetFloors: [1, 2, 3],
      targetRooms: [],
      status: 'COMPLETED',
      sentCount: 0,
      failedCount: 0,
    });
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
    const json = await res.json();
    expect(json.data?.target).toBe('FLOORS');
    expect(json.data?.targetFloors).toEqual([1, 2, 3]);
  });

  it('POST /api/broadcast with empty message returns 422', async () => {
    const mod = await import('@/app/api/broadcast/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/broadcast',
      method: 'POST',
      role: 'ADMIN',
      body: { message: '' },
    });

    const res: Response = await (mod as any).POST(req);
    // Zod validation error returns 422
    expect(res.status).toBe(422);
  });
});