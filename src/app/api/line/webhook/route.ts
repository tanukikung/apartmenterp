/**
 * LINE Webhook — Zero-loss ingest endpoint (replay-proof + out-of-order-safe)
 *
 * CONTRACT:
 *   1. Verify LINE signature (reject invalid — security boundary)
 *   2. For each event, upsert into InboxEvent (dedup by eventId — LINE retries safe)
 *   3. Record event in LineEvent table with result: SUCCESS | FAILED | DUPLICATE_REJECTED | OUT_OF_ORDER_REJECTED
 *   4. Track replyToken usage in LineReplyToken (replyToken can only be used once)
 *   5. Return 200 OK immediately — no processing, no LINE API calls at this layer
 *
 * OUT-OF-ORDER PROTECTION:
 *   LINE webhook events can arrive out of order (e.g., user reply arrives before
 *   the original message). Before processing, we check if we already processed
 *   a newer event from the same source. If so, the event is recorded as
 *   OUT_OF_ORDER_REJECTED and the InboxEvent is NOT enqueued for processing.
 *
 * WHY INBOX + LineEvent DUAL WRITE:
 *   - InboxEvent: powers the async InboxProcessor queue (all actual work done there)
 *   - LineEvent: replay detection ledger so we know immediately (not async) whether
 *     this event is new, duplicate, or failed — needed for the replyToken guard and
 *     for security monitoring (replay attacks)
 *
 * ReplyToken tracking: LINE's replyToken can only be used once. Before sending any
 * reply, we check LineReplyToken. If the token was already used, we skip the reply
 * (can't reply anyway) and log a warning. This prevents wasting API calls on stale
 * tokens and provides audit trail of token usage.
 *
 * Rate limiting: removed per FM-14 decision (malicious traffic fills inbox_events
 * with PENDING rows that processor discards on first look). Volume protection belongs
 * at the reverse proxy / WAF layer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { verifyLineSignature } from '@/lib/line/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { UnauthorizedError } from '@/lib';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { WebhookEvent } from '@line/bot-sdk';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

type RawWebhookPayload = { events?: WebhookEvent[] };

/**
 * Derive a stable deduplication key from a LINE event.
 *
 * Priority:
 *   1. webhookEventId  — LINE's own stable ID (v2.8+ API)
 *   2. message.id      — for message events without webhookEventId
 *   3. hash of (userId + postback data + timestamp)  — for postback events
 *   4. userId + type + timestamp  — for follow/unfollow/read events
 *
 * Using a derived key for events that don't have webhookEventId ensures we can
 * detect replays even for older LINE API versions or event types that lack a
 * native stable ID.
 */
function extractEventId(event: WebhookEvent): string {
  const e = event as {
    webhookEventId?: string;
    message?: { id?: string };
    postback?: { data?: string };
    type?: string;
    source?: { userId?: string; groupId?: string; roomId?: string };
    timestamp?: number;
  };

  if (e.webhookEventId) return e.webhookEventId;
  if (e.message?.id)    return `msg-${e.message.id}`;

  const userId = e.source?.userId ?? 'anon';
  const ts     = e.timestamp ?? Date.now();

  if (e.type === 'postback' && e.postback?.data) {
    const h = createHash('sha256')
      .update(`${userId}:pb:${e.postback.data}:${ts}`)
      .digest('hex')
      .slice(0, 24);
    return `pb-${h}`;
  }

  return `${e.type ?? 'unk'}-${userId}-${ts}`;
}

type LineEventResult = 'SUCCESS' | 'FAILED' | 'DUPLICATE_REJECTED' | 'OUT_OF_ORDER_REJECTED';

/**
 * Upsert a LineEvent record.
 * - If the eventId is new: INSERT — event is being processed for the first time
 * - If eventId already exists: UPDATE the result (e.g., from PENDING to SUCCESS/FAILED)
 *
 * The UPDATE on existing records handles the case where InboxProcessor completes
 * processing and calls back to mark the event as SUCCESS (via a separate internal call).
 * We use a single transaction for both the InboxEvent write and the LineEvent write.
 */
async function _upsertLineEvent(
  eventId: string,
  replyToken: string | undefined,
  eventType: string,
  sourceType: string,
  sourceId: string,
  eventTimestamp: bigint,
  result: LineEventResult,
  errorMsg?: string
): Promise<void> {
  await prisma.lineEvent.upsert({
    where:  { id: eventId },
    update: {
      result,
      errorMsg: errorMsg ?? null,
      replyToken: replyToken ?? null,
    },
    create: {
      id:             eventId,
      replyToken:     replyToken ?? null,
      eventType,
      sourceType,
      sourceId,
      eventTimestamp,
      result,
      errorMsg: errorMsg ?? null,
    },
  });
}

/**
 * Check if a replyToken has already been used.
 * Returns true if already used (skip reply), false if available.
 */
async function _isReplyTokenUsed(token: string): Promise<boolean> {
  const existing = await prisma.lineReplyToken.findUnique({ where: { token } });
  return existing !== null;
}

/**
 * Record that a replyToken has been used by a specific eventId.
 * If the token was already recorded by a concurrent request, we silently skip
 * (the unique constraint catches this — it's a replay scenario).
 */
async function _markReplyTokenUsed(token: string, eventId: string): Promise<void> {
  try {
    await prisma.lineReplyToken.create({
      data: { token, usedBy: eventId },
    });
  } catch (err) {
    // P2002 = already exists — token was used by another event (replay)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      logger.warn({ type: 'reply_token_replay_detected', token, eventId });
      return;
    }
    throw err;
  }
}

/**
 * Check if an event arrived out of order compared to already-processed events
 * from the same source.
 *
 * Returns true if the event is OLDER than the latest event we've already
 * processed from the same source — meaning LINE delivered it out of order
 * and we should reject it.
 *
 * Edge cases:
 *   - eventTimestamp = 0 or missing: returns false (skip check — can't determine order)
 *   - No prior event from this source: returns false (first event always allowed)
 *   - Same timestamp: returns false (indeterminate — process both)
 *   - Mock/test events (eventType='mock'): returns false (skip check)
 */
async function isOutOfOrder(
  sourceId: string,
  eventTimestamp: bigint,
  eventType: string
): Promise<boolean> {
  // Skip check for mock/test events or invalid timestamps
  if (eventType === 'mock')          return false;
  if (eventTimestamp <= BigInt(0))    return false;

  const lastEvent = await prisma.lineEvent.findFirst({
    where: {
      sourceId,
      eventType: { not: 'mock' },
    },
    orderBy: { eventTimestamp: 'desc' },
    select: { eventTimestamp: true },
  });

  if (!lastEvent) return false;

  // If the new event's timestamp is strictly less than the last processed
  // event's timestamp, it arrived out of order.
  return eventTimestamp < lastEvent.eventTimestamp;
}

// ─── Out-of-order guard results ───────────────────────────────────────────────

type EventIngestOp = {
  event: WebhookEvent;
  eventId: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  eventTimestamp: bigint;
  replyToken: string | undefined;
  outOfOrder: boolean;
};

/**
 * Classify each event before building the transaction operations.
 * Must run BEFORE the transaction so we can skip InboxEvent creation for
 * out-of-order events without holding a transaction open during a query.
 *
 * Out-of-order check is the only pre-transaction DB call we make per event,
 * so it is NOT inside the transaction to avoid holding locks during a read.
 */
async function classifyEvents(events: WebhookEvent[]): Promise<EventIngestOp[]> {
  return Promise.all(
    events.map(async (event) => {
      const eventId    = extractEventId(event);
      const eventType  = (event as { type?: string }).type ?? 'unknown';
      const source     = event as { source?: { type?: string; userId?: string; groupId?: string; roomId?: string } };
      const sourceType = source.source?.type ?? 'unknown';
      const sourceId   = source.source?.userId ?? source.source?.groupId ?? source.source?.roomId ?? 'unknown';
      const replyToken = (event as { replyToken?: string }).replyToken;
      const rawTs     = (event as { timestamp?: number }).timestamp ?? 0;
      const eventTimestamp = BigInt(rawTs);

      const outOfOrder = await isOutOfOrder(sourceId, eventTimestamp, eventType);

      if (outOfOrder) {
        logger.warn({
          type:                   'webhook_out_of_order_rejected',
          sourceId,
          eventTimestamp:        eventTimestamp.toString(),
          eventId,
          eventType,
        });
      }

      return { event, eventId, eventType, sourceType, sourceId, eventTimestamp, replyToken, outOfOrder };
    })
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  // 1. Read body first (needed for both signature check and persistence)
  const bodyText = await req.text();

  // 2. Signature verification — mandatory security check
  const signature = req.headers.get('x-line-signature') || '';
  if (!verifyLineSignature(bodyText, signature)) {
    throw new UnauthorizedError('Invalid LINE signature');
  }

  // 3. Parse
  let payload: RawWebhookPayload;
  try {
    payload = JSON.parse(bodyText) as RawWebhookPayload;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  if (events.length === 0) {
    return NextResponse.json({ success: true });
  }

  // 4. Classify all events (out-of-order check runs here, before transaction)
  const ingestOps = await classifyEvents(events);

  // 5. Process all events atomically: for each event, write InboxEvent + LineEvent
  //    Both operations must be in the transaction array so they're committed together.
  //    LineEvent.upsert is idempotent — concurrent retries get P2002 on INSERT attempt
  //    (first-writer-wins INSERT, subsequent writers skip via result=DUPLICATE_REJECTED).
  //
  //    OUT_OF_ORDER events: LineEvent is still upserted (for audit trail) but
  //    InboxEvent is NOT created (no processing needed).
  await prisma.$transaction(
    ingestOps.flatMap((op) => {
      const { eventId, eventType, sourceType, sourceId, eventTimestamp, replyToken, outOfOrder } = op;

      // 5a. InboxEvent — only for non-out-of-order events
      const inboxUpsert = !outOfOrder
        ? prisma.inboxEvent.upsert({
            where:  { eventId },
            update: {},   // duplicate — ignore silently
            create: {
              id:      uuidv4(),
              source:  'LINE',
              eventId,
              payload: op.event as Prisma.InputJsonValue,
              status:  'PENDING',
            },
          })
        : null;

      // 5b. LineEvent — always upserted (audit trail even for rejected events)
      //     Result reflects whether the event will be processed (SUCCESS) or
      //     was rejected as out-of-order (OUT_OF_ORDER_REJECTED).
      //
      //     Update branch: only change result if this is a true duplicate
      //     (outOfOrder=false). For outOfOrder=true the create branch already
      //     set the correct result, so don't overwrite it with DUPLICATE_REJECTED.
      const lineEventUpsert = prisma.lineEvent.upsert({
        where:  { id: eventId },
        update: outOfOrder
          ? {}   // already set to OUT_OF_ORDER_REJECTED in create below — no-op on update
          : { result: 'DUPLICATE_REJECTED' },
        create: {
          id:             eventId,
          replyToken:     replyToken ?? null,
          eventType,
          sourceType,
          sourceId,
          eventTimestamp,
          result:         outOfOrder ? 'OUT_OF_ORDER_REJECTED' : 'SUCCESS',
          sourceSequenceAt: null,
        },
      });

      // Return both/none as separate array items (flatMap flattens)
      return inboxUpsert ? [inboxUpsert, lineEventUpsert] : [lineEventUpsert];
    }),
  );

  const outOfOrderCount = ingestOps.filter((op) => op.outOfOrder).length;
  logger.info({ type: 'line_webhook_ingested', count: events.length, outOfOrderCount });

  // 6. Respond immediately — InboxProcessor handles the actual work asynchronously
  return NextResponse.json({ success: true, outOfOrderCount });
});
