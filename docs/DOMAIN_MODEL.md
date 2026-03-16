# Apartment ERP - Domain Model

## 1. Core Entities

### 1.1 Building
Represents the apartment building being managed.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Building name |
| address | String | Building address |
| totalFloors | Integer | Number of floors |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

### 1.2 Floor
Represents a floor in the building.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| buildingId | UUID | FK → Building |
| floorNumber | Integer | Floor number (1-8) |
| createdAt | DateTime | Creation timestamp |

### 1.3 Room
Represents an apartment unit.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| floorId | UUID | FK → Floor |
| roomNumber | String | Room number (e.g., "101", "802") |
| status | Enum | VACANT \| OCCUPIED \| MAINTENANCE |
| maxResidents | Integer | Always 2 |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Business Rules:**
- Maximum 2 residents per room
- Status changes trigger audit log
- Cannot delete if occupied

### 1.4 Tenant
Represents a person living in a room.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| lineUserId | String? | LINE user ID (nullable for secondary tenants) |
| firstName | String | First name |
| lastName | String | Last name |
| phone | String | Phone number |
| email | String? | Email (optional) |
| emergencyContact | String? | Emergency contact |
| emergencyPhone | String? | Emergency phone |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Business Rules:**
- Primary tenant must have LINE account for messaging
- Secondary tenant does not need LINE

### 1.5 RoomTenant
Junction table linking Room and Tenant with role.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| roomId | UUID | FK → Room |
| tenantId | UUID | FK → Tenant |
| role | Enum | PRIMARY \| SECONDARY |
| moveInDate | Date | Move-in date |
| moveOutDate | Date? | Move-out date (nullable) |
| createdAt | DateTime | Creation timestamp |

**Business Rules:**
- Maximum 2 tenants per room
- Exactly 1 must be PRIMARY
- Cannot have 2 PRIMARY tenants
- PRIMARY tenant is the contract holder

### 1.6 Contract
Represents the lease agreement.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| roomId | UUID | FK → Room |
| primaryTenantId | UUID | FK → Tenant (contract holder) |
| startDate | Date | Lease start |
| endDate | Date | Lease end |
| monthlyRent | Decimal | Monthly rent amount |
| deposit | Decimal? | Security deposit |
| status | Enum | ACTIVE \| EXPIRED \| TERMINATED |
| terminationDate | Date? | When terminated |
| terminationReason | String? | Reason for termination |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Business Rules:**
- One active contract per room at a time
- Contract holder must be PRIMARY tenant of the room
- Auto-expire when endDate passes

### 1.7 BillingItemType
Defines types of billing items.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| code | String | Unique code (RENT, ELECTRIC, WATER, FEE_XXX) |
| name | String | Display name |
| description | String? | Description |
| isRecurring | Boolean | Whether auto-generated monthly |
| defaultAmount | Decimal? | Default amount |
| createdAt | DateTime | Creation timestamp |

**Predefined Types:**
- `RENT` - Monthly rent
- `ELECTRIC` - Electricity usage
- `WATER` - Water usage
- `PARKING` - Parking fee
- `FACILITY` - Facility fee
- `FEE_LATE` - Late fee
- `FEE_OTHER` - Other fees

### 1.8 BillingRecord
Monthly billing for a room (editable grid row).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| roomId | UUID | FK → Room |
| year | Integer | Billing year |
| month | Integer | Billing month (1-12) |
| billingDay | Integer | Day of month billing is generated |
| dueDay | Integer | Payment due day |
| overdueDay | Integer | Day after which considered overdue |
| status | Enum | DRAFT \| LOCKED \| INVOICED |
| lockedAt | DateTime? | When billing was locked |
| lockedBy | String? | Admin who locked |
| subtotal | Decimal | Sum of all items |
| isPaid | Boolean | Whether fully paid |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Business Rules:**
- One BillingRecord per room per month
- Editable only when status = DRAFT
- Locking triggers audit log
- Cannot unlock after invoice generated

### 1.9 BillingItem
Individual line item within a BillingRecord.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| billingRecordId | UUID | FK → BillingRecord |
| itemTypeId | UUID | FK → BillingItemType |
| description | String? | Custom description |
| quantity | Decimal | Quantity (for usage-based) |
| unitPrice | Decimal | Price per unit |
| amount | Decimal | Calculated amount (qty × price) |
| isEditable | Boolean | Whether admin can edit |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Business Rules:**
- Editing triggers audit log with old/new values
- System-generated items (rent) may be non-editable
- Usage-based items (electric, water) editable

### 1.10 Invoice
Generated invoice document.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| roomId | UUID | FK → Room |
| billingRecordId | UUID | FK → BillingRecord |
| year | Integer | Invoice year |
| month | Integer | Invoice month |
| version | Integer | Version number (1, 2, 3...) |
| status | Enum | DRAFT \| GENERATED \| SENT \| VIEWED \| PAID \| OVERDUE |
| subtotal | Decimal | Invoice subtotal |
| total | Decimal | Invoice total |
| dueDate | Date | Payment due date |
| sentAt | DateTime? | When invoice was sent |
| sentBy | String? | Admin who sent |
| viewedAt | DateTime? | When tenant viewed |
| paidAt | DateTime? | When marked paid |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Business Rules:**
- One invoice per room per month
- Version increments on each regeneration
- Version resets to 1 each month
- Cannot send without generation

### 1.11 InvoiceVersion
Tracks each version of an invoice.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| invoiceId | UUID | FK → Invoice |
| version | Integer | Version number |
| billingRecordId | UUID | FK → BillingRecord (snapshot) |
| subtotal | Decimal | Snapshot subtotal |
| total | Decimal | Snapshot total |
| changeNote | String? | Description of changes |
| createdAt | DateTime | Creation timestamp |

**Business Rules:**
- Every generation creates a new version
- Stores snapshot of billing at generation time
- Used for comparison when detecting changes

### 1.12 InvoiceChange
Tracks changes between billing and invoice.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| invoiceId | UUID | FK → Invoice |
| previousInvoiceId | UUID? | FK → Previous Invoice (if regenerating) |
| billingItemId | UUID? | FK → BillingItem that changed |
| fieldChanged | String | Field that changed |
| oldValue | String | Previous value |
| newValue | String | New value |
| createdAt | DateTime | Creation timestamp |

**Business Rules:**
- Generated when invoice regenerated
- Used to require confirmation

### 1.13 Payment
Payment record imported from bank statement.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| amount | Decimal | Payment amount |
| paidAt | Date | Date payment was made |
| description | String? | Description from bank |
| reference | String? | Payment reference |
| sourceFile | String | Original import file name |
| status | Enum | PENDING \| MATCHED \| CONFIRMED \| REJECTED |
| matchedInvoiceId | UUID? | FK → Invoice (if matched) |
| matchedAt | DateTime? | When matched |
| confirmedAt | DateTime? | When admin confirmed |
| confirmedBy | String? | Admin who confirmed |
| rejectedAt | DateTime? | When rejected |
| rejectedBy | String? | Admin who rejected |
| rejectReason | String? | Reason for rejection |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Business Rules:**
- Never auto-confirm; always requires admin action
- Matching creates PaymentMatch record

### 1.14 PaymentMatch
Links Payment to Invoice with match confidence.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| paymentId | UUID | FK → Payment |
| invoiceId | UUID | FK → Invoice |
| confidence | Enum | HIGH \| MEDIUM \| LOW |
| matchCriteria | JSON | Why it matched |
| isAutoMatched | Boolean | Whether auto-matched |
| status | Enum | PENDING \| CONFIRMED \| REJECTED |
| confirmedAt | DateTime? | When confirmed |
| confirmedBy | String? | Admin who confirmed |
| createdAt | DateTime | Creation timestamp |

**Business Rules:**
- One PaymentMatch per payment-invoice pair
- Auto-matched payments require confirmation
- Manual matches also require confirmation

### 1.15 Conversation
LINE chat conversation with a tenant.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| lineUserId | String | LINE user ID |
| tenantId | UUID? | FK → Tenant (if linked) |
| roomId | UUID? | FK → Room (if linked) |
| lastMessageAt | DateTime | Last message timestamp |
| unreadCount | Integer | Unread messages count |
| status | Enum | ACTIVE \| ARCHIVED |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Business Rules:**
- One conversation per LINE user
- Links to tenant and room when tenant is identified

### 1.16 Message
Individual message in a conversation.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| conversationId | UUID | FK → Conversation |
| lineMessageId | String | LINE message ID |
| direction | Enum | INCOMING \| OUTGOING |
| type | Enum | TEXT \| IMAGE \| STICKER \| SYSTEM |
| content | String | Message content |
| metadata | JSON? | Extra data (sticker ID, etc.) |
| isRead | Boolean | Whether read |
| readAt | DateTime? | When read |
| sentAt | DateTime | When sent (from LINE) |
| receivedAt | DateTime | When received by system |

**Business Rules:**
- All messages logged permanently
- INCOMING messages may trigger auto-replies

### 1.17 LineUser
LINE user profile cache.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| lineUserId | String | LINE user ID |
| displayName | String | LINE display name |
| pictureUrl | String? | LINE profile picture |
| statusMessage | String? | LINE status message |
| lastFetchedAt | DateTime | Last profile update |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

### 1.18 Notification
Scheduled notification to tenant.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| type | Enum | INVOICE_REMINDER \| PAYMENT_REMINDER \| NOTICE \| CUSTOM |
| roomId | UUID | FK → Room |
| tenantId | UUID | FK → Tenant |
| scheduledAt | DateTime | When to send |
| sentAt | DateTime? | When actually sent |
| status | Enum | PENDING \| SENT \| FAILED \| CANCELLED |
| content | String | Message content |
| lineMessageId | String? | LINE message ID if sent |
| errorMessage | String? | Error if failed |
| createdAt | DateTime | Creation timestamp |

### 1.19 AuditLog
Immutable audit trail of all important actions.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| action | String | Action type (e.g., BILLING_EDIT) |
| entityType | String | Entity type (e.g., BillingRecord) |
| entityId | UUID | ID of affected entity |
| userId | String | Admin user who performed action |
| userName | String | Admin name |
| details | JSON | Old/new values, extra info |
| ipAddress | String? | Client IP |
| createdAt | DateTime | Timestamp |

**Business Rules:**
- Append-only; never modify or delete
- Required for: billing edits, invoice gen/send, payment confirm, admin actions

### 1.20 Config
System configuration.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| key | String | Config key |
| value | JSON | Config value |
| description | String? | Description |
| updatedAt | DateTime | Last update |

**Predefined Config Keys:**
- `billing.billingDay` - Day of month billing generated
- `billing.dueDay` - Payment due day
- `billing.overdueDay` - Overdue day
- `line.channelId` - LINE channel ID
- `line.accessToken` - LINE access token
- `building.name` - Building name
- `setup.complete` - Whether setup wizard completed

---

## 2. Entity Relationships

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                    RELATIONSHIPS                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────┐
                                    │  Building   │
                                    └──────┬──────┘
                                           │
                                    ┌──────┴──────┐
                                    │   Floor     │
                                    │ (1 building │
                                    │   has many  │
                                    │   floors)   │
                                    └──────┬──────┘
                                           │
                              ┌────────────┼────────────┐
                              │            │            │
                         ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
                         │  Room   │  │  Room   │  │  Room   │
                         │ (1 floor│  │         │  │         │
                         │ has many│  │         │  │         │
                         │ rooms)  │  │         │  │         │
                         └────┬────┘  └────┬────┘  └────┬────┘
                              │            │            │
                   ┌──────────┼───────────┼────────────┼──────────┐
                   │          │           │            │          │
              ┌────┴────┐ ┌──┴──┐   ┌────┴────┐ ┌────┴────┐ ┌──┴──┐
              │RoomTenant│ │     │   │RoomTenant│ │         │ │    │
              │(tenant1)│ │     │   │(tenant2)│ │         │ │    │
              └────┬────┘ └──┬──┘   └────┬────┘ └────┬────┘ └──┬──┘
                   │         │           │            │         │
              ┌────┴────┐   │      ┌────┴────┐       │         │
              │ Tenant  │◄──┘      │ Tenant  │◄──────┘         │
              │         │         │         │                  │
              └────┬────┘         └────┬────┘                  │
                   │                    │                       │
                   │              ┌─────┴─────┐                 │
                   │              │ Contract  │ (1 tenant is    │
                   └─────────────►│(PRIMARY)  │◄────────────────┘
                                  └─────┬─────┘
                                        │
                                        │
                               ┌────────┼────────┐
                               │        │        │
                          ┌────┴────┐ ┌┴────┐ ┌──┴──────┐
                          │Billing  │ │     │ │Payment  │
                          │Record   │ │     │ │Match    │
                          │(monthly)│ │     │ │         │
                          └────┬────┘ └──┬──┘ └───┬──────┘
                               │        │        │
                          ┌────┴────┐ ┌─┴────┐ ┌──┴──────┐
                          │Billing  │ │      │ │ Payment │
                          │Item     │ │Invoice│ │         │
                          │(line)   │ │      │ │         │
                          └─────────┘ └──┬───┘ └─────────┘
                                         │
                                    ┌────┴─────┐
                                    │Invoice   │
                                    │Version   │
                                    │(snapshot)│
                                    └──────────┘


┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           TENANT ↔ LINE RELATIONSHIP                                │
└─────────────────────────────────────────────────────────────────────────────────────┘

        ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
        │   Tenant    │         │Conversation │         │  LineUser   │
        │             │────────►│             │◄────────│             │
        │(has LINE   │  1:1    │(per LINE    │  1:1    │(profile     │
        │ userId)    │         │ user)       │         │ cache)      │
        └─────────────┘         └──────┬──────┘         └──────────────┘
                                        │
                                        │ 1:N
                                        │
                                   ┌────┴─────┐
                                   │ Message  │
                                   │(logged)  │
                                   └──────────┘
```

---

## 3. State Machines

### 3.1 Room Status

```
┌─────────┐
│VACANT   │
└────┬────┘
     │ tenant moves in
     ▼
┌─────────┐     maintenance starts     ┌─────────────┐
│OCCUPIED │────────────────────────────►│ MAINTENANCE │
└────┬────┘                             └──────┬──────┘
     │                                          │
     │ tenant moves out                    maintenance ends
     │                                          │
     └──────────────────────────────────────────┘
```

| Transition | Trigger | Side Effects |
|------------|---------|--------------|
| VACANT → OCCUPIED | RoomTenant created | Audit log |
| OCCUPIED → VACANT | All RoomTenants ended | Audit log |
| OCCUPIED → MAINTENANCE | Admin sets status | Audit log |
| MAINTENANCE → OCCUPIED | Admin sets status | Audit log |
| MAINTENANCE → VACANT | No tenants | Audit log |

### 3.2 BillingRecord Status

```
┌────────┐
│ DRAFT  │◄─────────────────────────────┐
└───┬────┘                              │
    │ admin locks billing              │
    │                                   │
    ▼                                   │
┌────────┐    invoice generated    ┌────┴────┐
│ LOCKED │─────────────────────────►│INVOICED │
└────────┘                          └─────────┘
```

| Transition | Trigger | Side Effects |
|------------|---------|--------------|
| DRAFT → LOCKED | Admin locks billing | Audit log, lockedAt set |
| LOCKED → INVOICED | Invoice generated | billingRecordId on Invoice |
| DRAFT → DRAFT | Billing edits | Audit log per edit |

### 3.3 Invoice Status

```
┌────────┐
│ DRAFT  │
└────┬───┘
     │ admin generates
     ▼
┌───────────┐     admin sends      ┌────────┐
│ GENERATED │─────────────────────►│  SENT  │
└─────┬─────┘                      └───┬────┘
      │                                 │
      │ tenant views                    │ tenant views
      │                                 │
      ▼                                 ▼
┌───────────┐                      ┌────────┐
│  VIEWED   │◄─────────────────────│  SENT  │
└─────┬─────┘                      └───┬────┘
      │                                 │
      │ payment matched               │ overdue
      │ & confirmed                    │
      ▼                                 ▼
┌─────────┐                      ┌──────────┐
│  PAID   │                      │ OVERDUE  │
└─────────┘                      └──────────┘
```

| Transition | Trigger | Side Effects |
|------------|---------|--------------|
| DRAFT → GENERATED | Generate invoice | InvoiceVersion created |
| GENERATED → SENT | Admin sends via LINE | sentAt, sentBy, Audit log |
| SENT → VIEWED | Tenant opens (LINE) | viewedAt |
| SENT → OVERDUE | Due date passes | status change |
| GENERATED/SENT/VIEWED/OVERDUE → PAID | Payment confirmed | paidAt, status change |
| GENERATED → DRAFT | Regenerate (if no sends) | New version created |

### 3.4 Payment Status

```
┌─────────┐
│ PENDING │
└────┬────┘
     │ auto-match or manual match
     ▼
┌─────────┐     admin confirms      ┌───────────┐
│ MATCHED │─────────────────────────►│ CONFIRMED │
└────┬────┘                          └─────┬─────┘
     │                                    │
     │ admin rejects                payment marked
     │                                    │ paid
     ▼                                    ▼
┌───────────┐                      ┌───────────┐
│ REJECTED  │                      │  PAID     │
└───────────┘                      └───────────┘
```

| Transition | Trigger | Side Effects |
|------------|---------|--------------|
| PENDING → MATCHED | Auto-match or admin links to invoice | PaymentMatch created, Audit log |
| MATCHED → CONFIRMED | Admin confirms | confirmedAt, confirmedBy, Audit log, Invoice status → PAID |
| MATCHED → REJECTED | Admin rejects | rejectedAt, rejectedBy, reason, Audit log |
| PENDING → REJECTED | Admin rejects unmatched | rejectedAt, rejectedBy, Audit log |
| PENDING → PAID | Direct payment (no matching) | Manual confirm flow |

### 3.5 Contract Status

```
┌─────────┐
│ ACTIVE  │
└────┬────┘
     │ end date passes
     │ or admin terminates
     ▼
┌───────────┐              ┌─────────────┐
│  EXPIRED  │◄────────────│ TERMINATED  │
└───────────┘  (if not    └─────────────┘
               renewed)
```

| Transition | Trigger | Side Effects |
|------------|---------|--------------|
| ACTIVE → EXPIRED | End date passes | status change, Audit log |
| ACTIVE → TERMINATED | Admin terminates | terminationDate, reason, Audit log |
| EXPIRED → ACTIVE | Contract renewed | New contract created |

---

## 4. Domain Events

### 4.1 Room Events

| Event | Payload | Side Effects |
|-------|---------|--------------|
| `ROOM_STATUS_CHANGED` | { roomId, oldStatus, newStatus, adminId } | AuditLog, maybe notify tenants |
| `ROOM_TENANT_ASSIGNED` | { roomId, tenantId, role } | AuditLog, Conversation link |
| `ROOM_TENANT_REMOVED` | { roomId, tenantId, reason } | AuditLog |

### 4.2 Tenant Events

| Event | Payload | Side Effects |
|-------|---------|--------------|
| `TENANT_CREATED` | { tenantId, lineUserId?, name } | Conversation created if LINE |
| `TENANT_UPDATED` | { tenantId, changes } | AuditLog |
| `TENANT_LINKED_TO_LINE` | { tenantId, lineUserId } | Conversation linked |

### 4.3 Contract Events

| Event | Payload | Side Effects |
|-------|---------|--------------|
| `CONTRACT_CREATED` | { contractId, roomId, tenantId } | AuditLog |
| `CONTRACT_RENEWED` | { oldContractId, newContractId } | AuditLog |
| `CONTRACT_TERMINATED` | { contractId, reason } | AuditLog, Room status update |
| `CONTRACT_EXPIRED` | { contractId } | AuditLog, Room status update |

### 4.4 Billing Events

| Event | Payload | Side Effects |
|-------|---------|--------------|
| `BILLING_RECORD_CREATED` | { billingRecordId, roomId, year, month } | Items created from templates |
| `BILLING_ITEM_UPDATED` | { billingRecordId, itemId, oldValue, newValue, adminId } | AuditLog, recalculate subtotal |
| `BILLING_LOCKED` | { billingRecordId, adminId } | AuditLog, status change |
| `BILLING_UNLOCK_REQUESTED` | { billingRecordId, reason } | (not allowed if invoiced) |

### 4.5 Invoice Events

| Event | Payload | Side Effects |
|-------|---------|--------------|
| `INVOICE_GENERATED` | { invoiceId, billingRecordId, version } | InvoiceVersion created |
| `INVOICE_REGENERATED` | { oldInvoiceId, newInvoiceId, changes } | InvoiceVersion, InvoiceChange records |
| `INVOICE_SENT` | { invoiceId, tenantId, adminId } | AuditLog, Notification, LINE message |
| `INVOICE_VIEWED` | { invoiceId, viewedAt } | Invoice status update |
| `INVOICE_PAID` | { invoiceId, paymentId } | Invoice status update |
| `INVOICE_OVERDUE` | { invoiceId, daysOverdue } | Notification |

### 4.6 Payment Events

| Event | Payload | Side Effects |
|-------|---------|--------------|
| `PAYMENT_IMPORTED` | { paymentId, sourceFile, count } | AuditLog |
| `PAYMENT_MATCHED` | { paymentId, invoiceId, confidence, adminId? } | PaymentMatch, AuditLog |
| `PAYMENT_CONFIRMED` | { paymentId, invoiceId, adminId } | Payment status, Invoice status, AuditLog |
| `PAYMENT_REJECTED` | { paymentId, reason, adminId } | Payment status, AuditLog |

### 4.7 Messaging Events

| Event | Payload | Side Effects |
|-------|---------|--------------|
| `MESSAGE_RECEIVED` | { conversationId, lineMessageId, content } | Message created, unreadCount++ |
| `MESSAGE_SENT` | { conversationId, messageId, content } | Message created |
| `CONVERSATION_READ` | { conversationId } | unreadCount = 0 |
| `NOTIFICATION_SENT` | { notificationId, lineMessageId } | Notification status |

### 4.8 System Events

| Event | Payload | Side Effects |
|-------|---------|--------------|
| `SETUP_COMPLETED` | { adminId, config } | Config updated |
| `CONFIG_CHANGED` | { key, oldValue, newValue, adminId } | AuditLog |

---

## 5. Data Ownership Boundaries

### 5.1 Aggregate Roots

| Aggregate | Owner Module | Children |
|-----------|--------------|----------|
| Building | Setup | Floor, Room |
| Room | Room Management | RoomTenant |
| Tenant | Tenant Management | RoomTenant, Contract |
| Contract | Contract Management | - |
| BillingRecord | Billing | BillingItem |
| Invoice | Billing | InvoiceVersion, InvoiceChange |
| Payment | Payment | PaymentMatch |
| Conversation | Messaging | Message |
| AuditLog | Audit | - |

### 5.2 Module Responsibilities

| Module | Owns | Interfaces With |
|--------|------|------------------|
| **Room Management** | Room, RoomTenant | Tenant (read), Contract (read), Billing (read status) |
| **Tenant Management** | Tenant, LineUser | Room (read), Conversation (link) |
| **Contract Management** | Contract | Room (read status), Tenant (read) |
| **Billing** | BillingRecord, BillingItem, Invoice, InvoiceVersion | Room (read), Contract (read rent), Payment (update status) |
| **Payment** | Payment, PaymentMatch | Invoice (confirm), Billing (read) |
| **Messaging** | Conversation, Message, Notification | Tenant (link), Room (link), LINE API |
| **Analytics** | (reads from all modules) | All (read-only) |
| **Audit** | AuditLog | All (append-only) |
| **Setup** | Config, Building, Floor, Room | - |

### 5.3 Cascading Rules

| Parent | Child | Delete Behavior |
|--------|-------|-----------------|
| Building | Floor | CASCADE |
| Floor | Room | CASCADE |
| Room | RoomTenant | CASCADE |
| Room | BillingRecord | CASCADE |
| Room | Invoice | CASCADE |
| Room | Conversation | CASCADE |
| BillingRecord | BillingItem | CASCADE |
| Invoice | InvoiceVersion | CASCADE |
| Invoice | InvoiceChange | CASCADE |
| Payment | PaymentMatch | CASCADE |
| Conversation | Message | CASCADE |
| Tenant | Contract | RESTRICT (must end first) |
| Tenant | RoomTenant | RESTRICT (must remove first) |

---

## 6. Key Business Rules Summary

### Room
- [ ] Maximum 2 residents
- [ ] Exactly 1 primary tenant
- [ ] Status changes logged

### Tenant
- [ ] Primary tenant must have LINE account
- [ ] Secondary tenant optional LINE

### Contract
- [ ] One active contract per room
- [ ] Contract holder = primary tenant

### Billing
- [ ] One record per room per month
- [ ] Editable only when DRAFT
- [ ] Locking is irreversible after invoice
- [ ] Editing creates audit trail

### Invoice
- [ ] Version increments on regeneration
- [ ] Version resets monthly
- [ ] Must detect changes if regenerated after send
- [ ] Sending requires confirmation

### Payment
- [ ] Never auto-confirm
- [ ] Auto-match creates pending match
- [ ] All matches require admin confirmation

### Messaging
- [ ] All messages logged
- [ ] Unread counters maintained
- [ ] LINE webhook must verify signature
