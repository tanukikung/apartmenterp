import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startMaintenanceRequest,
  handleMaintenanceRequestMessage,
  handleMaintenanceRequestImage,
  getMaintenanceRequestState,
  clearMaintenanceRequest,
} from '@/modules/line-maintenance';

// ─── Mock — hoisted so vi.mock resolves at evaluation time ────────────────────

const { mockPrismaInstance, mockLineClientInstance } = vi.hoisted(() => {
  const mockRoomTenant = {
    id: 'rt-1',
    roomNo: '101',
    tenantId: 'tenant-1',
    role: 'PRIMARY',
    moveInDate: new Date('2024-01-01'),
    moveOutDate: null,
    room: { roomNo: '101' },
  };

  const mockTenant = {
    id: 'tenant-1',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    lineUserId: 'U123',
    roomTenants: [mockRoomTenant],
  };

  // Shared state for lineMaintenanceState to make upsert/findUnique/delete work together
  const lineStateStore: Record<string, object> = {};

  const mockPrisma = {
    tenant: {
      findUnique: vi.fn().mockResolvedValue(mockTenant),
    },
    roomTenant: {
      findFirst: vi.fn().mockResolvedValue(mockRoomTenant),
    },
    maintenanceTicket: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'ticket-new',
        roomNo: data.roomNo,
        tenantId: data.tenantId,
        title: data.title,
        description: data.description,
        priority: data.priority,
      })),
    },
    maintenanceAttachment: {
      create: vi.fn().mockResolvedValue({ id: 'att-1' }),
    },
    lineMaintenanceState: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { lineUserId: string } }) => {
        return lineStateStore[where.lineUserId] ?? null;
      }),
      upsert: vi.fn().mockImplementation(async ({ where, create, update }: any) => {
        // On create (first time), store 'create' data
        // On update (subsequent), store 'update' data
        const existing = lineStateStore[where.lineUserId];
        lineStateStore[where.lineUserId] = existing ? { ...lineStateStore[where.lineUserId], ...update } : create;
        return lineStateStore[where.lineUserId];
      }),
      delete: vi.fn().mockImplementation(async ({ where }: { where: { lineUserId: string } }) => {
        delete lineStateStore[where.lineUserId];
        return {};
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    adminUser: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrisma)),
  };

  const mockLineClient = {
    getMessageContent: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8])),
  };

  return { mockPrismaInstance: mockPrisma, mockLineClientInstance: mockLineClient, lineStateStore };
});

vi.mock('@/lib/db/client', () => ({ prisma: mockPrismaInstance }));
vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(() => mockLineClientInstance),
  sendLineMessage: vi.fn().mockResolvedValue({ status: 200 }),
  sendReplyMessage: vi.fn().mockResolvedValue({ status: 200 }),
}));
vi.mock('@/lib', () => ({
  prisma: mockPrismaInstance,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  getLineClient: vi.fn(() => mockLineClientInstance),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('LINE Maintenance Request', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset in-memory state for test users
    clearMaintenanceRequest('U123');
    clearMaintenanceRequest('U999');

    // Restore default resolved values for each test
    mockPrismaInstance.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      lineUserId: 'U123',
      roomTenants: [{
        id: 'rt-1',
        roomNo: '101',
        tenantId: 'tenant-1',
        role: 'PRIMARY',
        moveInDate: new Date('2024-01-01'),
        moveOutDate: null,
        room: { roomNo: '101' },
      }],
    });
    mockPrismaInstance.roomTenant.findFirst.mockResolvedValue({
      id: 'rt-1',
      roomNo: '101',
      tenantId: 'tenant-1',
      role: 'PRIMARY',
      moveInDate: new Date('2024-01-01'),
      moveOutDate: null,
    });
    mockPrismaInstance.maintenanceTicket.create.mockImplementation(async ({ data }: any) => ({
      id: 'ticket-new',
      roomNo: data?.roomNo ?? 'unknown',
      tenantId: data?.tenantId ?? 'unknown',
      title: data?.title ?? 'unknown',
      description: data?.description ?? 'unknown',
      priority: data?.priority ?? 'MEDIUM',
    }));
    mockPrismaInstance.maintenanceAttachment.create.mockResolvedValue({ id: 'att-1' });
    // Don't reset lineMaintenanceState.findUnique — upsert sets store, findUnique reads from it
    mockPrismaInstance.lineMaintenanceState.upsert.mockImplementation(async ({ create }: any) => {
      // On first call (create), store the initial state so findUnique can return it
      lineStateStore[create.lineUserId] = create;
      return create;
    });
    mockPrismaInstance.lineMaintenanceState.delete.mockImplementation(async ({ where }: any) => {
      delete lineStateStore[where.lineUserId];
      return {};
    });
    mockPrismaInstance.lineMaintenanceState.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaInstance.adminUser.findMany.mockResolvedValue([]);

  // ── startMaintenanceRequest ───────────────────────────────────────────────

  describe('startMaintenanceRequest', () => {
    it('returns greeting and stores state when tenant is linked', async () => {
      const { replyText } = await startMaintenanceRequest('U123');

      expect(replyText).toContain('ห้อง: 101');
      expect(replyText).toContain('สมชาย');
      expect(replyText).toContain('แจ้งซ่อม');
      expect(await getMaintenanceRequestState('U123')).toBeDefined();
    });

    it('returns error when LINE user is not a registered tenant', async () => {
      mockPrismaInstance.tenant.findUnique.mockResolvedValue(null);

      const { replyText } = await startMaintenanceRequest('U999');

      expect(replyText).toContain('ไม่พบข้อมูลผู้เช่า');
      expect(await getMaintenanceRequestState('U999')).toBeUndefined();
    });

    it('returns error when tenant has no active room assignment', async () => {
      mockPrismaInstance.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        lineUserId: 'U123',
        roomTenants: [],
      });

      const { replyText } = await startMaintenanceRequest('U123');

      expect(replyText).toContain('ไม่พบข้อมูลการเช่าห้อง');
    });
  });

  // ── handleMaintenanceRequestMessage ───────────────────────────────────────

  describe('handleMaintenanceRequestMessage', () => {
    it('acknowledges description and transitions state to DESCRIPTION_PROVIDED', async () => {
      await startMaintenanceRequest('U123');

      const result = await handleMaintenanceRequestMessage('U123', 'หลอดไฟห้องน้ำเสีย');

      expect(result).not.toBeNull();
      expect(result!.replyText).toContain('ได้รับรายละเอียดแล้ว');
      expect((await getMaintenanceRequestState('U123'))!.state.step).toBe('DESCRIPTION_PROVIDED');
    });

    it('handles cancel command at any step and clears state', async () => {
      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'หลอดไฟเสีย');

      const result = await handleMaintenanceRequestMessage('U123', 'ยกเลิก');

      expect(result).not.toBeNull();
      expect(result!.replyText).toContain('ยกเลิก');
      expect(await getMaintenanceRequestState('U123')).toBeUndefined();
    });

    it('returns null for normal messages when no request is in progress', async () => {
      const result = await handleMaintenanceRequestMessage('U999', 'hello');
      expect(result).toBeNull();
    });

    it('updates description when user sends more text in DESCRIPTION_PROVIDED state', async () => {
      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'เดิมๆ');

      const result = await handleMaintenanceRequestMessage('U123', 'อัปเดตรายละเอียดใหม่');

      expect(result).not.toBeNull();
      expect(result!.replyText).toContain('อัปเดตรายละเอียด');
      expect((await getMaintenanceRequestState('U123'))!.state.description).toBe('อัปเดตรายละเอียดใหม่');
    });

    it('finalizes ticket creation when user sends completion signal', async () => {
      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'หลอดไฟเสีย');
      const result = await handleMaintenanceRequestMessage('U123', 'เสร็จสิ้น');

      expect(result).not.toBeNull();
      expect(result!.replyText).toContain('รับคำขอแจ้งซ่อมแล้ว');
      expect(await getMaintenanceRequestState('U123')).toBeUndefined();
    });
  });

  // ── handleMaintenanceRequestImage ─────────────────────────────────────────

  describe('handleMaintenanceRequestImage', () => {
    it('returns null when no maintenance request is in progress', async () => {
      const result = await handleMaintenanceRequestImage('U999', 'img-1');
      expect(result).toBeNull();
    });

    it('stores image message ID in DESCRIPTION_PROVIDED state', async () => {
      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'หลอดไฟเสีย');

      const result = await handleMaintenanceRequestImage('U123', 'img-001');

      expect(result).not.toBeNull();
      expect(result!.replyText).toContain('ได้รับรูปภาพแล้ว');
      expect((await getMaintenanceRequestState('U123'))!.state.imageMessageIds).toContain('img-001');
    });

    it('acknowledges image but asks for description in AWAITING_DESCRIPTION state', async () => {
      await startMaintenanceRequest('U123');

      const result = await handleMaintenanceRequestImage('U123', 'img-001');

      expect(result).not.toBeNull();
      expect(result!.replyText).toContain('ส่งรายละเอียดปัญหาก่อน');
    });
  });

  // ── Ticket creation ────────────────────────────────────────────────────────

  describe('finalizeMaintenanceRequest (ticket creation)', () => {
    it('creates a maintenance ticket via Prisma with correct data', async () => {
      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'ก็อกน้ำรั่ว');
      const result = await handleMaintenanceRequestMessage('U123', 'เสร็จสิ้น');

      expect(mockPrismaInstance.maintenanceTicket.create).toHaveBeenCalled();
      const createCallArgs = mockPrismaInstance.maintenanceTicket.create.mock.calls[0][0] as any;
      expect(Object.keys(createCallArgs)).toContain('data');
      expect(createCallArgs.data.roomNo).toBe('101');
      expect(createCallArgs.data.tenantId).toBe('tenant-1');
      expect(createCallArgs.data.description).toBe('ก็อกน้ำรั่ว');
      expect(result!.replyText).toContain('รับคำขอแจ้งซ่อมแล้ว');
    });

    it('does NOT create ticket when tenant is not assigned to room', async () => {
      mockPrismaInstance.roomTenant.findFirst.mockResolvedValue(null);

      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'ประตูห้องเสีย');
      const result = await handleMaintenanceRequestMessage('U123', 'เสร็จสิ้น');

      expect(mockPrismaInstance.maintenanceTicket.create).not.toHaveBeenCalled();
      expect(result!.replyText).toContain('ไม่สามารถสร้างคำขอแจ้งซ่อม');
    });

    it('clears state after successful ticket creation', async () => {
      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'หลอดไฟเสีย');
      await handleMaintenanceRequestMessage('U123', 'เสร็จสิ้น');

      expect(getMaintenanceRequestState('U123')).toBeUndefined();
    });
  });

  // ── clearMaintenanceRequest ───────────────────────────────────────────────

  describe('clearMaintenanceRequest', () => {
    it('removes stored state for user', async () => {
      await startMaintenanceRequest('U123');

      await clearMaintenanceRequest('U123');

      expect(await getMaintenanceRequestState('U123')).toBeUndefined();
    });
  });
});
