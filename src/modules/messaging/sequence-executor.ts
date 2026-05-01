import { prisma } from '@/lib/db';
import { EventBus } from '@/lib/events/event-bus';
import { EventTypes } from '@/lib/events/types';
import { messagingSequenceService } from '../messaging-sequence/messaging-sequence.service';

// Maps domain trigger events → sequence trigger enum values
const TRIGGER_MAP: Record<string, string> = {
  [EventTypes.REGISTRATION_APPROVED]: 'REGISTRATION_APPROVED',
  [EventTypes.MOVE_OUT_CONFIRMED]: 'MOVE_OUT_CONFIRMED',
  [EventTypes.CONTRACT_EXPIRING_SOON]: 'CONTRACT_EXPIRING_SOON',
};

function getTenantIdFromEvent(event: { aggregateType?: string; payload?: Record<string, unknown> }): string | null {
  // Most tenant events have tenantId or aggregateId as the tenant
  if (event.payload?.tenantId) return event.payload.tenantId as string;
  if (event.aggregateType === 'Tenant') return event.payload?.id as string ?? null;
  return null;
}

async function fireMatchingSequences(
  domainEventType: string,
  tenantId: string,
  actorId?: string
) {
  const trigger = TRIGGER_MAP[domainEventType];
  if (!trigger) return;

  const sequences = await prisma.messageSequence.findMany({
    where: { trigger: trigger as 'REGISTRATION_APPROVED' | 'MOVE_OUT_CONFIRMED' | 'CONTRACT_EXPIRING_SOON' | 'MANUAL', isActive: true },
  });

  for (const seq of sequences) {
    try {
      await messagingSequenceService.fireSequence(seq.id, tenantId, actorId);
    } catch (err) {
      console.error(`[SequenceExecutor] Failed to fire sequence ${seq.id} for tenant ${tenantId}:`, err);
    }
  }
}

export function registerSequenceExecutor() {
  for (const [eventType, trigger] of Object.entries(TRIGGER_MAP)) {
    if (!trigger) continue;
    EventBus.getInstance().subscribe(eventType, async (event) => {
      const tenantId = getTenantIdFromEvent(event);
      if (!tenantId) {
        console.warn(`[SequenceExecutor] No tenantId found in event ${eventType}, skipping`);
        return;
      }
      await fireMatchingSequences(eventType, tenantId, event.metadata?.userId);
    });
  }

  // Also handle manual fire via MESSAGE_SEQUENCE_TRIGGERED
  EventBus.getInstance().subscribe(EventTypes.MESSAGE_SEQUENCE_TRIGGERED, async (event) => {
    const { sequenceId, tenantId } = event.payload as unknown as { sequenceId: string; tenantId: string };
    if (!sequenceId || !tenantId) return;
    try {
      await messagingSequenceService.fireSequence(sequenceId, tenantId, event.metadata?.userId);
    } catch (err) {
      console.error(`[SequenceExecutor] Manual fire failed for sequence ${sequenceId}, tenant ${tenantId}:`, err);
    }
  });

  console.log('[SequenceExecutor] Registered for triggers:', Object.keys(TRIGGER_MAP));
}