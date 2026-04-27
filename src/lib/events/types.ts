import { z } from 'zod';

// ============================================================================
// Base Event Schema
// ============================================================================

export const baseEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  payload: z.record(z.unknown()),
  metadata: z.object({
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().optional(),
    userId: z.string().optional(),
    timestamp: z.date(),
    version: z.number().int().positive(),
  }),
});

export type BaseEvent = z.infer<typeof baseEventSchema>;

// ============================================================================
// Billing Events
// ============================================================================

export const billingRecordCreatedSchema = z.object({
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  billingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  overdueDay: z.number().int().min(1).max(31),
  totalAmount: z.number(),
});

export const billingItemUpdatedSchema = z.object({
  billingRecordId: z.string().uuid(),
  itemId: z.string().uuid(),
  itemType: z.string(),
  field: z.enum(['quantity', 'unitPrice', 'description', 'amount']),
  oldValue: z.string(),
  newValue: z.string(),
  adminId: z.string(),
  adminName: z.string(),
});

export const billingItemAddedSchema = z.object({
  billingRecordId: z.string().uuid(),
  itemId: z.string().uuid(),
  typeCode: z.string(),
  typeName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
  addedBy: z.string().optional(),
});

export const billingItemRemovedSchema = z.object({
  billingRecordId: z.string().uuid(),
  itemId: z.string().uuid(),
  typeCode: z.string(),
  removedBy: z.string().optional(),
});

export const billingLockedSchema = z.object({
  billingRecordId: z.string().uuid(),
  lockedBy: z.string(),
  lockedByName: z.string(),
  lockedAt: z.date(),
});

export const billingUnlockedSchema = z.object({
  billingRecordId: z.string().uuid(),
  unlockedBy: z.string(),
  unlockedByName: z.string(),
});

export type BillingRecordCreated = BaseEvent & {
  type: 'BillingRecordCreated';
  payload: z.infer<typeof billingRecordCreatedSchema>;
};

export type BillingItemUpdated = BaseEvent & {
  type: 'BillingItemUpdated';
  payload: z.infer<typeof billingItemUpdatedSchema>;
};

export type BillingItemAdded = BaseEvent & {
  type: 'BillingItemAdded';
  payload: z.infer<typeof billingItemAddedSchema>;
};

export type BillingItemRemoved = BaseEvent & {
  type: 'BillingItemRemoved';
  payload: z.infer<typeof billingItemRemovedSchema>;
};

export type BillingLocked = BaseEvent & {
  type: 'BillingLocked';
  payload: z.infer<typeof billingLockedSchema>;
};

export type BillingUnlocked = BaseEvent & {
  type: 'BillingUnlocked';
  payload: z.infer<typeof billingUnlockedSchema>;
};

export const invoiceGenerationRequestedSchema = z.object({
  billingRecordId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  totalAmount: z.number(),
  requestedBy: z.string().optional(),
});

export type InvoiceGenerationRequested = BaseEvent & {
  type: 'InvoiceGenerationRequested';
  payload: z.infer<typeof invoiceGenerationRequestedSchema>;
};

export type BillingEvent =
  | BillingRecordCreated
  | BillingItemAdded
  | BillingItemUpdated
  | BillingItemRemoved
  | BillingLocked
  | BillingUnlocked
  | InvoiceGenerationRequested;

// ============================================================================
// Invoice Events
// ============================================================================

export const invoiceGeneratedSchema = z.object({
  invoiceId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  billingRecordId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  version: z.number().int().positive(),
  subtotal: z.number(),
  total: z.number(),
  dueDate: z.date(),
});

export const invoiceVersionCreatedSchema = z.object({
  invoiceVersionId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  previousVersion: z.number().int().optional(),
  version: z.number().int().positive(),
  subtotal: z.number(),
  total: z.number(),
  changeNote: z.string().optional(),
});

export const invoiceSentSchema = z.object({
  invoiceId: z.string().uuid(),
  tenantId: z.string().uuid(),
  lineUserId: z.string(),
  sentBy: z.string(),
  sentByName: z.string(),
  lineMessageId: z.string().optional(),
  sentAt: z.date(),
});

export const invoiceViewedSchema = z.object({
  invoiceId: z.string().uuid(),
  viewedAt: z.date(),
  viewerId: z.string().optional(),
});

export const invoiceMarkedOverdueSchema = z.object({
  invoiceId: z.string().uuid(),
  daysOverdue: z.number().int(),
  markedAt: z.date(),
});

export const invoicePaidSchema = z.object({
  invoiceId: z.string().uuid(),
  paymentId: z.string().uuid(),
  paidAt: z.date(),
  amount: z.number(),
});

// Reminders
export const invoiceReminderDueSoonSchema = z.object({
  invoiceId: z.string().uuid(),
  dueDate: z.string(),
});

export const invoiceReminderDueTodaySchema = z.object({
  invoiceId: z.string().uuid(),
  dueDate: z.string(),
});

export const invoiceReminderOverdueSchema = z.object({
  invoiceId: z.string().uuid(),
  dueDate: z.string(),
  daysOverdue: z.number().int(),
});

export type InvoiceGenerated = BaseEvent & {
  type: 'InvoiceGenerated';
  payload: z.infer<typeof invoiceGeneratedSchema>;
};

export type InvoiceVersionCreated = BaseEvent & {
  type: 'InvoiceVersionCreated';
  payload: z.infer<typeof invoiceVersionCreatedSchema>;
};

export type InvoiceSent = BaseEvent & {
  type: 'InvoiceSent';
  payload: z.infer<typeof invoiceSentSchema>;
};

export type InvoiceViewed = BaseEvent & {
  type: 'InvoiceViewed';
  payload: z.infer<typeof invoiceViewedSchema>;
};

export type InvoiceMarkedOverdue = BaseEvent & {
  type: 'InvoiceMarkedOverdue';
  payload: z.infer<typeof invoiceMarkedOverdueSchema>;
};

export type InvoicePaid = BaseEvent & {
  type: 'InvoicePaid';
  payload: z.infer<typeof invoicePaidSchema>;
};

export type InvoiceReminderDueSoon = BaseEvent & {
  type: 'InvoiceReminderDueSoon';
  payload: z.infer<typeof invoiceReminderDueSoonSchema>;
};

export type InvoiceReminderDueToday = BaseEvent & {
  type: 'InvoiceReminderDueToday';
  payload: z.infer<typeof invoiceReminderDueTodaySchema>;
};

export type InvoiceReminderOverdue = BaseEvent & {
  type: 'InvoiceReminderOverdue';
  payload: z.infer<typeof invoiceReminderOverdueSchema>;
};

export type InvoiceEvent =
  | InvoiceGenerated
  | InvoiceVersionCreated
  | InvoiceSent
  | InvoiceViewed
  | InvoiceMarkedOverdue
  | InvoicePaid;

// ============================================================================
// Payment Events
// ============================================================================

export const bankStatementImportedSchema = z.object({
  importBatchId: z.string().uuid(),
  fileName: z.string(),
  recordCount: z.number().int().positive(),
  importedBy: z.string(),
  importedAt: z.date(),
});

export const paymentDetectedSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number(),
  paidAt: z.date(),
  reference: z.string().optional(),
  sourceFile: z.string(),
});

export const paymentMatchedSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  isAutoMatched: z.boolean(),
  matchCriteria: z.record(z.unknown()).optional(),
  matchedBy: z.string().optional(),
});

export const paymentConfirmedSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  confirmedBy: z.string(),
  confirmedByName: z.string(),
  confirmedAt: z.date(),
});

export const paymentRejectedSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string(),
  rejectedBy: z.string(),
  rejectedByName: z.string(),
  rejectedAt: z.date(),
});

export type BankStatementImported = BaseEvent & {
  type: 'BankStatementImported';
  payload: z.infer<typeof bankStatementImportedSchema>;
};

export type PaymentDetected = BaseEvent & {
  type: 'PaymentDetected';
  payload: z.infer<typeof paymentDetectedSchema>;
};

export type PaymentMatched = BaseEvent & {
  type: 'PaymentMatched';
  payload: z.infer<typeof paymentMatchedSchema>;
};

export type PaymentConfirmed = BaseEvent & {
  type: 'PaymentConfirmed';
  payload: z.infer<typeof paymentConfirmedSchema>;
};

export type PaymentRejected = BaseEvent & {
  type: 'PaymentRejected';
  payload: z.infer<typeof paymentRejectedSchema>;
};

export type PaymentEvent =
  | BankStatementImported
  | PaymentDetected
  | PaymentMatched
  | PaymentConfirmed
  | PaymentRejected;

// ============================================================================
// Messaging Events
// ============================================================================

export const lineMessageReceivedSchema = z.object({
  lineUserId: z.string(),
  lineMessageId: z.string(),
  content: z.string(),
  messageType: z.enum(['text', 'image', 'video', 'audio', 'file', 'sticker']),
  timestamp: z.date(),
});

export const conversationCreatedSchema = z.object({
  conversationId: z.string().uuid(),
  lineUserId: z.string(),
  tenantId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  createdAt: z.date(),
});

export const conversationLinkedSchema = z.object({
  conversationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  roomId: z.string().uuid(),
  linkedBy: z.string(),
});

export const messageStoredSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  content: z.string(),
  direction: z.enum(['INCOMING', 'OUTGOING']),
  messageType: z.enum(['text', 'image', 'sticker', 'system']),
  sentAt: z.date(),
});

export const adminReplySentSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  content: z.string(),
  sentBy: z.string(),
  sentByName: z.string(),
  lineMessageId: z.string().optional(),
  sentAt: z.date(),
});

export const lineMessageSentSchema = z.object({
  messageId: z.string().uuid(),
  lineMessageId: z.string(),
  recipientId: z.string(),
  messageType: z.string(),
  sentAt: z.date(),
});

export const reminderTriggeredSchema = z.object({
  reminderId: z.string().uuid(),
  type: z.enum(['INVOICE_REMINDER', 'PAYMENT_REMINDER', 'OVERDUE_NOTICE']),
  invoiceId: z.string().uuid(),
  tenantId: z.string().uuid(),
  scheduledFor: z.date(),
});

export type LineMessageReceived = BaseEvent & {
  type: 'LineMessageReceived';
  payload: z.infer<typeof lineMessageReceivedSchema>;
};

export type ConversationCreated = BaseEvent & {
  type: 'ConversationCreated';
  payload: z.infer<typeof conversationCreatedSchema>;
};

export type ConversationLinked = BaseEvent & {
  type: 'ConversationLinked';
  payload: z.infer<typeof conversationLinkedSchema>;
};

export type MessageStored = BaseEvent & {
  type: 'MessageStored';
  payload: z.infer<typeof messageStoredSchema>;
};

export type AdminReplySent = BaseEvent & {
  type: 'AdminReplySent';
  payload: z.infer<typeof adminReplySentSchema>;
};

export type LineMessageSent = BaseEvent & {
  type: 'LineMessageSent';
  payload: z.infer<typeof lineMessageSentSchema>;
};

export type ReminderTriggered = BaseEvent & {
  type: 'ReminderTriggered';
  payload: z.infer<typeof reminderTriggeredSchema>;
};

export type MessagingEvent =
  | LineMessageReceived
  | ConversationCreated
  | ConversationLinked
  | MessageStored
  | AdminReplySent
  | LineMessageSent
  | ReminderTriggered;

// ============================================================================
// System Events
// ============================================================================

export const setupCompletedSchema = z.object({
  completedBy: z.string(),
  completedAt: z.date(),
  buildingName: z.string(),
  totalFloors: z.number().int().positive(),
  totalRooms: z.number().int().positive(),
});

export const configChangedSchema = z.object({
  key: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  changedBy: z.string(),
  changedAt: z.date(),
});

export const auditLogCreatedSchema = z.object({
  auditLogId: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  userId: z.string(),
  userName: z.string(),
  details: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  createdAt: z.date(),
});

export const outboxEventFailedSchema = z.object({
  outboxEventId: z.string().uuid(),
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  retryCount: z.number().int(),
  lastError: z.string(),
  failedAt: z.date(),
});

export type SetupCompleted = BaseEvent & {
  type: 'SetupCompleted';
  payload: z.infer<typeof setupCompletedSchema>;
};

export type ConfigChanged = BaseEvent & {
  type: 'ConfigChanged';
  payload: z.infer<typeof configChangedSchema>;
};

export type AuditLogCreated = BaseEvent & {
  type: 'AuditLogCreated';
  payload: z.infer<typeof auditLogCreatedSchema>;
};

export type OutboxEventFailed = BaseEvent & {
  type: 'OutboxEventFailed';
  payload: z.infer<typeof outboxEventFailedSchema>;
};

export type SystemEvent =
  | SetupCompleted
  | ConfigChanged
  | AuditLogCreated
  | OutboxEventFailed;

// ============================================================================
// Room Events
// ============================================================================

export const roomCreatedSchema = z.object({
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  floorId: z.string().uuid(),
  floorNumber: z.number().int(),
  buildingId: z.string().uuid(),
  capacity: z.number().int(),
  createdBy: z.string().optional(),
});

export const roomUpdatedSchema = z.object({
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  changes: z.record(z.string(), z.object({ old: z.unknown(), new: z.unknown() })),
  updatedBy: z.string().optional(),
});

export const roomStatusChangedSchema = z.object({
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  previousStatus: z.enum(['VACANT', 'OCCUPIED', 'MAINTENANCE']),
  newStatus: z.enum(['VACANT', 'OCCUPIED', 'MAINTENANCE']),
  reason: z.string().optional(),
  changedBy: z.string().optional(),
});

export type RoomCreated = BaseEvent & {
  type: 'RoomCreated';
  payload: z.infer<typeof roomCreatedSchema>;
};

export type RoomUpdated = BaseEvent & {
  type: 'RoomUpdated';
  payload: z.infer<typeof roomUpdatedSchema>;
};

export type RoomStatusChanged = BaseEvent & {
  type: 'RoomStatusChanged';
  payload: z.infer<typeof roomStatusChangedSchema>;
};

export type RoomEvent = RoomCreated | RoomUpdated | RoomStatusChanged;

// ============================================================================
// Floor Events
// ============================================================================

export const floorCreatedSchema = z.object({
  floorId: z.string().uuid(),
  floorNumber: z.number().int(),
  buildingId: z.string().uuid(),
  roomCount: z.number().int(),
  createdBy: z.string().optional(),
});

export type FloorCreated = BaseEvent & {
  type: 'FloorCreated';
  payload: z.infer<typeof floorCreatedSchema>;
};

export type FloorEvent = FloorCreated;

// ============================================================================
// Building Events
// ============================================================================

export const buildingCreatedSchema = z.object({
  buildingId: z.string().uuid(),
  name: z.string(),
  address: z.string(),
  totalFloors: z.number().int(),
  createdBy: z.string().optional(),
});

export type BuildingCreated = BaseEvent & {
  type: 'BuildingCreated';
  payload: z.infer<typeof buildingCreatedSchema>;
};

export type BuildingEvent = BuildingCreated;

// ============================================================================
// Tenant Events
// ============================================================================

export const tenantCreatedSchema = z.object({
  tenantId: z.string().uuid(),
  fullName: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  lineUserId: z.string().optional(),
  createdBy: z.string().optional(),
});

export const tenantUpdatedSchema = z.object({
  tenantId: z.string().uuid(),
  fullName: z.string(),
  changes: z.record(z.string(), z.object({ old: z.unknown(), new: z.unknown() })),
  updatedBy: z.string().optional(),
});

export const tenantAssignedToRoomSchema = z.object({
  tenantId: z.string().uuid(),
  fullName: z.string(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  role: z.enum(['PRIMARY', 'SECONDARY']),
  moveInDate: z.string(),
  assignedBy: z.string().optional(),
});

export const tenantRemovedFromRoomSchema = z.object({
  tenantId: z.string().uuid(),
  fullName: z.string(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  role: z.enum(['PRIMARY', 'SECONDARY']),
  moveOutDate: z.string(),
  removedBy: z.string().optional(),
});

export const tenantLineLinkedSchema = z.object({
  tenantId: z.string().uuid(),
  fullName: z.string(),
  lineUserId: z.string(),
  linkedBy: z.string().optional(),
});

export type TenantCreated = BaseEvent & {
  type: 'TenantCreated';
  payload: z.infer<typeof tenantCreatedSchema>;
};

export type TenantUpdated = BaseEvent & {
  type: 'TenantUpdated';
  payload: z.infer<typeof tenantUpdatedSchema>;
};

export type TenantAssignedToRoom = BaseEvent & {
  type: 'TenantAssignedToRoom';
  payload: z.infer<typeof tenantAssignedToRoomSchema>;
};

export type TenantRemovedFromRoom = BaseEvent & {
  type: 'TenantRemovedFromRoom';
  payload: z.infer<typeof tenantRemovedFromRoomSchema>;
};

export type TenantLineLinked = BaseEvent & {
  type: 'TenantLineLinked';
  payload: z.infer<typeof tenantLineLinkedSchema>;
};

export type TenantEvent = 
  | TenantCreated 
  | TenantUpdated 
  | TenantAssignedToRoom 
  | TenantRemovedFromRoom 
  | TenantLineLinked;

// ============================================================================
// Contract Events
// ============================================================================

export const contractCreatedSchema = z.object({
  contractId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  rentAmount: z.number(),
  depositAmount: z.number(),
  createdBy: z.string().optional(),
});

export const contractRenewedSchema = z.object({
  contractId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  oldEndDate: z.string(),
  newEndDate: z.string(),
  newRentAmount: z.number().optional(),
  newDepositAmount: z.number().optional(),
  renewedBy: z.string().optional(),
});

export const contractTerminatedSchema = z.object({
  contractId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  terminationDate: z.string(),
  terminationReason: z.string().optional(),
  terminatedBy: z.string().optional(),
});

export const contractExpiredSchema = z.object({
  contractId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomNumber: z.string(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  endDate: z.string(),
});

export type ContractCreated = BaseEvent & {
  type: 'ContractCreated';
  payload: z.infer<typeof contractCreatedSchema>;
};

export type ContractRenewed = BaseEvent & {
  type: 'ContractRenewed';
  payload: z.infer<typeof contractRenewedSchema>;
};

export type ContractTerminated = BaseEvent & {
  type: 'ContractTerminated';
  payload: z.infer<typeof contractTerminatedSchema>;
};

export type ContractExpired = BaseEvent & {
  type: 'ContractExpired';
  payload: z.infer<typeof contractExpiredSchema>;
};

export type ContractEvent = 
  | ContractCreated 
  | ContractRenewed 
  | ContractTerminated 
  | ContractExpired;

// ============================================================================
// Union of all Events
// ============================================================================

export type DomainEvent =
  | BillingEvent
  | InvoiceEvent
  | PaymentEvent
  | MessagingEvent
  | SystemEvent
  | RoomEvent
  | FloorEvent
  | BuildingEvent
  | TenantEvent
  | ContractEvent;

// ============================================================================
// Event Type Constants
// ============================================================================

export const EventTypes = {
  // Billing
  BILLING_RECORD_CREATED: 'BillingRecordCreated',
  BILLING_ITEM_ADDED: 'BillingItemAdded',
  BILLING_ITEM_UPDATED: 'BillingItemUpdated',
  BILLING_ITEM_REMOVED: 'BillingItemRemoved',
  BILLING_LOCKED: 'BillingLocked',
  BILLING_UNLOCKED: 'BillingUnlocked',
  INVOICE_GENERATION_REQUESTED: 'InvoiceGenerationRequested',

  // Invoice
  INVOICE_GENERATED: 'InvoiceGenerated',
  INVOICE_VERSION_CREATED: 'InvoiceVersionCreated',
  INVOICE_SENT: 'InvoiceSent',
  INVOICE_VIEWED: 'InvoiceViewed',
  INVOICE_MARKED_OVERDUE: 'InvoiceMarkedOverdue',
  INVOICE_PAID: 'InvoicePaid',
  INVOICE_REMINDER_DUE_SOON: 'InvoiceReminderDueSoon',
  INVOICE_REMINDER_DUE_TODAY: 'InvoiceReminderDueToday',
  INVOICE_REMINDER_OVERDUE: 'InvoiceReminderOverdue',

  // Payment
  BANK_STATEMENT_IMPORTED: 'BankStatementImported',
  PAYMENT_DETECTED: 'PaymentDetected',
  PAYMENT_MATCHED: 'PaymentMatched',
  PAYMENT_CONFIRMED: 'PaymentConfirmed',
  PAYMENT_REJECTED: 'PaymentRejected',

  // Messaging
  LINE_MESSAGE_RECEIVED: 'LineMessageReceived',
  CONVERSATION_CREATED: 'ConversationCreated',
  CONVERSATION_LINKED: 'ConversationLinked',
  MESSAGE_STORED: 'MessageStored',
  ADMIN_REPLY_SENT: 'AdminReplySent',
  LINE_MESSAGE_SENT: 'LineMessageSent',
  REMINDER_TRIGGERED: 'ReminderTriggered',

  // System
  SETUP_COMPLETED: 'SetupCompleted',
  CONFIG_CHANGED: 'ConfigChanged',
  AUDIT_LOG_CREATED: 'AuditLogCreated',
  OUTBOX_EVENT_FAILED: 'OutboxEventFailed',

  // Room
  ROOM_CREATED: 'RoomCreated',
  ROOM_UPDATED: 'RoomUpdated',
  ROOM_STATUS_CHANGED: 'RoomStatusChanged',

  // Floor
  FLOOR_CREATED: 'FloorCreated',

  // Building
  BUILDING_CREATED: 'BuildingCreated',

  // Tenant
  TENANT_CREATED: 'TenantCreated',
  TENANT_UPDATED: 'TenantUpdated',
  TENANT_ASSIGNED_TO_ROOM: 'TenantAssignedToRoom',
  TENANT_REMOVED_FROM_ROOM: 'TenantRemovedFromRoom',
  TENANT_LINE_LINKED: 'TenantLineLinked',

  // Contract
  CONTRACT_CREATED: 'ContractCreated',
  CONTRACT_RENEWED: 'ContractRenewed',
  CONTRACT_TERMINATED: 'ContractTerminated',
  CONTRACT_EXPIRED: 'ContractExpired',
  CONTRACT_EXPIRING_SOON: 'ContractExpiringSoon',

  // Registration
  REGISTRATION_APPROVED: 'RegistrationApproved',

  // MoveOut
  MOVE_OUT_CONFIRMED: 'MoveOutConfirmed',
} as const;

// ============================================================================
// Event Handler Types
// ============================================================================

export type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T
) => Promise<void>;

export type EventHandlerMap = Map<string, EventHandler[]>;
