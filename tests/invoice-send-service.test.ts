import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  ValidationError,
} from '@/lib/utils/errors';
import { createInvoiceService } from '@/modules/invoices/invoice.service';

type InvoiceStatus = 'GENERATED' | 'SENT' | 'PAID';

type TestState = {
  invoice: {
    id: string;
    roomNo: string;
    roomBillingId: string;
    year: number;
    month: number;
    version: number;
    status: InvoiceStatus;
    totalAmount: number;
    dueDate: Date;
    issuedAt: Date;
    sentAt: Date | null;
    sentBy: string | null;
    viewedAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    room: {
      roomNo: string;
      roomTenants: Array<{
        tenant: {
          id: string;
          firstName: string;
          lastName: string;
          phone: string;
          lineUserId: string | null;
        } | null;
      }>;
    };
  };
  billingItems: Array<{
    description: string | null;
    quantity: number;
    unitPrice: number;
    amount: number;
    itemType: {
      code: string;
      name: string;
    };
  }>;
  deliveries: Array<Record<string, unknown>>;
  outboxEvents: Array<Record<string, unknown>>;
  documentTemplate: { id: string; body: string } | null;
  messageTemplate: { id: string; body: string } | null;
  nextDeliveryId: number;
  simulateLostEligibilityOnUpdate: boolean;
  simulateLineUserUnlinkedBeforeRecipientLock: boolean;
  simulateTenantMovedOutBeforeRecipientLock: boolean;
};

let state: TestState;

const mocks = vi.hoisted(() => ({
  prisma: {
    billingItem: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  isLineConfigured: vi.fn(),
  eventBusPublish: vi.fn(async () => {}),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logAudit: vi.fn(async () => {}),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: mocks.prisma,
}));

vi.mock('@/lib/line', () => ({
  isLineConfigured: mocks.isLineConfigured,
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/events', () => {
  class MockEventBus {
    publish = mocks.eventBusPublish;

    static getInstance() {
      return new MockEventBus();
    }
  }

  return {
    EventBus: MockEventBus,
    EventTypes: {
      INVOICE_GENERATED: 'INVOICE_GENERATED',
      INVOICE_SENT: 'INVOICE_SENT',
      INVOICE_VIEWED: 'INVOICE_VIEWED',
      INVOICE_PAID: 'INVOICE_PAID',
      INVOICE_MARKED_OVERDUE: 'INVOICE_MARKED_OVERDUE',
    },
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: mocks.logger,
}));

vi.mock('@/modules/audit', () => ({
  logAudit: mocks.logAudit,
}));

function createState(status: InvoiceStatus = 'GENERATED'): TestState {
  return {
    invoice: {
      id: 'invoice-1',
      roomNo: 'room-1',
      roomBillingId: 'billing-1',
      year: 2024,
      month: 3,
      version: 1,
      status,
      totalAmount: 5500,
      dueDate: new Date('2024-03-31T00:00:00Z'),
      issuedAt: new Date('2024-03-01T00:00:00Z'),
      sentAt: status === 'SENT' ? new Date('2024-03-01T01:00:00Z') : null,
      sentBy: status === 'SENT' ? 'admin-1' : null,
      viewedAt: null,
      paidAt: status === 'PAID' ? new Date('2024-03-05T00:00:00Z') : null,
      createdAt: new Date('2024-03-01T00:00:00Z'),
      updatedAt: new Date('2024-03-01T00:00:00Z'),
      room: {
        roomNo: 'room-1',
        roomTenants: [
          {
            tenant: {
              id: 'tenant-1',
              firstName: 'Jane',
              lastName: 'Doe',
              phone: '0800000000',
              lineUserId: 'line-user-1',
            },
          },
        ],
      },
    },
    billingItems: [
      {
        description: 'Monthly rent',
        quantity: 1,
        unitPrice: 5500,
        amount: 5500,
        itemType: {
          code: 'RENT',
          name: 'Rent',
        },
      },
    ],
    deliveries: [],
    outboxEvents: [],
    documentTemplate: {
      id: 'doc-template-1',
      body: 'invoice template body',
    },
    messageTemplate: {
      id: 'msg-template-1',
      body: 'invoice message body',
    },
    nextDeliveryId: 1,
    simulateLostEligibilityOnUpdate: false,
    simulateLineUserUnlinkedBeforeRecipientLock: false,
    simulateTenantMovedOutBeforeRecipientLock: false,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function buildInvoiceRecord(snapshot: TestState) {
  return {
    ...clone(snapshot.invoice),
    room: {
      ...clone(snapshot.invoice.room),
    },
    versions: [],
    deliveries: snapshot.deliveries.map((delivery) => clone(delivery)),
  };
}

function installTransactionalMocks() {
  mocks.prisma.billingItem.findMany.mockImplementation(async () => clone(state.billingItems));
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
    const working = clone(state);
    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.join(' ');

        if (query.includes('FROM "invoices" i')) {
          const invoiceId = values[0];
          if (invoiceId !== working.invoice.id) {
            return [];
          }

          return [
            {
              id: working.invoice.id,
              roomNo: working.invoice.roomNo,
              roomBillingId: working.invoice.roomBillingId,
              year: working.invoice.year,
              month: working.invoice.month,
              status: working.invoice.status,
              totalAmount: working.invoice.totalAmount,
              dueDate: working.invoice.dueDate,
              issuedAt: working.invoice.issuedAt,
              sentAt: working.invoice.sentAt,
              sentBy: working.invoice.sentBy,
              viewedAt: working.invoice.viewedAt,
              paidAt: working.invoice.paidAt,
              createdAt: working.invoice.createdAt,
              updatedAt: working.invoice.updatedAt,
            },
          ];
        }

        if (query.includes('FROM "room_tenants" rt')) {
          if (working.simulateLineUserUnlinkedBeforeRecipientLock) {
            working.invoice.room.roomTenants[0]!.tenant!.lineUserId = null;
            working.simulateLineUserUnlinkedBeforeRecipientLock = false;
          }

          if (working.simulateTenantMovedOutBeforeRecipientLock) {
            working.invoice.room.roomTenants = [];
            working.simulateTenantMovedOutBeforeRecipientLock = false;
          }

          const roomNo = values[0];
          if (roomNo !== working.invoice.roomNo) {
            return [];
          }

          const primaryTenant = working.invoice.room.roomTenants[0]?.tenant ?? null;
          if (!primaryTenant) {
            return [];
          }

          return [
            {
              roomTenantId: 'room-tenant-1',
              tenantId: primaryTenant.id,
              lineUserId: primaryTenant.lineUserId,
              firstName: primaryTenant.firstName,
              lastName: primaryTenant.lastName,
              phone: primaryTenant.phone,
            },
          ];
        }

        throw new Error(`Unexpected query in test: ${query}`);
      }),
      invoice: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id !== working.invoice.id) return null;
          return buildInvoiceRecord(working);
        }),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; status: InvoiceStatus };
            data: { status: 'SENT'; sentAt: Date; sentBy?: string };
          }) => {
            if (working.simulateLostEligibilityOnUpdate) {
              working.invoice.status = 'SENT';
              working.simulateLostEligibilityOnUpdate = false;
            }

            if (working.invoice.id !== where.id || working.invoice.status !== where.status) {
              return { count: 0 };
            }

            working.invoice.status = data.status;
            working.invoice.sentAt = data.sentAt;
            working.invoice.sentBy = data.sentBy ?? null;
            working.invoice.updatedAt = data.sentAt;
            return { count: 1 };
          }
        ),
      },
      invoiceDelivery: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const delivery = {
            id: `delivery-${working.nextDeliveryId++}`,
            invoiceId: data.invoiceId,
            channel: data.channel,
            status: data.status,
            recipientRef: data.recipientRef ?? null,
            sentAt: null,
            viewedAt: null,
            errorMessage: data.errorMessage ?? null,
            createdBy: data.createdBy ?? null,
            createdAt: new Date('2024-03-01T00:00:00Z'),
            documentTemplateId: data.documentTemplateId ?? null,
            documentTemplateHash: data.documentTemplateHash ?? null,
          };
          working.deliveries.push(delivery);
          return clone(delivery);
        }),
      },
      documentTemplate: {
        findFirst: vi.fn(async () => clone(working.documentTemplate)),
      },
      messageTemplate: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (!working.messageTemplate || working.messageTemplate.id !== where.id) {
            return null;
          }
          return clone(working.messageTemplate);
        }),
        findFirst: vi.fn(async () => clone(working.messageTemplate)),
      },
      outboxEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          working.outboxEvents.push({
            ...data,
            processedAt: null,
            createdAt: new Date('2024-03-01T00:00:00Z'),
          });
          return clone(working.outboxEvents[working.outboxEvents.length - 1]);
        }),
      },
    };

    try {
      const result = await fn(tx);
      state = working;
      return result;
    } catch (error) {
      throw error;
    }
  });
}

describe('InvoiceService.sendInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state = createState();
    mocks.isLineConfigured.mockReturnValue(true);
    installTransactionalMocks();
  });

  it('queues an eligible LINE send and marks the invoice SENT', async () => {
    const service = createInvoiceService({
      publish: mocks.eventBusPublish,
    } as any);

    const result = await service.sendInvoice(
      state.invoice.id,
      { sendToLine: true, channel: 'LINE' },
      'admin-1'
    );

    expect(result.queued).toBe(true);
    expect(result.invoice?.status).toBe('SENT');
    expect(state.invoice.status).toBe('SENT');
    expect(state.deliveries).toHaveLength(1);
    expect(state.deliveries[0]).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        recipientRef: 'line-user-1',
      })
    );
    expect(
      state.outboxEvents.filter((event) => event.eventType === 'InvoiceSendRequested')
    ).toHaveLength(1);
    expect(
      state.outboxEvents.filter((event) => event.eventType === 'INVOICE_SENT')
    ).toHaveLength(1);
    expect(mocks.eventBusPublish).toHaveBeenCalledWith(
      'INVOICE_SENT',
      'Invoice',
      state.invoice.id,
      expect.objectContaining({
        invoiceId: state.invoice.id,
        lineUserId: 'line-user-1',
      }),
      { userId: 'admin-1' }
    );
  });

  it('records failed delivery tracking without marking SENT when LINE delivery is impossible', async () => {
    mocks.isLineConfigured.mockReturnValue(false);
    const service = createInvoiceService({
      publish: mocks.eventBusPublish,
    } as any);

    const result = await service.sendInvoice(
      state.invoice.id,
      { sendToLine: true, channel: 'LINE' },
      'admin-1'
    );

    expect(result.queued).toBe(false);
    expect(result.errorMessage).toBe('LINE is not configured');
    expect(result.deliveryStatus).toBe('FAILED');
    expect(state.invoice.status).toBe('GENERATED');
    expect(state.deliveries).toHaveLength(1);
    expect(state.deliveries[0]).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        errorMessage: 'LINE is not configured',
      })
    );
    expect(state.outboxEvents).toHaveLength(0);
    expect(mocks.eventBusPublish).not.toHaveBeenCalled();
  });

  it.each(['SENT', 'PAID'] as const)(
    'does not queue a new real send when the invoice is already %s',
    async (status) => {
      state = createState(status);
      installTransactionalMocks();
      const service = createInvoiceService({
        publish: mocks.eventBusPublish,
      } as any);

      await expect(
        service.sendInvoice(state.invoice.id, { sendToLine: true, channel: 'LINE' }, 'admin-1')
      ).rejects.toBeInstanceOf(ValidationError);

      expect(state.invoice.status).toBe(status);
      expect(state.deliveries).toHaveLength(0);
      expect(
        state.outboxEvents.filter((event) => event.eventType === 'InvoiceSendRequested')
      ).toHaveLength(0);
      expect(mocks.eventBusPublish).not.toHaveBeenCalled();
    }
  );

  it('prevents a duplicate second send from enqueueing another real delivery', async () => {
    const service = createInvoiceService({
      publish: mocks.eventBusPublish,
    } as any);

    await service.sendInvoice(state.invoice.id, { sendToLine: true, channel: 'LINE' }, 'admin-1');

    await expect(
      service.sendInvoice(state.invoice.id, { sendToLine: true, channel: 'LINE' }, 'admin-1')
    ).rejects.toBeInstanceOf(ValidationError);

    expect(
      state.outboxEvents.filter((event) => event.eventType === 'InvoiceSendRequested')
    ).toHaveLength(1);
    expect(state.deliveries).toHaveLength(1);
  });

  it('rolls back delivery and outbox writes when eligibility is lost before the SENT transition', async () => {
    state.simulateLostEligibilityOnUpdate = true;
    installTransactionalMocks();
    const service = createInvoiceService({
      publish: mocks.eventBusPublish,
    } as any);

    await expect(
      service.sendInvoice(state.invoice.id, { sendToLine: true, channel: 'LINE' }, 'admin-1')
    ).rejects.toBeInstanceOf(ConflictError);

    expect(state.invoice.status).toBe('GENERATED');
    expect(state.deliveries).toHaveLength(0);
    expect(state.outboxEvents).toHaveLength(0);
    expect(mocks.eventBusPublish).not.toHaveBeenCalled();
  });

  it('does not queue a real send when LINE readiness is lost before the recipient lock is acquired', async () => {
    state.simulateLineUserUnlinkedBeforeRecipientLock = true;
    installTransactionalMocks();
    const service = createInvoiceService({
      publish: mocks.eventBusPublish,
    } as any);

    const result = await service.sendInvoice(
      state.invoice.id,
      { sendToLine: true, channel: 'LINE' },
      'admin-1'
    );

    expect(result.queued).toBe(false);
    expect(result.errorMessage).toBe('No LINE account linked to the tenant');
    expect(state.invoice.status).toBe('GENERATED');
    expect(
      state.outboxEvents.filter((event) => event.eventType === 'InvoiceSendRequested')
    ).toHaveLength(0);
    expect(state.deliveries).toHaveLength(1);
    expect(state.deliveries[0]).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        errorMessage: 'No LINE account linked to the tenant',
      })
    );
    expect(mocks.eventBusPublish).not.toHaveBeenCalled();
  });

  it('does not queue a real send when the primary tenant moves out before the recipient lock is acquired', async () => {
    state.simulateTenantMovedOutBeforeRecipientLock = true;
    installTransactionalMocks();
    const service = createInvoiceService({
      publish: mocks.eventBusPublish,
    } as any);

    const result = await service.sendInvoice(
      state.invoice.id,
      { sendToLine: true, channel: 'LINE' },
      'admin-1'
    );

    expect(result.queued).toBe(false);
    expect(result.errorMessage).toBe('No LINE account linked to the tenant');
    expect(state.invoice.status).toBe('GENERATED');
    expect(
      state.outboxEvents.filter((event) => event.eventType === 'InvoiceSendRequested')
    ).toHaveLength(0);
    expect(state.deliveries).toHaveLength(1);
    expect(state.deliveries[0]).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        errorMessage: 'No LINE account linked to the tenant',
      })
    );
    expect(mocks.eventBusPublish).not.toHaveBeenCalled();
  });
});
