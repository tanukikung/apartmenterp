import { createHash } from 'crypto';

/**
 * Compute a deterministic SHA-256 hash of an outbox event's content.
 * Used for exactly-once delivery guarantees — if two events have the same
 * messageHash, they represent the same logical message and only one may succeed.
 *
 * The hash is deterministic so it can be computed BEFORE creation and used
 * as a pre-insert dedup check (DB unique constraint on messageHash).
 */
export function computeMessageHash(
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>
): string {
  const content = JSON.stringify({ eventType, aggregateId, payload });
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Same as computeMessageHash but accepts a JSON string for payload
 * (avoids re-serializing when the caller already has JSON).
 */
export function computeMessageHashFromString(
  eventType: string,
  aggregateId: string,
  payloadJson: string
): string {
  const content = JSON.stringify({ eventType, aggregateId, payload: JSON.parse(payloadJson) });
  return createHash('sha256').update(content).digest('hex');
}
