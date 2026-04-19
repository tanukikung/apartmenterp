import { v4 as uuidv4 } from 'uuid';
import { logger, eventLogger } from '../utils/logger';
import type {
  DomainEvent,
  EventHandler,
  EventHandlerMap,
} from './types';

export interface EventBusOptions {
  correlationId?: string;
  causationId?: string;
  userId?: string;
}

export interface EventMetadata {
  correlationId: string;
  causationId?: string;
  userId?: string;
  timestamp: Date;
  version: number;
}

/**
 * Event Bus implementation for domain events
 * Supports publish/subscribe pattern with async handlers
 *
 * LIFECYCLE NOTES:
 * - **getInstance() vs constructor**: Use getInstance() for shared bus in API routes.
 *   Use `new EventBus()` in tests to get an isolated instance.
 * - **Test isolation**: Call EventBus.resetInstance() between tests to clear handlers/history.
 * - **Hot reload**: Call resetInstance() during dev reload to avoid duplicate handlers.
 * - **Thread safety**: Node.js is single-threaded; no true concurrency concerns apply.
 */
export class EventBus {
  private handlers: EventHandlerMap = new Map();
  private eventHistory: DomainEvent[] = [];
  private options: EventBusOptions;
  private static instance: EventBus | null = null;

  constructor(options: EventBusOptions = {}) {
    this.options = options;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Reset the singleton. Use between tests or during hot reload to get a fresh bus.
   */
  static resetInstance(): void {
    EventBus.instance = null;
  }

  /**
   * Subscribe to an event type
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    
    const handlers = this.handlers.get(eventType) as EventHandler[];
    handlers.push(handler as EventHandler);
    
    logger.debug({
      type: 'event_subscription',
      eventType,
      handlerCount: handlers.length,
    });
  }

  /**
   * Unsubscribe from an event type
   */
  unsubscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler as EventHandler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Subscribe multiple handlers at once
   */
  subscribeMany(
    subscriptions: Array<{ eventType: string; handler: EventHandler }>
  ): void {
    subscriptions.forEach(({ eventType, handler }) => {
      this.subscribe(eventType, handler);
    });
  }

  /**
   * Publish an event to all subscribers
   */
  async publish<T extends DomainEvent>(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any,
    options: EventBusOptions = {}
  ): Promise<T> {
    const event = {
      id: uuidv4(),
      type: eventType,
      aggregateType,
      aggregateId,
      payload,
      metadata: {
        correlationId: options.correlationId || uuidv4(),
        causationId: options.causationId || this.options.causationId,
        userId: options.userId || this.options.userId,
        timestamp: new Date(),
        version: 1,
      },
    } as T;

    // Store in history
    this.eventHistory.push(event);

    eventLogger.published(eventType, aggregateId);

    // Get handlers for this event type
    const handlers = this.handlers.get(eventType) || [];

    if (handlers.length === 0) {
      logger.debug({
        type: 'event_no_handlers',
        eventType,
        aggregateId,
      });
    }

    // Execute handlers concurrently
    const results = await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(event);
          eventLogger.consumed(eventType, handler.name);
        } catch (error) {
          eventLogger.error(eventType, handler.name, error as Error);
          throw error;
        }
      })
    );

    // Check for handler errors
    const errors = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    if (errors.length > 0) {
      logger.error({
        type: 'event_handler_errors',
        eventType,
        aggregateId,
        errorCount: errors.length,
        errors: errors.map((e) => (e.reason as Error).message),
      });
    }

    return event;
  }

  /**
   * Publish multiple events in sequence
   */
  async publishBatch<T extends DomainEvent>(
    events: Array<{
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: any;
    }>
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (const event of events) {
      const published = await this.publish<T>(
        event.eventType,
        event.aggregateType,
        event.aggregateId,
        event.payload
      );
      results.push(published);
    }

    return results;
  }

  /**
   * Get event history
   */
  getHistory(): DomainEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Get events by type
   */
  getEventsByType<T extends DomainEvent>(eventType: string): T[] {
    return this.eventHistory.filter((e) => e.type === eventType) as T[];
  }

  /**
   * Get events by aggregate
   */
  getEventsByAggregate(
    aggregateType: string,
    aggregateId: string
  ): DomainEvent[] {
    return this.eventHistory.filter(
      (e) => e.aggregateType === aggregateType && e.aggregateId === aggregateId
    );
  }

  /**
   * Get events by correlation ID
   */
  getEventsByCorrelation(correlationId: string): DomainEvent[] {
    return this.eventHistory.filter(
      (e) => e.metadata.correlationId === correlationId
    );
  }

  /**
   * Clear history (for testing)
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Set correlation ID for chained operations
   */
  setCorrelationId(correlationId: string): void {
    this.options.correlationId = correlationId;
  }

  /**
   * Set user ID for operations
   */
  setUserId(userId: string): void {
    this.options.userId = userId;
  }

  /**
   * Reset options
   */
  resetOptions(): void {
    this.options = {};
  }

  /**
   * Get handler count for an event type
   */
  getHandlerCount(eventType: string): number {
    return this.handlers.get(eventType)?.length || 0;
  }

  /**
   * List all subscribed event types
   */
  getSubscribedEvents(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ============================================================================
// Event Builder
// ============================================================================

export interface EventBuilderOptions {
  correlationId?: string;
  causationId?: string;
  userId?: string;
}

export class EventBuilder {
  private eventBus: EventBus;
  private options: EventBuilderOptions;

  constructor(eventBus?: EventBus, options: EventBuilderOptions = {}) {
    this.eventBus = eventBus || EventBus.getInstance();
    this.options = options;
  }

  /**
   * Set correlation ID for all events built
   */
  withCorrelation(correlationId: string): EventBuilder {
    return new EventBuilder(this.eventBus, {
      ...this.options,
      correlationId,
    });
  }

  /**
   * Set user ID for all events built
   */
  withUser(userId: string): EventBuilder {
    return new EventBuilder(this.eventBus, {
      ...this.options,
      userId,
    });
  }

  /**
   * Publish event with built options
   */
  async publish<T extends DomainEvent>(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any
  ): Promise<T> {
    return this.eventBus.publish<T>(
      eventType,
      aggregateType,
      aggregateId,
      payload,
      this.options
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createEventBus(options?: EventBusOptions): EventBus {
  return new EventBus(options);
}

export function getEventBus(): EventBus {
  return EventBus.getInstance();
}

export function createEventBuilder(
  eventBus?: EventBus,
  options?: EventBuilderOptions
): EventBuilder {
  return new EventBuilder(eventBus, options);
}
