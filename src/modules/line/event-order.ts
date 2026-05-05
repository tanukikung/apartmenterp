/**
 * Determines whether a LINE webhook event is out-of-order.
 *
 * LINE webhook events can arrive out of order. Before processing, we check
 * if we already processed a newer event from the same source. If so, the event
 * is out-of-order and should be rejected.
 *
 * @returns true if event is out-of-order (should be rejected), false otherwise
 */
export async function isOutOfOrder(
  sourceId: string,
  eventTimestamp: bigint,
  eventType: string,
): Promise<boolean> {
  // Skip check for mock/test events or invalid timestamps
  if (eventType === 'mock') return false;
  if (eventTimestamp <= BigInt(0)) return false;

  const { prisma } = await import('@/lib/db/client');

  const lastEvent = await prisma.lineEvent.findFirst({
    where: {
      sourceId,
      eventType: { not: 'mock' },
    },
    orderBy: { eventTimestamp: 'desc' },
    select: { eventTimestamp: true },
  });

  if (!lastEvent) return false;
  return eventTimestamp < lastEvent.eventTimestamp;
}