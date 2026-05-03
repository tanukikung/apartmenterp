/**
 * LINE Webhook — Zero-loss ingest endpoint
 *
 * CONTRACT:
 *   1. Verify LINE signature (reject invalid — security boundary)
 *   2. Persist every event into inbox_events in a single transaction
 *      (upsert on eventId → LINE retries are safe, duplicates silently ignored)
 *   3. Return 200 OK — no processing, no LINE API calls, no in-memory queues
 *
 * Why this design:
 *   - 100ms response budget: only one DB write, zero network calls
 *   - Crash-safe: events survive process restart because they're in Postgres
 *   - InboxProcessor polls inbox_events and does all the actual work
 *
 * Rate limiting at this layer was removed (FM-14 IP limit replaced by ingest
 * persistence). Malicious traffic from a single IP would fill inbox_events
 * with PENDING rows that the processor will discard on first look (no lineUserId
 * = skip). Volume protection belongs at the reverse proxy / WAF layer.
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
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

type RawWebhookPayload = { events?: WebhookEvent[] };

/**
 * Derive a stable deduplication key from a LINE event.
 *
 * Priority:
 *   1. webhookEventId  — LINE's own stable ID (v2.8+ API)
 *   2. message.id      — for message events without webhookEventId
 *   3. hash of (userId + postback data + timestamp)  — for postback events
 *   4. userId + type + timestamp  — for follow/unfollow/read
 */
function extractEventId(event: WebhookEvent): string {
  const e = event as {
    webhookEventId?: string;
    message?: { id?: string };
    postback?: { data?: string };
    type?: string;
    source?: { userId?: string };
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

  // 4. Persist all events in a single transaction — upsert so LINE retries are no-ops
  await prisma.$transaction(
    events.map((event) => {
      const eventId = extractEventId(event);
      return prisma.inboxEvent.upsert({
        where:  { eventId },
        update: {},   // duplicate — ignore
        create: {
          id:      uuidv4(),
          source:  'LINE',
          eventId,
          payload: event as Prisma.InputJsonValue,
          status:  'PENDING',
        },
      });
    }),
  );

  logger.info({ type: 'line_webhook_ingested', count: events.length });

  // 5. Respond immediately — InboxProcessor handles the rest asynchronously
  return NextResponse.json({ success: true });
});
