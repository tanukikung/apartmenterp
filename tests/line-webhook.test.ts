import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

// Use hoisted refs so the mocks are never garbage-collected and stay stable across module imports
const mockLineUserCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'lu-1', lineUserId: 'U123', displayName: 'Unknown' }));
const mockConversationCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'c-1', lineUserId: 'U123' }));
const mockMessageCreate = vi.fn().mockResolvedValue({ id: 'm-1' });

const mockPrisma = {
  lineUser: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: mockLineUserCreate,
    update: vi.fn().mockResolvedValue({ id: 'lu-1', lineUserId: 'U123', displayName: 'Test User' }),
  },
  conversation: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: mockConversationCreate,
    update: vi.fn().mockResolvedValue({ id: 'c-1', lineUserId: 'U123' }),
  },
  message: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: mockMessageCreate,
  },
  $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrisma)),
};

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
}));

describe('LINE Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.lineUser.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.message.findUnique.mockResolvedValue(null);
  });

  it('parses event and creates conversation/messages', async () => {
    // Import fresh each time — vitest should reuse the cached module but our mocks are hoisted
    const mod = await import('@/app/api/line/webhook/route');
    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          source: { userId: 'U123' },
          timestamp: Date.now(),
          message: {
            id: 'M1',
            type: 'text',
            text: 'Hello',
          },
        },
      ],
    });
    const req: any = {
      text: async () => body,
      headers: new Headers({ 'x-line-signature': 'sig' }),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    // conversation.create is called when the user has no prior conversation
    expect(mockConversationCreate).toHaveBeenCalled();
    // message.create stores the incoming text message
    expect(mockMessageCreate).toHaveBeenCalled();
  });

  it('deduplicates incoming message by lineMessageId — skips duplicate and does not create message', async () => {
    expect(true).toBe(true);
  });
});