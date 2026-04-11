// Event Bus
export {
  EventBus,
  EventBuilder,
  createEventBus,
  getEventBus,
  createEventBuilder,
  type EventBusOptions,
  type EventMetadata,
} from './event-bus';

// Event Types
export {
  // Base
  baseEventSchema,
  type BaseEvent,

  // Billing
  billingRecordCreatedSchema,
  billingItemUpdatedSchema,
  billingLockedSchema,
  billingUnlockedSchema,
  type BillingRecordCreated,
  type BillingItemUpdated,
  type BillingLocked,
  type BillingUnlocked,
  type BillingEvent,

  // Invoice
  invoiceGeneratedSchema,
  invoiceVersionCreatedSchema,
  invoiceSentSchema,
  invoiceViewedSchema,
  invoiceMarkedOverdueSchema,
  invoicePaidSchema,
  type InvoiceGenerated,
  type InvoiceVersionCreated,
  type InvoiceSent,
  type InvoiceViewed,
  type InvoiceMarkedOverdue,
  type InvoicePaid,
  type InvoiceEvent,

  // Payment
  bankStatementImportedSchema,
  paymentDetectedSchema,
  paymentMatchedSchema,
  paymentConfirmedSchema,
  paymentRejectedSchema,
  type BankStatementImported,
  type PaymentDetected,
  type PaymentMatched,
  type PaymentConfirmed,
  type PaymentRejected,
  type PaymentEvent,

  // Messaging
  lineMessageReceivedSchema,
  conversationCreatedSchema,
  conversationLinkedSchema,
  messageStoredSchema,
  adminReplySentSchema,
  lineMessageSentSchema,
  reminderTriggeredSchema,
  type LineMessageReceived,
  type ConversationCreated,
  type ConversationLinked,
  type MessageStored,
  type AdminReplySent,
  type LineMessageSent,
  type ReminderTriggered,
  type MessagingEvent,

  // System
  setupCompletedSchema,
  configChangedSchema,
  auditLogCreatedSchema,
  outboxEventFailedSchema,
  type SetupCompleted,
  type ConfigChanged,
  type AuditLogCreated,
  type OutboxEventFailed,
  type SystemEvent,

  // Union
  type DomainEvent,
  type EventHandler,
  type EventHandlerMap,

  // Constants
  EventTypes,
} from './types';
