# Database Table Reference

Source: [schema.prisma](/D:/apartment_erp/apps/erp/prisma/schema.prisma)

This file lists:
- every table in the current database schema
- what each table stores
- key relationships
- all columns from each table

## System Overview

Main data flow:

`buildings -> floors -> rooms -> room_tenants / tenants -> contracts -> billing_records -> billing_items -> invoices -> payment_transactions / payments`

Operational side tables:

`line_users -> conversations -> messages`

`maintenance_tickets -> maintenance_comments / maintenance_attachments`

Supporting tables:

`notifications`, `uploaded_files`, `audit_logs`, `configs`, `outbox_events`, `admin_users`, `password_reset_tokens`, `staff_registration_requests`

## Table List

| Table | Purpose |
|---|---|
| `buildings` | Building master data |
| `floors` | Floors in a building |
| `rooms` | Rooms/units |
| `tenants` | Tenant master data |
| `room_tenants` | Room occupancy assignments |
| `contracts` | Rental contracts |
| `billing_item_types` | Billing item type definitions |
| `billing_records` | Monthly billing header per room |
| `billing_items` | Line items inside a billing record |
| `invoices` | Invoice header/versioned monthly invoice |
| `invoice_versions` | Stored invoice snapshots |
| `invoice_changes` | Invoice change audit trail |
| `payments` | Legacy/manual payment records |
| `payment_transactions` | Imported bank transaction records |
| `payment_matches` | Matches between payments and invoices |
| `line_users` | LINE profile records |
| `conversations` | Chat thread per LINE user |
| `messages` | Chat messages |
| `notifications` | Scheduled/sent notifications |
| `uploaded_files` | Uploaded file metadata |
| `maintenance_tickets` | Maintenance requests |
| `maintenance_comments` | Comments on maintenance tickets |
| `maintenance_attachments` | Files attached to maintenance tickets |
| `audit_logs` | System audit trail |
| `configs` | Key-value system configuration |
| `outbox_events` | Async event queue |
| `admin_users` | Owner/staff login accounts |
| `password_reset_tokens` | Password reset tokens |
| `staff_registration_requests` | Staff signup approval requests |

## Building And Location

### `buildings`

Stores the building master record. One building has many floors.

Relations:
- one-to-many with `floors`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `name` | `String` | Building name |
| `address` | `String` | Building address |
| `totalFloors` | `Int` | Number of floors |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `floors`

Stores floors inside a building. One floor belongs to one building and has many rooms.

Relations:
- many-to-one to `buildings`
- one-to-many with `rooms`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `buildingId` | `String` | FK to `buildings.id` |
| `floorNumber` | `Int` | Floor number |
| `createdAt` | `DateTime` | Created timestamp |

### `rooms`

Stores room/unit records. A room is the core object linked to tenants, billing, invoices, conversations, and maintenance.

Relations:
- many-to-one to `floors`
- one-to-many with `room_tenants`
- one-to-many with `contracts`
- one-to-many with `billing_records`
- one-to-many with `invoices`
- one-to-many with `conversations`
- one-to-many with `maintenance_tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `floorId` | `String` | FK to `floors.id` |
| `roomNumber` | `String` | Room number |
| `status` | `RoomStatus` | `VACANT`, `OCCUPIED`, `MAINTENANCE` |
| `maxResidents` | `Int` | Maximum residents |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

## Tenant And Contract

### `tenants`

Stores tenant profile data.

Relations:
- one-to-many with `room_tenants`
- one-to-many with `contracts` as primary tenant
- one-to-many with `conversations`
- one-to-many with `maintenance_tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `lineUserId` | `String?` | Unique when present |
| `firstName` | `String` | First name |
| `lastName` | `String` | Last name |
| `phone` | `String` | Phone number |
| `email` | `String?` | Email |
| `emergencyContact` | `String?` | Emergency contact name |
| `emergencyPhone` | `String?` | Emergency contact phone |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `room_tenants`

Bridge table between rooms and tenants. Represents occupancy and tenant role in a room.

Relations:
- many-to-one to `rooms`
- many-to-one to `tenants`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `roomId` | `String` | FK to `rooms.id` |
| `tenantId` | `String` | FK to `tenants.id` |
| `role` | `TenantRole` | `PRIMARY`, `SECONDARY` |
| `moveInDate` | `DateTime` | Move-in date |
| `moveOutDate` | `DateTime?` | Move-out date |
| `createdAt` | `DateTime` | Created timestamp |

### `contracts`

Stores rental contracts per room and primary tenant.

Relations:
- many-to-one to `rooms`
- many-to-one to `tenants` as primary tenant

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `roomId` | `String` | FK to `rooms.id` |
| `primaryTenantId` | `String` | FK to `tenants.id` |
| `startDate` | `DateTime` | Contract start date |
| `endDate` | `DateTime` | Contract end date |
| `monthlyRent` | `Decimal(10,2)` | Monthly rent |
| `deposit` | `Decimal(10,2)?` | Deposit |
| `status` | `ContractStatus` | `ACTIVE`, `EXPIRED`, `TERMINATED` |
| `terminationDate` | `DateTime?` | Termination date |
| `terminationReason` | `String?` | Termination reason |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

## Billing And Invoice

### `billing_item_types`

Master list of billing item types.

Relations:
- one-to-many with `billing_items`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `code` | `String` | Unique code like `RENT`, `WATER` |
| `name` | `String` | Display name |
| `description` | `String?` | Description |
| `isRecurring` | `Boolean` | Recurring type flag |
| `defaultAmount` | `Decimal(10,2)?` | Default amount |
| `createdAt` | `DateTime` | Created timestamp |

### `billing_records`

Monthly billing header for one room and one month.

Relations:
- many-to-one to `rooms`
- one-to-many with `billing_items`
- one-to-many with `invoices`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `roomId` | `String` | FK to `rooms.id` |
| `year` | `Int` | Billing year |
| `month` | `Int` | Billing month |
| `billingDay` | `Int` | Billing generated day |
| `dueDay` | `Int` | Due day |
| `overdueDay` | `Int` | Overdue threshold day |
| `status` | `BillingStatus` | `DRAFT`, `LOCKED`, `INVOICED` |
| `lockedAt` | `DateTime?` | Lock timestamp |
| `lockedBy` | `String?` | User who locked |
| `subtotal` | `Decimal(12,2)` | Total before invoice |
| `isPaid` | `Boolean` | Paid flag |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `billing_items`

Line items under a billing record.

Relations:
- many-to-one to `billing_records`
- many-to-one to `billing_item_types`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `billingRecordId` | `String` | FK to `billing_records.id` |
| `itemTypeId` | `String` | FK to `billing_item_types.id` |
| `description` | `String?` | Item description |
| `quantity` | `Decimal(10,2)` | Quantity |
| `unitPrice` | `Decimal(10,2)` | Unit price |
| `amount` | `Decimal(12,2)` | Line total |
| `isEditable` | `Boolean` | Editable flag |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `invoices`

Invoice header generated from a billing record.

Relations:
- many-to-one to `rooms`
- many-to-one to `billing_records`
- one-to-many with `invoice_versions`
- one-to-many with `invoice_changes`
- one-to-many with `payment_matches`
- one-to-many with `payment_transactions`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `roomId` | `String` | FK to `rooms.id` |
| `billingRecordId` | `String` | FK to `billing_records.id` |
| `year` | `Int` | Invoice year |
| `month` | `Int` | Invoice month |
| `version` | `Int` | Invoice version |
| `status` | `InvoiceStatus` | `DRAFT`, `GENERATED`, `SENT`, `VIEWED`, `PAID`, `OVERDUE` |
| `subtotal` | `Decimal(12,2)` | Subtotal |
| `total` | `Decimal(12,2)` | Total |
| `dueDate` | `DateTime` | Due date |
| `issuedAt` | `DateTime?` | Issue timestamp |
| `sentAt` | `DateTime?` | Sent timestamp |
| `sentBy` | `String?` | User who sent |
| `viewedAt` | `DateTime?` | Viewed timestamp |
| `paidAt` | `DateTime?` | Paid timestamp |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `invoice_versions`

Stored snapshot/version of an invoice.

Relations:
- many-to-one to `invoices`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `invoiceId` | `String` | FK to `invoices.id` |
| `version` | `Int` | Snapshot version |
| `billingRecordId` | `String` | Source billing record id |
| `subtotal` | `Decimal(12,2)` | Snapshot subtotal |
| `total` | `Decimal(12,2)` | Snapshot total |
| `changeNote` | `String?` | Reason for change |
| `createdAt` | `DateTime` | Created timestamp |

### `invoice_changes`

Low-level invoice change history.

Relations:
- many-to-one to `invoices`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `invoiceId` | `String` | FK to `invoices.id` |
| `previousInvoiceId` | `String?` | Previous invoice id |
| `billingItemId` | `String?` | Related billing item id |
| `fieldChanged` | `String` | Changed field name |
| `oldValue` | `String` | Old value |
| `newValue` | `String` | New value |
| `createdAt` | `DateTime` | Created timestamp |

## Payment

### `payments`

Legacy/manual payment records.

Relations:
- one-to-many with `payment_matches`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `amount` | `Decimal(12,2)` | Paid amount |
| `paidAt` | `DateTime` | Payment date |
| `description` | `String?` | Description |
| `reference` | `String?` | Reference text |
| `sourceFile` | `String` | Import source file |
| `status` | `PaymentStatus` | `PENDING`, `MATCHED`, `CONFIRMED`, `REJECTED` |
| `matchedInvoiceId` | `String?` | Legacy matched invoice id |
| `matchedAt` | `DateTime?` | Match timestamp |
| `confirmedAt` | `DateTime?` | Confirm timestamp |
| `confirmedBy` | `String?` | Confirmed by |
| `rejectedAt` | `DateTime?` | Reject timestamp |
| `rejectedBy` | `String?` | Rejected by |
| `rejectReason` | `String?` | Reject reason |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `payment_transactions`

Imported bank transactions used in matching/review workflow.

Relations:
- many-to-one to `invoices` when matched

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `amount` | `Decimal(12,2)` | Transaction amount |
| `transactionDate` | `DateTime` | Bank transaction date |
| `description` | `String?` | Description |
| `reference` | `String?` | Reference text |
| `sourceFile` | `String` | Imported file |
| `status` | `PaymentTransactionStatus` | `PENDING`, `AUTO_MATCHED`, `NEED_REVIEW`, `CONFIRMED`, `REJECTED` |
| `confidenceScore` | `Decimal(3,2)?` | Matching confidence |
| `invoiceId` | `String?` | FK to `invoices.id` |
| `matchedAt` | `DateTime?` | Match timestamp |
| `confirmedAt` | `DateTime?` | Confirm timestamp |
| `confirmedBy` | `String?` | Confirmed by |
| `rejectedAt` | `DateTime?` | Reject timestamp |
| `rejectedBy` | `String?` | Rejected by |
| `rejectReason` | `String?` | Reject reason |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `payment_matches`

Match records between a payment and an invoice.

Relations:
- many-to-one to `payments`
- many-to-one to `invoices`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `paymentId` | `String` | FK to `payments.id` |
| `invoiceId` | `String` | FK to `invoices.id` |
| `confidence` | `MatchConfidence` | `HIGH`, `MEDIUM`, `LOW` |
| `matchCriteria` | `Json?` | Matching metadata |
| `isAutoMatched` | `Boolean` | Auto-match flag |
| `status` | `PaymentMatchStatus` | `PENDING`, `CONFIRMED`, `REJECTED` |
| `confirmedAt` | `DateTime?` | Confirm timestamp |
| `confirmedBy` | `String?` | Confirmed by |
| `createdAt` | `DateTime` | Created timestamp |

## Messaging And LINE

### `line_users`

Stores LINE user profile data.

Relations:
- one-to-many with `conversations`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `lineUserId` | `String` | Unique LINE user id |
| `displayName` | `String` | Display name |
| `pictureUrl` | `String?` | Profile picture |
| `statusMessage` | `String?` | LINE status message |
| `lastFetchedAt` | `DateTime?` | Last profile sync |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `conversations`

Chat thread per LINE user. Optionally linked to tenant and room.

Relations:
- many-to-one to `line_users`
- many-to-one to `tenants`
- many-to-one to `rooms`
- one-to-many with `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `lineUserId` | `String` | FK to `line_users.lineUserId` |
| `tenantId` | `String?` | FK to `tenants.id` |
| `roomId` | `String?` | FK to `rooms.id` |
| `lastMessageAt` | `DateTime` | Last message timestamp |
| `unreadCount` | `Int` | Unread count |
| `status` | `ConversationStatus` | `ACTIVE`, `ARCHIVED` |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `messages`

Individual chat messages.

Relations:
- many-to-one to `conversations`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `conversationId` | `String` | FK to `conversations.id` |
| `lineMessageId` | `String` | Unique LINE message id |
| `direction` | `MessageDirection` | `INCOMING`, `OUTGOING` |
| `type` | `MessageType` | `TEXT`, `IMAGE`, `STICKER`, `SYSTEM` |
| `content` | `String` | Message text/content |
| `metadata` | `Json?` | Message metadata |
| `isRead` | `Boolean` | Read flag |
| `readAt` | `DateTime?` | Read timestamp |
| `sentAt` | `DateTime` | Sent timestamp |
| `receivedAt` | `DateTime` | Received timestamp |

### `notifications`

Scheduled/sent outbound notifications.

Relations:
- logical link to rooms and tenants by id fields

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `type` | `NotificationType` | `INVOICE_REMINDER`, `PAYMENT_REMINDER`, `NOTICE`, `CUSTOM` |
| `roomId` | `String` | Target room id |
| `tenantId` | `String` | Target tenant id |
| `scheduledAt` | `DateTime` | Scheduled send time |
| `sentAt` | `DateTime?` | Sent time |
| `status` | `NotificationStatus` | `PENDING`, `SENT`, `FAILED`, `CANCELLED` |
| `content` | `String` | Message content |
| `lineMessageId` | `String?` | Sent LINE message id |
| `errorMessage` | `String?` | Error details |
| `createdAt` | `DateTime` | Created timestamp |

## Files And Maintenance

### `uploaded_files`

Metadata for uploaded files.

Relations:
- no direct FK relation in schema

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `originalName` | `String` | Original filename |
| `mimeType` | `String` | MIME type |
| `size` | `Int` | File size |
| `storageKey` | `String` | Unique storage key |
| `url` | `String` | Public/internal URL |
| `uploadedBy` | `String?` | Uploader id |
| `createdAt` | `DateTime` | Created timestamp |

### `maintenance_tickets`

Maintenance job/request per room and tenant.

Relations:
- many-to-one to `rooms`
- many-to-one to `tenants`
- one-to-many with `maintenance_comments`
- one-to-many with `maintenance_attachments`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `roomId` | `String` | FK to `rooms.id` |
| `tenantId` | `String` | FK to `tenants.id` |
| `title` | `String` | Ticket title |
| `description` | `String` | Ticket description |
| `priority` | `MaintenancePriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `status` | `MaintenanceStatus` | `OPEN`, `IN_PROGRESS`, `WAITING_PARTS`, `DONE`, `CLOSED` |
| `assignedStaffId` | `String?` | Assigned staff user id |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `maintenance_comments`

Comments on a maintenance ticket.

Relations:
- many-to-one to `maintenance_tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `ticketId` | `String` | FK to `maintenance_tickets.id` |
| `authorId` | `String` | Author user id |
| `message` | `String` | Comment text |
| `createdAt` | `DateTime` | Created timestamp |

### `maintenance_attachments`

Attachment records for maintenance tickets.

Relations:
- many-to-one to `maintenance_tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `ticketId` | `String` | FK to `maintenance_tickets.id` |
| `fileUrl` | `String` | File URL |
| `fileType` | `String` | File type |
| `createdAt` | `DateTime` | Created timestamp |

## Audit, Config, And Infra

### `audit_logs`

System audit trail for actions on entities.

Relations:
- logical references to users and entities by id fields

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `action` | `String` | Action code |
| `entityType` | `String` | Entity name |
| `entityId` | `String` | Entity id |
| `userId` | `String` | Acting user id |
| `userName` | `String` | Acting user name |
| `details` | `Json?` | Structured details |
| `ipAddress` | `String?` | Request IP |
| `createdAt` | `DateTime` | Created timestamp |

### `configs`

Key-value system config table.

Relations:
- no direct FK relation

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `key` | `String` | Unique config key |
| `value` | `Json` | Config value |
| `description` | `String?` | Config description |
| `updatedAt` | `DateTime` | Updated timestamp |

### `outbox_events`

Outbox queue for async/event-driven processing.

Relations:
- logical references to aggregate records by id

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `aggregateType` | `String` | Aggregate type |
| `aggregateId` | `String` | Aggregate id |
| `eventType` | `String` | Event name |
| `payload` | `Json` | Event payload |
| `createdAt` | `DateTime` | Created timestamp |
| `processedAt` | `DateTime?` | Processed time |
| `retryCount` | `Int` | Retry count |
| `lastError` | `String?` | Last error |

## Admin Auth

### `admin_users`

Owner/staff login accounts for the admin console.

Relations:
- one-to-many with `password_reset_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `username` | `String` | Unique username |
| `email` | `String?` | Unique when present |
| `displayName` | `String` | Display name |
| `role` | `AdminRole` | `ADMIN`, `STAFF` |
| `passwordHash` | `String` | Password hash |
| `isActive` | `Boolean` | Active flag |
| `forcePasswordChange` | `Boolean` | Must change password on next login |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |

### `password_reset_tokens`

Password reset tokens for admin users.

Relations:
- many-to-one to `admin_users`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `userId` | `String` | FK to `admin_users.id` |
| `tokenHash` | `String` | Unique token hash |
| `expiresAt` | `DateTime` | Expiration time |
| `usedAt` | `DateTime?` | Used time |
| `createdAt` | `DateTime` | Created timestamp |

### `staff_registration_requests`

Pending/approved/rejected staff signup requests that owner reviews.

Relations:
- logical link to reviewer by `reviewedById`

| Column | Type | Notes |
|---|---|---|
| `id` | `String` | PK, UUID |
| `username` | `String` | Requested username |
| `email` | `String?` | Requested email |
| `displayName` | `String` | Requested display name |
| `passwordHash` | `String` | Requested password hash |
| `status` | `StaffRegistrationStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `reviewedById` | `String?` | Reviewer user id |
| `reviewedAt` | `DateTime?` | Reviewed time |
| `rejectReason` | `String?` | Reject reason |
| `createdAt` | `DateTime` | Created timestamp |
| `updatedAt` | `DateTime` | Updated timestamp |
