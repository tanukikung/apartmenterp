export { OutboxProcessor, getOutboxProcessor, createOutboxProcessor, type OutboxProcessorOptions, type ProcessedResult, type OutboxEventWithPayload, } from './processor';
export { Outbox, getOutbox } from './outbox';
import { Json } from '@/types/prisma-json';

/**
 * Convenience helper to publish a single outbox event.
 * Derives aggregateType/aggregateId from common payload keys.
 */
export async function publishEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { validateEventPayload } = await import('../events/schemas');
  const { getOutbox } = await import('./outbox');
  const outbox = getOutbox();

  // Derive aggregate from well-known keys
  let aggregateType = 'System';
  let aggregateId = '00000000-0000-0000-0000-000000000000';

  if (typeof payload.invoiceId === 'string') {
    aggregateType = 'Invoice';
    aggregateId = payload.invoiceId as string;
  } else if (typeof payload.paymentId === 'string') {
    aggregateType = 'Payment';
    aggregateId = payload.paymentId as string;
  } else if (typeof payload.maintenanceId === 'string') {
    aggregateType = 'Maintenance';
    aggregateId = payload.maintenanceId as string;
  } else if (typeof payload.roomId === 'string') {
    aggregateType = 'Room';
    aggregateId = payload.roomId as string;
  }

  // Validate payload shape by event type
  validateEventPayload(eventType, payload);

  await outbox.write(aggregateType, aggregateId, eventType, payload as Json);
}
