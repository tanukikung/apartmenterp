-- Unique constraint: prevents duplicate outbox events for the same aggregate+eventType.
-- This is critical for idempotency — when two processes (or a retry) both try to create
-- the same ConfigurableReminder event for the same invoice, the second INSERT raises
-- P2002 and is safely caught/ignored by the caller, preventing duplicate LINE messages.
--
-- Note: A given invoice can still have multiple *different* event types (e.g.,
-- InvoiceGenerated + ConfigurableReminder) because they differ in eventType.

CREATE UNIQUE INDEX "OutboxEvent_aggregate_aggregateId_eventType_unique_idx"
  ON "OutboxEvent" (aggregateType, aggregateId, eventType);
