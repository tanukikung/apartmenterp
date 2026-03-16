# Apartment ERP - Domain Event Flow

## Overview

This document defines the domain event flows for the Apartment ERP system. All cross-module communication uses domain events to maintain loose coupling between services.

---

## 1. Event Architecture

### 1.1 Event Structure

```typescript
interface DomainEvent {
  id: string;                    // UUID
  type: string;                  // Event type name
  aggregateType: string;          // Entity type
  aggregateId: string;            // Entity ID
  payload: Record<string, any>;  // Event data
  metadata: {
    correlationId: string;        // For tracing
    causationId: string;         // Previous event ID
    userId: string;              // Who triggered
    timestamp: Date;             // When occurred
    version: number;             // Event version
  };
}
```

### 1.2 Event Producers & Consumers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVENT FLOW ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Billing   │     │   Invoice   │     │  Payment   │     │ Messaging   │
  │   Service   │     │   Service   │     │   Service  │     │   Service   │
  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
         │                   │                   │                   │
         │  Domain Events    │  Domain Events    │  Domain Events    │
         ▼                   ▼                   ▼                   ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        Event Bus (In-Memory)                            │
  │              (Can be replaced with message queue for scale)             │
  └─────────────────────────────────────────────────────────────────────────┘
         │                   │                   │                   │
         │                   │                   │                   │
         ▼                   ▼                   ▼                   ▼
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │  Listeners  │     │  Listeners  │     │  Listeners  │     │  Listeners  │
  │             │     │             │     │             │     │             │
  │ - Invoice   │     │ - Audit    │     │ - Invoice   │     │ - LINE API  │
  │ - Audit     │     │ - Analytics│     │ - Audit     │     │ - Audit     │
  │ - Analytics│     │ - Notif    │     │ - Analytics│     │ - Analytics │
  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## 2. Billing Lifecycle

### 2.1 Event Sequence Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        BILLING LIFECYCLE                                      │
└──────────────────────────────────────────────────────────────────────────────┘

   Admin              Billing Service          Event Bus              Listeners
     │                      │                     │                        │
     │  Create Billing      │                     │                        │
     │─────────────────────▶│                     │                        │
     │                      │                     │                        │
     │                      │ BillingRecordCreated │                        │
     │                      │─────────────────────▶│                        │
     │                      │                     │                        │
     │                      │                     │──▶ AuditService        │
     │                      │                     │──▶ AnalyticsService    │
     │                      │                     │                        │
     │  Update Items        │                     │                        │
     │─────────────────────▶│                     │                        │
     │                      │                     │                        │
     │                      │ BillingItemUpdated  │                        │
     │                      │─────────────────────▶│                        │
     │                      │                     │                        │
     │                      │                     │──▶ AuditService       │
     │                      │                     │     (logs old/new)    │
     │                      │                     │                        │
     │  Lock Billing        │                     │                        │
     │─────────────────────▶│                     │                        │
     │                      │                     │                        │
     │                      │ BillingLocked       │                        │
     │                      │─────────────────────▶│                        │
     │                      │                     │                        │
     │                      │                     │──▶ AuditService       │
     │                      │                     │──▶ InvoiceService     │
     │                      │                     │     (triggers gen)    │
     │                      │                     │                        │
     │                      │ InvoiceGenerationRequested                   │
     │                      │─────────────────────▶│                        │
     │                      │                     │                        │
     │◀─────────────────────│                      │                        │
     │   (success/error)    │                     │                        │
```

### 2.2 Events

| Event | Producer | Payload | Consumers |
|-------|----------|---------|-----------|
| `BillingRecordCreated` | BillingService | `{ roomId, year, month, billingDay, dueDay, overdueDay }` | AuditService, AnalyticsService |
| `BillingItemUpdated` | BillingService | `{ billingRecordId, itemId, oldValue, newValue, field, adminId }` | AuditService |
| `BillingLocked` | BillingService | `{ billingRecordId, lockedBy }` | AuditService, InvoiceService |
| `InvoiceGenerationRequested` | BillingService | `{ billingRecordId, requestedBy }` | InvoiceService |

### 2.3 State Transitions

```
┌─────────┐    BillingRecordCreated    ┌─────────┐    BillingLocked     ┌─────────┐
│  NONE   │ ─────────────────────────▶ │  DRAFT  │ ────────────────────▶ │ LOCKED │
└─────────┘                            └─────────┘                       └─────────┘
                                                                              │
                                                                              │ InvoiceGenerated
                                                                              ▼
                                                                       ┌─────────────┐
                                                                       │  INVOICED  │
                                                                       └─────────────┘
```

---

## 3. Invoice Lifecycle

### 3.1 Event Sequence Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        INVOICE LIFECYCLE                                      │
└──────────────────────────────────────────────────────────────────────────────┘

   Billing             Invoice              Event Bus              Listeners
   Service            Service                                          │
     │                  │                     │                        │
     │ InvoiceGenReq    │                     │                        │
     │─────────────────▶│                     │                        │
     │                  │                     │                        │
     │                  │ InvoiceGenerated    │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AuditService       │
     │                  │                     │──▶ InvoiceVersionCreated│
     │                  │                     │──▶ AnalyticsService   │
     │                  │                     │                        │
     │                  │ InvoiceVersionCreated                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │                        │
     │                  │  Send Invoice        │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │ InvoiceSent         │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AuditService       │
     │                  │                     │──▶ MessagingService   │
     │                  │                     │     (sends LINE)       │
     │                  │                     │──▶ AnalyticsService   │
     │                  │                     │                        │
     │                  │ LINEMessageSent     │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │                        │
     │  (tenant views)  │                     │                        │
     │─────────────────▶│                     │                        │
     │                  │ InvoiceViewed       │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AuditService       │
```

### 3.2 Events

| Event | Producer | Payload | Consumers |
|-------|----------|---------|-----------|
| `InvoiceGenerated` | InvoiceService | `{ invoiceId, roomId, billingRecordId, year, month, version, total }` | AuditService, AnalyticsService |
| `InvoiceVersionCreated` | InvoiceService | `{ invoiceVersionId, invoiceId, version, billingSnapshot }` | AuditService |
| `InvoiceSent` | InvoiceService | `{ invoiceId, sentTo, sentBy, lineMessageId }` | AuditService, MessagingService, AnalyticsService |
| `InvoiceViewed` | InvoiceService | `{ invoiceId, viewedAt }` | AuditService |
| `InvoiceMarkedOverdue` | InvoiceService (scheduler) | `{ invoiceId, daysOverdue }` | AuditService, MessagingService |
| `InvoicePaid` | PaymentService | `{ invoiceId, paymentId, paidAt }` | AuditService, AnalyticsService |

### 3.3 State Transitions

```
┌────────┐    InvoiceGenerated     ┌───────────┐    InvoiceSent     ┌────────┐
│ DRAFT  │ ────────────────────▶ │ GENERATED │ ──────────────────▶ │  SENT  │
└────┬───┘                       └─────┬─────┘                     └───┬────┘
     │                                   │                               │
     │                                   │ Tenant views                   │
     │                                   ▼                               ▼
     │                             ┌───────────┐                   ┌────────┐
     │                             │  VIEWED  │◀───────────────────│  SENT  │
     │                             └─────┬─────┘                   └───┬────┘
     │                                   │                               │
     │                                   │ Payment confirmed              │ Overdue
     │                                   ▼                               ▼
     │                             ┌─────────┐                     ┌──────────┐
     │                             │  PAID   │                     │ OVERDUE │
     │                             └─────────┘                     └──────────┘
```

### 3.4 Invoice Versioning Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     INVOICE VERSIONING FLOW                                   │
└──────────────────────────────────────────────────────────────────────────────┘

  Month: 2026-03

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │ Invoice v1  │     │ Invoice v2  │     │ Invoice v3  │
  │   SENT      │────▶│  GENERATED  │────▶│  GENERATED  │
  └─────────────┘     └──────┬──────┘     └──────┬──────┘
                             │                    │
                             │ BillingChanged     │
                             │ (detected)         │
                             │                    │
                             ▼                    ▼
                      ┌─────────────┐     ┌─────────────┐
                      │ InvoiceChange│     │ InvoiceChange│
                      │  record 1   │     │  record 2   │
                      └─────────────┘     └─────────────┘

  Events:
  - InvoiceRegenerated: { oldInvoiceId, newInvoiceId, changes[] }
  - InvoiceChangeDetected: { invoiceId, field, oldValue, newValue }
  - InvoiceRegenConfirmationRequired: { invoiceId, changes[] }
```

---

## 4. Payment Lifecycle

### 4.1 Event Sequence Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT LIFECYCLE                                      │
└──────────────────────────────────────────────────────────────────────────────┘

   Admin              Payment              Event Bus              Listeners
     │               Service                                          │
     │                  │                     │                        │
     │  Upload Bank     │                     │                        │
     │  Statement       │                     │                        │
     │─────────────────▶│                     │                        │
     │                  │                     │                        │
     │                  │ BankStatementImported                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AuditService       │
     │                  │                     │     (import log)      │
     │                  │                     │                        │
     │                  │ PaymentDetected     │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ PaymentMatchingService
     │                  │                     │     (auto-match)      │
     │                  │                     │                        │
     │                  │ PaymentMatched      │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AuditService       │
     │                  │                     │──▶ InvoiceService     │
     │                  │                     │     (pending status)  │
     │                  │                     │                        │
     │  Confirm         │                     │                        │
     │  Payment         │                     │                        │
     │─────────────────▶│                     │                        │
     │                  │                     │                        │
     │                  │ PaymentConfirmed    │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AuditService       │
     │                  │                     │──▶ InvoiceService     │
     │                  │                     │     (marks paid)       │
     │                  │                     │                        │
     │                  │ InvoiceMarkedPaid   │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AnalyticsService   │
     │                  │                     │                        │
     │◀─────────────────│                      │                        │
     │   (success)      │                     │                        │
```

### 4.2 Events

| Event | Producer | Payload | Consumers |
|-------|----------|---------|-----------|
| `BankStatementImported` | PaymentService | `{ fileName, recordCount, importBatchId }` | AuditService |
| `PaymentDetected` | PaymentService | `{ paymentId, amount, paidAt, reference }` | PaymentMatchingService |
| `PaymentMatched` | PaymentMatchingService | `{ paymentId, invoiceId, confidence, isAutoMatched }` | AuditService, InvoiceService |
| `PaymentConfirmed` | PaymentService | `{ paymentId, invoiceId, confirmedBy }` | AuditService, InvoiceService |
| `InvoiceMarkedPaid` | InvoiceService | `{ invoiceId, paymentId, paidAt }` | AuditService, AnalyticsService |
| `PaymentRejected` | PaymentService | `{ paymentId, reason, rejectedBy }` | AuditService |

### 4.3 State Transitions

```
┌─────────┐    BankStatementImported    ┌─────────┐    PaymentMatched    ┌─────────┐
│  NONE   │ ──────────────────────────▶ │ PENDING │ ───────────────────▶ │ MATCHED │
└─────────┘                              └────┬────┘                       └────┬────┘
                                                │                             │
                                                │ Admin confirms              │ Admin rejects
                                                ▼                             ▼
                                         ┌───────────┐                ┌───────────┐
                                         │ CONFIRMED │                │ REJECTED  │
                                         └─────┬─────┘                └───────────┘
                                               │
                                               │ Invoice updated
                                               ▼
                                         ┌───────────┐
                                         │   PAID    │
                                         │ (invoice) │
                                         └───────────┘
```

### 4.4 Auto-Match Rules

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     AUTO-MATCH RULES                                         │
└──────────────────────────────────────────────────────────────────────────────┘

  Confidence Levels:

  HIGH   │ Exact amount match + exact date match
         │ Exact amount match + date within ±3 days
  ───────┼────────────────────────────────────────────────────
  MEDIUM │ Exact amount match + date within ±7 days
         │ Amount within 5% + exact date match
  ───────┼────────────────────────────────────────────────────
  LOW    │ Amount within 10% + date within ±14 days
         │ Any other potential match (manual review required)

  Auto-match only triggers for HIGH confidence matches.
  MEDIUM/LOW confidence requires manual confirmation.
```

---

## 5. LINE Messaging Lifecycle

### 5.1 Event Sequence Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    LINE MESSAGING LIFECYCLE                                  │
└──────────────────────────────────────────────────────────────────────────────┘

   LINE                 Webhook              Event Bus              Listeners
  Platform             Handler                                          │
     │                    │                     │                        │
     │  Invoice event     │                     │                        │
     │───────────────────▶│                     │                        │
     │                    │                     │                        │
     │                    │ InvoiceSent         │                        │
     │                    │────────────────────▶│                        │
     │                    │                     │                        │
     │                    │                     │──▶ MessagingService    │
     │                    │                     │     (prepare message)  │
     │                    │                     │                        │
     │                    │ LINEMessagePrepared                        │
     │                    │────────────────────▶│                        │
     │                    │                     │                        │
     │                    │                     │──▶ LineAPIClient       │
     │                    │                     │     (send to LINE)    │
     │                    │                     │                        │
     │  Message sent      │                     │                        │
     │◀───────────────────│                     │                        │
     │                    │ LINEMessageSent     │                        │
     │                    │────────────────────▶│                        │
     │                    │                     │                        │
     │                    │                     │──▶ AuditService        │
     │                    │                     │──▶ AnalyticsService    │
```

### 5.2 Events

| Event | Producer | Payload | Consumers |
|-------|----------|---------|-----------|
| `InvoiceSent` | InvoiceService | `{ invoiceId, tenantId }` | MessagingService |
| `LINEMessagePrepared` | MessagingService | `{ messageId, recipientId, content, type }` | LineAPIClient |
| `LINEMessageSent` | LineAPIClient | `{ messageId, lineMessageId, sentAt }` | AuditService, AnalyticsService |
| `LINEMessageFailed` | LineAPIClient | `{ messageId, error, retryCount }` | RetryHandler |

### 5.3 Reminder Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      REMINDER FLOW                                           │
└──────────────────────────────────────────────────────────────────────────────┘

  Scheduler           Event Bus              Listeners
     │                    │                        │
     │  (cron: daily)     │                        │
     │                    │                        │
     │                    │ ReminderTriggered      │
     │                    │─────────────────────▶ │
     │                    │                        │
     │                    │──▶ MessagingService    │
     │                    │     (prepare reminder) │
     │                    │                        │
     │                    │ ReminderMessagePrepared                  │
     │                    │─────────────────────▶ │
     │                    │                        │
     │                    │──▶ LineAPIClient       │
     │                    │     (send to LINE)    │
     │                    │                        │
     │                    │ ReminderMessageSent   │
     │                    │─────────────────────▶ │
     │                    │                        │
     │                    │──▶ AuditService       │
     │                    │──▶ AnalyticsService   │
```

| Event | Producer | Payload | Consumers |
|-------|----------|---------|-----------|
| `ReminderTriggered` | Scheduler | `{ type: INVOICE_REMINDER | PAYMENT_REMINDER, invoiceId, tenantId }` | MessagingService |
| `ReminderMessageSent` | LineAPIClient | `{ notificationId, lineMessageId }` | AuditService, AnalyticsService |

---

## 6. Chat Messaging Lifecycle

### 6.1 Event Sequence Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      CHAT MESSAGING LIFECYCLE                                │
└──────────────────────────────────────────────────────────────────────────────┘

   LINE              Webhook              Event Bus              Listeners
  Platform          Handler                                          │
     │                  │                     │                        │
     │  User sends      │                     │                        │
     │  message         │                     │                        │
     │─────────────────▶│                     │                        │
     │                  │                     │                        │
     │                  │ (verify signature)   │                        │
     │                  │                     │                        │
     │                  │ LineMessageReceived │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ ConversationService │
     │                  │                     │     (find/create conv)  │
     │                  │                     │                        │
     │                  │ ConversationCreated │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ MessageService      │
     │                  │                     │     (store message)    │
     │                  │                     │                        │
     │                  │ MessageStored      │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AuditService       │
     │                  │                     │──▶ AnalyticsService   │
     │                  │                     │                        │
     │                  │                     │                        │
     │                  │  (reply from admin) │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │ AdminReplySent     │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ LineAPIClient       │
     │                  │                     │     (send reply)      │
     │                  │                     │                        │
     │  Reply sent      │                     │                        │
     │◀─────────────────│                     │                        │
     │                  │ LINEMessageSent     │                        │
     │                  │────────────────────▶│                        │
     │                  │                     │                        │
     │                  │                     │──▶ AuditService       │
```

### 6.2 Events

| Event | Producer | Payload | Consumers |
|-------|----------|---------|-----------|
| `LineMessageReceived` | WebhookHandler | `{ lineUserId, lineMessageId, content, type, timestamp }` | ConversationService |
| `ConversationCreated` | ConversationService | `{ conversationId, lineUserId, tenantId?, roomId? }` | MessageService |
| `MessageStored` | MessageService | `{ messageId, conversationId, content, direction }` | AuditService, AnalyticsService |
| `ConversationLinked` | ConversationService | `{ conversationId, tenantId, roomId }` | AuditService |
| `AdminReplySent` | MessagingService | `{ conversationId, messageId, content }` | AuditService |

---

## 7. Service Interaction Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE INTERACTION MAP                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────┐
                    │              Billing Service                │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │ • Create billing records               │ │
                    │  │ • Update billing items                  │ │
                    │  │ • Lock billing                          │ │
                    │  │ • Calculate totals                      │ │
                    │  └─────────────────────────────────────────┘ │
                    │                     │                         │
                    │    Events:          │    Events:              │
                    │    - BillingRecordCreated                    │
                    │    - BillingItemUpdated ◄─────────────────┐  │
                    │    - BillingLocked                         │  │
                    │                                             │  │
                    └─────────────────────┬───────────────────────┘  │
                                          │                          │
                    ┌─────────────────────┴───────────────────────┐  │
                    │            Invoice Service                   │  │
                    │  ┌─────────────────────────────────────────┐ │  │
                    │  │ • Generate invoices                     │ │  │
                    │  │ • Manage versions                       │ │  │
                    │  │ • Track status                          │ │  │
                    │  │ • Detect changes                        │ │  │
                    │  └─────────────────────────────────────────┘ │  │
                    │                     │                         │  │
                    │    Events:          │    Events:              │  │
                    │    - InvoiceGenerated                       │  │
                    │    - InvoiceVersionCreated ────────────────┐ │  │
                    │    - InvoiceSent ────────────────────────┐ │ │  │
                    │    - InvoiceViewed ◄──────────────────────┘ │ │  │
                    │    - InvoiceMarkedOverdue                  │ │  │
                    │    - InvoicePaid ◄─────────────────────────┘ │  │
                    │                                             │  │
                    └─────────────────────┬───────────────────────┘  │
                                          │                          │
                    ┌─────────────────────┴───────────────────────┐  │
                    │            Payment Service                   │  │
                    │  ┌─────────────────────────────────────────┐ │  │
                    │  │ • Import bank statements                │ │  │
                    │  │ • Match payments                        │ │  │
                    │  │ • Confirm/reject                        │ │  │
                    │  └─────────────────────────────────────────┘ │  │
                    │                     │                         │  │
                    │    Events:          │    Events:              │  │
                    │    - BankStatementImported                    │  │
                    │    - PaymentDetected ◄──────────────────────┘  │
                    │    - PaymentMatched ◄────────────────────────┐  │
                    │    - PaymentConfirmed ◄───────────────────────┘  │
                    │    - PaymentRejected                           │  │
                    │                                             │  │
                    └─────────────────────┬───────────────────────┘  │
                                          │                          │
                    ┌─────────────────────┴───────────────────────┐  │
                    │           Messaging Service                   │  │
                    │  ┌─────────────────────────────────────────┐ │  │
                    │  │ • Send LINE messages                   │ │  │
                    │  │ • Handle incoming messages              │ │  │
                    │  │ • Manage conversations                  │ │  │
                    │  │ • Schedule reminders                    │ │  │
                    │  └─────────────────────────────────────────┘ │  │
                    │                     │                         │  │
                    │    Events:          │    Events:              │  │
                    │    - LINEMessagePrepared ◄──────────────────┘  │
                    │    - LINEMessageSent ◄────────────────────────┐  │
                    │    - ReminderTriggered ◄──────────────────────┘  │
                    │                                             │  │
                    └─────────────────────┬───────────────────────┘  │
                                          │                          │
                    ┌─────────────────────┴───────────────────────┐  │
                    │            Audit Service (Consumer)          │  │
                    │  ┌─────────────────────────────────────────┐ │  │
                    │  │ • Log all actions                       │ │  │
                    │  │ • Query audit trail                     │ │  │
                    │  └─────────────────────────────────────────┘ │  │
                    │                                             │  │
                    └─────────────────────────────────────────────┘  │

  ┌─────────────────────────────────────────────────────────────────────┐
  │                     CROSS-CUTTING CONSUMERS                          │
  ├─────────────────────────────────────────────────────────────────────┤
  │  AuditService      - All events with audit flag                    │
  │  AnalyticsService  - Billing, Invoice, Payment events              │
  │  NotificationSvc   - Reminder, overdue events                       │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Retry & Failure Handling

### 8.1 Retry Rules

| Operation | Max Retries | Backoff | Failure Action |
|-----------|-------------|---------|-----------------|
| LINE API Send | 3 | Exponential (1s, 2s, 4s) | Mark as FAILED, log error |
| LINE Webhook Verify | 1 | None | Reject message |
| Payment Import | 1 | None | Keep as PENDING |
| Invoice Generation | 3 | Exponential | Return error to admin |
| Database Write | 3 | Exponential | Rollback, alert |

### 8.2 Failure Handling Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       RETRY HANDLING FLOW                                    │
└──────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐
  │  Operation  │
  │   Fails     │
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐     Yes     ┌─────────────┐
  │ Retry       │────────────▶│ Max retries │──▶ Failure Handler
  │ available?  │             │ exceeded?   │
  └──────┬──────┘             └──────┬──────┘
         │ No                       │
         ▼                          ▼
  ┌─────────────┐            ┌─────────────┐
  │ Execute     │            │ Log failure │
  │ retry       │            │ Alert admin │
  │ (backoff)   │            │ Mark entity │
  └─────────────┘            │ as FAILED   │
                             └─────────────┘

  Retry Strategy:
  - Exponential backoff: 1s → 2s → 4s → 8s → 16s
  - Circuit breaker after 5 consecutive failures
  - Dead letter queue for failed messages
```

### 8.3 Idempotency

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         IDEMPOTENCY KEYS                                      │
└──────────────────────────────────────────────────────────────────────────────┘

  All events include idempotency key:
  {
    idempotencyKey: "${aggregateId}-${eventType}-${payloadHash}"
  }

  Duplicate events with same key are:
  1. Detected by checking event store
  2. Silently ignored
  3. Original event result returned

  This applies to:
  - LINE message sends
  - Invoice generation
  - Payment matching
  - Notification sends
```

---

## 9. Outbox Pattern

### 9.1 Why Outbox?

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    PROBLEM: DUAL WRITE                                       │
└──────────────────────────────────────────────────────────────────────────────┘

  Without Outbox:                    With Outbox:
  ┌──────────┐                      ┌──────────┐
  │  Update  │                      │  Update  │
  │  DB      │                      │  DB      │
  └────┬─────┘                      └────┬─────┘
       │                                   │
       ▼                                   ▼
  ┌──────────┐                      ┌──────────┐
  │  Send     │                      │  Write   │
  │  Event    │                      │  Outbox  │
  │  (may     │                      │  Table   │
  │   fail!)  │                      └────┬─────┘
  └────┬─────┘                             │
       │                                   ▼
       ▼                             ┌──────────┐
  ❌ Data                            │  Async   │
  inconsistency                      │  Worker  │
                                     │  reads   │
                                     │  outbox  │
                                     │  sends  │
                                     │  event  │
                                     └────┬─────┘
                                          ▼
                                     ✅ Consistent
```

### 9.2 Implementation

```typescript
// Outbox Table
model OutboxEvent {
  id            String   @id @default(uuid())
  aggregateType String
  aggregateId   String
  eventType     String
  payload       Json
  createdAt    DateTime @default(now())
  processedAt   DateTime?
  retryCount   Int      @default(0)
  lastError    String?

  @@index([processedAt])
  @@map("outbox_events")
}
```

### 9.3 Outbox Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         OUTBOX PATTERN FLOW                                   │
└──────────────────────────────────────────────────────────────────────────────┘

  Service              Outbox Table          Event Bus           Consumer
     │                      │                     │                    │
     │  Transaction        │                     │                    │
     │  ┌─────────────┐     │                     │                    │
     │  │ Update DB   │     │                     │                    │
     │  └──────┬──────┘     │                     │                    │
     │         │            │                     │                    │
     │         ▼            │                     │                    │
     │  ┌─────────────┐     │                     │                    │
     │  │ Write to    │     │                     │                    │
     │  │ Outbox      │     │                     │                    │
     │  └──────┬──────┘     │                     │                    │
     │         │            │                     │                    │
     │         ▼            │                     │                    │
     │  ┌─────────────┐     │                     │                    │
     │  │ Commit      │     │                     │                    │
     │  │ Transaction │     │                     │                    │
     │  └──────┬──────┘     │                     │                    │
     │         │            │                     │                    │
     │◀────────┘            │                     │                    │
     │                      │                     │                    │
     │                      │  (async)            │                    │
     │                      │                     │                    │
     │                      │  Poll unprocessed   │                    │
     │                      │◀────────────────────│                    │
     │                      │                     │                    │
     │                      │  Read events         │                    │
     │                      │─────────────────────▶│                    │
     │                      │                     │                    │
     │                      │                     │ Publish to          │
     │                      │                     │ Event Bus           │
     │                      │                     │────────────────────▶│
     │                      │                     │                    │
     │                      │                     │                    │
     │                      │  Mark processed     │                    │
     │                      │◀────────────────────│                    │
     │                      │                     │                    │
```

### 9.4 Outbox Worker

```typescript
// Cron job every 5 seconds
async function processOutbox() {
  const events = await prisma.outboxEvent.findMany({
    where: { processedAt: null },
    take: 100, // Process in batches
    orderBy: { createdAt: 'asc' }
  });

  for (const event of events) {
    try {
      await eventBus.publish(event);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() }
      });
    } catch (error) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          retryCount: { increment: 1 },
          lastError: error.message
        }
      });
    }
  }
}
```

---

## 10. Event Summary

| Domain | Events Produced | Events Consumed |
|--------|----------------|-----------------|
| Billing | `BillingRecordCreated`, `BillingItemUpdated`, `BillingLocked` | - |
| Invoice | `InvoiceGenerated`, `InvoiceVersionCreated`, `InvoiceSent`, `InvoiceViewed`, `InvoiceMarkedOverdue`, `InvoicePaid` | `BillingLocked` |
| Payment | `BankStatementImported`, `PaymentDetected`, `PaymentMatched`, `PaymentConfirmed`, `PaymentRejected` | - |
| Messaging | `LINEMessagePrepared`, `LINEMessageSent`, `ReminderMessageSent` | `InvoiceSent`, `InvoiceMarkedOverdue` |
| Conversation | `LineMessageReceived`, `ConversationCreated`, `MessageStored`, `AdminReplySent` | - |
| Audit | - | All events |
| Analytics | - | Billing, Invoice, Payment events |

---

## 11. Implementation Notes

1. **Event Store**: Use database table for event storage (outbox pattern)
2. **Event Bus**: In-memory for MVP, swap for RabbitMQ/Kafka for scale
3. **Idempotency**: Always check for duplicate events
4. **Ordering**: Events for same aggregate must preserve order
5. **Monitoring**: Track event processing time and failure rates
