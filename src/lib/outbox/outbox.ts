import type { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma as sharedPrisma } from '../db/client';
import { logger } from '../utils/logger';
import { Json } from '@/types/prisma-json';

export interface OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  processedAt?: Date;
  retryCount: number;
  lastError?: string;
}

export class Outbox {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || (sharedPrisma as any as PrismaClient);
  }

  /**
   * Write an event to the outbox
   */
  async write(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Json
  ): Promise<OutboxEvent> {
    const outboxEvent = await this.prisma.outboxEvent.create({
      data: {
        id: uuidv4(),
        aggregateType,
        aggregateId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        retryCount: 0,
      },
    });

    return outboxEvent as any as OutboxEvent;
  }

  /**
   * Write multiple events to the outbox in a transaction
   */
  async writeBatch(
    events: Array<{
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Json;
    }>
  ): Promise<OutboxEvent[]> {
    const createdEvents = await this.prisma.$transaction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events.map((event) =>
        this.prisma.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
            retryCount: 0,
          },
        })
      )
    );

    return createdEvents as any as OutboxEvent[];
  }

  /**
   * Get unprocessed events
   */
  async getUnprocessed(limit: number = 100): Promise<OutboxEvent[]> {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        processedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    return events as OutboxEvent[];
  }

  /**
   * Mark event as processed
   */
  async markProcessed(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        processedAt: new Date(),
      },
    });
  }

  /**
   * Mark event as failed
   */
  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        lastError: error,
        retryCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Process outbox events
   */
  async process(
    handler: (event: OutboxEvent) => Promise<void>,
    options: {
      limit?: number;
      maxRetries?: number;
    } = {}
  ): Promise<{ processed: number; failed: number }> {
    const { limit = 100, maxRetries = 3 } = options;

    const events = await this.getUnprocessed(limit);
    let processed = 0;
    let failed = 0;

    for (const event of events) {
      if (event.retryCount >= maxRetries) {
        logger.error({
          type: 'outbox_event_max_retries',
          eventId: event.id,
          message: 'Exceeded max retries, skipping',
        });
        failed++;
        continue;
      }

      try {
        await handler(event);
        await this.markProcessed(event.id);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.markFailed(event.id, errorMessage);
        failed++;
        logger.error({
          type: 'outbox_event_process_failed',
          eventId: event.id,
          error: errorMessage,
        });
      }
    }

    return { processed, failed };
  }

  /**
   * Clean up old processed events
   */
  async cleanup(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prisma.outboxEvent.deleteMany({
      where: {
        processedAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}

// Singleton instance
let outboxInstance: Outbox | null = null;

export function getOutbox(prismaClient?: PrismaClient): Outbox {
  if (!outboxInstance) {
    outboxInstance = new Outbox(prismaClient);
  }
  return outboxInstance;
}
