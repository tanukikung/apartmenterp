import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startMaintenanceRequest,
  handleMaintenanceRequestMessage,
  handleMaintenanceRequestImage,
  getMaintenanceRequestState,
  clearMaintenanceRequest,
} from '@/modules/line-maintenance';

// ─── Shared in-memory store ────────────────────────────────────────────────────
// Mirrors the real module's `_maintenanceRequestCache`.
// This is the ONLY source of truth for lineMaintenanceState in these tests.
// All mock Prisma calls go through this store.

interface StoredState {
  lineUserId: string;
  currentStep: string;
  requestData: Record<string, unknown>;
}

const { mockPrisma, stateStore } = vi.hoisted(() => {
  const store: Record<string, StoredState> = {};

  const mock = {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({
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
      }),
    },
    roomTenant: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'rt-1',
        roomNo: '101',
        tenantId: 'tenant-1',
        role: 'PRIMARY',
        moveInDate: new Date('2024-01-01'),
        moveOutDate: null,
      }),
    },
    maintenanceTicket: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ticket-new',
        roomNo: data.roomNo,
        tenantId: data.tenantId,
        title: data.title,
        description: data.description,
        priority: data.priority ?? 'MEDIUM',
      })),
    },
    maintenanceAttachment: {
      create: vi.fn().mockResolvedValue({ id: 'att-1' }),
    },
    lineMaintenanceState: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { lineUserId: string } }) => {
        return store[where.lineUserId] ?? null;
      }),
      upsert: vi.fn().mockImplementation(async ({ where, create }: { where: { lineUserId: string }; create: StoredState }) => {
        store[where.lineUserId] = create as StoredState;
        return create;
      }),
      delete: vi.fn().mockImplementation(async ({ where }: { where: { lineUserId: string } }) => {
        delete store[where.lineUserId];
        return {};
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    adminUser: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma as never)),
  };

  return { mockPrisma: mock, stateStore: store };
});

vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn().mockReturnValue({
    getMessageContent: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8])),
  }),
  sendLineMessage: vi.fn().mockResolvedValue({ status: 200 }),
  sendReplyMessage: vi.fn().mockResolvedValue({ status: 200 }),
}));
vi.mock('@/lib', () => ({
  prisma: {},
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  getLineClient: vi.fn().mockReturnValue({
    getMessageContent: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8])),
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LINE Maintenance Request', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Clear the shared store that underpins both the mock and the real cache
    Object.keys(stateStore).forEach((k) => delete stateStore[k]);

    // Reset to default tenant
    (mockPrisma.tenant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    (mockPrisma.roomTenant.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'rt-1',
      roomNo: '101',
      tenantId: 'tenant-1',
      role: 'PRIMARY',
      moveInDate: new Date('2024-01-01'),
      moveOutDate: null,
    });
    (mockPrisma.lineMaintenanceState.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { lineUserId: string } }) => stateStore[where.lineUserId] ?? null
    );
    (mockPrisma.lineMaintenanceState.upsert as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where, create }: { where: { lineUserId: string }; create: StoredState }) => {
        stateStore[where.lineUserId] = create as StoredState;
        return create;
      }
    );
    (mockPrisma.lineMaintenanceState.delete as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { lineUserId: string } }) => {
        delete stateStore[where.lineUserId];
        return {};
      }
    );
    (mockPrisma.maintenanceTicket.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ticket-new',
        roomNo: data.roomNo,
        tenantId: data.tenantId,
        title: data.title,
        description: data.description,
        priority: data.priority ?? 'MEDIUM',
      })
    );
  });

  // ── startMaintenanceRequest ────────────────────────────────────────────────

  describe('startMaintenanceRequest', () => {
    it('returns greeting and stores state when tenant is linked', async () => {
      const { replyText } = await startMaintenanceRequest('U123');

      expect(replyText).toContain('ห้อง: 101');
      expect(replyText).toContain('สมชาย');
      expect(replyText).toContain('แจ้งซ่อม');
      expect(await getMaintenanceRequestState('U123')).toBeDefined();
    });

    it('returns error when LINE user is not a registered tenant', async () => {
      (mockPrisma.tenant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const { replyText } = await startMaintenanceRequest('U999');

      expect(replyText).toContain('ไม่พบข้อมูลผู้เช่า');
      expect(await getMaintenanceRequestState('U999')).toBeUndefined();
    });

    it('returns error when tenant has no active room assignment', async () => {
      (mockPrisma.tenant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
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

  // ── handleMaintenanceRequestMessage ──────────────────────────────────────

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

  // ── handleMaintenanceRequestImage ──────────────────────────────────────────

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

      expect(mockPrisma.maintenanceTicket.create).toHaveBeenCalled();
      const createCallArgs = mockPrisma.maintenanceTicket.create.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(createCallArgs)).toContain('data');
      expect(createCallArgs.data.roomNo).toBe('101');
      expect(createCallArgs.data.tenantId).toBe('tenant-1');
      expect(createCallArgs.data.description).toBe('ก็อกน้ำรั่ว');
      expect(result!.replyText).toContain('รับคำขอแจ้งซ่อมแล้ว');
    });

    it('does NOT create ticket when tenant is not assigned to room', async () => {
      (mockPrisma.roomTenant.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'ประตูห้องเสีย');
      const result = await handleMaintenanceRequestMessage('U123', 'เสร็จสิ้น');

      expect(mockPrisma.maintenanceTicket.create).not.toHaveBeenCalled();
      expect(result!.replyText).toContain('ไม่สามารถสร้างคำขอแจ้งซ่อม');
    });

    it('clears state after successful ticket creation', async () => {
      await startMaintenanceRequest('U123');
      await handleMaintenanceRequestMessage('U123', 'หลอดไฟเสีย');
      await handleMaintenanceRequestMessage('U123', 'เสร็จสิ้น');

      expect(await getMaintenanceRequestState('U123')).toBeUndefined();
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
