import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock prisma
const mockPrisma = {
  conversation: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'c-1', lineUserId: 'U123', lastMessageAt: new Date() }),
    update: vi.fn().mockResolvedValue({ id: 'c-1', lineUserId: 'U123' }),
  },
  message: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'm-1' }),
  },
  invoice: {
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({ id: 'inv-1' }),
  },
  lineUser: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrisma)),
};

vi.mock('@/lib/db/client', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib', () => ({
  prisma: mockPrisma,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string) { super(message); this.name = 'UnauthorizedError'; }
  },
  getEventBus: () => ({ publish: vi.fn(), subscribe: vi.fn() }),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/line/client', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    verifyLineSignature: vi.fn(() => true),
    getLineUserProfile: vi.fn().mockResolvedValue({
      userId: 'U123',
      displayName: 'Test User',
      pictureUrl: null,
      statusMessage: null,
    }),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTextEvent(userId: string, text: string, replyToken = 'rt-1') {
  return {
    type: 'message',
    source: { userId },
    timestamp: Date.now(),
    replyToken,
    message: { id: 'msg-1', type: 'text', text },
  };
}

function webhookBody(events: object[]) {
  return JSON.stringify({ events });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LINE Balance Inquiry — webhook text triggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.message.findUnique.mockResolvedValue(null);
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.lineUser.findUnique.mockResolvedValue(null);
  });

  const TRIGGERS = ['ยอดค้าง', 'ดูยอด', 'ยอดค้างชำระ', 'ใบแจ้งหนี้', 'ดูใบแจ้งหนี้'];

  for (const trigger of TRIGGERS) {
    it(`replies to "${trigger}" text without storing a message`, async () => {
      const mod = await import('@/app/api/line/webhook/route');
      const body = webhookBody([makeTextEvent('U123', trigger)]);
      const req: any = {
        text: async () => body,
        headers: new Headers({ 'x-line-signature': 'sig' }),
      };
      const res: Response = await (mod as any).POST(req);
      expect(res.ok).toBe(true);
    });
  }

  it('looks up unpaid invoice for the tenant room', async () => {
    // Set up conversation linked to room 101
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'c-1',
      lineUserId: 'U123',
      roomNo: '101',
      lastMessageAt: new Date(),
    });

    // Set up a lineUser record
    mockPrisma.lineUser.findUnique.mockResolvedValue({
      lineUserId: 'U123',
      tenantId: 'tenant-1',
    });

    // Set up unpaid invoice
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      roomNo: '101',
      year: 2026,
      month: 4,
      status: 'OVERDUE',
      totalAmount: 15000,
      dueDate: new Date('2026-04-05'),
    });

    const mod = await import('@/app/api/line/webhook/route');
    const body = webhookBody([makeTextEvent('U123', 'ยอดค้าง')]);
    const req: any = {
      text: async () => body,
      headers: new Headers({ 'x-line-signature': 'sig' }),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(mockPrisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roomNo: '101',
          status: { in: ['GENERATED', 'SENT', 'VIEWED', 'OVERDUE'] },
        }),
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('replies "not linked" when no room is found for the LINE user', async () => {
    // No conversation, no lineUser record
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.lineUser.findUnique.mockResolvedValue(null);

    const mod = await import('@/app/api/line/webhook/route');
    const body = webhookBody([makeTextEvent('U123', 'ยอดค้าง')]);
    const req: any = {
      text: async () => body,
      headers: new Headers({ 'x-line-signature': 'sig' }),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);

    const { sendReplyMessage } = await import('@/lib');
    // Should have replied with not-linked message
    expect(sendReplyMessage).toHaveBeenCalledWith(
      'rt-1',
      expect.stringContaining('ไม่ได้ลงทะเบียน')
    );
  });

  it('replies "no outstanding" when all invoices are paid', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'c-1',
      lineUserId: 'U123',
      roomNo: '101',
      lastMessageAt: new Date(),
    });

    // findFirst returns null for unpaid invoice
    mockPrisma.invoice.findFirst.mockResolvedValue(null);

    const mod = await import('@/app/api/line/webhook/route');
    const body = webhookBody([makeTextEvent('U123', 'ยอดค้าง')]);
    const req: any = {
      text: async () => body,
      headers: new Headers({ 'x-line-signature': 'sig' }),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);

    const { sendReplyMessage } = await import('@/lib');
    expect(sendReplyMessage).toHaveBeenCalledWith(
      'rt-1',
      expect.stringContaining('ไม่มียอดค้าง')
    );
  });
});

describe('balance-inquiry service', () => {
  it('returns notLinked=true when LINE user has no conversation or lineUser record', async () => {
    vi.resetModules();
    const { getLatestUnpaidInvoiceForLineUser } = await import('@/modules/invoices/balance-inquiry');

    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.lineUser.findUnique.mockResolvedValue(null);

    const result = await getLatestUnpaidInvoiceForLineUser('U-no-link');
    expect(result.notLinked).toBe(true);
    expect(result.hasOutstanding).toBe(false);
  });

  it('returns hasOutstanding=false when no unpaid invoice exists', async () => {
    vi.resetModules();
    const { getLatestUnpaidInvoiceForLineUser } = await import('@/modules/invoices/balance-inquiry');

    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'c-1',
      lineUserId: 'U123',
      roomNo: '101',
      lastMessageAt: new Date(),
    });
    mockPrisma.invoice.findFirst.mockResolvedValue(null);

    const result = await getLatestUnpaidInvoiceForLineUser('U123');
    expect(result.hasOutstanding).toBe(false);
    expect(result.roomNo).toBe('101');
  });

  it('returns invoice details when unpaid invoice is found', async () => {
    vi.resetModules();
    const { getLatestUnpaidInvoiceForLineUser } = await import('@/modules/invoices/balance-inquiry');

    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'c-1',
      lineUserId: 'U123',
      roomNo: '101',
      lastMessageAt: new Date(),
    });
    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-unpaid-1',
      roomNo: '101',
      year: 2026,
      month: 4,
      status: 'OVERDUE',
      totalAmount: 18500,
      dueDate: new Date('2026-04-10'),
    });

    const result = await getLatestUnpaidInvoiceForLineUser('U123');
    expect(result.hasOutstanding).toBe(true);
    expect(result.invoiceId).toBe('inv-unpaid-1');
    expect(result.totalAmount).toBe(18500);
    expect(result.status).toBe('OVERDUE');
    expect(result.pdfUrl).toContain('/api/invoices/inv-unpaid-1/pdf');
  });
});
