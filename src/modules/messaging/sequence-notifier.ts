import { EventBus } from '@/lib/events/event-bus';
import { EventTypes } from '@/lib/events/types';

interface SequenceStepPayload {
  lineUserId: string;
  messageType: string;
  subject?: string | null;
  contentTh: string;
  contentEn?: string | null;
  responseType: string;
  invalidReply?: string | null;
  stepId: string;
  stepOrder: number;
}

async function sendLineMessage(lineUserId: string, payload: SequenceStepPayload) {
  // Placeholder: integrate with actual LINE SDK
  // This will be called by the outbox processor via EventBus
  console.log(`[SequenceNotifier] Sending ${payload.messageType} to ${lineUserId}: ${payload.contentTh.substring(0, 50)}...`);
  // In production, this would call LINE Messaging API
  // await lineClient.pushMessage(lineUserId, buildMessage(payload));
}

export function registerSequenceNotifier() {
  EventBus.getInstance().subscribe(EventTypes.MESSAGE_SEQUENCE_STEP, async (event) => {
    const payload = event.payload as unknown as SequenceStepPayload;
    await sendLineMessage(payload.lineUserId, payload);
  });

  console.log('[SequenceNotifier] Registered for MessageSequenceStep events');
}