import { publishEvent as libPublishEvent } from '@/lib/outbox';

export async function publishEvent(
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  await libPublishEvent(type, payload);
}

