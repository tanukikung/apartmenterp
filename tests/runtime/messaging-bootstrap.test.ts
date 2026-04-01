import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;

describe('messaging runtime bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it('registers the expected subscribers once and stays idempotent', async () => {
    const { bootstrapMessagingRuntime } = await import('@/modules/messaging/bootstrap');
    const { getEventBus, EventTypes } = await import('@/lib');

    const bus = getEventBus();

    expect(bus.getHandlerCount('LineSendFileRequested')).toBe(0);
    expect(bus.getHandlerCount(EventTypes.INVOICE_GENERATED)).toBe(0);
    expect(bus.getHandlerCount(EventTypes.INVOICE_PAID)).toBe(0);
    expect(bus.getHandlerCount(EventTypes.INVOICE_REMINDER_DUE_SOON)).toBe(0);

    await bootstrapMessagingRuntime({ allowInTest: true });

    expect(bus.getHandlerCount('LineSendFileRequested')).toBe(1);
    expect(bus.getHandlerCount('InvoiceSendRequested')).toBe(1);
    expect(bus.getHandlerCount('ReceiptSendRequested')).toBe(1);
    expect(bus.getHandlerCount('ManualReminderSendRequested')).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_GENERATED)).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_PAID)).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_REMINDER_DUE_SOON)).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_REMINDER_DUE_TODAY)).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_REMINDER_OVERDUE)).toBe(1);

    await bootstrapMessagingRuntime({ allowInTest: true });

    expect(bus.getHandlerCount('LineSendFileRequested')).toBe(1);
    expect(bus.getHandlerCount('InvoiceSendRequested')).toBe(1);
    expect(bus.getHandlerCount('ReceiptSendRequested')).toBe(1);
    expect(bus.getHandlerCount('ManualReminderSendRequested')).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_GENERATED)).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_PAID)).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_REMINDER_DUE_SOON)).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_REMINDER_DUE_TODAY)).toBe(1);
    expect(bus.getHandlerCount(EventTypes.INVOICE_REMINDER_OVERDUE)).toBe(1);
  });
});
